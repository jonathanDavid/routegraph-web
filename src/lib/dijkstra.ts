// Client-side Dijkstra over the exported road graph — the key-less demo
// engine. Mirrors exactly what the Cypher queries do server-side, so demo
// mode and live-Neo4j mode return the same routes.

export type Mode = 'hops' | 'km' | 'min';

export interface GraphNode {
  id: string;
  name: string;
  dept: string;
  lat: number;
  lng: number;
  pop: number;
  /** True for Amazon-basin capitals with no road connection (air/river only). */
  roadless?: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
  route: string;
  km: number;
  min: number;
  /** Real road polyline from OSRM ([lng,lat][]), for map rendering. */
  path?: [number, number][];
}

export interface RoadGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface RouteResult {
  via: GraphNode[];
  legs: GraphEdge[];
  totalKm: number;
  totalMin: number;
  hops: number;
}

const weightOf = (e: GraphEdge, mode: Mode): number =>
  mode === 'hops' ? 1 : mode === 'km' ? e.km : e.min;

/** Undirected Dijkstra. Returns null when unreachable. */
export function shortestRoute(graph: RoadGraph, fromId: string, toId: string, mode: Mode): RouteResult | null {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  if (!byId.has(fromId) || !byId.has(toId)) return null;

  const adj = new Map<string, Array<{ edge: GraphEdge; other: string }>>();
  for (const n of graph.nodes) adj.set(n.id, []);
  for (const e of graph.edges) {
    adj.get(e.from)!.push({ edge: e, other: e.to });
    adj.get(e.to)!.push({ edge: e, other: e.from });
  }

  const dist = new Map<string, number>([[fromId, 0]]);
  const prev = new Map<string, { node: string; edge: GraphEdge }>();
  const done = new Set<string>();
  // simple O(V²) selection — 50 nodes, irrelevant
  for (;;) {
    let cur: string | null = null;
    let best = Infinity;
    for (const [id, d] of dist) {
      if (!done.has(id) && d < best) { best = d; cur = id; }
    }
    if (cur === null) break;
    if (cur === toId) break;
    done.add(cur);
    for (const { edge, other } of adj.get(cur)!) {
      if (done.has(other)) continue;
      const nd = best + weightOf(edge, mode);
      if (nd < (dist.get(other) ?? Infinity)) {
        dist.set(other, nd);
        prev.set(other, { node: cur, edge });
      }
    }
  }
  if (!dist.has(toId)) return null;

  const via: GraphNode[] = [];
  const legs: GraphEdge[] = [];
  let cur = toId;
  while (cur !== fromId) {
    via.unshift(byId.get(cur)!);
    const p = prev.get(cur);
    if (!p) return null;
    legs.unshift(p.edge);
    cur = p.node;
  }
  via.unshift(byId.get(fromId)!);

  return {
    via,
    legs,
    totalKm: Number(legs.reduce((s, e) => s + e.km, 0).toFixed(1)),
    totalMin: Math.round(legs.reduce((s, e) => s + e.min, 0)),
    hops: legs.length,
  };
}
