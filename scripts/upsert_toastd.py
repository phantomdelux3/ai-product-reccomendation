import os
import sys
import argparse
import glob
import json
import pandas as pd
from PIL import Image
import requests
from io import BytesIO
import base64
from openai import OpenAI
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct, VectorParams, Distance
from uuid import uuid4
from dotenv import load_dotenv
import time
import re

# Load env vars
load_dotenv(os.path.join(os.path.dirname(__file__), '../.env'))

QDRANT_URL = os.getenv("QDRANT_URL")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OLLAMA_URL = "http://localhost:11434/api/generate"

# Configuration
MAX_RETRIES = 3
RETRY_DELAY = 2

RECIPIENT_MAP = {
    'Boyfriend': 'boyfriends',
    'Girlfriend': 'girlfriends',
    'Mom': 'mom',
    'Dad': 'dad',
    'Friend': 'friend',
    'Colleague': 'colleague'
}
RECIPIENTS = list(RECIPIENT_MAP.keys())

# Specific vibes per recipient (Matches lib/config/guided-mode.ts)
VIBE_MAP = {
    'Boyfriend': ['Tech', 'Gaming', 'Grooming', 'Fashion', 'Fitness', 'Romantic', 'Food & Drink', 'Wellness', 'Travel', 'Music', 'General'],
    'Girlfriend': ['Jewelry', 'Beauty', 'Fashion', 'Home Decor', 'Cute', 'Romantic', 'Wellness', 'Food & Drink', 'Travel', 'Art', 'Books', 'Stationery', 'General'],
    'Mom': ['Home Decor', 'Kitchen', 'Wellness', 'Gardening', 'Fashion', 'Sentimental', 'Food & Drink', 'Travel', 'Books', 'Art', 'Stationery', 'General'],
    'Dad': ['Tech', 'Tools', 'Grooming', 'Food & Drink', 'Office', 'Wellness', 'Travel', 'Sports', 'Music', 'General'],
    'Friend': ['Funny', 'Games', 'Decor', 'Stationery', 'Tech', 'Snacks', 'Food & Drink', 'Wellness', 'Travel', 'Music', 'Books', 'General'],
    'Colleague': ['Office', 'Stationery', 'Tech', 'Coffee/Tea', 'Professional', 'Food & Drink', 'Wellness', 'Travel', 'Books', 'General']
}

def download_image_with_retry(image_url, max_retries=MAX_RETRIES):
    for attempt in range(max_retries):
        try:
            headers = {'User-Agent': 'Mozilla/5.0'}
            response = requests.get(image_url, headers=headers, stream=True, timeout=15)
            response.raise_for_status()
            img_raw = Image.open(BytesIO(response.content))
            if img_raw.mode != "RGB":
                img_raw = img_raw.convert("RGB")
            
            # Resize if too big (Ollama handles big images okay, but smaller is faster)
            if max(img_raw.size) > 1024:
                scale = 1024 / max(img_raw.size)
                img_raw = img_raw.resize((int(img_raw.width * scale), int(img_raw.height * scale)), Image.Resampling.LANCZOS)
            return img_raw
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(RETRY_DELAY)
            else:
                raise

def clean_html(raw_html):
    if not isinstance(raw_html, str):
        return ""
    cleanr = re.compile('<.*?>')
    cleantext = re.sub(cleanr, '', raw_html)
    return cleantext.strip()

def analyze_image_with_ollama(image, title, description, headline):
    """
    Analyzes image using Ollama's LLaVA model, using product text for context.
    """
    try:
        # Convert PIL Image to Base64
        buffered = BytesIO()
        image.save(buffered, format="JPEG")
        img_str = base64.b64encode(buffered.getvalue()).decode('utf-8')

        # Provide context to LLaVA so it knows what it's looking at
        prompt = f"""
        Context: Product "{title}". Headline: "{headline}".
        Description: "{description[:200]}..."
        
        Task: Analyze the image for GIFTING. 
        1. Confirm the visual style (Minimalist, Rugged, Cute, Luxury?).
        2. Describe the key visual features (Materials, Colors, Packaging).
        3. Who would this look good for?
        """

        response = requests.post(OLLAMA_URL, json={
            "model": "llava", # Standard vision model in Ollama
            "prompt": prompt,
            "images": [img_str],
            "stream": False
        })
        
        if response.status_code == 200:
            return response.json().get('response', 'Product image')
        else:
            print(f"  ⚠ Ollama Vision Error: {response.status_code} - {response.text}")
            return "Product image"
    except Exception as e:
        print(f"  ⚠ Ollama Vision Exception: {e}")
        return "Product image"

