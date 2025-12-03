#!/usr/bin/env python3
"""
Toastd Advanced Search API v2.1
Matches the search approach from: https://github.com/aviralgarg05/recommendation-engine-toastd

Features:
1. Query expansion using LLM (understands intent, categories, attributes)
2. Semantic search using SentenceTransformer + Qdrant
3. LLM reranking for better relevance
4. Final scoring combining AI relevance + popularity
5. LRU Cache for repeated queries (huge speedup!)
6. Optimized prompts for faster LLM responses

Supports: OpenAI, Ollama (local), or fallback to simple search
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import time
import json
import os
import hashlib
from collections import OrderedDict
from dotenv import load_dotenv
import requests
import re
import random

from qdrant_client import QdrantClient
from sentence_transformers import SentenceTransformer

# Load environment variables
load_dotenv()

# Configuration
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "toastd-final")
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY", None)

# LLM Configuration - supports OpenAI or Ollama (local)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")  # Fast models: llama3.2, phi3, mistral

# LLM Provider Priority: Ollama (fast local) > OpenAI (slower but better)
# Set USE_OLLAMA=true to prefer Ollama, or PREFER_OPENAI=true to prefer OpenAI
USE_OLLAMA = os.getenv("USE_OLLAMA", "true").lower() == "true"
PREFER_OPENAI = os.getenv("PREFER_OPENAI", "false").lower() == "true"

# Determine which LLM to use
if PREFER_OPENAI and OPENAI_API_KEY:
    LLM_PROVIDER = "openai"
elif USE_OLLAMA:
    LLM_PROVIDER = "ollama"
elif OPENAI_API_KEY:
    LLM_PROVIDER = "openai"
else:
    LLM_PROVIDER = "none"

USE_LLM = LLM_PROVIDER != "none"

# Cache Configuration
CACHE_SIZE = 500  # Number of queries to cache
CACHE_TTL = 3600  # Cache TTL in seconds (1 hour)

# Product types for filtering (used in reranking and fallback)
PRODUCT_TYPE_LIST = [
    'hoodie', 'hoodies', 't-shirt', 'tshirt', 'tee', 'shirt', 'dress', 'pants', 'jeans',
    'jacket', 'bag', 'backpack', 'shoes', 'sneakers', 'watch', 'skincare', 'makeup', 'cream'
]

app = FastAPI(
    title="Toastd Advanced Search API",
    description="Semantic search with LLM query expansion, reranking, and caching",
    version="2.1.0"
)

# CORS: Allow all origins for local development
# In production, set CORS_ORIGINS env var to restrict
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if CORS_ORIGINS == "*" else CORS_ORIGINS.split(","),
    allow_credentials=False,  # Must be False when allow_origins is ["*"]
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global instances
qdrant_client = None
encoder = None
openai_client = None
max_views = 1
max_votes = 1
ollama_available = False


# ============================================================
# TTL Cache Implementation (faster than Redis for single server)
# ============================================================

class TTLCache:
    """Simple TTL cache with LRU eviction"""
    
    def __init__(self, maxsize: int = 500, ttl: int = 3600):
        self.maxsize = maxsize
        self.ttl = ttl
        self.cache: OrderedDict = OrderedDict()
        self.timestamps: Dict[str, float] = {}
    
    def _make_key(self, query: str, limit: int, price_min: float = None, price_max: float = None) -> str:
        """Create cache key from search parameters"""
        key_str = f"{query.lower().strip()}|{limit}|{price_min}|{price_max}"
        return hashlib.sha256(key_str.encode()).hexdigest()[:32]
    
    def get(self, query: str, limit: int, price_min: float = None, price_max: float = None) -> Optional[Dict]:
        """Get cached result if exists and not expired"""
        key = self._make_key(query, limit, price_min, price_max)
        
        if key in self.cache:
            # Check TTL
            if time.time() - self.timestamps[key] < self.ttl:
                # Move to end (most recently used)
                self.cache.move_to_end(key)
                return self.cache[key]
            else:
                # Expired, remove
                del self.cache[key]
                del self.timestamps[key]
        return None
    
    def set(self, query: str, limit: int, result: Dict, price_min: float = None, price_max: float = None):
        """Cache a result"""
        key = self._make_key(query, limit, price_min, price_max)
        
        # Evict oldest if at capacity
        while len(self.cache) >= self.maxsize:
            oldest_key = next(iter(self.cache))
            del self.cache[oldest_key]
            del self.timestamps[oldest_key]
        
        self.cache[key] = result
        self.timestamps[key] = time.time()
    
    def clear(self):
        """Clear all cached results"""
        self.cache.clear()
        self.timestamps.clear()
    
    def stats(self) -> Dict:
        """Get cache statistics"""
        return {
            "size": len(self.cache),
            "maxsize": self.maxsize,
            "ttl": self.ttl
        }

# Global cache instances
query_expansion_cache = TTLCache(maxsize=200, ttl=3600)  # 1 hour TTL
search_results_cache = TTLCache(maxsize=500, ttl=300)     # 5 min TTL (products may change)


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    limit: int = Field(10, ge=1, le=50)
    priceMin: Optional[float] = Field(None, ge=0)
    priceMax: Optional[float] = Field(None, ge=0)
    skipCache: bool = Field(False, description="Skip cache for fresh results")
    skipRerank: bool = Field(False, description="Skip LLM reranking for faster results")


class ProductResult(BaseModel):
    id: str
    title: str
    description: str
    headline: Optional[str]
    price: float
    priceNumeric: float
    imageUrl: Optional[str]
    productUrl: Optional[str]
    tags: Optional[str]
    views: int
    votes: int
    score: float
    relevanceScore: Optional[float] = None
    reasoning: Optional[str] = None
    source: str = "toastd"


class SearchResponse(BaseModel):
    query: str
    totalResults: int
    results: List[ProductResult]
    processingTimeMs: float
    searchMode: str = "simple"
    cached: bool = False


# ============================================================
# Ollama Helper Functions
# ============================================================

def check_ollama_available() -> bool:
    """Check if Ollama is running and model is available"""
    try:
        resp = requests.get(f"{OLLAMA_URL}/api/tags", timeout=2)
        if resp.status_code == 200:
            models = resp.json().get("models", [])
            model_names = [m.get("name", "").split(":")[0] for m in models]
            return OLLAMA_MODEL.split(":")[0] in model_names
    except Exception:
        # Silently fail - Ollama not available is a valid state, will fall back to OpenAI or simple search
        pass
    return False


def pull_ollama_model():
    """Pull Ollama model if not available"""
    try:
        print(f"Pulling Ollama model: {OLLAMA_MODEL}...")
        resp = requests.post(
            f"{OLLAMA_URL}/api/pull",
            json={"name": OLLAMA_MODEL},
            timeout=300  # 5 min timeout for download
        )
        return resp.status_code == 200
    except Exception as e:
        print(f"Failed to pull model: {e}")
        return False


# ============================================================
# LLM Functions - Optimized for Speed
# ============================================================

def call_llm(prompt: str, max_tokens: int = 500) -> str:
    """Call LLM - Ollama (preferred for speed) or OpenAI"""
    if LLM_PROVIDER == "ollama":
        result = call_ollama(prompt, max_tokens)
        if result:
            return result
        # Fallback to OpenAI if Ollama fails
        if OPENAI_API_KEY:
            return call_openai(prompt, max_tokens)
    elif LLM_PROVIDER == "openai":
        return call_openai(prompt, max_tokens)
    return ""


def call_openai(prompt: str, max_tokens: int = 500) -> str:
    """Call OpenAI API"""
    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,  # Lower = faster, more deterministic
            max_tokens=max_tokens
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"OpenAI error: {e}")
        return ""


def call_ollama(prompt: str, max_tokens: int = 500) -> str:
    """Call local Ollama model - optimized for speed"""
    try:
        response = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.3,
                    "num_predict": max_tokens,
                    "num_ctx": 4096,  # Larger context for detailed prompts
                    "top_k": 40,
                    "top_p": 0.9
                }
            },
            timeout=60  # 60 second timeout for complex prompts
        )
        if response.status_code == 200:
            return response.json().get("response", "").strip()
    except Exception as e:
        print(f"Ollama error: {e}")
    return ""


# ============================================================
# OPTIMIZED Prompts - Shorter = Faster
# ============================================================

def expand_query(user_query: str) -> Dict[str, Any]:
    """
    Use LLM to expand query - matches algorithm from src/search.py.
    Uses cache to avoid repeated LLM calls.
    """
    # Check cache first
    cached = query_expansion_cache.get(user_query, 1)
    if cached:
        return cached
    
    # Full prompt matching src/search.py with examples
    prompt = f"""You are an e-commerce search expert. Your job is to understand what users are REALLY looking for when they search.

