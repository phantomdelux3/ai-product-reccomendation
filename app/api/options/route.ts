import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';

export async function GET() {
    try {
        // Path to the generated product_type.json in temp directory
        // Adjust path relative to where this route runs
        // process.cwd() is usually the project root
        const optionsPath = path.join(process.cwd(), 'temp', 'product_type.json');

        // Check if file exists
        try {
            await fs.access(optionsPath);
        } catch (e) {
            // If not found, return empty structure or default
            return NextResponse.json({});
        }

        const data = await fs.readFile(optionsPath, 'utf-8');
        const options = JSON.parse(data);

        return NextResponse.json(options);
    } catch (error) {
        console.error('Error serving options:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
