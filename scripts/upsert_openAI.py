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
# from sentence_transformers import SentenceTransformer (Unused with Ollama)
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

# Initialize OpenAI client (pointing to Ollama)
openai_client = OpenAI(
    base_url='http://127.0.0.1:11434/v1',
    api_key='ollama'
)

# ... (logging setup remains same)

def analyze_product_with_openai(
    image_url: str,
    title: str,
    price: str,
    original_description: str,
    brand: str
) -> Dict[str, str]:
    """
    Analyze product metadata using Ollama (Llama 3)
    Note: Llama 3 is text-only, so we skip image analysis.
    """
    
    logger.info(f"Analyzing product: {title[:50]}...")
    print(f"  [Ollama] Analyzing product metadata...")
    
    # Prepare the prompt for text analysis
    prompt = f"""Analyze this product based on the following information:

Product Title: {title}
Brand: {brand}
Price: ₹{price}
Original Description: {original_description if original_description and original_description != 'nan' else 'Not provided'}

Your task is to generate THREE separate outputs:

1. VISUAL_ANALYSIS: Infer visual details from the title and description. Include:
   - Likely appearance, style, and materials based on the product type.

2. PRODUCT_DESCRIPTION: Create a user-friendly, readable product description.
   - Length: 2-3 sentences

3. VECTOR_DESCRIPTION: Create a search-optimized description for semantic search.
   - Include keywords, category, style, occasions, personas.

Format your response as JSON:
{{
    "visual_analysis": "inferred visual description",
    "product_description": "user-friendly description",
    "vector_description": "search-optimized description",
    "colors": ["color1", "color2"],
    "materials": ["material1", "material2"],
    "category": "main category",
    "subcategory": "subcategory",
    "style": "style",
    "occasions": ["occasion1"],
    "personas": ["persona1"],
    "interests": ["interest1"],
    "price_sentiment": "budget|mid-range|premium"
}}"""

    try:
        response = openai_client.chat.completions.create(
            model="llama3",
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            response_format={ "type": "json_object" },
            temperature=0.7
        )
        
        content = response.choices[0].message.content
        result = json.loads(content)
        
        logger.info(f"Ollama analysis complete for: {title[:50]}")
        print(f"  [Ollama] Analysis complete")
        return result
        
    except Exception as e:
        logger.error(f"Ollama analysis failed for {title[:50]}: {str(e)}")
        print(f"  [Ollama] Error: {e}")
        return {
            "visual_analysis": f"{title} - Analysis failed",
            "product_description": f"{title}. {original_description}",
            "vector_description": f"{title}. Brand: {brand}. Price: ₹{price}",
            "colors": [], "materials": [], "category": "Unknown", "subcategory": "", "style": "",
            "occasions": [], "personas": [], "interests": [], "price_sentiment": "mid-range"
        }


def generate_embedding(text: str, model=None) -> List[float]:
    """Generate embedding vector using Ollama (nomic-embed-text)"""
    try:
        response = openai_client.embeddings.create(
            model="nomic-embed-text",
            input=text
        )
        return response.data[0].embedding
    except Exception as e:
        print(f"Embedding failed: {e}")
        return []

# ... (rest of the script)

# In main():
    # Initialize embedding model (No longer needed for SentenceTransformer, but we keep the variable for compatibility)
    print(f"\n[Embedding] Using Ollama (nomic-embed-text)...")
    embedding_model = None # Not used with Ollama API

    
    # Find CSV files
    data_dir = os.path.join(os.path.dirname(__file__), '../upsert/data')
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