def categorize_with_ollama(title, description, visual_desc, brand, headline):
    # Construct vibe options string for prompt
    vibe_context = "\n".join([f"       - {r}: {', '.join(vibes)}" for r, vibes in VIBE_MAP.items()])

    prompt = f"""
    You are a PRACTICAL & GENEROUS Gift Curator. Analyze this product to find MULTIPLE recipients.
    
    Product Context:
    - Title: {title}
    - Headline: {headline}
    - Description: {description[:500]} 
    - Visuals: {visual_desc}

    Your Goal: 
    1. Map to AS MANY recipients as possible (if it fits).
    2. Score "Good" matches high enough to count (> 5).
    3. Select ONLY vibes that ACTUALLY match the product features.
    4. Write a "Gift Analysis" (1-2 sentences) explaining WHY this is a great gift and WHO it is best for.

    Guidelines:
    1. **Recipients (BE AGGRESSIVE)**: 
       - **Luggage/Bags**: Fits Dad (Travel), Boyfriend (Commute), Friend (Travel), Girlfriend (Travel), Colleague (Work).
       - **Stationery/Notebooks**: Fits Friend (Creative), Colleague (Work), Girlfriend (Journaling/Cute), Dad (Office), Mom (Journaling).
       - **Tea/Coffee**: Fits Everyone (Dad, Mom, Boyfriend, Girlfriend, Friend, Colleague).
       - **Decor**: Fits Girlfriend, Mom, Friend, Colleague (Desk).

    2. **Scoring Calibration (CRITICAL)**:
       - **9-10 (Perfect)**: The item is MADE for them (e.g., "Beard Oil" for Boyfriend).
       - **6-8 (Good/Valid)**: They would use it or like it (e.g., "Luggage" for Dad/Friend). **USE THIS RANGE OFTEN.**
       - **0-5 (Weak)**: Irrelevant (e.g., "Beard Oil" for Mom).

    3. **Vibes (BE STRICT - DO NOT HALLUCINATE)**:
       - **"Tech"**: ONLY for electronics, gadgets. (NEVER for Tea, Bags).
       - **"Food & Drink"**: ONLY for edibles, mugs.
       - **"Travel"**: ONLY for bags, travel accessories.
       - **"Stationery"**: ONLY for notebooks, pens.

    Available Vibes per Recipient:
{vibe_context}

    Output JSON ONLY:
    {{
        "recipient_data": {{
            "Boyfriend": {{ 
                "score": 9, 
                "vibes": {{ "Tech": 9, "Gaming": 8 }} 
            }},
            "Dad": {{ 
                "score": 7,  # Good match!
                "vibes": {{ "Travel": 8 }} 
            }},
            "Friend": {{ 
                "score": 7,  # Good match!
                "vibes": {{ "Travel": 7 }} 
            }}
        }},
        "product_type": "Luggage",
        "gift_analysis": "A durable and stylish luggage piece, perfect for Dad's business trips or a Friend's weekend getaway. Its rugged design makes it a practical yet thoughtful gift for any traveler."
    }}
    """
    
    try:
        response = requests.post(OLLAMA_URL, json={
            "model": "llama3.2", # Using llama3.2 for robust JSON generation
            "prompt": prompt,
            "stream": False,
            "format": "json"
        })
        if response.status_code == 200:
            return response.json().get('response', '{}')
        return '{}'
    except:
        return '{}'

def slugify(text):
    text = str(text).lower()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_-]+', '-', text)
    return text.strip('-')

