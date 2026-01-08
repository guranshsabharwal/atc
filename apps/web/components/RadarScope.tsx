'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { WorldState, Aircraft } from '@atc/shared';

// KHEF center coordinates
const KHEF_CENTER: [number, number] = [-77.5154, 38.7214];

interface RadarScopeProps {
    worldState: WorldState | null;
}

/**
 * RadarScope - Phase 6 Radar style map view for Approach/Departure
 * 
 * Features:
 * - Dark radar-style background
 * - Data blocks showing callsign, altitude, ground speed
 * - Range rings at configurable intervals
 */
export default function RadarScope({ worldState }: RadarScopeProps) {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const [mapLoaded, setMapLoaded] = useState(false);

    // Range rings in nautical miles
    const RANGE_RINGS = [5, 10, 15, 20];

    const initializeMap = useCallback(() => {
        if (!mapContainer.current) return;

        // Clean up existing map
        if (map.current) {
            map.current.remove();
            map.current = null;
            setMapLoaded(false);
        }

        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: {
                version: 8,
                name: 'Radar Dark',
                glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
                sources: {},
                layers: [
                    {
                        id: 'background',
                        type: 'background',
                        paint: {
                            'background-color': '#0a1a0a' // Dark green tint
                        }
                    }
                ]
            },
            center: KHEF_CENTER,
            zoom: 9, // Zoomed out for radar view
            attributionControl: false
        });

        map.current.on('load', () => {
            if (!map.current) return;

            // Add range rings source
            const rangeRingsFeatures = RANGE_RINGS.map(rangeNm => {
                const points = [];
                for (let i = 0; i <= 64; i++) {
                    const angle = (i / 64) * 2 * Math.PI;
                    // Convert nm to degrees (rough approximation)
                    const latOffset = (rangeNm / 60) * Math.cos(angle);
                    const lonOffset = (rangeNm / 60) * Math.sin(angle) / Math.cos(KHEF_CENTER[1] * Math.PI / 180);
                    points.push([KHEF_CENTER[0] + lonOffset, KHEF_CENTER[1] + latOffset]);
                }
                return {
                    type: 'Feature' as const,
                    properties: { range: rangeNm },
                    geometry: {
                        type: 'LineString' as const,
                        coordinates: points
                    }
                };
            });

            map.current.addSource('range-rings', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: rangeRingsFeatures
                }
            });

            map.current.addLayer({
                id: 'range-rings-layer',
                type: 'line',
                source: 'range-rings',
                paint: {
                    'line-color': '#1a4a1a',
                    'line-width': 1,
                    'line-dasharray': [4, 4]
                }
            });

            // Add range labels
            const labelFeatures = RANGE_RINGS.map(rangeNm => ({
                type: 'Feature' as const,
                properties: { label: `${rangeNm} nm` },
                geometry: {
                    type: 'Point' as const,
                    coordinates: [KHEF_CENTER[0], KHEF_CENTER[1] + rangeNm / 60]
                }
            }));

            map.current.addSource('range-labels', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: labelFeatures
                }
            });

            map.current.addLayer({
                id: 'range-labels-layer',
                type: 'symbol',
                source: 'range-labels',
                layout: {
                    'text-field': ['get', 'label'],
                    'text-size': 10,
                    'text-anchor': 'bottom'
                },
                paint: {
                    'text-color': '#2a6a2a',
                    'text-halo-color': '#0a1a0a',
                    'text-halo-width': 1
                }
            });

            // Add airport marker
            map.current.addSource('airport', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: [{
                        type: 'Feature',
                        properties: { name: 'KHEF' },
                        geometry: {
                            type: 'Point',
                            coordinates: KHEF_CENTER
                        }
                    }]
                }
            });

            map.current.addLayer({
                id: 'airport-layer',
                type: 'circle',
                source: 'airport',
                paint: {
                    'circle-radius': 6,
                    'circle-color': '#00ff00',
                    'circle-opacity': 0.8
                }
            });

            map.current.addLayer({
                id: 'airport-label',
                type: 'symbol',
                source: 'airport',
                layout: {
                    'text-field': 'KHEF',
                    'text-size': 12,
                    'text-offset': [0, 1.2]
                },
                paint: {
                    'text-color': '#00ff00'
                }
            });

            // Add aircraft source (empty initially)
            map.current.addSource('aircraft', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: []
                }
            });

            // Aircraft symbols (squares for radar targets)
            map.current.addLayer({
                id: 'aircraft-targets',
                type: 'circle',
                source: 'aircraft',
                paint: {
                    'circle-radius': 5,
                    'circle-color': '#00ff00',
                    'circle-stroke-color': '#00ff00',
                    'circle-stroke-width': 1
                }
            });

            // Aircraft data blocks
            map.current.addLayer({
                id: 'aircraft-datablocks',
                type: 'symbol',
                source: 'aircraft',
                layout: {
                    'text-field': ['get', 'datablock'],
                    'text-size': 11,
                    'text-anchor': 'bottom-left',
                    'text-offset': [0.5, -0.5]
                },
                paint: {
                    'text-color': '#00ff00',
                    'text-halo-color': '#0a1a0a',
                    'text-halo-width': 1
                }
            });

            // History dots (trailing positions)
            map.current.addLayer({
                id: 'aircraft-history',
                type: 'circle',
                source: 'aircraft',
                paint: {
                    'circle-radius': 2,
                    'circle-color': '#006600',
                    'circle-opacity': 0.5
                },
                filter: ['==', ['get', 'isHistory'], true]
            });

            setMapLoaded(true);

            // Force a resize after load to ensure proper rendering
            setTimeout(() => {
                map.current?.resize();
            }, 100);
        });
    }, []);

    useEffect(() => {
        // Delay initialization to ensure container has dimensions
        const timeoutId = setTimeout(() => {
            if (mapContainer.current) {
                const rect = mapContainer.current.getBoundingClientRect();
                console.log('RadarScope container dimensions:', rect.width, rect.height);
                if (rect.width > 0 && rect.height > 0) {
                    initializeMap();
                } else {
                    console.warn('RadarScope: Container has zero dimensions, retrying...');
                    // Retry after another delay
                    setTimeout(() => initializeMap(), 500);
                }
            }
        }, 100);

        return () => {
            clearTimeout(timeoutId);
            if (map.current) {
                map.current.remove();
                map.current = null;
            }
        };
    }, [initializeMap]);

    // Handle container resize
    useEffect(() => {
        const handleResize = () => {
            if (map.current) {
                map.current.resize();
            }
        };

        window.addEventListener('resize', handleResize);

        // Also trigger resize after a short delay to catch any layout changes
        const resizeTimeout = setTimeout(handleResize, 200);

        return () => {
            window.removeEventListener('resize', handleResize);
            clearTimeout(resizeTimeout);
        };
    }, []);

    // Update aircraft positions
    useEffect(() => {
        if (!map.current || !mapLoaded || !worldState) return;

        const source = map.current.getSource('aircraft') as maplibregl.GeoJSONSource;
        if (!source) return;

        // Filter only airborne aircraft
        const airborneAircraft = worldState.aircraft.filter(
            ac => ac.flightPhase && ac.flightPhase !== 'GROUND'
        );

        const features = airborneAircraft.map((ac: Aircraft) => {
            // Format altitude as flight level or thousands
            const altDisplay = ac.position.alt >= 18000
                ? `FL${Math.round(ac.position.alt / 100)}`
                : `${Math.round(ac.position.alt / 100)}`;

            // Format speed
            const speedDisplay = Math.round(ac.speed);

            // Create datablock text
            const datablock = `${ac.callsign}\n${altDisplay} ${speedDisplay}`;

            return {
                type: 'Feature' as const,
                properties: {
                    id: ac.id,
                    callsign: ac.callsign,
                    datablock,
                    altitude: ac.position.alt,
                    speed: ac.speed,
                    heading: ac.position.heading,
                    controller: ac.controllerId,
                    flightPhase: ac.flightPhase,
                    isHistory: false
                },
                geometry: {
                    type: 'Point' as const,
                    coordinates: [ac.position.lon, ac.position.lat]
                }
            };
        });

        source.setData({
            type: 'FeatureCollection',
            features
        });
    }, [worldState, mapLoaded]);

    return (
        <div className="relative w-full h-full">
            <div ref={mapContainer} className="absolute inset-0" style={{ width: '100%', height: '100%' }} />

            {/* Radar info overlay */}
            <div className="absolute top-4 left-4 bg-black/80 text-green-400 px-3 py-2 text-xs font-mono rounded">
                <div className="font-bold">KHEF APPROACH</div>
                <div className="text-green-600">Radar Scope</div>
            </div>

            {/* Aircraft count */}
            <div className="absolute bottom-4 left-4 bg-black/80 text-green-400 px-3 py-2 text-xs font-mono rounded">
                <div>Targets: {worldState?.aircraft.filter(ac => ac.flightPhase && ac.flightPhase !== 'GROUND').length || 0}</div>
            </div>
        </div>
    );
}
