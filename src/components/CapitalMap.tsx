'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { Deal } from '@/lib/client-types';
import { fmtUsdShort } from './fmt';

export type Pick = { kind: 'sector'; name: string } | { kind: 'deal'; id: string } | { kind: 'investor'; name: string };
const GREEN = '#33ff00', AMBER = '#ffb000', RED = '#ff3333', DIM = '#1f521f';

function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }
function fib(i: number, n: number, r: number): THREE.Vector3 { const y = 1 - (i / Math.max(1, n - 1)) * 2, rad = Math.sqrt(Math.max(0, 1 - y * y)), th = Math.PI * (3 - Math.sqrt(5)) * i; return new THREE.Vector3(Math.cos(th) * rad * r, y * r * 0.7, Math.sin(th) * rad * r); }

interface GNode { id: string; kind: 'sector' | 'deal' | 'investor'; label: string; pos: THREE.Vector3; size: number; color: string; pulse?: boolean; sector?: string; info: string }
interface GEdge { a: string; b: string; kind: 'flow' | 'member' }

function buildGraph(deals: Deal[], lowPower: boolean) {
  const ds = [...deals].filter(d => d.status !== 'REPORTED_IN_TALKS').sort((a, b) => (b.amount_usd ?? 0) - (a.amount_usd ?? 0)).slice(0, lowPower ? 28 : 90);
  const secs = [...new Set(ds.map(d => d.sector ?? 'Other'))];
  const nodes: GNode[] = [], edges: GEdge[] = []; const pos = new Map<string, THREE.Vector3>();
  secs.forEach((s, i) => { const p = fib(i, secs.length, 6.5); const count = ds.filter(d => (d.sector ?? 'Other') === s).length; pos.set('s:' + s, p);
    nodes.push({ id: 's:' + s, kind: 'sector', label: s, pos: p, size: 0.8 + Math.min(1.2, count * 0.08), color: GREEN, info: `SECTOR ${s.toUpperCase()}\n${count} deals` }); });
  ds.forEach(d => { const sp = pos.get('s:' + (d.sector ?? 'Other'))!; const r = 2.2 + hash(d.id) * 1.4, th = hash(d.id + 'a') * Math.PI * 2, ph = Math.acos(2 * hash(d.id + 'b') - 1);
    const p = sp.clone().add(new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)).multiplyScalar(r)); pos.set(d.id, p);
    const alert = !!d.watchlist_hit || !!d.adjacency?.is_adjacent;
    nodes.push({ id: d.id, kind: 'deal', label: d.company_name, pos: p, size: 0.12 + Math.log10(Math.max(1e5, d.amount_usd ?? 1e6) / 1e5) * 0.1, color: d.watchlist_hit ? RED : alert ? AMBER : GREEN, pulse: alert, sector: d.sector ?? 'Other',
      info: `${d.company_name.toUpperCase()}\n${fmtUsdShort(d.amount_usd)} ${d.stage ?? ''}\n${d.watchlist_hit ? 'WATCHLIST HIT' : d.adjacency?.is_adjacent ? 'ADJACENT: ' + d.adjacency.watchlist_company : (d.sector ?? '')}` });
    edges.push({ a: 's:' + (d.sector ?? 'Other'), b: d.id, kind: 'member' }); });
  const inv = new Map<string, string[]>();
  ds.forEach(d => d.investors.forEach(i => { if (i.role === 'lead' || lowPower === false) inv.set(i.name, [...(inv.get(i.name) ?? []), d.id]); }));
  [...inv.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, lowPower ? 10 : 30).forEach(([name, ids]) => {
    const c = ids.reduce((acc, id) => acc.add(pos.get(id)!), new THREE.Vector3()).divideScalar(ids.length); const p = c.multiplyScalar(1.2).add(new THREE.Vector3((hash(name) - .5) * 2, (hash(name + 'y') - .5) * 2, (hash(name + 'z') - .5) * 2));
    pos.set('i:' + name, p); nodes.push({ id: 'i:' + name, kind: 'investor', label: name, pos: p, size: 0.18 + ids.length * 0.05, color: AMBER, sector: undefined, info: `INVESTOR ${name.toUpperCase()}\n${ids.length} deals` });
    ids.forEach(id => edges.push({ a: 'i:' + name, b: id, kind: 'flow' })); });
  return { nodes, edges, pos };
}

