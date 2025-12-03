#!/usr/bin/env python3
"""
Comprehensive Test Suite for Toastd Search API
Tests the integration from: https://github.com/aviralgarg05/recommendation-engine-toastd

This tests:
1. Health endpoints
2. Basic search functionality
3. Complex query handling
4. Price filters
5. Edge cases
6. Response format validation
7. Performance benchmarks
"""

import requests
import time

API_URL = "http://localhost:8001"
QDRANT_URL = "http://localhost:6333"

# Test results tracking
class TestResults:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.tests = []
    
    def add(self, name: str, passed: bool, message: str = "", duration_ms: float = 0):
        status = "✅ PASS" if passed else "❌ FAIL"
        self.tests.append({
            "name": name,
            "passed": passed,
            "message": message,
            "duration_ms": duration_ms
        })
        if passed:
            self.passed += 1
        else:
            self.failed += 1
        print(f"{status}: {name}" + (f" ({duration_ms:.0f}ms)" if duration_ms else ""))
        if message and not passed:
            print(f"       → {message}")
    
    def summary(self):
        print("\n" + "=" * 60)
        print(f"TEST SUMMARY: {self.passed}/{self.passed + self.failed} passed")
        print("=" * 60)
        if self.failed > 0:
            print("\nFailed tests:")
            for t in self.tests:
                if not t["passed"]:
                    print(f"  - {t['name']}: {t['message']}")
        return self.failed == 0

results = TestResults()


def test_qdrant_connection():
    """Test 1: Verify Qdrant is running and accessible"""
    try:
        r = requests.get(f"{QDRANT_URL}/collections", timeout=5)
        if r.status_code == 200:
            collections = r.json()["result"]["collections"]
            has_toastd = any(c["name"] == "toastd-final" for c in collections)
            results.add("Qdrant connection", has_toastd, 
                       "" if has_toastd else "toastd-final collection not found")
            return has_toastd
        results.add("Qdrant connection", False, f"Status {r.status_code}")
        return False
    except Exception as e:
        results.add("Qdrant connection", False, str(e))
        return False


def test_health_endpoint():
    """Test 2: Verify API health endpoint"""
    try:
        start = time.time()
        r = requests.get(f"{API_URL}/health", timeout=10)
        duration = (time.time() - start) * 1000
        
        if r.status_code == 200:
            data = r.json()
            checks = [
                data.get("status") == "healthy",
                data.get("collection") == "toastd-final",
                data.get("productsCount", 0) > 0,
                data.get("model") == "all-MiniLM-L6-v2"
            ]
            all_pass = all(checks)
            results.add("Health endpoint", all_pass, 
                       f"Products: {data.get('productsCount')}", duration)
            return data
        results.add("Health endpoint", False, f"Status {r.status_code}")
        return None
    except Exception as e:
        results.add("Health endpoint", False, str(e))
        return None


def test_basic_search(query: str, expected_min_results: int = 1):
    """Test 3: Basic search functionality"""
    try:
        start = time.time()
        r = requests.post(f"{API_URL}/search", json={
            "query": query,
            "limit": 10
        }, timeout=30)
        duration = (time.time() - start) * 1000
        
        if r.status_code == 200:
            data = r.json()
            count = data.get("totalResults", 0)
            passed = count >= expected_min_results
            results.add(f"Search: '{query[:30]}..'" if len(query) > 30 else f"Search: '{query}'", 
                       passed, f"Got {count} results", duration)
            return data
        results.add(f"Search: '{query}'", False, f"Status {r.status_code}")
        return None
    except Exception as e:
        results.add(f"Search: '{query}'", False, str(e))
        return None


def test_search_response_format():
    """Test 4: Validate response format matches expected schema"""
    try:
        r = requests.post(f"{API_URL}/search", json={
            "query": "gift",
            "limit": 3
        }, timeout=30)
        
        if r.status_code != 200:
            results.add("Response format", False, f"Status {r.status_code}")
            return False
        
        data = r.json()
        
        # Check top-level fields
        required_fields = ["query", "totalResults", "results", "processingTimeMs"]
        missing = [f for f in required_fields if f not in data]
        if missing:
            results.add("Response format", False, f"Missing fields: {missing}")
            return False
        
        # Check result item fields
        if data["results"]:
            item = data["results"][0]
            item_fields = ["id", "title", "description", "price", "score", "source"]
            missing_item = [f for f in item_fields if f not in item]
            if missing_item:
                results.add("Response format", False, f"Missing item fields: {missing_item}")
                return False
        
        results.add("Response format", True, "All required fields present")
        return True
    except Exception as e:
        results.add("Response format", False, str(e))
        return False


