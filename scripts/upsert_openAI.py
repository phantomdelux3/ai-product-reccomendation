#!/usr/bin/env python3
"""
OpenAI-Based Product Upsert Script
Uses OpenAI Vision API for image analysis and generates rich product descriptions
"""

import os
import sys
import argparse
import glob
import json
import time
import re
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
import hashlib

import pandas as pd
from dotenv import load_dotenv
from openai import OpenAI
from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct, VectorParams, Distance
from PIL import Image
import requests
from io import BytesIO
import torch

# Load environment variables
load_dotenv()

# Configuration
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
QDRANT_URL = os.getenv("QDRANT_URL")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")

# Retry configuration
MAX_RETRIES = 3
RETRY_DELAY = 2  # seconds

# Initialize OpenAI client
openai_client = OpenAI(api_key=OPENAI_API_KEY)

# Setup logging
logger = logging.getLogger(__name__)

def setup_logging(log_file: str):
    """Setup logging to both file and console"""
    logger.setLevel(logging.INFO)
    
    # File handler
    fh = logging.FileHandler(log_file)
    fh.setLevel(logging.INFO)
    
    # Console handler
    ch = logging.StreamHandler()
    ch.setLevel(logging.INFO)
    
    # Formatter with timestamps
    formatter = logging.Formatter('[%(asctime)s] %(levelname)s: %(message)s', 
                                 datefmt='%Y-%m-%d %H:%M:%S')
    fh.setFormatter(formatter)
    ch.setFormatter(formatter)
    
    logger.addHandler(fh)
    logger.addHandler(ch)
    
    return logger


def print_section(title: str, char: str = "="):
    """Print a formatted section header"""
    msg = f"\n{char * 80}\n{title}\n{char * 80}"
    print(msg)
    if logger.handlers:
        logger.info(title)


def print_subsection(title: str):
    """Print a formatted subsection header"""
    print(f"\n{'-' * 80}")
    print(f"{title}")
    print(f"{'-' * 80}")


