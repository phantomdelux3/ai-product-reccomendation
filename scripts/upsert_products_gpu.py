import os
import sys
import argparse
import glob
import json
import pandas as pd
import torch
import numpy as np  # <--- REQUIRED FOR IMAGE SCRUBBING
from PIL import Image
import requests
from io import BytesIO
from transformers import AutoProcessor, AutoModelForCausalLM
from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct, VectorParams, Distance
from uuid import uuid4
from dotenv import load_dotenv
import time

# Load env vars
load_dotenv(os.path.join(os.path.dirname(__file__), '../.env'))

QDRANT_URL = os.getenv("QDRANT_URL")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")

# Configuration
MAX_RETRIES = 3
RETRY_DELAY = 2

def get_device():
    if torch.cuda.is_available():
        device = "cuda"
        print(f"✓ CUDA GPU detected: {torch.cuda.get_device_name(0)}")
        print(f"  Memory: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.2f} GB")
    else:
        device = "cpu"
        print(f"⚠ No CUDA GPU detected, using CPU")
    return device

def load_models(device):
    print(f"\n{'='*60}")
    print(f"Loading AI Models on {device.upper()}...")
    print(f"{'='*60}")
    
    # Florence-2 works best with float16 on CUDA
    torch_dtype = torch.float16 if device == 'cuda' else torch.float32
    print(f"Using dtype: {torch_dtype}")
    
    florence_model_id = 'microsoft/Florence-2-base'
    print(f"\n[1/2] Loading Florence-2 Vision Model...")
    
    try:
        florence_model = AutoModelForCausalLM.from_pretrained(
            florence_model_id, 
            dtype=torch_dtype,
            trust_remote_code=True
        ).to(device)
        florence_model.eval()
        florence_processor = AutoProcessor.from_pretrained(florence_model_id, trust_remote_code=True)
        print(f"      ✓ Florence-2 loaded successfully")
    except Exception as e:
        print(f"      ✗ Failed to load Florence-2: {e}")
        raise

    print(f"\n[2/2] Loading SentenceTransformer...")
    try:
        embedding_model = SentenceTransformer('all-MiniLM-L6-v2', device=device)
        print(f"      ✓ SentenceTransformer loaded successfully")
    except Exception as e:
        print(f"      ✗ Failed to load SentenceTransformer: {e}")
        raise
    
    return florence_model, florence_processor, embedding_model

def download_image_with_retry(image_url, max_retries=MAX_RETRIES):
    """Download and SCRUB image data"""
    for attempt in range(max_retries):
        try:
            headers = {'User-Agent': 'Mozilla/5.0'}
            response = requests.get(image_url, headers=headers, stream=True, timeout=15)
            response.raise_for_status()
            
            # 1. Open Bytes
            img_raw = Image.open(BytesIO(response.content))
            
            # 2. Force Convert to RGB
            if img_raw.mode != "RGB":
                img_raw = img_raw.convert("RGB")
            
            # 3. THE FIX: Scrub Metadata using Numpy
            # This creates a fresh memory block, removing corrupt EXIF/Header data
            # that causes the "NoneType" error in the processor.
            img_array = np.array(img_raw)
            clean_image = Image.fromarray(img_array)
            
            # 4. Resize if too big (Florence max is usually ~1024)
            if max(clean_image.size) > 1024:
                scale = 1024 / max(clean_image.size)
                new_w = int(clean_image.width * scale)
                new_h = int(clean_image.height * scale)
                clean_image = clean_image.resize((new_w, new_h), Image.Resampling.LANCZOS)

            return clean_image
            
        except Exception as e:
            if attempt < max_retries - 1:
                print(f"      ⚠ Download attempt {attempt + 1} failed: {e}")
                time.sleep(RETRY_DELAY)
            else:
                raise

