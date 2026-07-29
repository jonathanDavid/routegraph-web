import type { Mode } from './dijkstra';

/** The Cypher that answers the current question — shown for teaching, and
 *  executed verbatim when a live Neo4j connection is configured. */
export function cypherFor(mode: Mode): string {
  if (mode === 'hops') {
    return `MATCH (a:City {name: $from}), (b:City {name: $to}),
      path = shortestPath((a)-[:ROAD*..15]-(b))
RETURN [n IN nodes(path) | n.name] AS via,
       [r IN relationships(path) | r.route] AS rutas,
       reduce(km = 0.0, r IN relationships(path) | km + r.km) AS totalKm,
       reduce(m = 0.0, r IN relationships(path) | m + r.min) AS totalMin`;
  }
  const w = mode === 'km' ? 'km' : 'min';
  return `MATCH (a:City {name: $from}), (b:City {name: $to})
CALL apoc.algo.dijkstra(a, b, 'ROAD', '${w}') YIELD path, weight
RETURN [n IN nodes(path) | n.name] AS via,
       [r IN relationships(path) | r.route] AS rutas,
       reduce(km = 0.0, r IN relationships(path) | km + r.km) AS totalKm,
       reduce(m = 0.0, r IN relationships(path) | m + r.min) AS totalMin`;
}