function Node({ n, dim, onPick, onHover }: { n: GNode; dim: boolean; onPick: () => void; onHover: (n: GNode | null) => void }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => { if (n.pulse && ref.current) ref.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 4) * 0.35); });
  return (
    <mesh ref={ref} position={n.pos} onClick={e => { e.stopPropagation(); onPick(); }} onPointerOver={e => { e.stopPropagation(); onHover(n); document.body.style.cursor = 'pointer'; }} onPointerOut={() => { onHover(null); document.body.style.cursor = ''; }}>
      {n.kind === 'sector' ? <icosahedronGeometry args={[n.size, 1]} /> : n.kind === 'investor' ? <octahedronGeometry args={[n.size, 0]} /> : <sphereGeometry args={[n.size, 8, 6]} />}
      <meshBasicMaterial color={n.color} wireframe transparent opacity={dim ? 0.12 : 0.95} />
    </mesh>);
}

function Flow({ edges, pos, active, frozen }: { edges: GEdge[]; pos: Map<string, THREE.Vector3>; active: Set<string> | null; frozen: boolean }) {
  const flow = useMemo(() => edges.filter(e => e.kind === 'flow').slice(0, 80), [edges]);
  const lines = useRef<THREE.LineSegments>(null), pts = useRef<THREE.Points>(null);
  const lineGeo = useMemo(() => { const g = new THREE.BufferGeometry(); const a: number[] = []; edges.forEach(e => { const p = pos.get(e.a), q = pos.get(e.b); if (p && q) a.push(p.x, p.y, p.z, q.x, q.y, q.z); }); g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); return g; }, [edges, pos]);
  const ptGeo = useMemo(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(flow.length * 3), 3)); return g; }, [flow]);
  useEffect(() => { lines.current?.computeLineDistances(); }, [lineGeo]);
  useFrame(({ clock }) => {
    const arr = ptGeo.getAttribute('position') as THREE.BufferAttribute; const t = frozen ? 0.5 : clock.elapsedTime;
    flow.forEach((e, i) => { const p = pos.get(e.a), q = pos.get(e.b); if (!p || !q) return; const f = (t * 0.35 + i * 0.137) % 1; arr.setXYZ(i, p.x + (q.x - p.x) * f, p.y + (q.y - p.y) * f, p.z + (q.z - p.z) * f); });
    arr.needsUpdate = true;
    const m = lines.current?.material as THREE.LineDashedMaterial | undefined; if (m && !frozen) (m as any).dashOffset = -clock.elapsedTime * 0.4;
  });
  void active;
  return (<>
    <lineSegments ref={lines} geometry={lineGeo}><lineDashedMaterial color={DIM} dashSize={0.25} gapSize={0.18} transparent opacity={0.8} /></lineSegments>
    <points ref={pts} geometry={ptGeo}><pointsMaterial color={AMBER} size={0.09} sizeAttenuation /></points>
  </>);
}

function Tip({ n }: { n: GNode }) {
  return (<Html position={n.pos} style={{ pointerEvents: 'none' }} zIndexRange={[50, 0]}><pre style={{ margin: 0, padding: '2px 6px', background: '#000', border: '1px solid #33ff00', color: '#33ff00', font: '11px JetBrains Mono, monospace', whiteSpace: 'pre', transform: 'translate(10px,-110%)' }}>{`+-- ${n.kind.toUpperCase()} --+\n${n.info}`}</pre></Html>);
}

function GraphScene({ deals, active, onPick, reduced, lowPower, frozen }: { deals: Deal[]; active?: string; onPick: (p: Pick) => void; reduced: boolean; lowPower: boolean; frozen: boolean }) {
  const g = useMemo(() => buildGraph(deals, lowPower), [deals, lowPower]); const [hover, setHover] = useState<GNode | null>(null);
  return (<>
    <group>{g.nodes.map(n => <Node key={n.id} n={n} dim={!!active && n.kind === 'deal' && n.sector !== active || (!!active && n.kind === 'sector' && n.label !== active)}
      onHover={setHover} onPick={() => onPick(n.kind === 'sector' ? { kind: 'sector', name: n.label } : n.kind === 'investor' ? { kind: 'investor', name: n.label } : { kind: 'deal', id: n.id })} />)}</group>
    <Flow edges={g.edges} pos={g.pos} active={null} frozen={frozen || reduced} />
    {hover && <Tip n={hover} />}
    <OrbitControls enablePan={false} autoRotate={!reduced && !hover} autoRotateSpeed={0.5} minDistance={6} maxDistance={26} enableDamping />
  </>);
}