User Query: "{user_query}"

Analyze this query deeply and return a JSON object that helps find the right products.

Your JSON must have these fields:

1. "search_intent": One sentence describing what the user actually wants
2. "product_categories": List of product types/categories that would satisfy this (be specific, 5-10 items)
3. "key_attributes": Important product qualities/features the user cares about (e.g., style, use case, quality level)
4. "context_clues": Any implicit context (occasion, recipient, urgency, price sensitivity, etc.)
5. "semantic_expansion": A rich 40-60 word text that represents this search intent, written to match against product descriptions (include synonyms, related terms, use cases)

Examples to guide you:

Query: "gifts for my girlfriend"
{{
  "search_intent": "User wants to buy a thoughtful, romantic gift for their romantic partner",
  "product_categories": ["jewelry", "necklaces", "bracelets", "rings", "accessories", "beauty products", "fragrances", "handbags", "fashion items", "personal care"],
  "key_attributes": ["romantic", "elegant", "feminine", "thoughtful", "beautiful", "high-quality", "giftable", "special"],
  "context_clues": "Romantic relationship, wants to impress, likely birthday or anniversary or spontaneous gesture, willing to spend reasonably, needs gift packaging",
  "semantic_expansion": "romantic elegant jewelry beautiful necklace bracelet ring feminine accessories thoughtful gift girlfriend partner love special occasion anniversary birthday present beautiful fragrance beauty products stylish handbag fashion items personal care premium quality giftable"
}}

