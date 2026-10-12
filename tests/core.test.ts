import { describe, it, expect } from 'vitest';
import { toUsd, normName, verifyEvidence, verifyDealEvidence, weekStartIST, previousWeekStart, dealWeek } from '../src/lib/normalize';
import { matchDeals } from '../src/lib/dedupe';
import { scoreDeal } from '../src/lib/rank';
import { prefilter } from '../src/lib/prefilter';
import { DEFAULT_CONFIG } from '../src/lib/config';
import { keywordSector } from '../src/lib/ingest/sector';
import { extractArticleText } from '../src/lib/ingest/enrich';
import fixture from './fixtures/extraction.json';

describe('amount conversion', () => {
  it('crore INR', () => expect(toUsd(12, 'INR', 'crore', 90)).toBe(Math.round(120_000_000 / 90)));
  it('lakh INR', () => expect(toUsd(50, 'INR', 'lakh', 100)).toBe(50_000));
  it('USD Mn / Bn', () => { expect(toUsd(4.5, 'USD', 'million', 90)).toBe(4_500_000); expect(toUsd(1.2, 'USD', 'billion', 90)).toBe(1_200_000_000); });
  it('null when undisclosed', () => expect(toUsd(null, 'USD', 'million', 90)).toBeNull());
  it('OTHER currency not converted', () => expect(toUsd(5, 'OTHER', 'million', 90)).toBeNull());
});
describe('name normalisation', () => {
  it('strips suffixes & punctuation', () => { expect(normName('Acme Technologies Pvt. Ltd.')).toBe('acme'); expect(normName('FooAI Labs India Private Limited')).toBe('fooai'); });
  it('keeps distinct names distinct', () => expect(normName('Zepto')).not.toBe(normName('Zeptonow')));
});
describe('dedupe', () => {
  const base = { company_norm: 'acme', amount_usd: 1_000_000, announcement_date: '2026-10-05', week_start: '2026-10-05' };
  it('same: name + amount within 10% + dates within 7d', () => expect(matchDeals(base, { ...base, amount_usd: 1_080_000, announcement_date: '2026-10-08' })).toBe('SAME'));
  it('same when one amount undisclosed', () => expect(matchDeals(base, { ...base, amount_usd: null })).toBe('SAME'));
  it('ambiguous when amounts differ >10% but dates close', () => expect(matchDeals(base, { ...base, amount_usd: 2_000_000 })).toBe('AMBIGUOUS'));
  it('different companies', () => expect(matchDeals(base, { ...base, company_norm: 'other' })).toBe('DIFFERENT'));
  it('alias match', () => expect(matchDeals(base, { ...base, company_norm: 'acme pay', aliases: ['Acme'] })).toBe('SAME'));
  it('different round far apart', () => expect(matchDeals(base, { ...base, amount_usd: 9_000_000, announcement_date: '2026-12-01' })).toBe('DIFFERENT'));
});
describe('evidence verification', () => {
  const text = 'Acme  raised $4 Mn\nin a Seed round led by  Foo Capital.';
  it('accepts substring after whitespace normalisation', () => expect(verifyEvidence('raised $4 Mn in a Seed round', text)).toBe(true));
  it('rejects fabricated', () => expect(verifyEvidence('raised $40 Mn', text)).toBe(false));
  it('nulls unverified evidence and flags', () => {
    const f = fixture.deals[0] as any;
    const { deal, verified } = verifyDealEvidence({ ...f, evidence: { amount: 'raised $99 Mn', stage: 'Seed round', investors: 'led by Foo Capital' } }, text);
    expect(verified).toBe(false); expect(deal.evidence.amount).toBeNull(); expect(deal.evidence.stage).toBe('Seed round');
  });
});
describe('IST week bucketing', () => {
  it('Sunday 23:59 IST belongs to the week ending that Sunday', () => expect(weekStartIST('2026-10-11T23:59:00+05:30')).toBe('2026-10-05'));
  it('Monday 00:00 IST starts a new week', () => expect(weekStartIST('2026-10-12T00:00:00+05:30')).toBe('2026-10-12'));
  it('UTC Sunday 19:00 is already Monday IST', () => expect(weekStartIST('2026-10-11T19:00:00Z')).toBe('2026-10-12'));
  it('date-only', () => expect(weekStartIST('2026-10-07')).toBe('2026-10-05'));
  it('previous week from Monday brief time', () => expect(previousWeekStart(new Date('2026-10-12T00:30:00Z'))).toBe('2026-10-05'));
  it('announcement date beats publish date', () => expect(dealWeek('2026-10-06', '2026-10-13T05:00:00Z')).toBe('2026-10-05'));
});
describe('ranking', () => {
  const cfg = DEFAULT_CONFIG;
  const mk = (o: any) => ({ sector: 'Other', stage: 'SERIES_C', amount_usd: 100_000_000, confidence: 'SINGLE_SOURCE', ...o });
  it('focus sector+stage > neither', () => expect(scoreDeal(mk({ sector: 'Fintech', stage: 'SEED' }), cfg)).toBeGreaterThan(scoreDeal(mk({}), cfg)));
  it('watchlist hit tops everything', () => expect(scoreDeal(mk({ watchlist_hit: 'X' }), cfg)).toBeGreaterThan(scoreDeal(mk({ sector: 'Fintech', stage: 'SEED', amount_usd: 3e6 }), cfg)));
  it('adjacency high', () => expect(scoreDeal(mk({ adjacency: { is_adjacent: true } }), cfg)).toBeGreaterThan(scoreDeal(mk({ sector: 'Fintech', stage: 'SEED' }), cfg)));
  it('confidence multiplies', () => expect(scoreDeal(mk({ sector: 'Fintech', confidence: 'CONFIRMED' }), cfg)).toBeGreaterThan(scoreDeal(mk({ sector: 'Fintech', confidence: 'LOW' }), cfg)));
  it('cheque range adds', () => expect(scoreDeal(mk({ amount_usd: 3e6 }), cfg)).toBeGreaterThan(scoreDeal(mk({}), cfg)));
});
describe('prefilter', () => {
  it('keeps funding headlines', () => { expect(prefilter('Acme raises $4 Mn in Seed round').pass).toBe(true); expect(prefilter('FooAI bags Rs 12 Cr led by Peak XV').pass).toBe(true); });
  it('drops trend pieces without a deal', () => { expect(prefilter("India's Cleantech Funding Boom, The AI Safety Drill").pass).toBe(false); expect(prefilter('EV Bets Drive India’s Cleantech Funding Surge In Q3').pass).toBe(false); });
  it('keeps undisclosed-amount rounds', () => expect(prefilter('Acme raises funding led by Peak XV').pass).toBe(true));
  it('drops noise', () => { expect(prefilter('Startup X lays off 200 employees').pass).toBe(false); expect(prefilter('Company files DRHP for IPO').pass).toBe(false); expect(prefilter('Q2 results: net loss narrows').pass).toBe(false); });
});
describe('sector keywords', () => {
  it('maps', () => { expect(keywordSector('payments', null, DEFAULT_CONFIG.taxonomy)).toBe('Fintech'); expect(keywordSector(null, 'EV battery swapping', DEFAULT_CONFIG.taxonomy)).toBe('Climate/EV'); });
});
describe('fixture article parsing (no Gemini)', () => {
  it('extracts article text from html', () => {
    const html = `<html><body><nav>menu</nav><article>${'<p>Acme, a Bengaluru-based fintech, raised $4 Mn in a Seed round led by Foo Capital to expand lending.</p>'.repeat(8)}</article></body></html>`;
    const t = extractArticleText(html);
    expect(t).toContain('raised $4 Mn'); expect(t).not.toContain('menu');
  });
  it('fixture deal evidence verifies against article', () => {
    const d = fixture.deals[0] as any;
    expect(verifyEvidence(d.evidence.amount, fixture.article)).toBe(true);
    expect(verifyEvidence(d.evidence.investors, fixture.article)).toBe(true);
  });
});