def analyze_image_with_retry(model, processor, image, title, price, device, max_retries=MAX_RETRIES):
    """Analyze image with Florence-2, robustly."""

    task = "<MORE_DETAILED_CAPTION>"

    for attempt in range(max_retries):
        try:
            if image is None:
                raise ValueError("Image is None")

            # 1. Processor → full BatchEncoding
            inputs = processor(
                text=task,
                images=image,
                return_tensors="pt"
            )

            # Safety check
            if "pixel_values" not in inputs or inputs["pixel_values"] is None:
                raise ValueError("Processor failed to generate pixel_values")

            # 2. Move to device, but keep dtypes correct
            for k, v in inputs.items():
                if isinstance(v, torch.Tensor):
                    inputs[k] = v.to(device)

            # On CUDA, pixel_values should be float16; input_ids stay long
            if device == "cuda":
                inputs["pixel_values"] = inputs["pixel_values"].to(torch.float16)

            # Optional debug (uncomment if needed)
            # print("Florence inputs:")
            # for k, v in inputs.items():
            #     if isinstance(v, torch.Tensor):
            #         print("  ", k, v.shape, v.dtype, v.device)

            # 3. Generate – IMPORTANT: pass **inputs
            with torch.no_grad():
                generated_ids = model.generate(
                    **inputs,
                    max_new_tokens=512,
                    do_sample=False,
                    num_beams=3,
                )

            # 4. Decode
            generated_text = processor.batch_decode(
                generated_ids,
                skip_special_tokens=False
            )[0]

            # 5. Post-process using Florence helper
            parsed = processor.post_process_generation(
                generated_text,
                task=task,
                image_size=(image.width, image.height),
            )

            description = parsed.get(task, "")

            # Fallbacks to avoid empty text
            if not description:
                description = (
                    generated_text
                    .replace(task, "")
                    .replace("<s>", "")
                    .replace("</s>", "")
                    .strip()
                )

            if not description:
                description = f"Product image of {title}"

            return description

        except Exception as e:
            if device == "cuda":
                torch.cuda.empty_cache()

            if attempt < max_retries - 1:
                print(f"      ⚠ Analysis attempt {attempt + 1} failed: {e}")
                print(f"      ⏳ Retrying in {RETRY_DELAY}s...")
                time.sleep(RETRY_DELAY)
            else:
                print(f"      ✗ Florence failed after {max_retries} attempts. Using fallback.")
                return f"Product image of {title}"

def main():
    parser = argparse.ArgumentParser(description="GPU-Accelerated Product Upsert")
    parser.add_argument("--collection", required=True, help="Qdrant collection name")
    args = parser.parse_args()
    collection_name = args.collection

    print(f"\n{'='*60}")
    print(f"GPU-Accelerated Product Upsert (Numpy Scrub Fix)")
    print(f"{'='*60}")
    
    device = get_device()
    
    # Connect Qdrant
    try:
        client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
        try:
            client.get_collection(collection_name)
        except:
            client.create_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(size=384, distance=Distance.COSINE),
            )
        print(f"✓ Connected to Collection: {collection_name}")
    except Exception as e:
        print(f"✗ Qdrant Error: {e}")
        sys.exit(1)

    # Load Models
    try:
        florence_model, florence_processor, embedding_model = load_models(device)
    except Exception as e:
        print(f"✗ Model Error: {e}")
        sys.exit(1)

    # Find Data
    data_dir = os.path.join(os.path.dirname(__file__), '../upsert_data/data')
    csv_files = glob.glob(os.path.join(data_dir, '**', 'products.csv'), recursive=True)
    print(f"Found {len(csv_files)} product CSV files\n")

    total_processed = 0

    for csv_file in csv_files:
        brand = os.path.basename(os.path.dirname(csv_file))
        print(f"\nProcessing Brand: {brand}")
        
        try:
            df = pd.read_csv(csv_file)
        except: continue

        for idx, row in df.iterrows():
            title = str(row.get('title', ''))
            image_url = str(row.get('image_url', ''))
            price = str(row.get('price_original', ''))
            original_desc = str(row.get('description', ''))

            if not title or not image_url or image_url == 'nan': continue

            print(f"\n[{total_processed+1}] {title[:50]}...")

            # 1. Download & Scrub
            try:
                image = download_image_with_retry(image_url)
                print(f"  ✓ Downloaded & Scrubbed ({image.width}x{image.height})")
            except Exception as e:
                print(f"  ✗ Download failed: {e}")
                continue

            # 2. Analyze
            print(f"  Analysing...")
            visual_desc = analyze_image_with_retry(
                florence_model, florence_processor, image, title, price, device
            )
            print(f"  ✓ Description: {visual_desc[:50]}...")

            # 3. Embed & Upsert
            rich_text = f"Product: {title}. Brand: {brand}. Price: {price}. Visuals: {visual_desc}. {original_desc}"
            embedding = embedding_model.encode(rich_text).tolist()

            try:
                point = PointStruct(
                    id=str(uuid4()),
                    vector=embedding,
                    payload={
                        "title": title,
                        "description": visual_desc,
                        "original_description": original_desc,
                        "price_numeric": float(price) if price and price != 'nan' else 0,
                        "image_url": image_url,
                        "product_url": row.get('product_url', ''),
                        "brand": brand
                    }
                )
                client.upsert(collection_name=collection_name, points=[point])
                print(f"  ✓ Upserted")
                total_processed += 1
            except Exception as e:
                print(f"  ✗ Upsert failed: {e}")

    print(f"\nDone! Processed {total_processed} items.")

if __name__ == "__main__":
    main()