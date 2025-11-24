# GPU-Accelerated Product Upsert Script

## Overview
This script (`scripts/upsert_products_gpu.py`) uses your GPU to analyze product images and generate rich descriptions using Microsoft's Florence-2 vision model, then upserts them to Qdrant with embeddings.

## Features
- **GPU Acceleration**: Automatically detects and uses CUDA GPU if available
- **Florence-2 Vision Model**: Generates detailed product descriptions from images
- **SentenceTransformers**: Creates 384-dimensional embeddings for semantic search
- **Batch Processing**: Recursively processes all `products.csv` files in `upsert_data/data/`

## Requirements
- Python 3.12 (recommended for CUDA compatibility)
- NVIDIA GPU with CUDA support
- Dependencies installed (see below)

## Installation

### 1. Install PyTorch with CUDA Support
```bash
py -3.12 -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
```

### 2. Install Other Dependencies
```bash
py -3.12 -m pip install transformers sentence-transformers pillow timm einops accelerate python-dotenv qdrant-client pandas requests
```

## Usage

### Basic Usage
```bash
py -3.12 scripts/upsert_products_gpu.py --collection girlfriends
```

### Arguments
- `--collection`: (Required) Name of the Qdrant collection to upsert into

### Examples
```bash
# Upsert products for girlfriends collection
py -3.12 scripts/upsert_products_gpu.py --collection girlfriends

# Upsert products for boyfriends collection
py -3.12 scripts/upsert_products_gpu.py --collection boyfriends

# Upsert products for general products collection
py -3.12 scripts/upsert_products_gpu.py --collection products
```

## How It Works

1. **Model Loading**: Loads Florence-2-base and all-MiniLM-L6-v2 onto GPU
2. **CSV Discovery**: Finds all `products.csv` files in `upsert_data/data/`
3. **For Each Product**:
   - Downloads product image
   - Analyzes image using Florence-2 to generate detailed description
   - Combines title, description, brand, and price into rich text
   - Generates 384-dim embedding using SentenceTransformers
   - Upserts to Qdrant with metadata

## Performance
- **GPU**: ~2-5 seconds per product (depending on image size and GPU)
- **CPU**: ~10-20 seconds per product (fallback mode)

## Output Format
Each product is upserted with the following payload:
```json
{
  "title": "Product Name",
  "description": "AI-generated visual description",
  "original_description": "Original CSV description",
  "price_numeric": 1234.56,
  "image_url": "https://...",
  "product_url": "https://...",
  "brand": "Brand Name"
}
```

## Troubleshooting

### Model Download
On first run, Florence-2-base (~500MB) will be downloaded from Hugging Face. This may take a few minutes.

### CUDA Out of Memory
If you encounter OOM errors, the script will automatically fall back to CPU mode.

### SSL/Network Errors
If image downloads fail, the script will skip those products and continue.

## Comparison with OpenAI Version

| Feature | GPU Script | OpenAI Script (mts) |
|---------|-----------|---------------------|
| Cost | Free (local) | ~$0.01-0.02 per image |
| Speed | 2-5s/image | 3-8s/image |
| Quality | Good (Florence-2) | Excellent (GPT-4o) |
| Offline | Yes | No |
| GPU Required | Yes (recommended) | No |

## Notes
- The script uses `attn_implementation='eager'` to avoid SDPA compatibility issues
- Float16 precision is used on CUDA for faster inference
- The script creates the collection if it doesn't exist
