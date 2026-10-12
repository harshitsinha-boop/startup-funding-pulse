export interface Deal {
  id: string; company_name: string; description: string | null; hq_city: string | null; sector: string | null; sector_raw: string | null;
  stage: string | null; instrument: string; amount_usd: number | null; amount_value: number | null; amount_currency: string | null; amount_unit: string | null;
  amount_disclosed: boolean; status: string; confidence: string; announcement_date: string | null; week_start: string;
  evidence: Record<string, string | null>; evidence_verified: boolean; watchlist_hit: string | null;
  adjacency: { is_adjacent?: boolean; watchlist_company?: string; relationship?: string; reason?: string } | null;
  score: number; first_seen: string; last_updated: string;
  investors: { name: string; role: string }[]; sources: { url: string; name: string; title: string }[];
}
export interface FeedEvent { id: number; level: string; message: string; created_at: string }
export interface DashData {
  week: string; weeks: string[]; deals: Deal[]; stats: any; insights: { headline: string; detail: string; type: string; supporting_deal_ids: string[] }[];
  coverage: number | null; briefSentAt: string | null; feed: FeedEvent[]; lastRun: any; nextRun: string; inr: number;
  config: { sectors: string[]; stages: string[] }; watchlist: { name: string; description: string }[];
}