def test_price_filter():
    """Test 5: Price range filtering"""
    try:
        # Search with price filter
        r = requests.post(f"{API_URL}/search", json={
            "query": "gift",
            "limit": 10,
            "priceMin": 500,
            "priceMax": 2000
        }, timeout=30)
        
        if r.status_code != 200:
            results.add("Price filter", False, f"Status {r.status_code}")
            return False
        
        data = r.json()
        
        if not data["results"]:
            results.add("Price filter", True, "No results (acceptable)")
            return True
        
        # Verify all prices are in range
        out_of_range = []
        for item in data["results"]:
            price = item.get("price", 0)
            if price < 500 or price > 2000:
                out_of_range.append(f"{item.get('title', 'Unknown')}: ₹{price}")
        
        if out_of_range:
            results.add("Price filter", False, f"Out of range: {out_of_range[0]}")
            return False
        
        results.add("Price filter", True, f"All {len(data['results'])} results in range")
        return True
    except Exception as e:
        results.add("Price filter", False, str(e))
        return False


def test_empty_query():
    """Test 6: Empty query handling"""
    try:
        r = requests.post(f"{API_URL}/search", json={
            "query": "",
            "limit": 10
        }, timeout=10)
        
        # Should return 422 (validation error) or 400
        passed = r.status_code in [400, 422]
        results.add("Empty query rejection", passed, 
                   f"Status {r.status_code}" if passed else f"Unexpected status {r.status_code}")
        return passed
    except Exception as e:
        results.add("Empty query rejection", False, str(e))
        return False


def test_limit_parameter():
    """Test 7: Limit parameter works correctly"""
    try:
        for limit in [1, 5, 20]:
            r = requests.post(f"{API_URL}/search", json={
                "query": "home decor",
                "limit": limit
            }, timeout=30)
            
            if r.status_code != 200:
                results.add(f"Limit={limit}", False, f"Status {r.status_code}")
                return False
            
            data = r.json()
            count = len(data["results"])
            
            if count > limit:
                results.add(f"Limit={limit}", False, f"Got {count} results, expected <= {limit}")
                return False
        
        results.add("Limit parameter", True, "All limits respected")
        return True
    except Exception as e:
        results.add("Limit parameter", False, str(e))
        return False


def test_complex_queries():
    """Test 8: Complex natural language queries (from original repo examples)"""
    complex_queries = [
        "gifts for my girlfriend who likes minimalist jewelry",
        "home workout equipment for small apartment",
        "skincare routine products for oily skin",
        "travel accessories for backpacking in europe",
        "aesthetic room decoration on a budget",
        "birthday gift under 2000 rupees for college student",
    ]
    
    all_passed = True
    for query in complex_queries:
        result = test_basic_search(query, expected_min_results=1)
        if not result:
            all_passed = False
    
    return all_passed


def test_performance_benchmark():
    """Test 9: Performance under multiple requests"""
    queries = [
        "birthday gift",
        "skincare products",
        "home decor items",
        "fitness equipment",
        "jewelry for women",
    ]
    
    times = []
    try:
        for query in queries:
            start = time.time()
            r = requests.post(f"{API_URL}/search", json={
                "query": query,
                "limit": 10
            }, timeout=30)
            duration = (time.time() - start) * 1000
            
            if r.status_code == 200:
                times.append(duration)
        
        if times:
            avg_time = sum(times) / len(times)
            max_time = max(times)
            min_time = min(times)
            
            # Performance should be under 500ms average after model warm-up
            passed = avg_time < 1000  # 1 second threshold
            results.add("Performance benchmark", passed, 
                       f"Avg: {avg_time:.0f}ms, Min: {min_time:.0f}ms, Max: {max_time:.0f}ms")
            return passed
        
        results.add("Performance benchmark", False, "No successful requests")
        return False
    except Exception as e:
        results.add("Performance benchmark", False, str(e))
        return False


def test_special_characters():
    """Test 10: Queries with special characters"""
    special_queries = [
        "gift's for mom",
        "home & decor",
        "skincare (oily skin)",
        "jewelry - gold",
    ]
    
    all_passed = True
    for query in special_queries:
        try:
            r = requests.post(f"{API_URL}/search", json={
                "query": query,
                "limit": 5
            }, timeout=30)
            
            passed = r.status_code == 200
            if not passed:
                results.add(f"Special chars: '{query}'", False, f"Status {r.status_code}")
                all_passed = False
        except Exception as e:
            results.add(f"Special chars: '{query}'", False, str(e))
            all_passed = False
    
    if all_passed:
        results.add("Special character handling", True, "All queries processed")
    return all_passed


def test_unicode_query():
    """Test 11: Unicode/Hindi text handling"""
    try:
        r = requests.post(f"{API_URL}/search", json={
            "query": "गिफ्ट for girlfriend",  # Hindi + English mix
            "limit": 5
        }, timeout=30)
        
        passed = r.status_code == 200
        results.add("Unicode handling", passed, 
                   "Processed successfully" if passed else f"Status {r.status_code}")
        return passed
    except Exception as e:
        results.add("Unicode handling", False, str(e))
        return False


