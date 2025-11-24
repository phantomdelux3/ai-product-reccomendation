async function testTransformers() {
    try {
        console.log('Importing @xenova/transformers...');
        const { pipeline } = await import('@xenova/transformers');

        console.log('Loading model...');
        const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

        const text = "This is a test sentence.";
        console.log(`Generating embedding for: "${text}"`);

        const output = await extractor(text, { pooling: 'mean', normalize: true });
        const embedding = Array.from(output.data);

        console.log(`Embedding generated. Dimensions: ${embedding.length}`);

        if (embedding.length === 384) {
            console.log('✅ Success: Transformers library is working correctly.');
        } else {
            console.error('❌ Failure: Incorrect dimensions.');
        }

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

testTransformers();
