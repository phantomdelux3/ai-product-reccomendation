import os
import sys
import argparse
import glob
import json
import pandas as pd
import torch
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
RETRY_DELAY = 2  # seconds

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
    
    # Determine dtype
    torch_dtype = torch.float16 if device == 'cuda' else torch.float32
    print(f"Using dtype: {torch_dtype}")
    
    # Florence-2 for Image Analysis
    florence_model_id = 'microsoft/Florence-2-base'
    print(f"\n[1/2] Loading Florence-2 Vision Model...")
    print(f"      Model: {florence_model_id}")
    
    try:
        florence_model = AutoModelForCausalLM.from_pretrained(
            florence_model_id, 
            dtype=torch_dtype,
            trust_remote_code=True,
            attn_implementation='eager'  # Avoid SDPA compatibility issues
        ).to(device)
        florence_model.eval()  # Set to evaluation mode
        florence_processor = AutoProcessor.from_pretrained(florence_model_id, trust_remote_code=True)
        print(f"      ✓ Florence-2 loaded successfully")
    except Exception as e:
        print(f"      ✗ Failed to load Florence-2: {e}")
        raise

    # Sentence Transformer for Embeddings (384 dimensions)
    print(f"\n[2/2] Loading SentenceTransformer for Embeddings...")
    print(f"      Model: all-MiniLM-L6-v2 (384 dims)")
    
    try:
        embedding_model = SentenceTransformer('all-MiniLM-L6-v2', device=device)
        print(f"      ✓ SentenceTransformer loaded successfully")
    except Exception as e:
        print(f"      ✗ Failed to load SentenceTransformer: {e}")
        raise
    
    print(f"\n{'='*60}")
    print(f"✓ All models loaded successfully!")
    print(f"{'='*60}\n")
    
    return florence_model, florence_processor, embedding_model

def download_image_with_retry(image_url, max_retries=MAX_RETRIES):
    """Download image with retry logic"""
    for attempt in range(max_retries):
        try:
            response = requests.get(image_url, stream=True, timeout=15)
            response.raise_for_status()
            image = Image.open(BytesIO(response.content)).convert("RGB")
            
            # Validate image
            if image is None or image.size[0] == 0 or image.size[1] == 0:
                raise ValueError("Invalid image dimensions")
            
            return image
        except Exception as e:
            if attempt < max_retries - 1:
                print(f"      ⚠ Download attempt {attempt + 1} failed: {e}")
                print(f"      ⏳ Retrying in {RETRY_DELAY}s...")
                time.sleep(RETRY_DELAY)
            else:
                raise

def analyze_image_with_retry(model, processor, image, title, price, device, max_retries=MAX_RETRIES):
    """Analyze image with Florence-2 with retry logic"""
    
    for attempt in range(max_retries):
        try:
            prompt = "<MORE_DETAILED_CAPTION>"
            
            if image is None:
                raise ValueError("Image is None")
            
            # Determine dtype
            torch_dtype = torch.float16 if device == 'cuda' else torch.float32
            
            # Process inputs - this returns a BatchEncoding object
            inputs = processor(text=prompt, images=image, return_tensors="pt")
            
            # Manually move each tensor to device with correct dtype
            # This avoids the .to() issue with BatchEncoding
            input_ids = inputs["input_ids"].to(device)
            pixel_values = inputs["pixel_values"].to(device, dtype=torch_dtype)
            
            # Generate with explicit parameters
            with torch.no_grad():
                generated_ids = model.generate(
                    input_ids=input_ids,
                    pixel_values=pixel_values,
                    max_new_tokens=512,
                    early_stopping=False,
                    do_sample=False,
                    num_beams=3,
                )
            
            # Decode the generated text
            generated_text = processor.batch_decode(generated_ids, skip_special_tokens=False)[0]
            
            # Parse the response
            parsed_answer = processor.post_process_generation(
                generated_text, 
                task=prompt, 
                image_size=(image.width, image.height)
            )
            
            description = parsed_answer.get(prompt, "")
            
            if not description or description.strip() == "":
                raise ValueError("Empty description generated")
            
            return description
            
        except Exception as e:
            if attempt < max_retries - 1:
                print(f"      ⚠ Analysis attempt {attempt + 1} failed: {e}")
                print(f"      ⏳ Retrying in {RETRY_DELAY}s...")
                time.sleep(RETRY_DELAY)
            else:
                # Last attempt failed - raise the error
                raise

