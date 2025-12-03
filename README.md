# AI Gift Recommendation Chat with Toastd Search Integration

A Next.js-based gift recommendation chatbot that combines semantic search across multiple product catalogs with AI-powered conversation.

## Features

- 🤖 **AI-Powered Chat**: Natural language gift recommendations using GPT-4
- 🔍 **Multi-Source Search**: Searches both main product catalog and specialized Toastd collection
- 🎯 **Semantic Search**: Vector-based similarity search using Qdrant
- 💡 **LLM Query Expansion**: Advanced search with query understanding and reranking (Toastd API)
- 💰 **Price Filtering**: Natural language price constraints ("under 2000", "between 500 and 1500")
- 📊 **Session Management**: Persistent conversations with context awareness
- ⚡ **Performance**: Redis caching + TTL cache in search API

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Next.js App    │────▶│  FastAPI Server  │────▶│  Qdrant Cloud   │
│  (Port 3000)    │     │  (Port 8001)     │     │  toastd-final   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                       │
        │                       ▼
        │               ┌──────────────────┐
        │               │ SentenceTransformer │
        │               │ all-MiniLM-L6-v2    │
        │               └──────────────────┘
        ▼
┌─────────────────┐
│  Qdrant Cloud   │
│  products       │
└─────────────────┘
```

## Prerequisites

1. **Node.js 18+** - For Next.js app
2. **Python 3.9+** - For toastd search API
3. **PostgreSQL** - For message/session storage
4. **Redis** (optional) - For caching
5. **Qdrant Cloud** - Vector database (or local Qdrant)

## Quick Start

### 1. Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Install Python dependencies for toastd search API
cd scripts
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\\Scripts\\activate
pip install -r requirements.txt
cd ..
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your credentials:

```env
# Database
PGHOST=your-postgres-host
PGUSER=your-db-user
PGPASSWORD=your-password
PGDATABASE=your-database

# OpenAI
OPENAI_API_KEY=your-openai-key

# Qdrant
QDRANT_URL=https://your-cluster.cloud.qdrant.io:6333
QDRANT_API_KEY=your-qdrant-key

# Toastd Search API
TOASTD_API_URL=http://localhost:8001

# Optional: For advanced Toastd search
USE_OLLAMA=true
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
```

### 3. Start Toastd Search API

The toastd search API provides advanced semantic search with LLM-powered query expansion and reranking.

```bash
cd scripts
source venv/bin/activate
python toastd_search_api.py
```

The API will start on http://localhost:8001

**Features:**
- `/health` - API health check and collection info
- `/search` - Semantic product search with filters
- LLM query expansion (supports Ollama or OpenAI)
- LLM reranking for better relevance
- TTL caching for performance
- Natural language price parsing

### 4. Start Next.js App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Testing

### Automated Tests

Run the comprehensive test suite for the toastd search API:

```bash
cd scripts
source venv/bin/activate
python tests/test_comprehensive.py
```

The test suite covers:
- ✅ Infrastructure (Qdrant connection, API health)
- ✅ Basic search functionality
- ✅ Price filtering
- ✅ Complex natural language queries
- ✅ Unicode/special character handling
- ✅ Response format validation
- ✅ Performance benchmarks
- ✅ Concurrent request handling

### Manual Testing

**Test Toastd API:**
```bash
# Health check
curl http://localhost:8001/health

# Search
curl -X POST http://localhost:8001/search \
  -H "Content-Type: application/json" \
  -d '{"query": "birthday gift for girlfriend", "limit": 5}'

# Search with price filter
curl -X POST http://localhost:8001/search \
  -H "Content-Type: application/json" \
  -d '{"query": "skincare products", "limit": 10, "priceMin": 500, "priceMax": 2000}'
