'use client';

import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { WorldState, Aircraft, KHEF_RUNWAY_CONFIGS } from '@atc/shared';

interface AirportMapProps {
    worldState: WorldState | null;
    showLayerToggles?: boolean;                                // hide debug toggles in demo mode
    onAssignRunway?: (aircraftId: string, runwayId: string) => void; // HUMAN-mode click action
    onHoldAircraft?: (aircraftId: string, hold: boolean) => void;    // manual Stop/Resume
}

const RUNWAY_OPTIONS = ['16L', '16R', '34L', '34R'];

export default function AirportMap({ worldState, showLayerToggles = false, onAssignRunway, onHoldAircraft }: AirportMapProps) {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const [loaded, setLoaded] = useState(false);
    const popupRef = useRef<maplibregl.Popup | null>(null);

    // Mode + assigner refs so map click handlers stay correct across re-renders.
    const worldStateRef = useRef<WorldState | null>(worldState);
    const onAssignRunwayRef = useRef(onAssignRunway);
    const onHoldAircraftRef = useRef(onHoldAircraft);
    useEffect(() => { worldStateRef.current = worldState; }, [worldState]);
    useEffect(() => { onAssignRunwayRef.current = onAssignRunway; }, [onAssignRunway]);
    useEffect(() => { onHoldAircraftRef.current = onHoldAircraft; }, [onHoldAircraft]);

    // Visibility States
    const [showGraph, setShowGraph] = useState(false);
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
            zoom: 14,
        });

        // Add aircraft image on load
        map.current.loadImage('https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Airplane_silhouette.svg/200px-Airplane_silhouette.svg.png').then((response) => {
            if (response && response.data) {
                map.current?.addImage('aircraft-icon', response.data);
            }
        }).catch(err => console.error('Failed to load aircraft icon', err));

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

            // Aircraft Source (Dynamic)
            map.current?.addSource('aircraft-source', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: []
                }
            });

            // Layers (same as before)
            map.current?.addLayer({
                id: 'airport-aprons',
                type: 'fill',
                source: 'airport-osm',
                layout: { visibility: 'visible' },
                paint: { 'fill-color': '#e0e0e0', 'fill-opacity': 0.5 },
                filter: ['in', 'aeroway', 'apron', 'parking_position']
            });

            map.current?.addLayer({
                id: 'airport-runways',
                type: 'line',
                source: 'airport-osm',
                layout: { visibility: 'visible' },
                paint: { 'line-color': '#555', 'line-width': 4 },
                filter: ['==', 'aeroway', 'runway']
            });

            map.current?.addLayer({
                id: 'airport-taxiways',
                type: 'line',
                source: 'airport-osm',
                layout: { visibility: 'visible' },
                paint: { 'line-color': '#888', 'line-width': 2 },
                filter: ['==', 'aeroway', 'taxiway']
            });

            // Custom Runway Threshold Labels - Individual designators at each end
            // Coordinates from OSM runway geometry
            map.current?.addSource('runway-thresholds', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: [
                        // Runway 16L/34R (main runway - runs NW to SE)
                        // 16L = northwest end, 34R = southeast end
                        { type: 'Feature', geometry: { type: 'Point', coordinates: [-77.5187, 38.7277] }, properties: { label: '16L' } },
                        { type: 'Feature', geometry: { type: 'Point', coordinates: [-77.5081, 38.7129] }, properties: { label: '34R' } },
                        // Runway 16R/34L (parallel runway - west of main)
                        // 16R = northwest end, 34L = southeast end  
                        { type: 'Feature', geometry: { type: 'Point', coordinates: [-77.5210, 38.7266] }, properties: { label: '16R' } },
                        { type: 'Feature', geometry: { type: 'Point', coordinates: [-77.5147, 38.7178] }, properties: { label: '34L' } }
                    ]
                }
            });

            // Runway Threshold Labels - LARGE and Bold
            map.current?.addLayer({
                id: 'airport-runway-labels',
                type: 'symbol',
                source: 'runway-thresholds',
                layout: {
                    'text-field': ['get', 'label'],
                    'text-size': 18,
                    'text-font': ['Open Sans Bold'],
                    'text-offset': [0, 0],
                    'text-anchor': 'center',
                    'text-allow-overlap': true,
                    visibility: 'visible'
                },
                paint: {
                    'text-color': '#ffffff',
                    'text-halo-color': '#000000',
                    'text-halo-width': 2
                }
            });

            // Taxiway Labels - smaller
            map.current?.addLayer({
                id: 'airport-labels',
                type: 'symbol',
                source: 'airport-osm',
                layout: {
                    'text-field': ['get', 'label'],
                    'text-size': 11,
                    'text-offset': [0, 1],
                    'text-anchor': 'top',
                    visibility: 'visible'
                },
                paint: { 'text-color': '#333', 'text-halo-color': '#fff', 'text-halo-width': 1 },
                filter: ['==', 'aeroway', 'taxiway']
            });

            map.current?.addLayer({
                id: 'graph-edges',
                type: 'line',
                source: 'airport-graph',
                layout: { visibility: 'visible' },
                paint: { 'line-color': 'blue', 'line-width': 1, 'line-opacity': 0.5 }
            });

            // Aircraft Paths Source
            map.current?.addSource('aircraft-paths', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: []
                }
            });

            // Aircraft halo (only visible for aircraft awaiting assignment in HUMAN mode)
            map.current?.addLayer({
                id: 'aircraft-halo-layer',
                type: 'circle',
                source: 'aircraft-source',
                paint: {
                    'circle-radius': 11,
                    'circle-color': '#f59e0b',
                    'circle-opacity': ['case', ['==', ['get', 'needsAssign'], 1], 0.35, 0],
                    'circle-stroke-width': 0
                }
            });

            // Aircraft Layer (colored per feature) — small and clean
            map.current?.addLayer({
                id: 'aircraft-layer',
                type: 'circle',
                source: 'aircraft-source',
                paint: {
                    'circle-radius': 5,
                    'circle-color': ['get', 'color'],
                    'circle-stroke-width': 1.5,
                    'circle-stroke-color': '#ffffff'
                }
            });

            // Aircraft Path Layer (per-aircraft color set on the feature)
            map.current?.addLayer({
                id: 'aircraft-path-layer',
                type: 'line',
                source: 'aircraft-paths',
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round',
                    visibility: 'visible'
                },
                paint: {
                    'line-color': ['get', 'color'],
                    'line-width': 3,
                    'line-opacity': 0.85,
                    'line-dasharray': [2, 1] // Dashed
                }
            });

            // Add Label for Aircraft. Per-feature label offset so when two
            // aircraft are at very nearby points the labels don't sit on top of
            // each other.
            map.current?.addLayer({
                id: 'aircraft-label-layer',
                type: 'symbol',
                source: 'aircraft-source',
                layout: {
                    'text-field': ['get', 'callsign'],
                    'text-size': 11,
                    'text-offset': ['get', 'labelOffset'],
                    'text-anchor': 'bottom',
                    'text-font': ['Open Sans Bold'],
                    'text-allow-overlap': true,
                    'text-ignore-placement': true,
                },
                paint: {
                    'text-color': '#000',
                    'text-halo-color': '#fff',
                    'text-halo-width': 2,
                },
            });

            // Click Handler for Selection
            map.current?.on('click', 'aircraft-layer', (e) => {
                if (!e.features || e.features.length === 0) return;
                const feature = e.features[0];
                const { callsign, id, suggestedRunwayId } = (feature.properties as Record<string, string>) || {};
                const geometry = feature.geometry as any;
                const coordinates = geometry.coordinates.slice();

                if (popupRef.current) popupRef.current.remove();

                const ws = worldStateRef.current;
                const ac = ws?.aircraft.find(a => a.id === id);
                const isHuman = ws?.mode === 'HUMAN';
                const isUnassigned = !ac?.clearance || ac.clearance.type === 'NONE';
                const showAssign = isHuman && isUnassigned && !!onAssignRunwayRef.current;

                const root = document.createElement('div');
                root.style.minWidth = '180px';

                if (showAssign) {
                    const heading = document.createElement('div');
                    heading.style.fontWeight = '700';
                    heading.style.marginBottom = '6px';
                    heading.textContent = `${callsign} — pick runway`;
                    root.appendChild(heading);

                    const grid = document.createElement('div');
                    grid.style.display = 'grid';
                    grid.style.gridTemplateColumns = '1fr 1fr';
                    grid.style.gap = '4px';

                    const suggested = suggestedRunwayId;
                    const config = ws?.activeConfig ?? '16';
                    const activeSet = new Set(KHEF_RUNWAY_CONFIGS[config].active);
                    for (const rwy of RUNWAY_OPTIONS) {
                        const isActive = activeSet.has(rwy);
                        const btn = document.createElement('button');
                        btn.textContent = rwy + (rwy === suggested ? ' ★' : '');
                        btn.style.padding = '6px 8px';
                        btn.style.fontSize = '13px';
                        btn.style.fontWeight = rwy === suggested ? '700' : '500';
                        btn.style.borderRadius = '6px';
                        btn.style.border = '1px solid #d1d5db';
                        btn.style.background = !isActive
                            ? '#e5e7eb'
                            : (rwy === suggested ? '#fde68a' : '#f3f4f6');
                        btn.style.color = !isActive ? '#9ca3af' : '#000000';
                        btn.style.cursor = isActive ? 'pointer' : 'not-allowed';
                        if (!isActive) {
                            btn.disabled = true;
                            btn.title = 'Inactive — wrong wind direction';
                        } else {
                            btn.addEventListener('click', () => {
                                onAssignRunwayRef.current?.(id, rwy);
                                popupRef.current?.remove();
                            });
                        }
                        grid.appendChild(btn);
                    }
                    root.appendChild(grid);

                    const note = document.createElement('div');
                    note.style.marginTop = '6px';
                    note.style.fontSize = '11px';
                    note.style.color = '#6b7280';
                    note.textContent = `★ default · grayed runways inactive (${config}-flow)`;
                    root.appendChild(note);
                } else {
                    const heading = document.createElement('div');
                    heading.style.fontWeight = '700';
                    heading.textContent = String(callsign);
                    root.appendChild(heading);
                    const sub = document.createElement('div');
                    sub.style.fontSize = '11px';
                    sub.style.color = '#6b7280';
                    sub.style.marginBottom = '6px';
                    sub.textContent = ac?.clearance?.type
                        ? `Status: ${ac.clearance.type}${ac.manualHold ? ' (HELD)' : ''}`
                        : `ID: ${id}`;
                    root.appendChild(sub);
                }

                // Hold / Resume button — available any time, in either mode.
                if (onHoldAircraftRef.current && ac) {
                    const isHeld = !!ac.manualHold;
                    const holdBtn = document.createElement('button');
                    holdBtn.textContent = isHeld ? 'Resume' : 'Stop';
                    holdBtn.style.marginTop = '8px';
                    holdBtn.style.width = '100%';
                    holdBtn.style.padding = '6px 10px';
                    holdBtn.style.fontSize = '13px';
                    holdBtn.style.fontWeight = '600';
                    holdBtn.style.borderRadius = '6px';
                    holdBtn.style.border = '1px solid';
                    holdBtn.style.borderColor = isHeld ? '#10b981' : '#ef4444';
                    holdBtn.style.background = isHeld ? '#d1fae5' : '#fee2e2';
                    holdBtn.style.color = isHeld ? '#065f46' : '#991b1b';
                    holdBtn.style.cursor = 'pointer';
                    holdBtn.addEventListener('click', () => {
                        onHoldAircraftRef.current?.(id, !isHeld);
                        popupRef.current?.remove();
                    });
                    root.appendChild(holdBtn);
                }

                popupRef.current = new maplibregl.Popup({ closeOnClick: true })
                    .setLngLat(coordinates)
                    .setDOMContent(root)
                    .addTo(map.current!);

                e.originalEvent.stopPropagation();
            });

            // Cursor pointer on hover
            map.current?.on('mouseenter', 'aircraft-layer', () => {
                map.current!.getCanvas().style.cursor = 'pointer';
            });
            map.current?.on('mouseleave', 'aircraft-layer', () => {
                map.current!.getCanvas().style.cursor = '';
            });
        });
    }, []);

    const [graphData, setGraphData] = useState<any>(null);

    // Fetch Graph Data for Path Reconstruction
    useEffect(() => {
        fetch('/api/geo/graph')
            .then(res => res.json())
            .then(data => {
                // Index nodes for quick lookup
                const nodes: Record<string, [number, number]> = {};

                // The graph_debug.geojson contains LineStrings for edges.
                // Each feature has properties: { from: string, to: string, ... }
                // and geometry: { coordinates: [[lon1, lat1], [lon2, lat2]] }
                data.features.forEach((f: any) => {
                    if (f.geometry.type === 'LineString' && f.properties.from && f.properties.to) {
                        const coords = f.geometry.coordinates;
                        if (coords.length >= 2) {
                            nodes[f.properties.from] = coords[0] as [number, number];
                            nodes[f.properties.to] = coords[coords.length - 1] as [number, number];
                        }
                    }
                });
                console.log(`[AirportMap] Loaded ${Object.keys(nodes).length} nodes for path rendering`);
                setGraphData(nodes);
            })
            .catch(err => console.error("Failed to load graph data for paths:", err));
    }, []);

    // Update Aircraft Positions & Paths
    useEffect(() => {
        if (!map.current || !loaded || !worldState) return;

        const mode = worldState.mode ?? 'AI';

        const colorFor = (ac: Aircraft): string => {
            if (ac.manualHold) return '#3b82f6';       // blue: operator-held
            if (ac.inConflictStop) return '#ef4444';   // red
            if (ac.isRerouting) return '#a855f7';      // purple
            if (mode === 'AI') return '#10b981';       // emerald
            return '#f59e0b';                           // amber for HUMAN
        };

        // Compute per-aircraft label offsets: when aircraft sit within ~50 m of
        // each other (e.g., queued at a hold-short) we vertically stagger their
        // callsign labels so they don't pile up. 50 m ≈ 0.00045° at this lat.
        const NEAR_DEG = 0.00045;
        const aircraftList = worldState.aircraft || [];
        const labelOffsets = new Map<string, [number, number]>();
        // Sort by id so the slot assignment is stable across ticks.
        const sorted = [...aircraftList].sort((a, b) => a.id.localeCompare(b.id));
        for (const ac of sorted) {
            // Slot = number of already-placed aircraft within NEAR_DEG of this one.
            let slot = 0;
            labelOffsets.forEach((_, otherId) => {
                const other = aircraftList.find(o => o.id === otherId);
                if (!other) return;
                const dlat = ac.position.lat - other.position.lat;
                const dlon = ac.position.lon - other.position.lon;
                if (Math.sqrt(dlat * dlat + dlon * dlon) < NEAR_DEG) slot += 1;
            });
            // Slot 0: above. Slot 1: below. Slot 2: further above. Slot 3: further below.
            const yOff = slot === 0 ? -1.5
                : slot % 2 === 1 ? 1.6 + Math.floor(slot / 2) * 1.1
                : -1.5 - Math.floor(slot / 2) * 1.1;
            labelOffsets.set(ac.id, [0, yOff]);
        }

        // Update Aircraft Points
        const source = map.current.getSource('aircraft-source') as maplibregl.GeoJSONSource;
        if (source) {
            const features = aircraftList.map(ac => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [ac.position.lon, ac.position.lat]
                },
                properties: {
                    callsign: ac.callsign,
                    heading: ac.position.heading,
                    id: ac.id,
                    color: colorFor(ac),
                    suggestedRunwayId: ac.suggestedRunwayId ?? '',
                    needsAssign: mode === 'HUMAN' && (!ac.clearance || ac.clearance.type === 'NONE') ? 1 : 0,
                    labelOffset: labelOffsets.get(ac.id) ?? [0, -1.5],
                }
            }));

            source.setData({
                type: 'FeatureCollection',
                features: features as any
            });
        }

        // Update Aircraft Paths (Trails)
        const pathSource = map.current.getSource('aircraft-paths') as maplibregl.GeoJSONSource;
        if (pathSource && graphData) {
            const pathFeatures = (worldState.aircraft || [])
                .filter(ac => ac.route && ac.route.length > 1)
                .map(ac => {
                    const coords = ac.route!
                        .map(nodeId => graphData[nodeId])
                        .filter(c => c !== undefined);

                    if (coords.length < 2) return null;

                    return {
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: coords
                        },
                        properties: {
                            callsign: ac.callsign,
                            color: colorFor(ac),
                        }
                    };
                })
                .filter(Boolean);

            pathSource.setData({
                type: 'FeatureCollection',
                features: (pathFeatures.length > 0 ? pathFeatures : []) as any,
            });
        }
    }, [worldState, loaded, graphData]);


    // Effect to handle toggles
    useEffect(() => {
        if (!map.current || !loaded) return;

        map.current.setLayoutProperty('graph-edges', 'visibility', showGraph ? 'visible' : 'none');

        const labelVisibility = showLabels ? 'visible' : 'none';
        map.current.setLayoutProperty('airport-labels', 'visibility', labelVisibility);
        map.current.setLayoutProperty('airport-runway-labels', 'visibility', labelVisibility);

        const layoutVisibility = showLayout ? 'visible' : 'none';
        map.current.setLayoutProperty('airport-runways', 'visibility', layoutVisibility);
        map.current.setLayoutProperty('airport-taxiways', 'visibility', layoutVisibility);
        map.current.setLayoutProperty('airport-aprons', 'visibility', layoutVisibility);

    }, [loaded, showGraph, showLabels, showLayout]);

    // Dim runway-threshold labels for the inactive wind side (e.g., 34L/34R).
    useEffect(() => {
        if (!map.current || !loaded) return;
        const config = worldState?.activeConfig ?? '16';
        const activeSet = new Set(KHEF_RUNWAY_CONFIGS[config].active);
        const thresholdsSource = map.current.getSource('runway-thresholds') as maplibregl.GeoJSONSource | undefined;
        if (!thresholdsSource) return;
        thresholdsSource.setData({
            type: 'FeatureCollection',
            features: [
                { type: 'Feature', geometry: { type: 'Point', coordinates: [-77.5187, 38.7277] }, properties: { label: '16L', active: activeSet.has('16L') ? 1 : 0 } },
                { type: 'Feature', geometry: { type: 'Point', coordinates: [-77.5081, 38.7129] }, properties: { label: '34R', active: activeSet.has('34R') ? 1 : 0 } },
                { type: 'Feature', geometry: { type: 'Point', coordinates: [-77.5210, 38.7266] }, properties: { label: '16R', active: activeSet.has('16R') ? 1 : 0 } },
                { type: 'Feature', geometry: { type: 'Point', coordinates: [-77.5147, 38.7178] }, properties: { label: '34L', active: activeSet.has('34L') ? 1 : 0 } },
            ],
        });
        map.current.setPaintProperty('airport-runway-labels', 'text-color', [
            'case', ['==', ['get', 'active'], 1], '#ffffff', '#9ca3af',
        ]);
        map.current.setPaintProperty('airport-runway-labels', 'text-halo-color', [
            'case', ['==', ['get', 'active'], 1], '#000000', '#374151',
        ]);
    }, [loaded, worldState?.activeConfig]);

    return (
        <div className="relative w-full h-full overflow-hidden flex flex-col">
            <div ref={mapContainer} className="flex-1 relative" />
            {!loaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-100/50 backdrop-blur-sm z-10 pointer-events-none">
                    <span className="text-sm font-medium">Loading Map...</span>
                </div>
            )}
            {showLayerToggles && (
                <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur p-3 rounded shadow-md z-10 flex flex-col gap-2 text-sm border">
                    <h4 className="font-semibold mb-1">Map Layers</h4>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={showLayout} onChange={e => setShowLayout(e.target.checked)} className="rounded" />
                        Airport Layout
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} className="rounded" />
                        Labels (Runway/Taxi)
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={showGraph} onChange={e => setShowGraph(e.target.checked)} className="rounded" />
                        Graph Debug (Blue)
                    </label>
                </div>
            )}
        </div>
    );
}
