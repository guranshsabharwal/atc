import { parse } from 'csv-parse/sync';
import fs from 'fs-extra';
import path from 'path';
import { Airport, AirportSchema } from '@atc/shared';

const KHEF_IDENT = 'KHEF';

async function main() {
    const rawDir = path.resolve(__dirname, '../../../data/raw/ourairports');
    const derivedDir = path.resolve(__dirname, '../../../data/derived/khef');

    // Ensure directories exist (in case they weren't created correctly)
    await fs.ensureDir(derivedDir);

    console.log(`Reading from ${rawDir}`);

    // 1. Read Airports
    const airportsCsv = await fs.readFile(path.join(rawDir, 'airports.csv'), 'utf-8');
    const airports = parse(airportsCsv, { columns: true, skip_empty_lines: true });

    const khefRaw = airports.find((a: any) => a.ident === KHEF_IDENT);
    if (!khefRaw) {
        throw new Error(`Airport ${KHEF_IDENT} not found in airports.csv`);
    }

    // 2. Read Runways
    const runwaysCsv = await fs.readFile(path.join(rawDir, 'runways.csv'), 'utf-8');
    const runwaysAll = parse(runwaysCsv, { columns: true, skip_empty_lines: true });
    const khefRunwaysRaw = runwaysAll.filter((r: any) => r.airport_ref === khefRaw.id);

    // 3. Transform
    const airport: Airport = {
        id: khefRaw.ident,
        name: khefRaw.name,
        elevation_ft: parseFloat(khefRaw.elevation_ft || '0'),
        location: {
            lat: parseFloat(khefRaw.latitude_deg),
            lon: parseFloat(khefRaw.longitude_deg),
        },
        runways: khefRunwaysRaw.map((r: any) => ({
            ident: r.le_ident + (r.he_ident ? `/${r.he_ident}` : ''), // e.g. "16L/34R"
            length_ft: parseFloat(r.length_ft || '0'),
            width_ft: parseFloat(r.width_ft || '0'),
            surface: r.surface,
            lighted: r.lighted === '1',
            closed: r.closed === '1',
        })),
    };

    // 4. Validate
    const validated = AirportSchema.parse(airport);

    // 5. Write
    const outputPath = path.join(derivedDir, 'airport.base.json');
    await fs.writeJson(outputPath, validated, { spaces: 2 });
    console.log(`Wrote validated airport data to ${outputPath}`);
}

main().catch(console.error);
