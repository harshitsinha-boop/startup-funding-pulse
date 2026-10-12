export type Stage = 'PRE_SEED'|'SEED'|'PRE_SERIES_A'|'SERIES_A'|'SERIES_B'|'SERIES_C'|'SERIES_D'|'SERIES_E_PLUS'|'GROWTH'|'BRIDGE'|'DEBT'|'UNDISCLOSED';
export type Confidence = 'CONFIRMED'|'SINGLE_SOURCE'|'LOW'|'RUMOURED';

export interface ExtractedDeal {
  company_name: string;
  company_aliases: string[];
  company_description: string | null;
  hq_city: string | null;
  sector: string | null;
  amount_value: number | null;
  amount_currency: 'INR'|'USD'|'EUR'|'OTHER'|null;
  amount_unit: 'crore'|'lakh'|'million'|'billion'|'thousand'|'unit'|null;
  amount_disclosed: boolean;
  stage: Stage | null;
  instrument: 'EQUITY'|'DEBT'|'MIXED'|'UNKNOWN';
  lead_investors: string[];
  other_investors: string[];
  status: 'CLOSED'|'REPORTED_IN_TALKS';
  announcement_date: string | null;
  evidence: { amount: string|null; stage: string|null; investors: string|null };
}
export interface ExtractionResult { is_funding_announcement: boolean; deals: ExtractedDeal[] }

/** A deal after normalisation, before/after DB persistence. */
export interface NormDeal extends ExtractedDeal {
  company_norm: string;
  amount_usd: number | null;
  sector_mapped: string | null;
  week_start: string; // YYYY-MM-DD (IST Monday)
  evidence_verified: boolean;
  article_id?: string;
  source_slug?: string;
  source_tier?: number;
  published_at?: string | null;
}

export interface Config {
  sectors: string[];            // focus sectors
  taxonomy: string[];           // full taxonomy for mapping
  stages: Stage[];              // focus stages
  chequeMinUsd: number;
  chequeMaxUsd: number;
  weights: { sector: number; stage: number; watchlist: number; adjacency: number; cheque: number;
             conf: Record<Confidence, number> };
  emailRecipients: string[];
  briefSendTime: string;
  disabledSources: string[];
  inrPerUsdFallback: number;
}
