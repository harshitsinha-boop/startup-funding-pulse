import type { Config, Confidence } from './types';

export interface Rankable { sector: string | null; stage: string | null; amount_usd: number | null;
  watchlist_hit?: string | null; adjacency?: { is_adjacent?: boolean } | null; confidence: Confidence | string }

export function scoreDeal(d: Rankable, cfg: Config): number {
  const w = cfg.weights;
  let s = 0;
  if (d.watchlist_hit) s += w.watchlist;
  if (d.adjacency?.is_adjacent) s += w.adjacency;
  if (d.sector && cfg.sectors.some(x => x.toLowerCase() === d.sector!.toLowerCase())) s += w.sector;
  if (d.stage && cfg.stages.includes(d.stage as never)) s += w.stage;
  if (d.amount_usd != null && d.amount_usd >= cfg.chequeMinUsd && d.amount_usd <= cfg.chequeMaxUsd) s += w.cheque;
  const mult = w.conf[d.confidence as Confidence] ?? 1;
  return Math.round(s * mult * 100) / 100;
}