Query: "workout equipment for home"
{{
  "search_intent": "User wants to set up home gym or fitness area",
  "product_categories": ["dumbbells", "resistance bands", "yoga mats", "fitness equipment", "weights", "exercise gear", "workout accessories", "home gym equipment"],
  "key_attributes": ["durable", "compact", "effective", "versatile", "quality", "space-saving", "functional"],
  "context_clues": "Work from home or limited gym access, wants convenience, likely beginner to intermediate, needs space-efficient solutions",
  "semantic_expansion": "home workout equipment fitness gear exercise dumbbells weights resistance bands yoga mat gym equipment training accessories compact space-saving durable quality functional versatile strength training cardio home gym setup"
}}

Query: "minimalist desk accessories"
{{
  "search_intent": "User wants clean, simple desk items with aesthetic appeal",
  "product_categories": ["desk organizers", "pen holders", "cable management", "desk lamps", "stationery", "office accessories", "desk decor", "workspace items"],
  "key_attributes": ["minimalist", "clean design", "functional", "aesthetic", "simple", "organized", "modern", "sleek"],
  "context_clues": "Values aesthetics and organization, likely remote worker or student, prefers quality over quantity, willing to pay for good design",
  "semantic_expansion": "minimalist desk accessories office simple clean design modern workspace organizer aesthetic functional stationery pen holder cable management sleek desk lamp organization tools workspace decor contemporary style productivity clutter-free"
}}

Now analyze: "{user_query}"

Return ONLY valid JSON, no other text."""

    try:
        response = call_llm(prompt, max_tokens=400)
        if not response:
            raise ValueError("Empty response")
        
        # Clean markdown
        text = response.replace('```json', '').replace('```', '').strip()
        # Find JSON in response
        start = text.find('{')
        end = text.rfind('}') + 1
        if start >= 0 and end > start:
            text = text[start:end]
        
        # Fix common JSON issues
        # Fix trailing commas
        text = re.sub(r',\s*}', '}', text)
        text = re.sub(r',\s*]', ']', text)
        # Fix missing quotes around keys
        text = re.sub(r'(\{|\,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:', r'\1"\2":', text)
        
        expanded = json.loads(text)
        
        # Normalize field names
        result = {
            "search_intent": expanded.get("search_intent", expanded.get("intent", user_query)),
            "product_categories": expanded.get("product_categories", expanded.get("categories", [])),
            "key_attributes": expanded.get("key_attributes", expanded.get("attributes", [])),
            "context_clues": expanded.get("context_clues", ""),
            "semantic_expansion": expanded.get("semantic_expansion", expanded.get("expansion", user_query))
        }
        
        # Cache the result
        query_expansion_cache.set(user_query, 1, result)
        
        return result
        
    except Exception as e:
        print(f"Query expansion failed: {e}")
        return {
            "search_intent": f"Find products related to: {user_query}",
            "product_categories": [user_query],
            "key_attributes": [],
            "context_clues": "General search",
            "semantic_expansion": user_query
        }


def rerank_with_llm(user_query: str, expanded_context: Dict, candidates: List[Dict], top_k: int = 10) -> List[Dict]:
    """
    Use LLM to rerank - matches algorithm from src/search.py.
    Uses detailed product data including popularity signals.
    Only returns products that genuinely match the query.
    
    Handles both toastd-final schema (name, short_description) and
    products schema (title, description).
    """
    # Prepare product data for LLM - consider top 15 candidates
    products_for_llm = []
    for i, c in enumerate(candidates[:15]):
        p = c['product']
        # Handle both schemas
        name = (p.get('title') or p.get('name', ''))[:80]
        desc = (p.get('description') or p.get('short_description', '') or '')[:100]
        tags = (p.get('tags', '') or '')
        if isinstance(tags, list):
            tags = ', '.join(tags[:5])
        tags = tags[:50]
        
        products_for_llm.append({
            'i': i,
            'name': name,
            'desc': desc,
            'tags': tags
        })
    
    # Extract primary product type from query for strict filtering
    query_lower = user_query.lower()
    product_type = None
    for ptype in PRODUCT_TYPE_LIST:
        if ptype in query_lower:
            product_type = ptype
            break
    
    type_instruction = ""
    if product_type:
        type_instruction = f"\nCRITICAL: User wants '{product_type}'. ONLY include products that ARE {product_type}s. Score 0 for anything else (sunscreen, tees, bags etc are NOT {product_type}s)."
    
    prompt = f"""Rate products for query: "{user_query}"

