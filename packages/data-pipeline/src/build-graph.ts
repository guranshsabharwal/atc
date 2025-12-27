import fs from 'fs-extra';
import path from 'path';
import * as turf from '@turf/turf';

async function main() {
    const geojsonPath = path.resolve(__dirname, '../../../data/raw/osm/khef.geojson');
    const graphPath = path.resolve(__dirname, '../../../data/derived/khef/graph.json');
    const debugPath = path.resolve(__dirname, '../../../data/derived/khef/graph_debug.geojson');

    console.log(`Reading GeoJSON from ${geojsonPath}`);
    const geojson = await fs.readJson(geojsonPath);

    // 1. Filter filter for taxiways/runways
    const lines = geojson.features.filter((f: any) =>
        f.geometry.type === 'LineString' &&
        (f.properties.aeroway === 'taxiway' || f.properties.aeroway === 'runway')
    );
    console.log(`Found ${lines.length} lines (taxiways/runways)`);

    // 2. Topology Building: Explode into segments
    // A simple approach for robust graph building from independent lines is:
    // a. Collect all vertices from all lines.
    // b. Snap vertices close to each other (merge nodes).
    // c. Create edges between consecutive vertices in original lines.

    // However, we want to split lines at intersections. Turf has topological tools, but they can be heavy.
    // For a simple ATC sim, we can assume OSM nodes that are shared are effectively intersections.
    // BUT in OSM, lines might cross without sharing a node if not properly digitized.
    // Given the "Build ground movement graph" complexity, let's stick to endpoint/vertex graph construction first.
    // If we need splitting, we'd use line-split. Let's assume initially that OSM data is reasonably topological for intersections.

    // Better approach:
    // 1. Explode all LineStrings into constituent coordinate pairs (segments).
    // 2. Create a map of coordinate -> nodeId.
    // 3. For each segment, create an edge.

    const nodes = new Map<string, { id: string, lat: number, lon: number }>();
    const edges: any[] = [];

    const getNode = (lon: number, lat: number) => {
        // Simple snapping by precision rounding (~11cm precision at 6 decimals)
        const key = `${lon.toFixed(6)},${lat.toFixed(6)}`;
        if (!nodes.has(key)) {
            nodes.set(key, {
                id: key,
                lat,
                lon
            });
        }
        return nodes.get(key)!;
    };

    let edgeCount = 0;

    for (const feature of lines) {
        const coords = feature.geometry.coordinates;
        if (!coords || coords.length < 2) continue;

        for (let i = 0; i < coords.length - 1; i++) {
            const start = coords[i];
            const end = coords[i + 1];

            const fromNode = getNode(start[0], start[1]);
            const toNode = getNode(end[0], end[1]);

            // Calculate distance
            const from = turf.point([fromNode.lon, fromNode.lat]);
            const to = turf.point([toNode.lon, toNode.lat]);
            const distance = turf.distance(from, to, { units: 'kilometers' }) * 1000; // meters

            edges.push({
                id: `edge_${edgeCount++}`,
                from: fromNode.id,
                to: toNode.id,
                distance,
                type: feature.properties.aeroway,
                ref: feature.properties.ref || feature.properties.name
            });

            // Should be bidirectional for ground movement generally
            edges.push({
                id: `edge_${edgeCount++}`,
                from: toNode.id,
                to: fromNode.id,
                distance,
                type: feature.properties.aeroway,
                ref: feature.properties.ref || feature.properties.name
            });
        }
    }

    const graph = {
        nodes: Object.fromEntries(nodes),
        edges
    };

    await fs.writeJson(graphPath, graph, { spaces: 2 });
    console.log(`Wrote Graph to ${graphPath}: ${nodes.size} nodes, ${edges.length} edges`);

    // Debug GeoJSON: turn each edge into a feature
    const debugFeatures = edges.map(e => {
        const n1 = nodes.get(e.from)!;
        const n2 = nodes.get(e.to)!;
        return turf.lineString([[n1.lon, n1.lat], [n2.lon, n2.lat]], {
            ...e
        });
    });

    await fs.writeJson(debugPath, turf.featureCollection(debugFeatures), { spaces: 2 });
    console.log(`Wrote Debug GeoJSON to ${debugPath}`);
}

main().catch(console.error);
