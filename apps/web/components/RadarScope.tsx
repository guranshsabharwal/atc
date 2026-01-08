'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { WorldState, Aircraft } from '@atc/shared';
import * as turf from '@turf/turf';

// KHEF center coordinates
const KHEF_CENTER: [number, number] = [-77.5154, 38.7214];

// Range rings in nautical miles
const RANGE_RINGS = [5, 10, 15, 20];

// Cardinal directions for compass rose
const COMPASS_DIRECTIONS = [
    { label: 'N', angle: 0 },
    { label: 'NE', angle: 45 },
    { label: 'E', angle: 90 },
    { label: 'SE', angle: 135 },
    { label: 'S', angle: 180 },
    { label: 'SW', angle: 225 },
    { label: 'W', angle: 270 },
    { label: 'NW', angle: 315 },
];

interface RadarScopeProps {
    worldState: WorldState | null;
}

interface MeasurePoint {
    lng: number;
    lat: number;
}

/**
 * RadarScope - Enhanced Phase 6 Radar style map view for Approach/Departure
 * 
 * Features:
 * - Dark radar-style background with scanline effect
 * - Compass rose with cardinal directions
 * - Data blocks with leader lines
 * - Aircraft heading indicators
 * - Speed vector lines (projected position)
 * - Altitude trend arrows
 * - Color coding (arrivals=green, departures=cyan)
 * - Range rings at 5/10/15/20 nm
 * - Measuring tool (Turf distance)
 */
