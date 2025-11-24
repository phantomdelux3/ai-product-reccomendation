function testDiversityLogic() {
    console.log('Testing Brand Diversity Logic...');

    // Mock search results (sorted by relevance score)
    const searchResult = [
        { id: '1', payload: { brand: 'Brand A', title: 'Product 1' } },
        { id: '2', payload: { brand: 'Brand A', title: 'Product 2' } },
        { id: '3', payload: { brand: 'Brand B', title: 'Product 3' } },
        { id: '4', payload: { brand: 'Brand A', title: 'Product 4' } },
        { id: '5', payload: { brand: 'Brand C', title: 'Product 5' } },
        { id: '6', payload: { brand: 'Brand B', title: 'Product 6' } },
        { id: '7', payload: { brand: 'Brand D', title: 'Product 7' } },
    ];

    console.log('Input:', JSON.stringify(searchResult.map(p => p.payload.brand)));

    // Logic from API
    const uniqueBrands = new Set();
    const diverseProducts = [];
    const otherProducts = [];

    for (const item of searchResult) {
        const product = { id: item.id, ...item.payload };
        const brand = product.brand || 'Unknown';

        if (!uniqueBrands.has(brand)) {
            uniqueBrands.add(brand);
            diverseProducts.push(product);
        } else {
            otherProducts.push(product);
        }
    }

    // Fill up to 5 products
    const finalProducts = [...diverseProducts, ...otherProducts].slice(0, 5);

    console.log('Output:', JSON.stringify(finalProducts.map(p => p.brand)));

    // Expected: Brand A, Brand B, Brand C, Brand D, Brand A (or similar, ensuring A, B, C, D are present first)
    const brands = finalProducts.map(p => p.brand);
    const uniqueCount = new Set(brands).size;

    if (uniqueCount >= 4) { // We expect A, B, C, D to be present
        console.log('✅ Success: Diversity logic prioritized unique brands.');
    } else {
        console.error('❌ Failure: Diversity logic failed.');
    }
}

testDiversityLogic();
