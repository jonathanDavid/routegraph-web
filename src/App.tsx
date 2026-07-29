import { useEffect, useMemo, useState } from 'react';
import rawGraph from './data/graph.json';
import { shortestRoute, type Mode, type RoadGraph, type RouteResult } from './lib/dijkstra';
import { cypherFor } from './lib/cypher';
import { loadConfig, saveConfig, testConnection, liveRoute, type Neo4jConfig } from './lib/neo4jClient';
import { MapView } from './MapView';
import './App.css';

const graph = rawGraph as unknown as RoadGraph;
const cities = [...graph.nodes].sort((a, b) => a.name.localeCompare(b.name, 'es'));

const MODE_LABEL: Record<Mode, string> = {
  hops: 'Fewest legs',
  km: 'Shortest (km)',
  min: 'Fastest (time)',
};

function fmtH(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export default function App() {
  const [originId, setOriginId] = useState<string>('11001'); // Bogotá
  const [destId, setDestId] = useState<string>('47001'); // Santa Marta
  const [mode, setMode] = useState<Mode>('km');
  const [nextPick, setNextPick] = useState<'origin' | 'dest'>('origin');

  const [cfg, setCfg] = useState<Neo4jConfig | null>(loadConfig);
  const [live, setLive] = useState(false);
  const [liveStatus, setLiveStatus] = useState<string>('');
  const [liveResult, setLiveResult] = useState<RouteResult | null>(null);
  const [showConn, setShowConn] = useState(false);
  const [form, setForm] = useState<Neo4jConfig>(cfg ?? { uri: 'bolt://localhost:7687', user: 'neo4j', password: '' });

  const demoResult = useMemo(
    () => shortestRoute(graph, originId, destId, mode),
    [originId, destId, mode]
  );

  // live query when connected
  useEffect(() => {
    if (!live || !cfg) { setLiveResult(null); return; }
    const from = graph.nodes.find((n) => n.id === originId)?.name;
    const to = graph.nodes.find((n) => n.id === destId)?.name;
    if (!from || !to) return;
    let stale = false;
    liveRoute(cfg, graph, from, to, mode)
      .then((r) => { if (!stale) { setLiveResult(r); setLiveStatus('live'); } })
      .catch((e) => { if (!stale) { setLive(false); setLiveStatus(`connection lost — demo engine (${e.message})`); } });
    return () => { stale = true; };
  }, [live, cfg, originId, destId, mode]);

  const result = live && liveResult ? liveResult : demoResult;

  function pickCity(id: string) {
    if (nextPick === 'origin') { setOriginId(id); setNextPick('dest'); }
    else { setDestId(id); setNextPick('origin'); }
  }

  async function connect() {
    try {
      setLiveStatus('connecting…');
      const msg = await testConnection(form);
      saveConfig(form);
      setCfg(form);
      setLive(true);
      setLiveStatus(msg);
      setShowConn(false);
    } catch (e) {
      setLiveStatus(`failed: ${(e as Error).message}`);
    }
  }

  return (
    <div className="app">
      <MapView graph={graph} route={result} onPickCity={pickCity} originId={originId} destId={destId} />

      <aside className="panel">
        <header>
          <h1>Colombia Route Graph</h1>
          <p className="sub">50 cities · 67 real highway edges · Neo4j property graph</p>
        </header>

        <section className="card">
          <div className="row">
            <label>From
              <select value={originId} onChange={(e) => setOriginId(e.target.value)}>
                {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>To
              <select value={destId} onChange={(e) => setDestId(e.target.value)}>
                {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          </div>
          <p className="hint">or click cities on the map ({nextPick === 'origin' ? 'next click sets origin' : 'next click sets destination'})</p>
          <div className="modes">
            {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
              <button key={m} className={m === mode ? 'on' : ''} onClick={() => setMode(m)}>{MODE_LABEL[m]}</button>
            ))}
          </div>
        </section>

        {result ? (
          <section className="card result">
            <div className="totals">
              <span><strong>{result.totalKm}</strong> km</span>
              <span><strong>{fmtH(result.totalMin)}</strong></span>
              <span><strong>{result.hops}</strong> legs</span>
            </div>
            <ol className="via">
              {result.via.map((n, i) => (
                <li key={n.id}>
                  <span className="via-city">{n.name}</span>
                  {i < result.legs.length && (
                    <span className="via-leg">{result.legs[i].route} · {result.legs[i].km} km · {fmtH(result.legs[i].min)}</span>
                  )}
                </li>
              ))}
            </ol>
          </section>
        ) : (
          <section className="card result"><p className="hint">No route found.</p></section>
        )}

        <section className="card cypher">
          <div className="cypher-head">
            <h2>The Cypher behind this answer</h2>
            <span className={`engine ${live ? 'engine--live' : ''}`}>
              {live ? '● live Neo4j' : '○ demo engine (same algorithm, client-side)'}
            </span>
          </div>
          <pre>{cypherFor(mode)}</pre>
          <button className="link" onClick={() => setShowConn((s) => !s)}>
            {cfg ? 'Neo4j connection…' : 'Connect a real Neo4j…'}
          </button>
          {showConn && (
            <div className="conn">
              <input placeholder="bolt://localhost:7687 or neo4j+s://…" value={form.uri}
                onChange={(e) => setForm({ ...form, uri: e.target.value })} />
              <input placeholder="user" value={form.user}
                onChange={(e) => setForm({ ...form, user: e.target.value })} />
              <input placeholder="password" type="password" value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <div className="conn-actions">
                <button onClick={connect}>Connect</button>
                {cfg && <button onClick={() => { saveConfig(null); setCfg(null); setLive(false); setLiveStatus('disconnected'); }}>Forget</button>}
              </div>
              <p className="hint">Credentials stay in your browser's localStorage — nothing ships with this site. Seed your DB with <a href="https://github.com/jonathanDavid/routegraph-db" target="_blank" rel="noopener noreferrer">routegraph-db</a>.</p>
            </div>
          )}
          {liveStatus && <p className="hint status">{liveStatus}</p>}
        </section>

        <footer className="src">
          Cities: DANE DIVIPOLA · Roads: Rutas Nacionales (INVIAS) · Distances: OSRM/OpenStreetMap ·
          <a href="https://github.com/jonathanDavid/routegraph-db" target="_blank" rel="noopener noreferrer"> graph source</a>
        </footer>
      </aside>
    </div>
  );
}
