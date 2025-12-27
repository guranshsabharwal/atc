'use client';

import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export default function AirportMap() {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const [loaded, setLoaded] = useState(false);

    // Visibility States
    const [showGraph, setShowGraph] = useState(true);
    const [showLabels, setShowLabels] = useState(true);
    const [showLayout, setShowLayout] = useState(true);

    useEffect(() => {
        if (map.current || !mapContainer.current) return;

        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: {
                version: 8,
                sources: {
                    'osm-tiles': {
                        type: 'raster',
                        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                        tileSize: 256,
                        attribution: '&copy; OpenStreetMap Contributors'
                    }
                },
                layers: [
                    {
                        id: 'osm-tiles-layer',
                        type: 'raster',
                        source: 'osm-tiles',
                        minzoom: 0,
                        maxzoom: 19
                    }
                ]
            },
            center: [-77.5154, 38.7214], // KHEF
            zoom: 14, // Zoomed in a bit more for Labels
        });

        map.current.on('load', () => {
            setLoaded(true);

            // Add Sources
            map.current?.addSource('airport-osm', {
                type: 'geojson',
                data: '/api/geo/osm'
            });

            map.current?.addSource('airport-graph', {
                type: 'geojson',
                data: '/api/geo/graph'
            });

            // Add Layers
            // 1. Aprons/Parking (Polygons)
            map.current?.addLayer({
                id: 'airport-aprons',
                type: 'fill',
                source: 'airport-osm',
                layout: {
                    visibility: 'visible'
                },
                paint: {
                    'fill-color': '#e0e0e0',
                    'fill-opacity': 0.5
                },
                filter: ['in', 'aeroway', 'apron', 'parking_position']
            });

            // 2. Runways (Lines)
            map.current?.addLayer({
                id: 'airport-runways',
                type: 'line',
                source: 'airport-osm',
                layout: {
                    visibility: 'visible'
                },
                paint: {
                    'line-color': '#555',
                    'line-width': 4
                },
                filter: ['==', 'aeroway', 'runway']
            });

            // 3. Taxiways (Lines)
            map.current?.addLayer({
                id: 'airport-taxiways',
                type: 'line',
                source: 'airport-osm',
                layout: {
                    visibility: 'visible'
                },
                paint: {
                    'line-color': '#888',
                    'line-width': 2
                },
                filter: ['==', 'aeroway', 'taxiway']
            });

            // 4. Labels (Text)
            map.current?.addLayer({
                id: 'airport-labels',
                type: 'symbol',
                source: 'airport-osm',
                layout: {
                    'text-field': ['get', 'label'],
                    'text-size': 10,
                    'text-offset': [0, 1],
                    'text-anchor': 'top',
                    visibility: 'visible'
                },
                paint: {
                    'text-color': '#333',
                    'text-halo-color': '#fff',
                    'text-halo-width': 1
                },
                filter: ['any', ['==', 'aeroway', 'runway'], ['==', 'aeroway', 'taxiway']]
            });

            // 5. Graph Debug (Overlay)
            map.current?.addLayer({
                id: 'graph-edges',
                type: 'line',
                source: 'airport-graph',
                layout: {
                    visibility: 'visible'
                },
                paint: {
                    'line-color': 'blue',
                    'line-width': 1,
                    'line-opacity': 0.5
                }
            });
        });
    }, []);

    // Effect to handle toggles
    useEffect(() => {
        if (!map.current || !loaded) return;

        map.current.setLayoutProperty('graph-edges', 'visibility', showGraph ? 'visible' : 'none');

        const labelVisibility = showLabels ? 'visible' : 'none';
        map.current.setLayoutProperty('airport-labels', 'visibility', labelVisibility);

        const layoutVisibility = showLayout ? 'visible' : 'none';
        map.current.setLayoutProperty('airport-runways', 'visibility', layoutVisibility);
        map.current.setLayoutProperty('airport-taxiways', 'visibility', layoutVisibility);
        map.current.setLayoutProperty('airport-aprons', 'visibility', layoutVisibility);

    }, [loaded, showGraph, showLabels, showLayout]);

    return (
        <div className="relative w-full h-[600px] border rounded-lg overflow-hidden flex flex-col">
            {/* Map Container */}
            <div ref={mapContainer} className="flex-1 relative" />

            {/* Loading Overlay */}
            {!loaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-100/50 backdrop-blur-sm z-10 pointer-events-none">
                    <span className="text-sm font-medium">Loading Map...</span>
                </div>
            )}

            {/* Controls Panel */}
            <div className="absolute top-4 right-4 bg-white/90 backdrop-blur p-3 rounded shadow-md z-10 flex flex-col gap-2 text-sm border">
                <h4 className="font-semibold mb-1">Map Layers</h4>
                <label className="flex items-center gap-2 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={showLayout}
                        onChange={e => setShowLayout(e.target.checked)}
                        className="rounded"
                    />
                    Airport Layout
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={showLabels}
                        onChange={e => setShowLabels(e.target.checked)}
                        className="rounded"
                    />
                    Labels (Runway/Taxi)
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={showGraph}
                        onChange={e => setShowGraph(e.target.checked)}
                        className="rounded"
                    />
                    Graph Debug (Blue)
                </label>
            </div>
        </div>
    );
}
