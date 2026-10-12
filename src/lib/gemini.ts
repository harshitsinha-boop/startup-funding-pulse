import { GoogleGenAI } from '@google/genai';
import { sleep } from './util';

export const MODEL = () => process.env.GEMINI_MODEL || 'gemini-3.6-flash';

/** Per-run tracker: call budget + token usage (written to ingest_runs). */
export class GeminiBudget {
  calls = 0; tokensIn = 0; tokensOut = 0;
  constructor(public maxCalls = 60) {}
  get exhausted() { return this.calls >= this.maxCalls; }
}

let client: GoogleGenAI | null = null;
const ai = () => (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }));

export interface GenOpts { system: string; prompt: string; schema?: object; budget: GeminiBudget; onRetry?: (msg: string) => void }

/** JSON/structured generation with exponential backoff on 429/5xx. Temperature 0. */
export async function genJSON<T>(o: GenOpts): Promise<T> {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing');
  if (o.budget.exhausted) throw new Error('gemini call budget exhausted');
  let delay = 2000, lastErr: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      o.budget.calls++;
      const res = await ai().models.generateContent({
        model: MODEL(), contents: o.prompt,
        config: { systemInstruction: o.system, temperature: 0, responseMimeType: 'application/json',
          thinkingConfig: { thinkingLevel: (process.env.GEMINI_THINKING || 'LOW') as any },
          ...(o.schema ? { responseSchema: o.schema } : {}) },
      });
      o.budget.tokensIn += res.usageMetadata?.promptTokenCount ?? 0;
      o.budget.tokensOut += res.usageMetadata?.candidatesTokenCount ?? 0;
      const txt = res.text ?? '';
      return JSON.parse(txt.replace(/^```json\s*|```$/g, '')) as T;
    } catch (e: any) {
      lastErr = e;
      const status = e?.status ?? e?.code ?? 0;
      const retryable = status === 429 || status >= 500 || e instanceof SyntaxError || /fetch failed|ECONN|timeout|overloaded|UNAVAILABLE/i.test(String(e?.message));
      if (!retryable || attempt === 4) break;
      o.onRetry?.(`gemini ${status || 'error'} — retrying in ${Math.round(delay / 1000)}s`);
      await sleep(delay); delay *= 2;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Gemini response-schema type constants (OpenAPI subset). */
export const T = { S: 'STRING', N: 'NUMBER', B: 'BOOLEAN', O: 'OBJECT', A: 'ARRAY' } as const;
