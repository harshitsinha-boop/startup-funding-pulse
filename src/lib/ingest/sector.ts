import { genJSON, GeminiBudget, T } from '../gemini';

const KEYWORDS: [string, RegExp][] = [
  ['Fintech', /fintech|payments?|lending|neobank|insurtech|banking|credit|wealth|nbfc|upi|loan/i],
  ['AI/ML', /\bai\b|artificial intelligence|machine learning|genai|llm|agentic/i],
  ['Healthtech', /health|medic|pharma|diagnos|biotech|wellness|hospital|clinic/i],
  ['Climate/EV', /climate|\bev\b|electric vehicle|solar|battery|renewable|cleantech|energy|carbon|sustainab/i],
  ['D2C', /d2c|direct.to.consumer|beauty|fashion|apparel|personal care|\bfmcg\b|food (brand|delivery)|skincare/i],
  ['B2B SaaS', /saas|b2b|enterprise software|cloud software|devtools|developer tools|cybersecurity|\berp\b/i],
  ['Edtech', /edtech|education|learning|upskilling/i],
  ['Logistics', /logistic|supply chain|freight|mobility|delivery/i],
  ['Ecommerce', /e-?commerce|marketplace|quick commerce|retail/i],
  ['Deeptech', /deeptech|spacetech|drone|semiconductor|robotics|defen[cs]e|aerospace/i],
  ['Gaming', /gaming|esports|games?/i],
  ['Agritech', /agri|farm/i],
];

export function keywordSector(raw: string | null, desc: string | null, taxonomy: string[]): string | null {
  const text = `${raw ?? ''} ${desc ?? ''}`;
  if (!text.trim()) return null;
  // Prefer matches on the raw sector string
  for (const src of [raw ?? '', text]) {
    for (const [name, re] of KEYWORDS) if (taxonomy.includes(name) && re.test(src)) return name;
  }
  return null;
}

/** Map any still-unmapped (raw, description) pairs with one cheap Gemini call. */
export async function mapSectorsGemini(items: { key: string; raw: string | null; desc: string | null }[], taxonomy: string[], budget: GeminiBudget): Promise<Record<string, string>> {
  if (!items.length) return {};
  const arr = await genJSON<{ key: string; sector: string }[]>({
    system: `Map each company to exactly one sector from this taxonomy: ${taxonomy.join(', ')}. Use "Other" if none fit. Return JSON array of {key, sector}.`,
    prompt: items.map(i => `key=${i.key} | sector_text=${i.raw ?? ''} | description=${i.desc ?? ''}`).join('\n'),
    schema: { type: T.A, items: { type: T.O, properties: { key: { type: T.S }, sector: { type: T.S, enum: taxonomy } }, required: ['key', 'sector'] } },
    budget,
  });
  return Object.fromEntries(arr.map(x => [x.key, x.sector]));
}
