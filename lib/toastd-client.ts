/**
 * Toastd Search Client (Simple API Proxy)
 * 
 * Alternative approach: Instead of embedding TypeScript libraries,
 * this client simply proxies requests to the Python FastAPI server.
 * 
 * This is the RECOMMENDED approach for simple integration.
 * 
 * Usage in your Next.js app:
 *   import { searchToastd } from '@/lib/toastd-client';
 *   const results = await searchToastd('skincare for oily skin');
 */

const TOASTD_API_URL = process.env.TOASTD_API_URL || 'http://localhost:8001';

export interface ToastdProduct {
    id: string;
    title: string;
    description: string;
    headline?: string;
    price: number;
    priceNumeric: number;
    imageUrl?: string;
    productUrl?: string;
    tags?: string;
    views: number;
    votes: number;
    score: number;
    source: 'toastd';
}

export interface ToastdSearchResponse {
    query: string;
    totalResults: number;
    results: ToastdProduct[];
    processingTimeMs: number;
}

export interface ToastdSearchOptions {
    limit?: number;
    priceMin?: number;
    priceMax?: number;
}

/**
 * Search for products in the toastd collection
 */
export async function searchToastd(
    query: string,
    options: ToastdSearchOptions = {}
): Promise<ToastdSearchResponse> {
    const { limit = 10, priceMin, priceMax } = options;

    const response = await fetch(`${TOASTD_API_URL}/search`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            query,
            limit,
            priceMin,
            priceMax,
        }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Search failed' }));
        throw new Error(error.detail || 'Toastd search failed');
    }

    return response.json();
}

/**
 * Check if the toastd API is healthy
 */
export async function checkToastdHealth(): Promise<{
    status: string;
    collection: string;
    productsCount: number;
    model: string;
}> {
    const response = await fetch(`${TOASTD_API_URL}/health`);

    if (!response.ok) {
        throw new Error('Toastd API is not healthy');
    }

    return response.json();
}

export default {
    search: searchToastd,
    checkHealth: checkToastdHealth,
};