def main():
    parser = argparse.ArgumentParser(description="GPU-Accelerated Product Upsert with Florence-2")
    parser.add_argument("--collection", required=True, help="Qdrant collection name")
    parser.add_argument("--skip-existing", action="store_true", help="Skip products that already exist in collection")
    args = parser.parse_args()
    collection_name = args.collection

    print(f"\n{'='*60}")
    print(f"GPU-Accelerated Product Upsert Script")
    print(f"{'='*60}")
    print(f"Target Collection: {collection_name}")
    print(f"{'='*60}\n")

    # Get device
    device = get_device()

    # Initialize Qdrant
    print(f"\nConnecting to Qdrant...")
    try:
        client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
        print(f"✓ Connected to Qdrant at {QDRANT_URL}")
    except Exception as e:
        print(f"✗ Failed to connect to Qdrant: {e}")
        sys.exit(1)
    
    # Ensure collection exists
    try:
        client.get_collection(collection_name)
        print(f"✓ Collection '{collection_name}' exists")
    except Exception:
        print(f"⚠ Collection '{collection_name}' not found, creating...")
        try:
            client.create_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(size=384, distance=Distance.COSINE),
            )
            print(f"✓ Collection '{collection_name}' created")
        except Exception as e:
            print(f"✗ Failed to create collection: {e}")
            sys.exit(1)

    # Load Models
    try:
        florence_model, florence_processor, embedding_model = load_models(device)
    except Exception as e:
        print(f"\n✗ Failed to load models: {e}")
        sys.exit(1)

    # Find CSVs
    data_dir = os.path.join(os.path.dirname(__file__), '../upsert_data/data')
    csv_files = glob.glob(os.path.join(data_dir, '**', 'products.csv'), recursive=True)
    print(f"Found {len(csv_files)} product CSV files\n")

    if len(csv_files) == 0:
        print(f"⚠ No CSV files found in {data_dir}")
        sys.exit(0)

    # Statistics
    total_products = 0
    total_processed = 0
    total_failed = 0
    failed_products = []

    for csv_idx, csv_file in enumerate(csv_files):
        brand = os.path.basename(os.path.dirname(csv_file))
        print(f"\n{'='*60}")
        print(f"[{csv_idx + 1}/{len(csv_files)}] Processing Brand: {brand}")
        print(f"{'='*60}")
        
        try:
            df = pd.read_csv(csv_file)
            print(f"Found {len(df)} products in CSV")
        except Exception as e:
            print(f"✗ Error reading CSV: {e}")
            continue

        for idx, row in df.iterrows():
            total_products += 1
            
            title = str(row.get('title', ''))
            image_url = str(row.get('image_url', ''))
            price = str(row.get('price_original', ''))
            product_url = str(row.get('product_url', ''))
            original_desc = str(row.get('description', ''))

            if not title or not image_url or image_url == 'nan':
                print(f"\n[{idx+1}] ⚠ Skipping: Missing title or image URL")
                continue

            print(f"\n{'─'*60}")
            print(f"[{idx+1}/{len(df)}] Product: {title}")
            print(f"{'─'*60}")
            print(f"  Price: ${price}")
            print(f"  Image: {image_url[:60]}...")

            # Download Image
            print(f"\n  [Step 1/4] Downloading image...")
            try:
                image = download_image_with_retry(image_url)
                print(f"  ✓ Image downloaded: {image.size[0]}x{image.size[1]} pixels, {image.mode} mode")
            except Exception as e:
                print(f"  ✗ Failed to download image after {MAX_RETRIES} attempts: {e}")
                failed_products.append({"title": title, "reason": f"Image download failed: {e}"})
                total_failed += 1
                continue

            # Analyze Image with Florence-2
            print(f"\n  [Step 2/4] Analyzing image with Florence-2...")
            try:
                visual_description = analyze_image_with_retry(
                    florence_model, florence_processor, image, title, price, device
                )
                print(f"  ✓ Analysis complete!")
                print(f"\n  {'┌' + '─'*58 + '┐'}")
                print(f"  │ FLORENCE-2 GENERATED DESCRIPTION:                       │")
                print(f"  {'├' + '─'*58 + '┤'}")
                # Word wrap the description
                words = visual_description.split()
                line = "  │ "
                for word in words:
                    if len(line) + len(word) + 1 > 58:
                        print(f"{line:<60}│")
                        line = "  │ " + word + " "
                    else:
                        line += word + " "
                if len(line.strip()) > 3:
                    print(f"{line:<60}│")
                print(f"  {'└' + '─'*58 + '┘'}\n")
                
            except Exception as e:
                print(f"  ✗ Failed to analyze image after {MAX_RETRIES} attempts: {e}")
                failed_products.append({"title": title, "reason": f"Image analysis failed: {e}"})
                total_failed += 1
                continue

            # Create Rich Text for Embedding
            rich_text = f"Product: {title}. Brand: {brand}. Price: {price}. Description: {visual_description}. {original_desc}"
            
            # Generate Embedding
            print(f"  [Step 3/4] Generating embedding...")
            try:
                embedding = embedding_model.encode(rich_text, show_progress_bar=False).tolist()
                print(f"  ✓ Embedding generated: 384 dimensions")
            except Exception as e:
                print(f"  ✗ Embedding generation failed: {e}")
                failed_products.append({"title": title, "reason": f"Embedding failed: {e}"})
                total_failed += 1
                continue

            # Upsert to Qdrant
            print(f"\n  [Step 4/4] Upserting to Qdrant...")
            try:
                point = PointStruct(
                    id=str(uuid4()),
                    vector=embedding,
                    payload={
                        "title": title,
                        "description": visual_description,
                        "original_description": original_desc,
                        "price_numeric": float(price) if price and price != 'nan' else 0,
                        "image_url": image_url,
                        "product_url": product_url,
                        "brand": brand
                    }
                )
                
                client.upsert(
                    collection_name=collection_name,
                    points=[point]
                )
                print(f"  ✓ Successfully upserted to '{collection_name}' collection")
                total_processed += 1
                
            except Exception as e:
                print(f"  ✗ Upsert failed: {e}")
                failed_products.append({"title": title, "reason": f"Upsert failed: {e}"})
                total_failed += 1

    # Final Summary
    print(f"\n\n{'='*60}")
    print(f"FINAL SUMMARY")
    print(f"{'='*60}")
    print(f"Total products found:     {total_products}")
    print(f"Successfully processed:   {total_processed} ✓")
    print(f"Failed:                   {total_failed} ✗")
    print(f"Success rate:             {(total_processed/total_products*100) if total_products > 0 else 0:.1f}%")
    print(f"{'='*60}")
    
    if failed_products:
        print(f"\nFailed Products:")
        for i, failed in enumerate(failed_products, 1):
            print(f"  {i}. {failed['title']}")
            print(f"     Reason: {failed['reason']}")
    
    print(f"\n✓ Script completed!\n")

if __name__ == "__main__":
    main()
