# Toastd Product Search Integration

A semantic search API for toastd products using Qdrant vector database and SentenceTransformer embeddings. Designed for easy integration with the [ai-product-reccomendation](https://github.com/phantomdelux3/ai-product-reccomendation) Next.js project.

## Overview

This integration provides:
- **FastAPI server** for semantic product search
- **TypeScript client** for Next.js integration
- **Next.js API route** for frontend consumption

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Next.js App    │────▶│  FastAPI Server  │────▶│  Local Qdrant   │
│  (Port 3000)    │     │  (Port 8001)     │     │  (Port 6333)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ SentenceTransformer │
                    │ all-MiniLM-L6-v2    │
                    └──────────────────┘
```

## Project Structure

```
integration/
├── README.md                           # This file
├── requirements.txt                    # Python dependencies
├── scripts/
│   └── toastd_search_api.py           # FastAPI search server (main entry point)
├── lib/
│   └── toastd-client.ts               # TypeScript client for Next.js
└── app/
    └── api/
        └── toastd/
            └── search/
                └── route.ts           # Next.js API route (copy to your project)
```

## Prerequisites

1. **Docker** - For running Qdrant
2. **Python 3.9+** - For the search API server
3. **Node.js 18+** - For Next.js integration

## Quick Start

### 1. Start Qdrant (Docker)

```bash
docker run -d --name qdrant \
  -p 6333:6333 -p 6334:6334 \
  -v $(pwd)/qdrant_storage:/qdrant/storage \
  qdrant/qdrant:latest
```

### 2. Load the toastd-final collection

Ensure your Qdrant has the `toastd-final` collection with 466 products. The collection uses:
- **Vector size**: 384 dimensions
- **Distance metric**: Cosine
- **Embedding model**: `all-MiniLM-L6-v2`

### 3. Install Python dependencies

```bash
cd integration
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 4. Start the search API server

```bash
python scripts/toastd_search_api.py
```

The server will start on `http://localhost:8001`.

### 5. Test the API

```bash
# Health check
curl http://localhost:8001/health

# Search products
curl -X POST http://localhost:8001/search \
  -H "Content-Type: application/json" \
  -d '{"query": "birthday gift for girlfriend", "limit": 5}'
```

## API Reference

### Endpoints

#### `GET /health`

Returns server health and collection info.

**Response:**
```json
{
  "status": "healthy",
  "collection": "toastd-final",
  "productsCount": 466,
  "model": "all-MiniLM-L6-v2"
}
```

#### `POST /search`

Search for products semantically.

**Request:**
```json
{
  "query": "skincare for oily skin",
  "limit": 10,
  "priceMin": 100,
  "priceMax": 2000
}
```

**Response:**
```json
{
  "query": "skincare for oily skin",
  "totalResults": 10,
  "results": [
    {
      "id": "123",
      "title": "Product Name",
      "description": "Product description",
      "headline": "Product headline",
      "price": 599.0,
      "priceNumeric": 599.0,
      "imageUrl": "https://...",
      "productUrl": "https://...",
      "tags": "Skincare|Beauty",
      "views": 1234,
      "votes": 45,
      "score": 0.85,
      "source": "toastd"
    }
  ],
  "processingTimeMs": 45.23
}
```

## Next.js Integration

### Option 1: Direct API Calls (Recommended)

Use the TypeScript client in your Next.js components:

```typescript
// Copy lib/toastd-client.ts to your project's lib folder
import { searchToastd } from '@/lib/toastd-client';

// In your component or API route
const results = await searchToastd('birthday gift', { limit: 5 });
```

### Option 2: API Route Proxy

Copy the Next.js API route to proxy requests:

```bash
# Copy to your Next.js project
cp app/api/toastd/search/route.ts YOUR_PROJECT/app/api/toastd/search/route.ts
```

Add environment variable to your `.env.local`:
```env
TOASTD_API_URL=http://localhost:8001
```

Then call from your frontend:
```typescript
const response = await fetch('/api/toastd/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: 'skincare products', limit: 10 })
});
const data = await response.json();
```

## Integration with ai-product-reccomendation

To integrate with the main project:

### 1. Copy files

```bash
# From this repo
cp integration/lib/toastd-client.ts /path/to/ai-product-reccomendation/lib/
cp integration/app/api/toastd/search/route.ts /path/to/ai-product-reccomendation/app/api/toastd/search/
```

### 2. Update chat route

In `app/api/message/chat/route.ts`, add toastd search:

```typescript
import { searchToastd } from '@/lib/toastd-client';

// In your chat handler, when searching for products:
const toastdResults = await searchToastd(userQuery, { limit: 5 });

// Merge with existing product results
const allProducts = [...existingProducts, ...toastdResults.results];
```

### 3. Environment variables

Add to your `.env`:
```env
TOASTD_API_URL=http://localhost:8001
```

## Configuration

### Server Configuration

Edit `scripts/toastd_search_api.py` to change:

```python
# Qdrant connection
COLLECTION_NAME = "toastd-final"
QDRANT_URL = "http://localhost:6333"
QDRANT_API_KEY = None  # Set for cloud Qdrant

# Server port (default: 8001)
uvicorn.run(..., port=8001)
```

### Using Cloud Qdrant

To use Qdrant Cloud instead of local:

```python
QDRANT_URL = "https://your-cluster.cloud.qdrant.io:6333"
QDRANT_API_KEY = "your-api-key"
COLLECTION_NAME = "your-collection"
```

## Technical Details

### Embedding Model

- **Model**: `all-MiniLM-L6-v2` (SentenceTransformers)
- **Dimensions**: 384
- **This matches** the embedding model used in the main project's `scripts/embedding_server.py`

### Payload Schema (toastd-final collection)

Each product vector includes:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Product title |
| `short_description` | string | Brief description |
| `headline_description` | string | Marketing headline |
| `price` | float | Product price (INR) |
| `main_image` | string | Primary image URL |
| `product_url` | string | Product page URL |
| `tags` | string | Pipe-separated tags |
| `view_count` | int | Number of views |
| `vote_count` | int | Number of votes |

## Troubleshooting

### Server won't start

1. Check if Qdrant is running:
   ```bash
   curl http://localhost:6333/collections
   ```

2. Check if port 8001 is free:
   ```bash
   lsof -i :8001
   ```

3. Kill existing process:
   ```bash
   lsof -ti :8001 | xargs kill -9
   ```

### Search returns no results

1. Verify collection exists:
   ```bash
   curl http://localhost:6333/collections/toastd-final
   ```

2. Check collection has vectors:
   ```bash
   curl http://localhost:8001/health
   ```

### Slow first request

The first search request may take 5-10 seconds while the SentenceTransformer model loads. Subsequent requests are fast (~50-100ms).

## Performance

- **Startup time**: ~10 seconds (model loading)
- **Search latency**: 15-100ms per query
- **Collection size**: 466 products
- **Vector dimensions**: 384

## License

MIT