```

**Test Chat Interface:**
1. Open http://localhost:3000
2. Try queries like:
   - "Show me birthday gifts for my girlfriend"
   - "I need skincare products under 2000 rupees"
   - "Gift ideas for a tech enthusiast between 1000 and 3000"
3. Verify products appear from both catalogs
4. Check that toastd products are labeled correctly

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── message/chat/route.ts    # Main chat API (integrates toastd)
│   │   ├── toastd/search/route.ts   # Toastd search proxy endpoint
│   │   ├── feedback/route.ts         # User feedback
│   │   └── sessions/route.ts         # Session management
│   ├── page.tsx                      # Main page
│   └── layout.tsx                    # App layout
├── components/                       # React components
├── lib/
│   ├── toastd-client.ts             # Toastd API client
│   ├── db.ts                         # PostgreSQL connection
│   ├── qdrant.ts                     # Qdrant client
│   ├── redis.ts                      # Redis client
│   ├── openai.ts                     # OpenAI client
│   └── embeddings.ts                 # Embedding utilities
├── scripts/
│   ├── toastd_search_api.py         # FastAPI search server
│   ├── requirements.txt              # Python dependencies
│   └── tests/
│       └── test_comprehensive.py     # Test suite
└── public/                           # Static assets
```

## API Reference

### Chat API (`POST /api/message/chat`)

**Request:**
```typescript
{
  message: string;
  sessionId?: string;
  isReload?: boolean;
  guestId?: string;
  excludeIds?: string[];
  seenBrands?: string[];
}
```

**Response:** Streaming NDJSON with:
```typescript
{
  type: 'status' | 'result' | 'error';
  message?: string;  // For status updates
  data?: {
    sessionId: string;
    messageId: string;
    assistantResponse: string;
    products: Product[];
    toastdProducts: Product[];
    preferences: object;
  };
}
```

### Toastd Search API (`POST /api/toastd/search`)

**Request:**
```typescript
{
  query: string;
  limit?: number;      // Default: 10
  priceMin?: number;
  priceMax?: number;
}
```

**Response:**
```typescript
{
  query: string;
  totalResults: number;
  results: Array<{
    id: string;
    title: string;
    description: string;
    headline?: string;
    price: number;
    imageUrl?: string;
    productUrl?: string;
    tags?: string;
    views: number;
    votes: number;
    score: number;
    source: 'toastd';
  }>;
  processingTimeMs: number;
  searchMode: 'advanced' | 'simple';
  cached: boolean;
}
```

## Configuration

### Toastd Search API

Edit `scripts/toastd_search_api.py` to configure:

```python
# Qdrant connection
COLLECTION_NAME = "toastd-final"
QDRANT_URL = "http://localhost:6333"  # or cloud URL
QDRANT_API_KEY = None  # Set for cloud

# LLM Provider (Ollama preferred for speed, OpenAI for quality)
USE_OLLAMA = True
OLLAMA_URL = "http://localhost:11434"
OLLAMA_MODEL = "llama3.2"

# Cache settings
CACHE_SIZE = 500          # Number of queries to cache
CACHE_TTL = 3600          # Cache TTL in seconds
```

### Search Integration

The chat route integrates toastd search with automatic fallback:

1. **Primary**: FastAPI toastd search (advanced semantic search)
2. **Fallback**: Direct Qdrant search (if API unavailable)
3. **Merge**: Combines results from both main catalog and toastd

## Deployment

### Vercel (Next.js)

```bash
npm run build
vercel deploy
```

Remember to set environment variables in Vercel dashboard.

### FastAPI Server

Deploy the Python search API to:
- **Railway**: Simple Python deployments
- **Render**: Free tier available
- **DigitalOcean App Platform**: Easy scaling
- **AWS Lambda**: Serverless option

Update `TOASTD_API_URL` in your `.env` to point to deployed API.

## Troubleshooting

### Toastd API won't start

1. Check if port 8001 is free:
   ```bash
   lsof -i :8001
   ```

2. Verify Qdrant connection:
   ```bash
   curl https://your-cluster.cloud.qdrant.io:6333/collections
   ```

3. Check Python dependencies:
   ```bash
   pip install -r scripts/requirements.txt
   ```

### No toastd results in chat

1. Check if toastd API is running:
   ```bash
   curl http://localhost:8001/health
   ```

2. Check browser console for errors
3. Verify `TOASTD_API_URL` in `.env`
4. The system will fallback to direct Qdrant search if API fails

### Slow first search

The first toastd search may take 5-10 seconds while the SentenceTransformer model loads. Subsequent searches are fast (~50-100ms).

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `python scripts/tests/test_comprehensive.py`
5. Create a pull request