def main():
    print("Starting Toastd Product Upsert (Ollama Vision + OpenAI Embeddings)...")
    
    if not OPENAI_API_KEY:
        print("✗ Error: OPENAI_API_KEY not found in .env")
        return

    # Connect Qdrant
    client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
    collection_name = "toastd"
    
    # Initialize OpenAI
    openai_client = OpenAI(api_key=OPENAI_API_KEY)
    
    # Recreate Collection
    print(f"Recreating collection: {collection_name}")
    client.delete_collection(collection_name)
    client.create_collection(
        collection_name=collection_name,
        vectors_config=VectorParams(size=384, distance=Distance.COSINE),
    )
    
    # Read CSV
    csv_path = os.path.join(os.path.dirname(__file__), '../data/toastd_products.csv')
    if not os.path.exists(csv_path):
        print(f"CSV not found at {csv_path}")
        return

    df = pd.read_csv(csv_path)
    print(f"Found {len(df)} products")
    
    total_upserted = 0
    
    batch_size = 20
    batch_points = []
    
    for idx, row in df.iterrows():
        title = str(row.get('title', ''))
        image_url = str(row.get('first_image_url', row.get('image_url', '')))
        price = str(row.get('price', '0'))
        
        # Clean Description (Remove HTML)
        raw_desc = str(row.get('description', ''))
        description = clean_html(raw_desc)
        
        headline = str(row.get('headline', ''))
        headline_desc = str(row.get('headlinedescription', ''))
        offer = str(row.get('offer', ''))
        brand = str(row.get('brand_name', 'toastd'))
        
        if not title or not image_url or image_url == 'nan': continue
        
        print(f"\nProcessing [{idx+1}/{len(df)}]: {title[:50]}...")
        
        # 1. Image Analysis (Ollama LLaVA)
        try:
            image = download_image_with_retry(image_url)
            visual_desc = analyze_image_with_ollama(image, title, description, headline)
            print(f"  ✓ Visual Analysis: {visual_desc[:50]}...")
        except Exception as e:
            print(f"  ✗ Image failed: {e}")
            visual_desc = f"Product image of {title}"

        # 2. Categorization (Ollama Llama 3.2)
        cat_json_str = categorize_with_ollama(title, description, visual_desc, brand, headline)
        try:
            cat_data = json.loads(cat_json_str)
            
            # Parse Recipient Data (Score + Vibe Scores)
            recipient_data = cat_data.get('recipient_data', {})
            
            final_recipients = []
            final_vibes = [] 
            display_recipients = [] # For CLI output
            
            for r, data in recipient_data.items():
                score = data.get('score', 0)
                vibes_dict = data.get('vibes', {})
                
                # Filter Recipient by Score > 5
                if isinstance(score, (int, float)) and score > 5:
                    mapped_r = RECIPIENT_MAP.get(r)
                    if mapped_r:
                        final_recipients.append(mapped_r)
                        display_recipients.append(f"{r}({score})")
                        
                        # Filter Vibes by Score > 5
                        if isinstance(vibes_dict, dict):
                            for v, v_score in vibes_dict.items():
                                if isinstance(v_score, (int, float)) and v_score > 5:
                                    final_vibes.append(v)
                        elif isinstance(vibes_dict, str): # Fallback if AI returns string
                             final_vibes.append(vibes_dict)

            
            # Deduplicate vibes
            final_vibes = list(set(final_vibes))
            
            product_type = cat_data.get('product_type', 'General')
            gift_analysis = cat_data.get('gift_analysis', '')
            
            print(f"  ✓ Type: {product_type} | For: {display_recipients} | Vibe: {final_vibes}")
        except:
            final_recipients = []
            product_type = 'General'
            final_vibes = []
            gift_analysis = ''
            print(f"  ⚠ Categorization failed. Raw: {cat_json_str[:100]}...")

        # 3. Prepare Data
        slug = slugify(row.get('slug', slugify(title))) 
        product_url = f"https://www.toastd.in/product/{slug}"
        
        # Rich text for embedding
        rich_text = (
            f"Product: {title}. "
            f"Headline: {headline}. "
            f"Type: {product_type}. "
            f"For: {', '.join(final_recipients)}. "
            f"Aesthetics: {', '.join(final_vibes)}. "
            f"Visuals: {visual_desc}. "
            f"Description: {description}. "
            f"Analysis: {gift_analysis}. "
            f"Price: {price}"
        )
        
        # Generate Embedding with OpenAI (384 dimensions)
        try:
            embedding_response = openai_client.embeddings.create(
                model="text-embedding-3-small",
                input=rich_text,
                dimensions=384
            )
            embedding = embedding_response.data[0].embedding
        except Exception as e:
            print(f"  ✗ Embedding failed: {e}")
            continue
        
        point = PointStruct(
            id=str(uuid4()),
            vector=embedding,
            payload={
                "title": title,
                "description": description,
                "visual_description": visual_desc,
                "analysis_description": gift_analysis,
                "headline": headline,
                "headline_description": headline_desc,
                "offer": offer,
                "price": float(price) if price.replace('.','',1).isdigit() else 0,
                "image_url": image_url,
                "product_url": product_url,
                "brand": brand,
                "recipients": final_recipients,
                "product_type": product_type,
                "aesthetics": final_vibes,
                "is_toastd": True,
                "slug": slug
            }
        )
        
        batch_points.append(point)
        
        if len(batch_points) >= batch_size:
            try:
                client.upsert(collection_name=collection_name, points=batch_points)
                total_upserted += len(batch_points)
                print(f"  ✓ Upserted batch of {len(batch_points)} products")
                batch_points = []
            except Exception as e:
                print(f"  ✗ Batch upsert failed: {e}")

    # Upsert remaining points
    if batch_points:
        try:
            client.upsert(collection_name=collection_name, points=batch_points)
            total_upserted += len(batch_points)
            print(f"  ✓ Upserted final batch of {len(batch_points)} products")
        except Exception as e:
            print(f"  ✗ Final batch upsert failed: {e}")

    print(f"\nDone! Upserted {total_upserted} products.")

if __name__ == "__main__":
    main()
