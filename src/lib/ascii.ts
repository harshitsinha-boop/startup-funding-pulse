export const bar = (pct: number, width = 14) => { const n = Math.max(0, Math.min(width, Math.round((pct / 100) * width))); return `[${'|'.repeat(n)}${'.'.repeat(width - n)}]`; };
export const delta = (p: number | null) => (p == null ? '  n/a' : p >= 0 ? `▲${p > 999 ? '>999' : p}%` : `▼${Math.abs(p)}%`);
const SPARK = '▁▂▃▄▅▆▇█';
export const spark = (xs: number[]) => { const mx = Math.max(...xs, 1); return xs.map(x => SPARK[Math.min(7, Math.round((x / mx) * 7))]).join(''); };