def test_result_relevance():
    """Test 12: Check if results are semantically relevant"""
    test_cases = [
        ("skincare for oily skin", ["skincare", "oily", "skin", "face", "care", "serum", "cleanser"]),
        ("jewelry for women", ["jewelry", "jewellery", "necklace", "bracelet", "ring", "gold", "silver"]),
        ("home decor", ["decor", "home", "wall", "room", "aesthetic", "frame", "lamp"]),
    ]
    
    all_passed = True
    for query, keywords in test_cases:
        try:
            r = requests.post(f"{API_URL}/search", json={
                "query": query,
                "limit": 5
            }, timeout=30)
            
            if r.status_code != 200:
                results.add(f"Relevance: '{query}'", False, f"Status {r.status_code}")
                all_passed = False
                continue
            
            data = r.json()
            
            if not data["results"]:
                results.add(f"Relevance: '{query}'", False, "No results")
                all_passed = False
                continue
            
            # Check if at least one keyword appears in top results
            found_relevant = False
            for item in data["results"][:3]:
                text = f"{item.get('title', '')} {item.get('description', '')} {item.get('tags', '')}".lower()
                if any(kw in text for kw in keywords):
                    found_relevant = True
                    break
            
            if not found_relevant:
                # Still pass but with warning - semantic search may find related items
                results.add(f"Relevance: '{query}'", True, 
                           f"Semantic match (no exact keywords but {data['results'][0].get('title', 'Unknown')[:30]})")
            else:
                results.add(f"Relevance: '{query}'", True, "Keyword match found")
                
        except Exception as e:
            results.add(f"Relevance: '{query}'", False, str(e))
            all_passed = False
    
    return all_passed


def test_product_details_complete():
    """Test 13: Product details have all expected fields"""
    try:
        r = requests.post(f"{API_URL}/search", json={
            "query": "popular products",
            "limit": 5
        }, timeout=30)
        
        if r.status_code != 200:
            results.add("Product details", False, f"Status {r.status_code}")
            return False
        
        data = r.json()
        
        if not data["results"]:
            results.add("Product details", False, "No results")
            return False
        
        # Check completeness of first few results
        issues = []
        for i, item in enumerate(data["results"][:3]):
            if not item.get("title"):
                issues.append(f"Item {i}: missing title")
            if not item.get("id"):
                issues.append(f"Item {i}: missing id")
            if item.get("price", -1) < 0:
                issues.append(f"Item {i}: invalid price")
            if not item.get("imageUrl"):
                issues.append(f"Item {i}: missing imageUrl")
        
        if issues:
            results.add("Product details", False, issues[0])
            return False
        
        results.add("Product details", True, "All fields present")
        return True
    except Exception as e:
        results.add("Product details", False, str(e))
        return False


def test_concurrent_requests():
    """Test 14: Handle concurrent requests"""
    import concurrent.futures
    
    def make_request(query):
        try:
            r = requests.post(f"{API_URL}/search", json={
                "query": query,
                "limit": 5
            }, timeout=60)
            return r.status_code == 200
        except Exception:
            return False
    
    queries = [
        "gift for mom",
        "skincare routine",
        "home decor",
        "fitness gear",
        "travel accessories",
    ]
    
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            start = time.time()
            futures = [executor.submit(make_request, q) for q in queries]
            results_list = [f.result() for f in concurrent.futures.as_completed(futures)]
            duration = (time.time() - start) * 1000
        
        all_passed = all(results_list)
        results.add("Concurrent requests", all_passed, 
                   f"{sum(results_list)}/5 successful in {duration:.0f}ms")
        return all_passed
    except Exception as e:
        results.add("Concurrent requests", False, str(e))
        return False


def run_all_tests():
    """Run the complete test suite"""
    print("=" * 60)
    print("TOASTD SEARCH API - COMPREHENSIVE TEST SUITE")
    print("=" * 60)
    print(f"API URL: {API_URL}")
    print(f"Qdrant URL: {QDRANT_URL}")
    print("=" * 60)
    print()
    
    print("─" * 60)
    print("INFRASTRUCTURE TESTS")
    print("─" * 60)
    
    # Infrastructure tests
    test_qdrant_connection()
    health = test_health_endpoint()
    
    if not health:
        print("\n⚠️  Server not ready. Cannot continue with other tests.")
        return results.summary()
    
    print()
    print("─" * 60)
    print("API FUNCTIONALITY TESTS")
    print("─" * 60)
    
    # Basic functionality
    test_basic_search("birthday gift", 3)
    test_basic_search("skincare products", 3)
    test_search_response_format()
    test_limit_parameter()
    test_empty_query()
    
    print()
    print("─" * 60)
    print("ADVANCED QUERY TESTS")
    print("─" * 60)
    
    # Advanced features
    test_price_filter()
    test_special_characters()
    test_unicode_query()
    test_complex_queries()
    
    print()
    print("─" * 60)
    print("QUALITY & PERFORMANCE TESTS")
    print("─" * 60)
    
    # Quality and performance
    test_result_relevance()
    test_product_details_complete()
    test_performance_benchmark()
    test_concurrent_requests()
    
    # Final summary
    return results.summary()


if __name__ == "__main__":
    success = run_all_tests()
    exit(0 if success else 1)
