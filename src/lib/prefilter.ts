const POSITIVE = [
  /\braise[sd]?\b/i, /\bfunding\b/i, /\bseries\s?[A-H]\b/i, /\bseed\b/i, /\bpre-?seed\b/i, /\bbridge round\b/i, /\bled by\b/i,
  /\$\s?\d/, /(rs\.?|inr|₹)\s?\d/i, /\d+(\.\d+)?\s?(cr|crore|mn|million|bn|billion|lakh)\b/i, /\binvestment from\b/i, /\bbacked\b/i,
  /\bsecures?\b.*\b(cr|crore|mn|million|\$)/i, /\bbags\b/i, /\bfunds?\s+round\b/i,
];
const NOISE_ONLY = [/\bipo\b/i, /\blayoffs?\b/i, /\bq[1-4]\s?(fy)?\d*\s*(results|earnings)\b/i, /\bquarterly results\b/i, /\bnet loss\b/i, /\bfires?\b.*employees/i];

export interface PrefilterVerdict { pass: boolean; reason: string }

const MONEY = /(\$\s?\d|₹\s?\d|\b(rs|inr)\.?\s?\d|\d(\.\d+)?\s?(cr|crore|mn|million|bn|billion|lakh)\b)/i;
const ROUND = /\b(raise[sd]?|secures?|bags?|funding round|series\s?[A-H]|seed|pre-?seed|bridge round|investment from|backed by)\b/i;
// Round words that are specific enough to keep an undisclosed-amount deal
const SPECIFIC = /\b(raise[sd]?|secures?|bags?)\b.*\bfunding\b|\bfunding round\b|\bseries\s?[A-H]\b|\b(pre-?)?seed (round|funding)\b|\bled by\b|\binvestment from\b|\bbacked by\b/i;

export function prefilter(title: string, summary = ''): PrefilterVerdict {
  const text = `${title}\n${summary}`;
  if (!POSITIVE.some(r => r.test(text))) return { pass: false, reason: 'no-funding-signal' };
  const noisy = NOISE_ONLY.some(r => r.test(title));
  const strong = (ROUND.test(text) && MONEY.test(text)) || SPECIFIC.test(text);
  if (!strong) return { pass: false, reason: 'weak-signal' };      // e.g. "Cleantech funding boom" trend pieces
  if (noisy && !(ROUND.test(text) && MONEY.test(text))) return { pass: false, reason: 'noise' };
  return { pass: true, reason: 'funding-signal' };
}