import { insightIsGrounded, numbersIn } from '../src/lib/patterns';
describe('insight grounding', () => {
  const facts = 'SECTOR Fintech: 12 deals, $45.2M; WoW 50%.';
  it('accepts numbers present in facts', () => expect(insightIsGrounded('Fintech had 12 deals worth $45.2M, up 50%', facts)).toBe(true));
  it('rejects invented numbers', () => expect(insightIsGrounded('Fintech jumped 73%', facts)).toBe(false));
  it('numbersIn strips commas', () => expect(numbersIn('1,200 deals')).toEqual(['1200']));
});

import { parseCommand, parseMoney, complete } from '../src/lib/commands';
describe('command bar parser', () => {
  it('parses money', () => { expect(parseMoney('5m')).toBe(5_000_000); expect(parseMoney('500k')).toBe(500_000); expect(parseMoney('x')).toBeNull(); });
  it('filter flags', () => { const r: any = parseCommand('filter --sector fintech --stage seed --min 5m', '2026-10-05'); expect(r.filters).toEqual({ sector: 'fintech', stage: 'SEED', minUsd: 5_000_000 }); });
  it('unknown command', () => expect((parseCommand('wat', 'w') as any).out).toBe('[ERR] command not found: wat — try help'));
  it('show with quoted name', () => expect((parseCommand('show "Acme Pay"', 'w') as any).company).toBe('Acme Pay'));
  it('week offset', () => expect((parseCommand('week -1', 'w') as any).offset).toBe(-1));
  it('autocomplete', () => expect(complete('wa')).toEqual(['watchlist']));
});