function CityScene({ deals, prevByKey, active, onPick, reduced }: { deals: Deal[]; prevByKey: Record<string, number>; active?: string; onPick: (p: Pick) => void; reduced: boolean }) {
  const cur = useMemo(() => { const m: Record<string, number> = {}; deals.filter(d => d.status !== 'REPORTED_IN_TALKS').forEach(d => { const k = d.sector ?? 'Other'; m[k] = (m[k] ?? 0) + (d.amount_usd ?? 0); }); return m; }, [deals]);
  const keys = [...new Set([...Object.keys(cur), ...Object.keys(prevByKey)])].sort((a, b) => (cur[b] ?? 0) - (cur[a] ?? 0)).slice(0, 12);
  const max = Math.max(1, ...keys.map(k => Math.max(cur[k] ?? 0, prevByKey[k] ?? 0))); const H = (v: number) => 0.15 + (v / max) * 6;
  const cols = Math.ceil(Math.sqrt(keys.length)); const [hover, setHover] = useState<string | null>(null);
  return (<>
    <gridHelper args={[20, 20, GREEN, DIM]} position={[0, 0, 0]} />
    {keys.map((k, i) => {
      const x = (i % cols - (cols - 1) / 2) * 3, z = (Math.floor(i / cols) - (Math.ceil(keys.length / cols) - 1) / 2) * 3, h = H(cur[k] ?? 0), ph = H(prevByKey[k] ?? 0);
      const dim = !!active && active !== k;
      return (
        <group key={k} position={[x, 0, z]}>
          <mesh position={[0, h / 2, 0]} onClick={e => { e.stopPropagation(); onPick({ kind: 'sector', name: k }); }} onPointerOver={e => { e.stopPropagation(); setHover(k); document.body.style.cursor = 'pointer'; }} onPointerOut={() => { setHover(null); document.body.style.cursor = ''; }}>
            <boxGeometry args={[1.6, h, 1.6]} /><meshBasicMaterial color={GREEN} wireframe transparent opacity={dim ? 0.15 : 0.9} />
          </mesh>
          <lineSegments position={[0, ph / 2, 0]} onUpdate={l => l.computeLineDistances()}>
            <edgesGeometry args={[new THREE.BoxGeometry(1.9, ph, 1.9)]} /><lineDashedMaterial color={AMBER} dashSize={0.2} gapSize={0.15} transparent opacity={dim ? 0.15 : 0.9} />
          </lineSegments>
          <Html position={[0, -0.05, 1.3]} center style={{ pointerEvents: 'none' }}><span style={{ font: '10px JetBrains Mono, monospace', color: '#33ff00', whiteSpace: 'nowrap', background: '#000a' }}>{k.toUpperCase()}</span></Html>
          {hover === k && <Html position={[0, h + 0.4, 0]} center style={{ pointerEvents: 'none' }}><pre style={{ margin: 0, padding: '2px 6px', background: '#000', border: '1px solid #33ff00', color: '#33ff00', font: '11px JetBrains Mono, monospace' }}>{`${k.toUpperCase()}\nnow  ${fmtUsdShort(cur[k] ?? 0)}\nprev ${fmtUsdShort(prevByKey[k] ?? 0)}`}</pre></Html>}
        </group>);
    })}
    <OrbitControls enablePan={false} autoRotate={!reduced && !hover} autoRotateSpeed={0.4} minDistance={8} maxDistance={30} maxPolarAngle={Math.PI / 2.05} enableDamping />
  </>);
}

export default function CapitalMap({ deals, prevByKey, activeSector, onPick, view }: { deals: Deal[]; prevByKey: Record<string, number>; activeSector?: string; onPick: (p: Pick) => void; view: 'graph' | 'city' }) {
  const wrap = useRef<HTMLDivElement>(null); const [visible, setVisible] = useState(true); const [hidden, setHidden] = useState(false);
  const [reduced, setReduced] = useState(false); const [lowPower, setLowPower] = useState(false); const [gl, setGl] = useState(true);
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)'); setReduced(m.matches);
    const nav: any = navigator; setLowPower(window.innerWidth < 768 || (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4);
    try { const c = document.createElement('canvas'); setGl(!!(c.getContext('webgl2') || c.getContext('webgl'))); } catch { setGl(false); }
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting)); if (wrap.current) io.observe(wrap.current);
    const vis = () => setHidden(document.hidden); document.addEventListener('visibilitychange', vis);
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', vis); };
  }, []);
  if (!gl) return <div className="dim p-2">[WARN] WebGL unavailable — showing ASCII fallback. See PATTERNS pane.</div>;
  const frameloop = !visible || hidden ? 'never' : reduced ? 'demand' : 'always';
  return (
    <div ref={wrap} style={{ height: 300, background: '#000' }} role="img" aria-label={`3D ${view} view of this week's capital flows. Use the PATTERNS pane and deal table for the same data in text.`}>
      <Canvas dpr={[1, 1.5]} frameloop={frameloop} camera={{ position: [0, 5, 15], fov: 50 }} gl={{ antialias: false, powerPreference: 'low-power' }}>
        {view === 'graph' ? <GraphScene deals={deals} active={activeSector} onPick={onPick} reduced={reduced} lowPower={lowPower} frozen={reduced} />
          : <CityScene deals={deals} prevByKey={prevByKey} active={activeSector} onPick={onPick} reduced={reduced} />}
      </Canvas>
    </div>);
}
