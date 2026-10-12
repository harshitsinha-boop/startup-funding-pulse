import { genJSON, GeminiBudget, T } from '../gemini';
import { verifyDealEvidence } from '../normalize';
import type { ExtractedDeal, ExtractionResult } from '../types';

const STR = { type: T.S }, NSTR = { type: T.S, nullable: true };
const STAGES = ['PRE_SEED','SEED','PRE_SERIES_A','SERIES_A','SERIES_B','SERIES_C','SERIES_D','SERIES_E_PLUS','GROWTH','BRIDGE','DEBT','UNDISCLOSED'];

export const DEAL_SCHEMA = {
  type: T.O,
  properties: {
    company_name: STR,
    company_aliases: { type: T.A, items: STR },
    company_description: NSTR, hq_city: NSTR, sector: NSTR,
    amount_value: { type: T.N, nullable: true },
    amount_currency: { type: T.S, nullable: true, enum: ['INR','USD','EUR','OTHER'] },
    amount_unit: { type: T.S, nullable: true, enum: ['crore','lakh','million','billion','thousand','unit'] },
    amount_disclosed: { type: T.B },
    stage: { type: T.S, nullable: true, enum: STAGES },
    instrument: { type: T.S, enum: ['EQUITY','DEBT','MIXED','UNKNOWN'] },
    lead_investors: { type: T.A, items: STR }, other_investors: { type: T.A, items: STR },
    status: { type: T.S, enum: ['CLOSED','REPORTED_IN_TALKS'] },
    announcement_date: NSTR,
    evidence: { type: T.O, properties: { amount: NSTR, stage: NSTR, investors: NSTR }, required: ['amount','stage','investors'] },
  },
  required: ['company_name','company_aliases','company_description','hq_city','sector','amount_value','amount_currency','amount_unit','amount_disclosed','stage','instrument','lead_investors','other_investors','status','announcement_date','evidence'],
};
export const BATCH_SCHEMA = {
  type: T.A,
  items: { type: T.O, properties: { article_id: STR, is_funding_announcement: { type: T.B }, deals: { type: T.A, items: DEAL_SCHEMA } },
    required: ['article_id','is_funding_announcement','deals'] },
};

export const EXTRACT_SYSTEM = `You extract structured funding-round data from Indian startup news articles.
RULES:
- Never guess. If a field is not explicitly stated in the article, return null. "Undisclosed" amounts => amount_disclosed=false, amount_value=null.
- Do NOT convert currencies or units. Return the amount exactly as written (e.g. "Rs 12 crore" => amount_value 12, amount_currency INR, amount_unit crore; "$4.5 Mn" => 4.5, USD, million).
- "evidence" fields MUST be sentences copied verbatim, character for character, from the article text. If you cannot quote one, return null for it.
- status: "in talks", "reportedly", "set to raise", "plans to raise", "looking to raise" => REPORTED_IN_TALKS. Completed/announced rounds => CLOSED.
- Ignore acquisitions, IPOs, government grants and layoffs unless the article clearly describes a funding round for a company. An article with no funding round => is_funding_announcement=false, deals=[].
- Roundup articles list many deals: return one entry per company.
- announcement_date: ISO date (YYYY-MM-DD) only if the article text states or clearly implies it; else null.
- stage: use UNDISCLOSED only when the article says the round type is undisclosed; null when not stated.
- lead_investors: only investors explicitly described as leading. other_investors: participants/existing investors named.
- Return one result object per article, echoing its article_id.`;

export interface ArticleIn { id: string; title: string; text: string; publishedAt?: string | null }

export async function extractBatch(arts: ArticleIn[], budget: GeminiBudget, onRetry?: (m: string) => void, maxChars = 6000):
  Promise<Map<string, { is_funding_announcement: boolean; deals: ExtractedDeal[]; verifiedAll: boolean[] }>> {
  const prompt = arts.map(a => `=== ARTICLE id=${a.id} ===\nPUBLISHED: ${a.publishedAt ?? 'unknown'}\nTITLE: ${a.title}\nTEXT:\n${a.text.slice(0, maxChars)}`).join('\n\n');
  const raw = await genJSON<(ExtractionResult & { article_id: string })[]>({ system: EXTRACT_SYSTEM, prompt, schema: BATCH_SCHEMA, budget, onRetry });
  const out = new Map<string, { is_funding_announcement: boolean; deals: ExtractedDeal[]; verifiedAll: boolean[] }>();
  for (const r of raw) {
    const art = arts.find(a => a.id === r.article_id); if (!art) continue;
    const corpus = `${art.title}\n${art.text}`;
    const deals: ExtractedDeal[] = [], ver: boolean[] = [];
    for (const d of r.deals ?? []) {
      if (!d.company_name?.trim()) continue;
      const { deal, verified } = verifyDealEvidence(d, corpus);
      // Disclosed amount whose quote failed verification: drop the numbers rather than trust them
      if (!verified && deal.evidence.amount == null && d.evidence.amount) { deal.amount_value = null; deal.amount_currency = null; deal.amount_unit = null; deal.amount_disclosed = false; }
      deals.push(deal); ver.push(verified);
    }
    out.set(r.article_id, { is_funding_announcement: r.is_funding_announcement, deals, verifiedAll: ver });
  }
  return out;
}
