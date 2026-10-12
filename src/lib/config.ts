import { db } from './db';
import type { Config } from './types';

export const DEFAULT_CONFIG: Config = {
  sectors: ['Fintech', 'B2B SaaS', 'AI/ML', 'Healthtech', 'Climate/EV', 'D2C'],
  taxonomy: ['Fintech', 'B2B SaaS', 'AI/ML', 'Healthtech', 'Climate/EV', 'D2C', 'Edtech', 'Logistics', 'Ecommerce', 'Deeptech', 'Consumer', 'Gaming', 'Agritech', 'Other'],
  stages: ['SEED', 'PRE_SERIES_A', 'SERIES_A'],
  chequeMinUsd: 500_000, chequeMaxUsd: 15_000_000,
  weights: { sector: 3, stage: 3, watchlist: 20, adjacency: 12, cheque: 2,
    conf: { CONFIRMED: 1.2, SINGLE_SOURCE: 1, LOW: 0.6, RUMOURED: 0.4 } },
  emailRecipients: [], briefSendTime: '06:00 IST', disabledSources: [], inrPerUsdFallback: 88,
};

export async function loadConfig(): Promise<Config> {
  const { data } = await db().from('config').select('data').eq('id', 1).maybeSingle();
  const cfg = { ...DEFAULT_CONFIG, ...(data?.data ?? {}) } as Config;
  cfg.weights = { ...DEFAULT_CONFIG.weights, ...(cfg.weights ?? {}), conf: { ...DEFAULT_CONFIG.weights.conf, ...(cfg.weights?.conf ?? {}) } };
  return cfg;
}
export async function saveConfig(c: Config) {
  const r = await db().from('config').upsert({ id: 1, data: c, updated_at: new Date().toISOString() });
  if (r.error) throw new Error(r.error.message);
}
export interface WatchItem { id?: string; name: string; description: string; aliases: string[] }
export async function loadWatchlist(): Promise<WatchItem[]> {
  const { data } = await db().from('watchlist').select('*').order('name');
  return (data ?? []) as WatchItem[];
}
