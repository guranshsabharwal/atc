import fs from 'fs-extra';
import path from 'path';
import osmtogeojson from 'osmtogeojson';

async function main() {
    const qlPath = path.resolve(__dirname, '../../../data/raw/osm/khef.overpassql');
    const outPath = path.resolve(__dirname, '../../../data/raw/osm/khef.geojson');

    console.log(`Reading QL from ${qlPath}`);
    const query = await fs.readFile(qlPath, 'utf-8');

    console.log('Querying Overpass API...');
    const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
    });

    if (!response.ok) {
        throw new Error(`Overpass API failed: ${response.status} ${response.statusText}`);
    }

    const osmData = await response.json();
    console.log(`Received ${osmData.elements.length} elements`);

    console.log('Converting to GeoJSON...');
    const geojson = osmtogeojson(osmData);

    console.log('Normalizing and Validating...');
    const normalizedFeatures = geojson.features.map((feature: any) => {
        // Normalization
        const props = feature.properties || {};
        // Ensure aeroway tag is present (it should be due to query)
        if (!props.aeroway) {
            console.warn(`Feature ${feature.id} missing aeroway tag`);
        }

        // Normalization: Ensure 'ref' or 'name' is accessible as 'label'
        props.label = props.ref || props.name || props.aeroway;

        return {
            ...feature,
            properties: props,
        };
    }).filter((feature: any) => {
        // Validation: simple geometry check
        if (!feature.geometry || !feature.geometry.coordinates || feature.geometry.coordinates.length === 0) {
            console.warn(`Feature ${feature.id} has invalid geometry. Dropping.`);
            return false;
        }
        return true;
    });

    const finalGeoJSON = {
        ...geojson,
        features: normalizedFeatures,
    };

    await fs.writeJson(outPath, finalGeoJSON, { spaces: 2 });
    console.log(`Wrote validated GeoJSON to ${outPath} (${normalizedFeatures.length} features)`);
}

main().catch(console.error);
