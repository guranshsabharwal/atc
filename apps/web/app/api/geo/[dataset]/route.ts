import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET(
    request: NextRequest,
    { params }: { params: { dataset: string } }
) {
    try {
        const { dataset } = params;
        let filePath = '';

        // Securely map dataset names to file paths to prevent arbitrary file access
        if (dataset === 'osm') {
            filePath = path.join(process.cwd(), '../../data/raw/osm/khef.geojson');
        } else if (dataset === 'graph') {
            filePath = path.join(process.cwd(), '../../data/derived/khef/graph_debug.geojson');
        } else {
            return NextResponse.json({ error: 'Dataset not found' }, { status: 404 });
        }

        const fileContent = await fs.readFile(filePath, 'utf-8');
        const json = JSON.parse(fileContent);

        return NextResponse.json(json);
    } catch (error) {
        console.error('Error fetching geojson:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