export default function RadarScope({ worldState }: RadarScopeProps) {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [measureMode, setMeasureMode] = useState(false);
    const [measurePoints, setMeasurePoints] = useState<MeasurePoint[]>([]);
    const [measuredDistance, setMeasuredDistance] = useState<number | null>(null);

    // Helper to convert degrees to radians
    const degToRad = (deg: number) => deg * Math.PI / 180;

    // Helper to calculate offset position given distance (nm) and bearing
    const offsetPosition = (centerLon: number, centerLat: number, distanceNm: number, bearingDeg: number): [number, number] => {
        const latOffset = (distanceNm / 60) * Math.cos(degToRad(bearingDeg));
        const lonOffset = (distanceNm / 60) * Math.sin(degToRad(bearingDeg)) / Math.cos(degToRad(centerLat));
        return [centerLon + lonOffset, centerLat + latOffset];
    };

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
                name: 'Radar Dark Enhanced',
                glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
                sources: {},
                layers: [
                    {
                        id: 'background',
                        type: 'background',
                        paint: {
                            'background-color': '#050f05' // Darker green tint
                        }
                    }
                ]
            },
            center: KHEF_CENTER,
            zoom: 9,
            attributionControl: false
        });

        map.current.on('load', () => {
            if (!map.current) return;

            // === RANGE RINGS ===
            const rangeRingsFeatures = RANGE_RINGS.map(rangeNm => {
                const points = [];
                for (let i = 0; i <= 64; i++) {
                    const angle = (i / 64) * 360;
                    points.push(offsetPosition(KHEF_CENTER[0], KHEF_CENTER[1], rangeNm, angle));
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
                data: { type: 'FeatureCollection', features: rangeRingsFeatures }
            });

            map.current.addLayer({
                id: 'range-rings-layer',
                type: 'line',
                source: 'range-rings',
                paint: {
                    'line-color': '#1a3a1a',
                    'line-width': 1,
                    'line-opacity': 0.6
                }
            });

            // === COMPASS ROSE SPOKES ===
            const spokeFeatures = COMPASS_DIRECTIONS.map(dir => {
                const innerPoint = offsetPosition(KHEF_CENTER[0], KHEF_CENTER[1], 1, dir.angle);
                const outerPoint = offsetPosition(KHEF_CENTER[0], KHEF_CENTER[1], 22, dir.angle);
                return {
                    type: 'Feature' as const,
                    properties: { label: dir.label, isCardinal: ['N', 'E', 'S', 'W'].includes(dir.label) },
                    geometry: {
                        type: 'LineString' as const,
                        coordinates: [innerPoint, outerPoint]
                    }
                };
            });

            map.current.addSource('compass-spokes', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: spokeFeatures }
            });

            map.current.addLayer({
                id: 'compass-spokes-layer',
                type: 'line',
                source: 'compass-spokes',
                paint: {
                    'line-color': ['case', ['get', 'isCardinal'], '#2a5a2a', '#1a3a1a'],
                    'line-width': ['case', ['get', 'isCardinal'], 1.5, 0.5],
                    'line-opacity': 0.4,
                    'line-dasharray': [8, 8]
                }
            });

            // === COMPASS LABELS ===
            const compassLabelFeatures = COMPASS_DIRECTIONS.filter(d => ['N', 'E', 'S', 'W'].includes(d.label)).map(dir => ({
                type: 'Feature' as const,
                properties: { label: dir.label },
                geometry: {
                    type: 'Point' as const,
                    coordinates: offsetPosition(KHEF_CENTER[0], KHEF_CENTER[1], 23, dir.angle)
                }
            }));

            map.current.addSource('compass-labels', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: compassLabelFeatures }
            });

            map.current.addLayer({
                id: 'compass-labels-layer',
                type: 'symbol',
                source: 'compass-labels',
                layout: {
                    'text-field': ['get', 'label'],
                    'text-size': 14,
                    'text-font': ['Open Sans Bold']
                },
                paint: {
                    'text-color': '#3a8a3a',
                    'text-halo-color': '#050f05',
                    'text-halo-width': 2
                }
            });

            // === RANGE LABELS ===
            const rangeLabelFeatures = RANGE_RINGS.map(rangeNm => ({
                type: 'Feature' as const,
                properties: { label: `${rangeNm}` },
                geometry: {
                    type: 'Point' as const,
                    coordinates: offsetPosition(KHEF_CENTER[0], KHEF_CENTER[1], rangeNm, 45)
                }
            }));

            map.current.addSource('range-labels', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: rangeLabelFeatures }
            });

            map.current.addLayer({
                id: 'range-labels-layer',
                type: 'symbol',
                source: 'range-labels',
                layout: {
                    'text-field': ['get', 'label'],
                    'text-size': 10,
                    'text-anchor': 'center'
                },
                paint: {
                    'text-color': '#2a6a2a',
                    'text-halo-color': '#050f05',
                    'text-halo-width': 1
                }
            });

            // === AIRPORT MARKER ===
            map.current.addSource('airport', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: [{
                        type: 'Feature',
                        properties: { name: 'KHEF' },
                        geometry: { type: 'Point', coordinates: KHEF_CENTER }
                    }]
                }
            });

            // Airport crosshairs
            map.current.addLayer({
                id: 'airport-crosshair',
                type: 'circle',
                source: 'airport',
                paint: {
                    'circle-radius': 8,
                    'circle-color': 'transparent',
                    'circle-stroke-color': '#00ff00',
                    'circle-stroke-width': 2
                }
            });

            map.current.addLayer({
                id: 'airport-center',
                type: 'circle',
                source: 'airport',
                paint: {
                    'circle-radius': 2,
                    'circle-color': '#00ff00'
                }
            });

            map.current.addLayer({
                id: 'airport-label',
                type: 'symbol',
                source: 'airport',
                layout: {
                    'text-field': 'KHEF',
                    'text-size': 11,
                    'text-offset': [0, 1.5],
                    'text-font': ['Open Sans Bold']
                },
                paint: {
                    'text-color': '#00ff00',
                    'text-halo-color': '#050f05',
                    'text-halo-width': 1
                }
            });

            // === AIRCRAFT SOURCES ===
            map.current.addSource('aircraft', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });

            map.current.addSource('aircraft-vectors', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });

            // Speed vector lines
            map.current.addLayer({
                id: 'aircraft-speed-vectors',
                type: 'line',
                source: 'aircraft-vectors',
                paint: {
                    'line-color': ['get', 'color'],
                    'line-width': 1,
                    'line-opacity': 0.6
                }
            });

            // Aircraft primary targets
            map.current.addLayer({
                id: 'aircraft-targets',
                type: 'circle',
                source: 'aircraft',
                filter: ['!=', ['get', 'isHistory'], true],
                paint: {
                    'circle-radius': 4,
                    'circle-color': ['get', 'color'],
                    'circle-stroke-color': ['get', 'color'],
                    'circle-stroke-width': 2
                }
            });

            // Aircraft data blocks with improved styling
            map.current.addLayer({
                id: 'aircraft-datablocks',
                type: 'symbol',
                source: 'aircraft',
                filter: ['!=', ['get', 'isHistory'], true],
                layout: {
                    'text-field': ['get', 'datablock'],
                    'text-size': 11,
                    'text-anchor': 'bottom-left',
                    'text-offset': [0.8, -0.3],
                    'text-font': ['Open Sans Regular'],
                    'text-justify': 'left'
                },
                paint: {
                    'text-color': ['get', 'color'],
                    'text-halo-color': '#050f05',
                    'text-halo-width': 1.5
                }
            });

            // History trail dots
            map.current.addLayer({
                id: 'aircraft-history',
                type: 'circle',
                source: 'aircraft',
                filter: ['==', ['get', 'isHistory'], true],
                paint: {
                    'circle-radius': 2,
                    'circle-color': '#004400',
                    'circle-opacity': 0.4
                }
            });

            // Measuring tool sources
            map.current.addSource('measure-points', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });

            map.current.addSource('measure-line', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });

            map.current.addLayer({
                id: 'measure-points-layer',
                type: 'circle',
                source: 'measure-points',
                paint: {
                    'circle-radius': 6,
                    'circle-color': '#ffff00',
                    'circle-stroke-color': '#ffff00',
                    'circle-stroke-width': 2
                }
            });

            map.current.addLayer({
                id: 'measure-line-layer',
                type: 'line',
                source: 'measure-line',
                paint: {
                    'line-color': '#ffff00',
                    'line-width': 2,
                    'line-dasharray': [4, 4]
                }
            });

            setMapLoaded(true);

            setTimeout(() => {
                map.current?.resize();
            }, 100);
        });
    }, []);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (mapContainer.current) {
                const rect = mapContainer.current.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    initializeMap();
                } else {
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

    useEffect(() => {
        const handleResize = () => map.current?.resize();
        window.addEventListener('resize', handleResize);
        const resizeTimeout = setTimeout(handleResize, 200);
        return () => {
            window.removeEventListener('resize', handleResize);
            clearTimeout(resizeTimeout);
        };
    }, []);

    // Measuring tool click handler
    useEffect(() => {
        if (!map.current || !mapLoaded) return;

        const handleClick = (e: maplibregl.MapMouseEvent) => {
            if (!measureMode) return;

            const point: MeasurePoint = { lng: e.lngLat.lng, lat: e.lngLat.lat };

            if (measurePoints.length === 0) {
                // First point
                setMeasurePoints([point]);
                setMeasuredDistance(null);
            } else if (measurePoints.length === 1) {
                // Second point - calculate distance
                const from = turf.point([measurePoints[0].lng, measurePoints[0].lat]);
                const to = turf.point([point.lng, point.lat]);
                const distance = turf.distance(from, to, { units: 'nauticalmiles' });
                setMeasurePoints([measurePoints[0], point]);
                setMeasuredDistance(distance);
            } else {
                // Reset and start new measurement
                setMeasurePoints([point]);
                setMeasuredDistance(null);
            }
        };

        map.current.on('click', handleClick);
        return () => {
            map.current?.off('click', handleClick);
        };
    }, [mapLoaded, measureMode, measurePoints]);

    // Update measuring tool visualization
    useEffect(() => {
        if (!map.current || !mapLoaded) return;

        const pointsSource = map.current.getSource('measure-points') as maplibregl.GeoJSONSource;
        const lineSource = map.current.getSource('measure-line') as maplibregl.GeoJSONSource;
        if (!pointsSource || !lineSource) return;

        // Update points
        const pointFeatures = measurePoints.map(p => ({
            type: 'Feature' as const,
            properties: {},
            geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] }
        }));
        pointsSource.setData({ type: 'FeatureCollection', features: pointFeatures });

        // Update line
        if (measurePoints.length === 2) {
            lineSource.setData({
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    properties: {},
                    geometry: {
                        type: 'LineString',
                        coordinates: [[measurePoints[0].lng, measurePoints[0].lat], [measurePoints[1].lng, measurePoints[1].lat]]
                    }
                }]
            });
        } else {
            lineSource.setData({ type: 'FeatureCollection', features: [] });
        }
    }, [measurePoints, mapLoaded]);

    // Update aircraft positions with enhanced features
    useEffect(() => {
        if (!map.current || !mapLoaded || !worldState) return;

        const aircraftSource = map.current.getSource('aircraft') as maplibregl.GeoJSONSource;
        const vectorSource = map.current.getSource('aircraft-vectors') as maplibregl.GeoJSONSource;
        if (!aircraftSource || !vectorSource) return;

        const airborneAircraft = worldState.aircraft.filter(
            ac => ac.flightPhase && ac.flightPhase !== 'GROUND'
        );

        const aircraftFeatures = airborneAircraft.map((ac: Aircraft) => {
            // Determine if climbing, descending, or level
            const targetAlt = ac.targetAltitude || ac.position.alt;
            const altDiff = targetAlt - ac.position.alt;
            let trendArrow = '';
            if (altDiff > 100) trendArrow = '↑';
            else if (altDiff < -100) trendArrow = '↓';

            // Format altitude
            const altDisplay = ac.position.alt >= 18000
                ? `FL${Math.round(ac.position.alt / 100)}`
                : `${Math.round(ac.position.alt / 100).toString().padStart(2, '0')}`;

            // Color based on phase (departures=cyan, arrivals=green)
            const isDeparture = ac.flightPhase === 'DEPARTURE';
            const color = isDeparture ? '#00ffff' : '#00ff00';

            // Create enhanced datablock
            const datablock = `${ac.callsign}\n${altDisplay}${trendArrow} ${Math.round(ac.speed)}`;

            return {
                type: 'Feature' as const,
                properties: {
                    id: ac.id,
                    callsign: ac.callsign,
                    datablock,
                    color,
                    heading: ac.position.heading,
                    flightPhase: ac.flightPhase,
                    isHistory: false
                },
                geometry: {
                    type: 'Point' as const,
                    coordinates: [ac.position.lon, ac.position.lat]
                }
            };
        });

        // Create speed vector lines (1 minute projection)
        const vectorFeatures = airborneAircraft.map((ac: Aircraft) => {
            const speedNmPerMin = ac.speed / 60; // Convert knots to nm/min
            const projectionMinutes = 1;
            const projectionDistance = speedNmPerMin * projectionMinutes;

            const startCoord: [number, number] = [ac.position.lon, ac.position.lat];
            const endCoord = offsetPosition(ac.position.lon, ac.position.lat, projectionDistance, ac.position.heading);

            const isDeparture = ac.flightPhase === 'DEPARTURE';
            const color = isDeparture ? '#00ffff' : '#00ff00';

            return {
                type: 'Feature' as const,
                properties: { id: ac.id, color },
                geometry: {
                    type: 'LineString' as const,
                    coordinates: [startCoord, endCoord]
                }
            };
        });

        aircraftSource.setData({ type: 'FeatureCollection', features: aircraftFeatures });
        vectorSource.setData({ type: 'FeatureCollection', features: vectorFeatures });
    }, [worldState, mapLoaded]);

    const targetCount = worldState?.aircraft.filter(ac => ac.flightPhase && ac.flightPhase !== 'GROUND').length || 0;
    const departureCount = worldState?.aircraft.filter(ac => ac.flightPhase === 'DEPARTURE').length || 0;
    const arrivalCount = targetCount - departureCount;

    return (
        <div className="relative w-full h-full bg-[#050f05]">
            <div ref={mapContainer} className="absolute inset-0" style={{ width: '100%', height: '100%' }} />

            {/* Enhanced radar info overlay */}
            <div className="absolute top-4 left-4 bg-black/90 border border-green-900 text-green-400 px-4 py-3 text-xs font-mono rounded shadow-lg">
                <div className="text-green-300 font-bold text-sm mb-1">KHEF APPROACH</div>
                <div className="text-green-600 text-[10px] mb-2">RADAR SCOPE • ASR-9</div>
                <div className="border-t border-green-900 pt-2 space-y-1">
                    <div className="flex justify-between gap-4">
                        <span className="text-green-600">TIME</span>
                        <span>{new Date().toLocaleTimeString('en-US', { hour12: false })}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                        <span className="text-green-600">RANGE</span>
                        <span>20 NM</span>
                    </div>
                </div>
            </div>

            {/* Traffic summary with color coding */}
            <div className="absolute bottom-4 left-4 bg-black/90 border border-green-900 text-green-400 px-4 py-3 text-xs font-mono rounded shadow-lg">
                <div className="text-green-600 text-[10px] mb-2">TRAFFIC SUMMARY</div>
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-400"></div>
                        <span>Arrivals: {arrivalCount}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-cyan-400"></div>
                        <span className="text-cyan-400">Departures: {departureCount}</span>
                    </div>
                </div>
            </div>

            {/* Legend */}
            <div className="absolute bottom-4 right-4 bg-black/90 border border-green-900 text-green-400 px-3 py-2 text-[10px] font-mono rounded">
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-green-600">↑</span>
                    <span>Climbing</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-green-600">↓</span>
                    <span>Descending</span>
                </div>
            </div>

            {/* Measuring Tool Controls */}
            <div className="absolute top-4 right-4 flex flex-col gap-2">
                <button
                    onClick={() => {
                        setMeasureMode(!measureMode);
                        if (measureMode) {
                            setMeasurePoints([]);
                            setMeasuredDistance(null);
                        }
                    }}
                    className={`px-3 py-2 text-xs font-mono rounded shadow-lg border transition-colors ${measureMode
                            ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400'
                            : 'bg-black/90 border-green-900 text-green-400 hover:border-green-600'
                        }`}
                >
                    📏 {measureMode ? 'MEASURING' : 'MEASURE'}
                </button>

                {/* Distance Display */}
                {measureMode && (
                    <div className="bg-black/90 border border-yellow-500 text-yellow-400 px-3 py-2 text-xs font-mono rounded shadow-lg">
                        {measuredDistance !== null ? (
                            <div className="text-center">
                                <div className="text-yellow-600 text-[10px]">DISTANCE</div>
                                <div className="text-lg font-bold">{measuredDistance.toFixed(1)} NM</div>
                            </div>
                        ) : measurePoints.length === 1 ? (
                            <div className="text-center text-yellow-600">Click second point</div>
                        ) : (
                            <div className="text-center text-yellow-600">Click first point</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