Products:
{json.dumps(products_for_llm)}
{type_instruction}
Return JSON array with ONLY products that EXACTLY match what user asked for:
- i = index number from above
- s = score (0.7-1.0, where 1.0 = perfect match, 0 = doesn't match)  
- r = reason (5-10 words)

Be STRICT: if user asks for hoodies, only hoodies get scores > 0.
Skip all unrelated products completely.

JSON only:"""

    try:
        response = call_llm(prompt, max_tokens=600)
        if not response:
            raise ValueError("Empty response")
        
        # Extract JSON array
        text = response.replace('```json', '').replace('```', '').strip()
        start = text.find('[')
        end = text.rfind(']') + 1
        if start >= 0 and end > start:
            text = text[start:end]
        
        # Fix common JSON issues
        text = re.sub(r',\s*]', ']', text)
        text = re.sub(r',\s*}', '}', text)
        if not text.endswith(']'):
            last_brace = text.rfind('}')
            if last_brace > 0:
                text = text[:last_brace+1] + ']'
        
        reranked = json.loads(text)
        
        # Map back to full data - FILTER OUT low relevance scores
        # Use stricter threshold when user specifies a product type
        min_score = 0.8 if product_type else 0.6
        
        result = []
        for item in reranked:
            idx = item.get('i', item.get('index', -1))
            score = float(item.get('s', item.get('score', 0)))
            if idx >= 0 and idx < len(candidates) and score >= min_score:
                # Additional validation: if product type specified, verify it's in the product
                if product_type:
                    p = candidates[idx]['product']
                    # Handle both schemas
                    name_lower = (p.get('title', '') or p.get('name', '') or '').lower()
                    tags = p.get('tags', '') or p.get('auto_tags', [])
                    if isinstance(tags, list):
                        tags_lower = ', '.join(tags).lower()
                    else:
                        tags_lower = str(tags).lower()
                    desc_lower = (p.get('description', '') or p.get('short_description', '') or '').lower()
                    pt_check = product_type.rstrip('s')  # Remove plural
                    if pt_check not in name_lower and pt_check not in tags_lower and pt_check not in desc_lower:
                        continue  # Skip products that don't actually contain the type
                
                result.append({
                    'index': idx,
                    'product': candidates[idx]['product'],
                    'relevance_score': score,
                    'reasoning': item.get('r', item.get('reason', 'Relevant match')),
                    'original_score': candidates[idx]['score'],
                    'id': candidates[idx]['id']
                })
        
        result = result[:top_k]
        
        if not result:
            print(f"No results passed threshold. Sample: {reranked[:2] if reranked else 'empty'}")
        
        return result if result else _fallback_ranking(candidates, min(top_k, 5), user_query)
        
    except Exception as e:
        print(f"Reranking failed: {e}")
        return _fallback_ranking(candidates, top_k, user_query)


def _fallback_ranking(candidates: List[Dict], top_k: int, query: str = "") -> List[Dict]:
    """Fallback when LLM fails - apply basic name-based filtering.
    
    Handles both toastd-final schema (name, short_description) and
    products schema (title, description).
    """
    # Extract product type from query for basic filtering
    query_lower = query.lower()
    product_types = []
    for ptype in PRODUCT_TYPE_LIST:
        if ptype in query_lower:
            product_types.append(ptype.rstrip('s'))  # Remove plural 's'
    
    results = []
    for i, candidate in enumerate(candidates):
        product = candidate['product']
        # Handle both schemas
        name_lower = (product.get('title', '') or product.get('name', '') or '').lower()
        tags = product.get('tags', '') or product.get('auto_tags', [])
        if isinstance(tags, list):
            tags_lower = ', '.join(tags).lower()
        else:
            tags_lower = str(tags).lower()
        desc_lower = (product.get('description', '') or product.get('short_description', '') or '').lower()
        
        # If we have product type requirements, check if this matches
        if product_types:
            matches = any(pt in name_lower or pt in tags_lower or pt in desc_lower for pt in product_types)
            if not matches:
                continue
        
        results.append({
            'index': i,
            'product': product,
            'relevance_score': candidate['score'],
            'reasoning': 'Semantic similarity match',
            'original_score': candidate['score'],
            'id': candidate['id']
        })
        
        if len(results) >= top_k:
            break
    
    return results


def apply_final_scoring(reranked: List[Dict]) -> List[Dict]:
    """Combine AI relevance with popularity"""
    for item in reranked:
        product = item.get('product', {})
        view_score = (product.get('view_count', 0) or 0) / max_views
        vote_score = (product.get('vote_count', 0) or 0) / max_votes
        
        item['final_score'] = (
            0.70 * item.get('relevance_score', 0.5) +
            0.20 * vote_score +
            0.10 * view_score
        )
    
    reranked.sort(key=lambda x: x.get('final_score', 0), reverse=True)
    return reranked


# ============================================================
# Startup and Endpoints
# ============================================================

def _setup_llm_provider():
    """Setup LLM provider and return configuration."""
    global LLM_PROVIDER, USE_LLM, openai_client, ollama_available
    
    should_try_ollama = LLM_PROVIDER == "ollama" or (LLM_PROVIDER == "none" and USE_OLLAMA)
    
    if should_try_ollama:
        ollama_available = check_ollama_available()
        if ollama_available:
            print(f"LLM: Ollama ({OLLAMA_MODEL}) ✓")
            LLM_PROVIDER = "ollama"
            USE_LLM = True
            return
        
        print(f"Ollama not available at {OLLAMA_URL}")
        LLM_PROVIDER = "openai" if OPENAI_API_KEY else "none"
        USE_LLM = bool(OPENAI_API_KEY)
        if OPENAI_API_KEY:
            print("Falling back to OpenAI")
        else:
            print("No LLM available - using simple search")
    
    if LLM_PROVIDER == "openai":
        print("LLM: OpenAI (gpt-4o-mini)")
        from openai import OpenAI
        openai_client = OpenAI(api_key=OPENAI_API_KEY)
        USE_LLM = True
    elif LLM_PROVIDER == "none":
        print("LLM: Disabled (simple semantic search)")
        print("  To enable: start Ollama or set OPENAI_API_KEY")


def _setup_qdrant_and_encoder():
    """Setup Qdrant client and encoder."""
    global qdrant_client, encoder, max_views, max_votes
    
    qdrant_client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
    print("Loading SentenceTransformer...")
    encoder = SentenceTransformer('all-MiniLM-L6-v2')
    
    info = qdrant_client.get_collection(COLLECTION_NAME)
    print(f"Connected! {info.points_count} products")
    
    sample = qdrant_client.scroll(
        collection_name=COLLECTION_NAME,
        limit=500,
        with_payload=True
    )[0]
    
    views = [p.payload.get('view_count', 0) or 0 for p in sample]
    votes = [p.payload.get('vote_count', 0) or 0 for p in sample]
    max_views = max(views) if views and max(views) > 0 else 1
    max_votes = max(votes) if votes and max(votes) > 0 else 1


@app.on_event("startup")
async def startup_event():
    print("=" * 60)
    print("Toastd Advanced Search API v2.1")
    print("=" * 60)
    print(f"Qdrant: {QDRANT_URL}")
    print(f"Collection: {COLLECTION_NAME}")
    
    _setup_llm_provider()
    print(f"Cache: {CACHE_SIZE} queries, {CACHE_TTL}s TTL")
    
    try:
        _setup_qdrant_and_encoder()
        print("=" * 60)
    except Exception as e:
        print(f"Startup failed: {e}")
        raise


@app.get("/health")
async def health():
    if qdrant_client is None:
        raise HTTPException(status_code=503, detail="Not ready")
    
    info = qdrant_client.get_collection(COLLECTION_NAME)
    
    return {
        "status": "healthy",
        "collection": COLLECTION_NAME,
        "productsCount": info.points_count,
        "model": "all-MiniLM-L6-v2",
        "llm": LLM_PROVIDER,
        "searchMode": "advanced" if USE_LLM else "simple",
        "cache": {
            "expansion": query_expansion_cache.stats(),
            "results": search_results_cache.stats()
        }
    }


def _safe_float(val, default=0.0):
    """Convert value to float safely."""
    if val is None:
        return default
    if isinstance(val, (int, float)):
        return float(val)
    try:
        return float(str(val).replace(',', '').replace(' ', '') or default)
    except (ValueError, TypeError):
        return default


def _parse_price_from_query(query: str) -> tuple:
    """
    Extract price constraints from natural language query.
    Returns (price_min, price_max, clean_query)
    
    Examples:
    - "hoodies under 1000" -> (None, 1000, "hoodies")
    - "watches above 5000" -> (5000, None, "watches")
    - "bags between 500 and 2000" -> (500, 2000, "bags")
    - "gifts below rs 1500" -> (None, 1500, "gifts")
    """
    price_min = None
    price_max = None
    clean_query = query
    
    # Patterns for price extraction (case insensitive)
    patterns = [
        # "under/below/less than X" or "under/below rs X"
        (r'\b(?:under|below|less than|cheaper than|max|upto|up to)\s*(?:rs\.?|inr|₹)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\b', 'max'),
        # "above/over/more than X" or "above rs X"  
        (r'\b(?:above|over|more than|min|minimum|at least|starting)\s*(?:rs\.?|inr|₹)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\b', 'min'),
        # "between X and Y"
        (r'\bbetween\s*(?:rs\.?|inr|₹)?\s*(\d+(?:,\d{3})*)\s*(?:and|to|-)\s*(?:rs\.?|inr|₹)?\s*(\d+(?:,\d{3})*)\b', 'range'),
        # "X to Y" or "X-Y" price range
        (r'\b(?:rs\.?|inr|₹)?\s*(\d+(?:,\d{3})*)\s*(?:to|-)\s*(?:rs\.?|inr|₹)?\s*(\d+(?:,\d{3})*)\b', 'range'),
        # "for X rupees" or "around X"
        (r'\b(?:for|around|approx|approximately)\s*(?:rs\.?|inr|₹)?\s*(\d+(?:,\d{3})*)\b', 'around'),
    ]
    
    for pattern, ptype in patterns:
        match = re.search(pattern, query, re.IGNORECASE)
        if match:
            if ptype == 'max':
                price_max = float(match.group(1).replace(',', ''))
                clean_query = re.sub(pattern, '', query, flags=re.IGNORECASE)
            elif ptype == 'min':
                price_min = float(match.group(1).replace(',', ''))
                clean_query = re.sub(pattern, '', query, flags=re.IGNORECASE)
            elif ptype == 'range':
                price_min = float(match.group(1).replace(',', ''))
                price_max = float(match.group(2).replace(',', ''))
                clean_query = re.sub(pattern, '', query, flags=re.IGNORECASE)
            elif ptype == 'around':
                # For "around X", set range as X-20% to X+20%
                base = float(match.group(1).replace(',', ''))
                price_min = base * 0.8
                price_max = base * 1.2
                clean_query = re.sub(pattern, '', query, flags=re.IGNORECASE)
            break
    
    # Clean up extra whitespace
    clean_query = ' '.join(clean_query.split()).strip()
    
    return (price_min, price_max, clean_query)


def _format_product_result(item: Dict) -> ProductResult:
    """Format a single product result.
    
    Handles both toastd-final schema (name, short_description, main_image) and
    products schema (title, description, image_url).
    """
    p = item.get('product', {})
    
    # Handle tags - could be string or list
    tags_val = p.get('tags', '') or p.get('auto_tags', [])
    if isinstance(tags_val, list):
        tags_str = ', '.join(tags_val[:10])  # Limit to 10 tags
    else:
        tags_str = str(tags_val)
    
    # Handle title - products collection uses 'title', toastd-final uses 'name'
    title = p.get('title') or p.get('name', '')
    
    # Handle description - products uses 'description', toastd-final uses 'short_description'
    description = p.get('description') or p.get('short_description', '')
    
    # Handle image URL - products uses 'image_url', toastd-final uses 'main_image'
    image_url = p.get('image_url') or p.get('main_image')
    
    # Handle price - products uses 'price_numeric', toastd-final uses 'price'
    price = _safe_float(p.get('price_numeric')) or _safe_float(p.get('price'))
    
    return ProductResult(
        id=item.get('id', str(p.get('id', ''))),
        title=title,
        description=description,
        headline=p.get('headline_description'),
        price=price,
        priceNumeric=price,
        imageUrl=image_url,
        productUrl=p.get('product_url'),
        tags=tags_str,
        views=int(p.get('view_count', 0) or 0),
        votes=int(p.get('vote_count', 0) or 0),
        score=item.get('final_score', item.get('score', 0)),
        relevanceScore=item.get('relevance_score'),
        reasoning=item.get('reasoning'),
        source="toastd"
    )


def _build_price_filter(price_min: Optional[float], price_max: Optional[float]) -> Optional[Dict]:
    """Build price filter for Qdrant query.
    
    Uses 'price' field for toastd-final collection.
    """
    if price_min is None and price_max is None:
        return None
    return {
        "must": [{
            "key": "price",
            "range": {
                "gte": price_min or 0,
                "lte": price_max or 1000000
            }
        }]
    }


def _perform_search(request: SearchRequest) -> Dict:
    """Perform the search and return response data."""
    start_time = time.time()
    search_mode = "advanced" if USE_LLM else "simple"
    
    # Parse price from natural language query
    parsed_min, parsed_max, clean_query = _parse_price_from_query(request.query)
    
    # Use parsed prices if not explicitly provided in request
    effective_min = request.priceMin if request.priceMin is not None else parsed_min
    effective_max = request.priceMax if request.priceMax is not None else parsed_max
    search_query = clean_query if (parsed_min or parsed_max) else request.query
    
    # Query expansion
    if USE_LLM:
        expanded = expand_query(search_query)
        search_text = expanded.get('semantic_expansion', search_query)
    else:
        expanded = {"search_intent": search_query}
        search_text = search_query
    
    # Vector search - get top 30 candidates for reranking (matching src/search.py)
    query_embedding = encoder.encode([search_text])[0].tolist()
    filter_conditions = _build_price_filter(effective_min, effective_max)
    candidate_limit = 30 if USE_LLM else request.limit
    
    results = qdrant_client.query_points(
        collection_name=COLLECTION_NAME,
        query=query_embedding,
        limit=candidate_limit,
        query_filter=filter_conditions,
        with_payload=True
    ).points
    
    candidates = [
        {'product': r.payload, 'score': r.score, 'id': str(r.id)}
        for r in results
    ]
    
    # Rerank with LLM or use simple results
    if USE_LLM and candidates and not request.skipRerank:
        reranked = rerank_with_llm(search_query, expanded, candidates, top_k=request.limit)
        final_results = apply_final_scoring(reranked)
    else:
        final_results = [
            {
                'product': c['product'],
                'final_score': c['score'],
                'relevance_score': c['score'],
                'reasoning': None,
                'id': c['id']
            }
            for c in candidates[:request.limit]
        ]
    
    formatted_results = [_format_product_result(item) for item in final_results]
    processing_time = (time.time() - start_time) * 1000
    
    return {
        "query": request.query,
        "totalResults": len(formatted_results),
        "results": formatted_results,
        "processingTimeMs": round(processing_time, 2),
        "searchMode": search_mode,
        "cached": False
    }


@app.post("/search", response_model=SearchResponse)
async def search(request: SearchRequest):
    if qdrant_client is None or encoder is None:
        raise HTTPException(status_code=503, detail="Not ready")
    
    try:
        # Check cache first
        if not request.skipCache:
            cached = search_results_cache.get(
                request.query, request.limit, 
                request.priceMin, request.priceMax
            )
            if cached:
                cached['cached'] = True
                cached['processingTimeMs'] = 0.1
                return SearchResponse(**cached)
        
        response_data = _perform_search(request)
        
        # Cache the result
        search_results_cache.set(
            request.query, request.limit, response_data,
            request.priceMin, request.priceMax
        )
        
        return SearchResponse(**response_data)
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/cache")
async def clear_cache():
    """Clear all caches"""
    query_expansion_cache.clear()
    search_results_cache.clear()
    return {"status": "cleared", "message": "All caches cleared"}


@app.get("/cache/stats")
async def cache_stats():
    """Get cache statistics"""
    return {
        "expansion_cache": query_expansion_cache.stats(),
        "results_cache": search_results_cache.stats()
    }


@app.get("/")
async def root():
    return {
        "service": "Toastd Advanced Search API",
        "version": "2.1.0",
        "searchMode": "advanced" if USE_LLM else "simple",
        "llm": LLM_PROVIDER,
        "features": [
            "Query expansion (LLM)",
            "Semantic search (Qdrant)",
            "LLM reranking",
            "TTL caching (500 queries)",
            "Final scoring (AI + popularity)"
        ] if USE_LLM else [
            "Semantic search (Qdrant)",
            "TTL caching"
        ],
        "endpoints": {
            "health": "GET /health",
            "search": "POST /search",
            "chat": "POST /api/chat/message",
            "sessions": "GET /api/sessions/user/{userId}",
            "messages": "GET /api/sessions/messages/{sessionId}",
            "feedback": "POST /api/feedback/product",
            "cache_stats": "GET /cache/stats",
            "clear_cache": "DELETE /cache"
        }
    }


# ============================================================
# Chat & Session Management (for ai_chat_frontend integration)
# ============================================================

import uuid
from datetime import datetime

# TODO: In-memory session storage - will be lost on server restart.
# For production, implement persistence layer with one of:
#   - Redis: Use redis-py with connection pooling for fast key-value storage
#   - PostgreSQL: Use SQLAlchemy with async support for relational data
#   - MongoDB: Use motor for document-based storage
# Consider adding a STORAGE_BACKEND env var to toggle between implementations.
sessions_store: Dict[str, Dict] = {}  # sessionId -> session data
user_sessions: Dict[str, List[str]] = {}  # userId -> list of sessionIds
messages_store: Dict[str, List[Dict]] = {}  # sessionId -> list of messages
feedback_store: List[Dict] = []  # Store all feedback


class ChatMessageRequest(BaseModel):
    message: str
    sessionId: Optional[str] = None
    userId: Optional[str] = None


class ChatMessageResponse(BaseModel):
    sessionId: str
    userId: str
    assistantResponse: str
    products: List[Dict]
    messageId: str


class FeedbackRequest(BaseModel):
    sessionId: str
    messageID: str
    productId: str
    rating: int = Field(ge=1, le=5)
    reason: Optional[List[str]] = None
    reason_text: Optional[str] = None
    user_query: Optional[str] = None
    feedback_type: Optional[str] = None


def _transform_product_for_frontend(product) -> Dict:
    """Transform our product format to frontend expected format.
    Handles both dict and ProductResult Pydantic model.
    """
    # Convert Pydantic model to dict if needed
    if hasattr(product, 'model_dump'):
        product = product.model_dump()
    elif hasattr(product, 'dict'):
        product = product.dict()
    
    return {
        "id": str(product.get("id", "")),
        "title": product.get("title", ""),
        "price": product.get("price", 0),
        "discounted_price": product.get("price", 0),  # Same as price if no discount
        "url": product.get("productUrl", ""),
        "image": product.get("imageUrl", ""),
        "description": product.get("description", "") or product.get("headline", ""),
        "brand": product.get("source", "toastd"),
        "category": (product.get("tags", "") or "").split("|")[0] if product.get("tags") else "",
        "score": product.get("relevanceScore", product.get("score", 0)),
        "rank": 0  # Will be set based on position
    }


def _generate_assistant_response(query: str, products: List[Dict]) -> str:
    """Generate a natural assistant response based on query and results"""
    if not products:
        return f"I couldn't find any products matching '{query}'. Could you try a different search or be more specific about what you're looking for?"
    
    count = len(products)
    
    # Extract price range from results
    prices = [p.get("price", 0) for p in products if p.get("price")]
    if prices:
        min_price = min(prices)
        max_price = max(prices)
        price_info = f" ranging from {min_price} to {max_price}" if min_price != max_price else f" at {min_price}"
    else:
        price_info = ""
    
    # Generate contextual response
    responses = [
        f"I found {count} great options for you{price_info}! Here are my top recommendations:",
        f"Here are {count} products that match what you're looking for{price_info}:",
        f"Based on your search, I've found {count} items{price_info} that you might love:",
        f"Great news! I found {count} products{price_info} that fit your criteria:",
    ]
    return random.choice(responses)


@app.post("/api/chat/message", response_model=ChatMessageResponse)
async def chat_message(request: ChatMessageRequest):
    """Handle chat messages - integrates with ai_chat_frontend"""
    if qdrant_client is None or encoder is None:
        raise HTTPException(status_code=503, detail="Search service not ready")
    
    # Generate or use existing session/user IDs
    user_id = request.userId or str(uuid.uuid4())
    session_id = request.sessionId or str(uuid.uuid4())
    message_id = str(uuid.uuid4())
    
    # Initialize session if new
    if session_id not in sessions_store:
        sessions_store[session_id] = {
            "id": session_id,
            "user_id": user_id,
            "created_at": datetime.now().isoformat(),
            "title": request.message[:50] + "..." if len(request.message) > 50 else request.message
        }
        messages_store[session_id] = []
        
        # Track user sessions
        if user_id not in user_sessions:
            user_sessions[user_id] = []
        if session_id not in user_sessions[user_id]:
            user_sessions[user_id].append(session_id)
    
    # Perform search using existing search logic
    search_request = SearchRequest(
        query=request.message,
        limit=10,
        skipCache=False
    )
    
    try:
        # Check cache first
        cached = search_results_cache.get(
            search_request.query, search_request.limit,
            search_request.priceMin, search_request.priceMax
        )
        
        if cached:
            search_results = cached
        else:
            search_results = _perform_search(search_request)
            search_results_cache.set(
                search_request.query, search_request.limit, search_results,
                search_request.priceMin, search_request.priceMax
            )
        
        # Transform products for frontend
        products = []
        for idx, result in enumerate(search_results.get("results", [])):
            product = _transform_product_for_frontend(result)
            product["rank"] = idx + 1
            products.append(product)
        
        # Generate assistant response
        assistant_response = _generate_assistant_response(request.message, products)
        
        # Store message
        message_data = {
            "id": message_id,
            "user_content": request.message,
            "assistant_content": assistant_response,
            "products": products,
            "created_at": datetime.now().isoformat()
        }
        messages_store[session_id].append(message_data)
        
        return ChatMessageResponse(
            sessionId=session_id,
            userId=user_id,
            assistantResponse=assistant_response,
            products=products,
            messageId=message_id
        )
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sessions/user/{user_id}")
async def get_user_sessions(user_id: str):
    """Get all sessions for a user"""
    session_ids = user_sessions.get(user_id, [])
    sessions = []
    
    for sid in session_ids:
        if sid in sessions_store:
            session = sessions_store[sid].copy()
            session["message_count"] = len(messages_store.get(sid, []))
            sessions.append(session)
    
    # Sort by created_at descending (newest first)
    sessions.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    
    return {"sessions": sessions, "userId": user_id}


@app.get("/api/sessions/messages/{session_id}")
async def get_session_messages(session_id: str):
    """Get all messages for a session"""
    if session_id not in sessions_store:
        raise HTTPException(status_code=404, detail="Session not found")
    
    messages = messages_store.get(session_id, [])
    return {"messages": messages, "sessionId": session_id}


@app.post("/api/feedback/product")
async def submit_feedback(request: FeedbackRequest):
    """Submit product feedback"""
    feedback_data = {
        "id": str(uuid.uuid4()),
        "sessionId": request.sessionId,
        "messageId": request.messageID,
        "productId": request.productId,
        "rating": request.rating,
        "reason": request.reason or [],
        "reason_text": request.reason_text,
        "user_query": request.user_query,
        "feedback_type": request.feedback_type,
        "created_at": datetime.now().isoformat()
    }
    
    feedback_store.append(feedback_data)
    print(f"Feedback received: {feedback_data}")
    
    return {"success": True, "feedbackId": feedback_data["id"]}


@app.get("/api/feedback")
async def get_all_feedback():
    """Get all feedback (for admin/analytics)"""
    return {"feedback": feedback_store, "total": len(feedback_store)}


if __name__ == "__main__":
    import uvicorn
    
    banner = """
==========================================
Toastd Advanced Search API v2.2
==========================================

Features:
1. Ollama LLM for query expansion & reranking
2. TTL Cache for queries (500 items)
3. Chat & Session management (ai_chat_frontend compatible)
4. Product feedback collection

Endpoints:
- GET  /health
- POST /search
- POST /api/chat/message
- GET  /api/sessions/user/{userId}
- GET  /api/sessions/messages/{sessionId}
- POST /api/feedback/product
- GET  /cache/stats
- DELETE /cache
==========================================
"""
    print(banner)
    
    uvicorn.run(
        "toastd_search_api:app",
        host="0.0.0.0",
        port=8001,
        reload=False
    )
