// Optional LIVE mode: run the same Cypher against a real Neo4j over
// bolt-in-websocket, straight from the browser (no API server). Credentials
// are entered by the user and kept in localStorage only — the deployed demo
// ships none.
import neo4j, { type Driver } from 'neo4j-driver';
import { cypherFor } from './cypher';
import type { Mode, RoadGraph, RouteResult } from './dijkstra';

const CFG_KEY = 'routegraph.neo4j';

export interface Neo4jConfig {
  uri: string; // e.g. bolt://localhost:7687 or neo4j+s://xxx.databases.neo4j.io
  user: string;
  password: string;
}

export function loadConfig(): Neo4jConfig | null {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    return raw ? (JSON.parse(raw) as Neo4jConfig) : null;
  } catch {
    return null;
  }
}

export function saveConfig(cfg: Neo4jConfig | null): void {
  if (cfg) localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  else localStorage.removeItem(CFG_KEY);
}

let driver: Driver | null = null;
let driverKey = '';

function getDriver(cfg: Neo4jConfig): Driver {
  const key = `${cfg.uri}|${cfg.user}`;
  if (!driver || driverKey !== key) {
    driver?.close();
    driver = neo4j.driver(cfg.uri, neo4j.auth.basic(cfg.user, cfg.password));
    driverKey = key;
  }
  return driver;
}

export async function testConnection(cfg: Neo4jConfig): Promise<string> {
  const d = getDriver(cfg);
  const session = d.session();
  try {
    const res = await session.run('MATCH (c:City) RETURN count(c) AS n');
    return `connected — ${res.records[0].get('n')} cities in the graph`;
  } finally {
    await session.close();
  }
}

/** Run the mode's Cypher live; map the row back into the shared RouteResult. */
export async function liveRoute(
  cfg: Neo4jConfig,
  graph: RoadGraph,
  fromName: string,
  toName: string,
  mode: Mode
): Promise<RouteResult | null> {
  const d = getDriver(cfg);
  const session = d.session();
  try {
    const res = await session.run(cypherFor(mode), { from: fromName, to: toName });
    if (res.records.length === 0) return null;
    const rec = res.records[0];
    const viaNames: string[] = rec.get('via');
    const byName = new Map(graph.nodes.map((n) => [n.name, n]));
    const via = viaNames.map((n) => byName.get(n)).filter((n): n is NonNullable<typeof n> => !!n);
    const legs = [];
    for (let i = 0; i < via.length - 1; i++) {
      const a = via[i].id, b = via[i + 1].id;
      const e = graph.edges.find(
        (x) => (x.from === a && x.to === b) || (x.from === b && x.to === a)
      );
      if (e) legs.push(e);
    }
    const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v?.toString() ?? 0));
    return {
      via,
      legs,
      totalKm: Number(num(rec.get('totalKm')).toFixed(1)),
      totalMin: Math.round(num(rec.get('totalMin'))),
      hops: via.length - 1,
    };
  } finally {
    await session.close();
  }
}