def analyze_product_with_openai(
    image_url: str,
    title: str,
    price: str,
    original_description: str,
    brand: str
) -> Dict[str, str]:
    """
    Analyze product image and metadata using OpenAI Vision API
    
    Returns:
        dict with keys:
            - visual_analysis: Detailed visual description from image
            - product_description: User-friendly product description
            - vector_description: Search-optimized description for embeddings
    """
    
    logger.info(f"Analyzing product: {title[:50]}...")
    print(f"  [OpenAI] Analyzing product image and generating descriptions...")
    
    # Prepare the prompt for comprehensive analysis
    prompt = f"""Analyze this product image and the following information:

Product Title: {title}
Brand: {brand}
Price: ₹{price}
Original Description: {original_description if original_description and original_description != 'nan' else 'Not provided'}

Your task is to generate THREE separate outputs:

1. VISUAL_ANALYSIS: Describe what you see in the image in detail. Include:
   - Visual appearance (colors, patterns, textures, materials)
   - Style and design characteristics
   - Product type and category
   - Any distinctive features or details
   - Materials visible in the image

2. PRODUCT_DESCRIPTION: Create a user-friendly, readable product description that:
   - Combines the visual analysis with the product information
   - Describes the product in an engaging, natural way
   - Highlights key features and benefits
   - Is suitable for displaying on an e-commerce site
   - Length: 2-3 sentences

3. VECTOR_DESCRIPTION: Create a search-optimized description for semantic search that:
   - Includes all searchable terms and keywords
   - Mentions product type, category, subcategory
   - Lists colors, materials, style attributes
   - Includes occasion tags (e.g., birthday, anniversary, casual gift)
   - Includes persona tags (e.g., trendy girl, minimalist, nature lover)
   - Includes interest areas (e.g., skincare, home decor, wellness)
   - Mentions price range (budget, mid-range, premium based on price)
   - Is comprehensive but natural for embedding

Format your response as JSON:
{{
    "visual_analysis": "detailed visual description here",
    "product_description": "user-friendly description here",
    "vector_description": "search-optimized description here",
    "colors": ["color1", "color2"],
    "materials": ["material1", "material2"],
    "category": "main category",
    "subcategory": "subcategory if applicable",
    "style": "design style",
    "occasions": ["occasion1", "occasion2"],
    "personas": ["persona1", "persona2"],
    "interests": ["interest1", "interest2"],
    "price_sentiment": "budget|mid-range|premium"
}}"""

    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": prompt
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": image_url
                            }
                        }
                    ]
                }
            ],
            max_tokens=1000,
            temperature=0.7
        )
        
        # Parse the JSON response
        content = response.choices[0].message.content
        
        # Extract JSON from response (in case there's extra text)
        json_match = re.search(r'\{.*\}', content, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
        else:
            result = json.loads(content)
        
        logger.info(f"OpenAI analysis complete for: {title[:50]}")
        print(f"  [OpenAI] Analysis complete")
        return result
        
    except Exception as e:
        logger.error(f"OpenAI analysis failed for {title[:50]}: {str(e)}")
        print(f"  [OpenAI] Error: {e}")
        # Return fallback values
        return {
            "visual_analysis": f"{title} - Image analysis failed",
            "product_description": f"{title}. {original_description if original_description and original_description != 'nan' else 'A quality product from ' + brand}",
            "vector_description": f"{title}. Brand: {brand}. Price: ₹{price}. {original_description if original_description and original_description != 'nan' else ''}",
            "colors": [],
            "materials": [],
            "category": "Unknown",
            "subcategory": "",
            "style": "",
            "occasions": [],
            "personas": [],
            "interests": [],
            "price_sentiment": "mid-range"
        }


def generate_embedding(text: str, model: SentenceTransformer) -> List[float]:
    """Generate embedding vector for text using SentenceTransformer"""
    embedding = model.encode(text, show_progress_bar=False, convert_to_numpy=False)
    return embedding.tolist() if hasattr(embedding, 'tolist') else embedding


def generate_point_id(product_url: str) -> str:
    """Generate unique ID for product based on URL"""
    digest = hashlib.sha256(product_url.encode()).hexdigest()
    return digest[:32]


def parse_price(price_str: str) -> float:
    """Parse price string to float"""
    try:
        if not price_str or price_str == 'nan':
            return 0.0
        # Remove all non-numeric characters except decimal point
        cleaned = re.sub(r'[^\d.]', '', str(price_str))
        return float(cleaned) if cleaned else 0.0
    except:
        return 0.0


def process_single_product(
    product: Dict[str, Any],
    brand: str,
    embedding_model: SentenceTransformer,
    client: QdrantClient,
    collection_name: str
) -> bool:
    """
    Process a single product: analyze with OpenAI, generate embeddings, upsert to Qdrant
    
    Returns:
        True if successful, False otherwise
    """
    
    title = str(product.get('title', 'Untitled'))
    image_url = str(product.get('image_url', ''))
    price_original = str(product.get('price_original', '0'))
    price_discounted = str(product.get('price_discounted', ''))
    product_url = str(product.get('product_url', ''))
    original_description = str(product.get('description', ''))
    
    print(f"\n  Product: {title[:70]}")
    print(f"  Price: ₹{price_original}")
    print(f"  Image: {image_url[:70]}...")
    
    if not image_url or image_url == 'nan':
        print(f"  [SKIP] No image URL")
        return False
    
    # Analyze with OpenAI Vision API
    try:
        analysis = analyze_product_with_openai(
            image_url=image_url,
            title=title,
            price=price_original,
            original_description=original_description,
            brand=brand
        )
    except Exception as e:
        print(f"  [ERROR] Failed to analyze: {e}")
        return False
    
    # Log generated descriptions
    print(f"\n  {'┌' + '─' * 78 + '┐'}")
    print(f"  │ VISUAL ANALYSIS (from image):{' ' * 49}│")
    print(f"  {'├' + '─' * 78 + '┤'}")
    for line in analysis['visual_analysis'][:200].split('\n'):
        print(f"  │ {line[:76]:<76}│")
    print(f"  {'└' + '─' * 78 + '┘'}")
    
    print(f"\n  {'┌' + '─' * 78 + '┐'}")
    print(f"  │ PRODUCT DESCRIPTION (user-friendly):{' ' * 42}│")
    print(f"  {'├' + '─' * 78 + '┤'}")
    for line in analysis['product_description'][:200].split('\n'):
        print(f"  │ {line[:76]:<76}│")
    print(f"  {'└' + '─' * 78 + '┘'}")
    
    print(f"\n  {'┌' + '─' * 78 + '┐'}")
    print(f"  │ VECTOR DESCRIPTION (search-optimized):{' ' * 40}│")
    print(f"  {'├' + '─' * 78 + '┤'}")
    for line in analysis['vector_description'][:200].split('\n'):
        print(f"  │ {line[:76]:<76}│")
    print(f"  {'└' + '─' * 78 + '┘'}")
    
    # Generate embedding from vector description
    print(f"\n  [Embedding] Generating vector from search-optimized description...")
    try:
        embedding = generate_embedding(analysis['vector_description'], embedding_model)
        print(f"  [Embedding] Generated {len(embedding)}-dimensional vector")
    except Exception as e:
        print(f"  [ERROR] Failed to generate embedding: {e}")
        return False
    
    # Parse price
    price_numeric = parse_price(price_original)
    
    # Prepare payload for Qdrant
    payload = {
        'title': title,
        'description': analysis['product_description'],  # User-friendly description
        'vector_description': analysis['vector_description'],  # Search-optimized
        'visual_analysis': analysis['visual_analysis'],  # Raw visual analysis
        'original_description': original_description,
        'price_original': price_original,
        'price_discounted': price_discounted,
        'price_numeric': price_numeric,
        'image_url': image_url,
        'product_url': product_url,
        'brand': brand,
        # AI-generated metadata
        'colors': analysis.get('colors', []),
        'materials': analysis.get('materials', []),
        'category': analysis.get('category', 'Unknown'),
        'subcategory': analysis.get('subcategory', ''),
        'style': analysis.get('style', ''),
        'occasions': analysis.get('occasions', []),
        'personas': analysis.get('personas', []),
        'interests': analysis.get('interests', []),
        'price_sentiment': analysis.get('price_sentiment', 'mid-range'),
        'uploaded_at': datetime.now().isoformat()
    }
    
    # Generate point ID
    point_id = generate_point_id(product_url)
    
    # Upsert to Qdrant
    print(f"\n  [Qdrant] Upserting to collection '{collection_name}'...")
    try:
        point = PointStruct(
            id=point_id,
            vector=embedding,
            payload=payload
        )
        
        client.upsert(
            collection_name=collection_name,
            points=[point]
        )
        logger.info(f"Successfully upserted: {title[:50]} to {collection_name}")
        print(f"  [Qdrant] Successfully upserted")
        return True
        
    except Exception as e:
        logger.error(f"Upsert failed for {title[:50]}: {str(e)}")
        print(f"  [ERROR] Failed to upsert: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="OpenAI-Based Product Upsert Script"
    )
    parser.add_argument("--collection", required=True, help="Qdrant collection name")
    parser.add_argument("--batch-size", type=int, default=20, help="Batch size for processing")
    parser.add_argument("--skip-existing", action="store_true", help="Skip products already in collection")
    parser.add_argument("--limit", type=int, help="Limit number of products to process (for testing)")
    parser.add_argument("--brands", help="Comma-separated list of brands to process")
    
    args = parser.parse_args()
    
    # Setup logging
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    log_dir = os.path.join(os.path.dirname(__file__), '../logs')
    os.makedirs(log_dir, exist_ok=True)
    log_file = os.path.join(log_dir, f'upsert_openai_{args.collection}_{timestamp}.log')
    setup_logging(log_file)
    
    logger.info("="*80)
    logger.info("OpenAI-Based Product Upsert Script Started")
    logger.info(f"Log file: {log_file}")
    logger.info(f"Target Collection: {args.collection}")
    logger.info(f"Batch Size: {args.batch_size}")
    if args.limit:
        logger.info(f"Limit: {args.limit} products")
    if args.brands:
        logger.info(f"Filtering brands: {args.brands}")
    logger.info("="*80)
    
    print_section("OpenAI-Based Product Upsert Script")
    print(f"Target Collection: {args.collection}")
    print(f"Batch Size: {args.batch_size}")
    print(f"Log file: {log_file}")
    
    # Check API keys
    if not OPENAI_API_KEY:
        print("\n[ERROR] OPENAI_API_KEY not found in environment variables")
        sys.exit(1)
    
    if not QDRANT_URL or not QDRANT_API_KEY:
        print("\n[ERROR] QDRANT_URL or QDRANT_API_KEY not found in environment variables")
        sys.exit(1)
    
    print(f"\n[✓] Environment variables loaded")
    
    # Initialize Qdrant client
    print(f"\n[Qdrant] Connecting to {QDRANT_URL}...")
    try:
        qdrant_client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
        print(f"[✓] Connected to Qdrant")
    except Exception as e:
        print(f"[ERROR] Failed to connect to Qdrant: {e}")
        sys.exit(1)
    
    # Ensure collection exists
    try:
        qdrant_client.get_collection(args.collection)
        print(f"[✓] Collection '{args.collection}' exists")
    except Exception:
        print(f"\n[!] Collection '{args.collection}' not found, creating...")
        try:
            qdrant_client.create_collection(
                collection_name=args.collection,
                vectors_config=VectorParams(size=384, distance=Distance.COSINE)
            )
            print(f"[✓] Collection created")
        except Exception as e:
            print(f"[ERROR] Failed to create collection: {e}")
            sys.exit(1)
    
    # Initialize embedding model
    print(f"\n[Embedding] Loading SentenceTransformer model...")
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    embedding_model = SentenceTransformer('all-MiniLM-L6-v2', device=device)
    print(f"[✓] Loaded on {device.upper()}")
    if device == 'cuda':
        print(f"[✓] Using GPU: {torch.cuda.get_device_name(0)}")
    
    # Find CSV files
    data_dir = os.path.join(os.path.dirname(__file__), '../upsert_data/data')
    if not os.path.exists(data_dir):
        data_dir = os.path.join(os.path.dirname(__file__), '../data_new')
    
    csv_files = glob.glob(os.path.join(data_dir, '**', 'products.csv'), recursive=True)
    
    # Filter by brands if specified
    if args.brands:
        brand_list = [b.strip() for b in args.brands.split(',')]
        csv_files = [f for f in csv_files if any(brand in f for brand in brand_list)]
    
    print(f"\n[✓] Found {len(csv_files)} product CSV files")
    
    if len(csv_files) == 0:
        print(f"[ERROR] No CSV files found in {data_dir}")
        sys.exit(0)
    
    # Statistics
    total_products = 0
    total_processed = 0
    total_failed = 0
    failed_products = []
    start_time = time.time()
    
    # Process each brand
    for csv_idx, csv_file in enumerate(csv_files):
        brand = os.path.basename(os.path.dirname(csv_file))
        
        print_section(f"[{csv_idx + 1}/{len(csv_files)}] Processing Brand: {brand}")
        
        try:
            df = pd.read_csv(csv_file)
            products_in_csv = len(df)
            
            # Apply limit if specified
            if args.limit and total_processed >= args.limit:
                print(f"[!] Reached limit of {args.limit} products, stopping")
                break
            
            if args.limit:
                remaining = args.limit - total_processed
                if remaining < products_in_csv:
                    df = df.head(remaining)
                    products_in_csv = remaining
            
            print(f"Found {products_in_csv} products in CSV")
        except Exception as e:
            print(f"[ERROR] Failed to read CSV: {e}")
            continue
        
        # Process each product
        for idx, row in df.iterrows():
            total_products += 1
            
            product = row.to_dict()
            product['brand'] = brand
            
            print_subsection(f"[{idx + 1}/{products_in_csv}]")
            
            success = process_single_product(
                product=product,
                brand=brand,
                embedding_model=embedding_model,
                client=qdrant_client,
                collection_name=args.collection
            )
            
            if success:
                total_processed += 1
            else:
                total_failed += 1
                failed_products.append({
                    'title': product.get('title', 'Unknown'),
                    'brand': brand
                })
            
            # Progress logging every 10 products
            if total_products % 10 == 0:
                elapsed = time.time() - start_time
                rate = total_products / elapsed if elapsed > 0 else 0
                remaining = total_products  # Will be updated when we know total
                eta_seconds = remaining / rate if rate > 0 else 0
                logger.info(f"Progress: {total_processed}/{total_products} processed, "
                          f"{total_failed} failed, {rate:.2f} products/sec")
            
            # Small delay to avoid rate limiting
            time.sleep(0.5)
    
    # Final summary
    elapsed_time = time.time() - start_time
    
    print_section("FINAL SUMMARY")
    print(f"Total products found:     {total_products}")
    print(f"Successfully processed:   {total_processed} [✓]")
    print(f"Failed:                   {total_failed} [✗]")
    print(f"Total time:               {elapsed_time/60:.1f} minutes")
    print(f"Processing rate:          {total_products/elapsed_time:.2f} products/sec")
    
    logger.info("="*80)
    logger.info("FINAL SUMMARY")
    logger.info(f"Total products found: {total_products}")
    logger.info(f"Successfully processed: {total_processed}")
    logger.info(f"Failed: {total_failed}")
    logger.info(f"Total time: {elapsed_time/60:.1f} minutes")
    logger.info(f"Processing rate: {total_products/elapsed_time:.2f} products/sec")
    
    if total_products > 0:
        success_rate = (total_processed / total_products) * 100
        print(f"Success rate:             {success_rate:.1f}%")
        logger.info(f"Success rate: {success_rate:.1f}%")
    
    if failed_products:
        print(f"\nFailed products:")
        logger.warning(f"Failed products ({len(failed_products)} total):")
        for i, failed in enumerate(failed_products[:10], 1):
            print(f"  {i}. {failed['title']} (Brand: {failed['brand']})")
            logger.warning(f"  {i}. {failed['title']} (Brand: {failed['brand']})")
        if len(failed_products) > 10:
            print(f"  ... and {len(failed_products) - 10} more")
    
    logger.info("Script completed successfully")
    logger.info("="*80)
    print(f"\n[✓] Script completed\n")


if __name__ == "__main__":
    main()
