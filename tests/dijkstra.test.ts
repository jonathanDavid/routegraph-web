import { describe, it, expect } from 'vitest';
import { shortestRoute, type RoadGraph } from '../src/lib/dijkstra';
import rawGraph from '../src/data/graph.json';

const graph = rawGraph as unknown as RoadGraph;
const byName = new Map(graph.nodes.map((n) => [n.name, n.id]));
const go = (from: string, to: string, mode: 'hops' | 'km' | 'min') =>
  shortestRoute(graph, byName.get(from)!, byName.get(to)!, mode);

describe('demo dijkstra over the real graph', () => {
  it('matches the seeded Neo4j smoke answer: Bogotá→Santa Marta by km', () => {
    const r = go('Bogotá', 'Santa Marta', 'km')!;
    // The Chiquinquirá–Barbosa alterna (v1.1 secondary corridors) shaves the
    // old via-Tunja Ruta del Sol total from 971 km to 956 km.
    expect(r.via.map((n) => n.name)).toEqual(['Bogotá', 'Bucaramanga', 'Aguachica', 'Bosconia', 'Ciénaga', 'Santa Marta']);
    expect(Math.round(r.totalKm)).toBe(956);
  });

  it('the three criteria give three DIFFERENT routes where corridors compete', () => {
    // v1.1's reason to exist: secondary/alternate corridors make the modes
    // disagree. Cali→Yopal: shortest-km climbs via the Transversal del Sisga,
    // fastest-time swings through Villavicencio, fewest-legs rides the
    // express trunks through Medellín.
    const keys = (['hops', 'km', 'min'] as const).map((m) =>
      go('Cali', 'Yopal', m)!.via.map((n) => n.name).join('>')
    );
    expect(new Set(keys).size).toBe(3);
  });

  it('adjacent cities route directly', () => {
    const r = go('Cali', 'Palmira', 'km')!;
    expect(r.hops).toBe(1);
    expect(r.legs[0].route).toContain('RN40');
  });

  it('mode changes the answer: hops vs km can differ', () => {
    const hops = go('Bogotá', 'Medellín', 'hops')!;
    const km = go('Bogotá', 'Medellín', 'km')!;
    expect(hops.hops).toBeLessThanOrEqual(km.hops);
    expect(km.totalKm).toBeLessThanOrEqual(hops.totalKm);
  });

  it('is symmetric (undirected roads)', () => {
    const ab = go('Pasto', 'Cúcuta', 'min')!;
    const ba = go('Cúcuta', 'Pasto', 'min')!;
    expect(ab.totalMin).toBe(ba.totalMin);
    expect(ab.via.map((n) => n.name)).toEqual([...ba.via.map((n) => n.name)].reverse());
  });

  it('every ROAD-CONNECTED city can reach every other; roadless capitals cannot', () => {
    const roadless = graph.nodes.filter((n) => n.roadless).map((n) => n.id);
    expect(roadless.length).toBe(4); // Leticia, Mitú, Inírida, Puerto Carreño
    for (const id of roadless) {
      expect(shortestRoute(graph, byName.get('Bogotá')!, id, 'km')).toBeNull();
    }
    const ids = graph.nodes.filter((n) => !n.roadless).map((n) => n.id);
    const origin = ids[0];
    for (const to of ids.slice(1)) {
      expect(shortestRoute(graph, origin, to, 'km'), `unreachable ${to}`).not.toBeNull();
    }
  });

  it('totals equal the sum of legs', () => {
    const r = go('Riohacha', 'Ipiales', 'km')!;
    const km = r.legs.reduce((s, e) => s + e.km, 0);
    expect(r.totalKm).toBeCloseTo(km, 1);
  });
});
