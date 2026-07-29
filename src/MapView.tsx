import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { StyleSpecification, MapLayerMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// Vite rewrites MapLibre's default worker URL to a 404 — hand it a bundled one.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { RoadGraph, RouteResult } from './lib/dijkstra';

maplibregl.setWorkerUrl(maplibreWorkerUrl);

const BG = '#0b1220';

const BASE_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': BG } }],
};

interface Props {
  graph: RoadGraph;
  route: RouteResult | null;
  onPickCity: (id: string) => void;
  originId: string | null;
  destId: string | null;
}

function graphToGeoJSON(graph: RoadGraph) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const edges = {
    type: 'FeatureCollection' as const,
    features: graph.edges.map((e) => {
      const a = byId.get(e.from)!, b = byId.get(e.to)!;
      return {
        type: 'Feature' as const,
        properties: { key: [e.from, e.to].sort().join('|'), route: e.route, km: e.km },
        geometry: { type: 'LineString' as const, coordinates: [[a.lng, a.lat], [b.lng, b.lat]] },
      };
    }),
  };
  const nodes = {
    type: 'FeatureCollection' as const,
    features: graph.nodes.map((n) => ({
      type: 'Feature' as const,
      properties: { id: n.id, name: n.name, pop: n.pop },
      geometry: { type: 'Point' as const, coordinates: [n.lng, n.lat] },
      id: n.id,
    })),
  };
  return { edges, nodes };
}

export function MapView({ graph, route, onPickCity, originId, destId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASE_STYLE,
      center: [-74.3, 5.4],
      zoom: 5.1,
      minZoom: 4,
      maxZoom: 9,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

    map.on('load', () => {
      const { edges, nodes } = graphToGeoJSON(graph);
      map.addSource('edges', { type: 'geojson', data: edges, promoteId: 'key' });
      map.addSource('nodes', { type: 'geojson', data: nodes, promoteId: 'id' });

      map.addLayer({
        id: 'edge-lines', type: 'line', source: 'edges',
        paint: { 'line-color': '#33507a', 'line-width': 1.4, 'line-opacity': 0.85 },
      });
      map.addLayer({
        id: 'route-lines', type: 'line', source: 'edges',
        paint: {
          'line-color': '#38e1c6',
          'line-width': ['case', ['boolean', ['feature-state', 'onRoute'], false], 4, 0],
          'line-opacity': 0.95,
        },
      });
      map.addLayer({
        id: 'city-dots', type: 'circle', source: 'nodes',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'pop'], 40000, 3.5, 8000000, 9],
          'circle-color': [
            'case',
            ['boolean', ['feature-state', 'endpoint'], false], '#38e1c6',
            ['boolean', ['feature-state', 'onRoute'], false], '#9ad8ff',
            '#5b7ba8',
          ],
          'circle-stroke-color': BG,
          'circle-stroke-width': 1.5,
        },
      });

      map.on('click', 'city-dots', (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.id;
        if (id != null) onPickCity(String(id));
      });
      map.on('mouseenter', 'city-dots', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'city-dots', () => (map.getCanvas().style.cursor = ''));

      // City labels: DOM markers for the 14 biggest — key-less, no glyph server.
      [...graph.nodes]
        .sort((a, b) => b.pop - a.pop)
        .slice(0, 14)
        .forEach((n) => {
          const el = document.createElement('div');
          el.className = 'city-label';
          el.textContent = n.name;
          new maplibregl.Marker({ element: el, anchor: 'left', offset: [8, 0] })
            .setLngLat([n.lng, n.lat])
            .addTo(map);
        });

      readyRef.current = true;
      applyRoute();
    });

    return () => {
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyRoute() {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.removeFeatureState({ source: 'edges' });
    map.removeFeatureState({ source: 'nodes' });
    for (const e of route?.legs ?? []) {
      map.setFeatureState(
        { source: 'edges', id: [e.from, e.to].sort().join('|') },
        { onRoute: true }
      );
    }
    for (const n of route?.via ?? []) {
      map.setFeatureState({ source: 'nodes', id: n.id }, { onRoute: true });
    }
    for (const id of [originId, destId]) {
      if (id) map.setFeatureState({ source: 'nodes', id }, { endpoint: true });
    }
  }

  useEffect(() => {
    applyRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, originId, destId]);

  return <div ref={containerRef} className="map-container" />;
}
