export const fmtUsdShort = (n: number | null | undefined) => n == null ? 'UNDISCLOSED' : n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${n}`;
export const fmtInrShort = (usd: number | null | undefined, inr: number) => { if (usd == null) return '—'; const v = usd * inr; return v >= 1e7 ? `₹${(v / 1e7).toFixed(v >= 1e9 ? 0 : 1)}Cr` : `₹${(v / 1e5).toFixed(0)}L`; };
export const stageLabel = (s: string | null) => (s ?? '—').replace(/_/g, ' ');
