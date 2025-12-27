'use client';

import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export default function AirportMap() {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const [loaded, setLoaded] = useState(false);

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
            zoom: 13,
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
                paint: {
                    'line-color': '#888',
                    'line-width': 2
                },
                filter: ['==', 'aeroway', 'taxiway']
            });

            // 4. Graph Debug (Overlay)
            map.current?.addLayer({
                id: 'graph-edges',
                type: 'line',
                source: 'airport-graph',
                paint: {
                    'line-color': 'blue',
                    'line-width': 1,
                    'line-opacity': 0.5
                }
            });
        });
    }, []);

    return (
        <div className="relative w-full h-[500px] border rounded-lg overflow-hidden">
            <div ref={mapContainer} className="absolute inset-0" />
            {!loaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-100/50 backdrop-blur-sm z-10">
                    <span className="text-sm font-medium">Loading Map...</span>
                </div>
            )}
        </div>
    );
}
