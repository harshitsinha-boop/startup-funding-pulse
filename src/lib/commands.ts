export interface Filters { investor?: string; sector?: string; stage?: string; minUsd?: number; q?: string; watch?: boolean; company?: string }
export type CmdResult =
  | { kind: 'filter'; filters: Filters; out: string }
  | { kind: 'show'; company: string; out: string }
  | { kind: 'week'; offset: number; out: string }
  | { kind: 'nav'; href: string; out: string }
  | { kind: 'investors'; newOnly: boolean; out: string }
  | { kind: 'clear'; out: string }
  | { kind: 'out'; out: string; err?: boolean };

export const COMMANDS = ['filter', 'watchlist', 'show', 'week', 'brief', 'investors', 'clear', 'help'];
export const HELP = [
  'filter --sector <s> --stage <s> --min 5m   narrow the deal table (filter alone = reset)',
  'watchlist                                  show watchlist hits + adjacent deals',
  'show <company>                             open deal detail',
  'week -1                                    jump relative weeks (week 0 = latest)',
  'brief                                      open this week\'s email brief',
  'investors [--new]                          most active / new-to-sector investors',
  'clear                                      reset filters and output',
];

/** "5m" => 5_000_000, "500k", "1b", plain number. */
export function parseMoney(s: string): number | null {
  const m = s.trim().toLowerCase().match(/^\$?(\d+(?:\.\d+)?)\s*(k|m|mn|b|bn|cr)?$/);
  if (!m) return null;
  const mult = { k: 1e3, m: 1e6, mn: 1e6, b: 1e9, bn: 1e9, cr: 1e7 / 88 }[m[2] ?? ''] ?? 1;
  return Math.round(parseFloat(m[1]) * mult);
}

export function parseCommand(input: string, weekStart: string): CmdResult {
  const toks = input.trim().match(/"[^"]*"|\S+/g)?.map(t => t.replace(/^"|"$/g, '')) ?? [];
  if (!toks.length) return { kind: 'out', out: '' };
  const [cmd, ...rest] = toks; const wantsHelp = rest.includes('--help') || rest.includes('-h');
  const usage = (c: string) => HELP.find(h => h.startsWith(c)) ?? '';
  if (wantsHelp && COMMANDS.includes(cmd)) return { kind: 'out', out: usage(cmd) };
  switch (cmd) {
    case 'help': return { kind: 'out', out: HELP.join('\n') };
    case 'clear': return { kind: 'clear', out: '' };
    case 'watchlist': return { kind: 'filter', filters: { watch: true }, out: '[OK] showing watchlist hits + adjacent deals' };
    case 'brief': return { kind: 'nav', href: `/briefs/${weekStart}`, out: `[OK] opening brief for week ${weekStart}` };
    case 'investors': return { kind: 'investors', newOnly: rest.includes('--new'), out: '' };
    case 'show': return rest.length ? { kind: 'show', company: rest.join(' '), out: '' } : { kind: 'out', err: true, out: '[ERR] usage: show <company>' };
    case 'week': {
      const n = rest[0] === undefined ? 0 : Number(rest[0]);
      return Number.isInteger(n) ? { kind: 'week', offset: n, out: '' } : { kind: 'out', err: true, out: '[ERR] usage: week -1' };
    }
    case 'filter': {
      const f: Filters = {}; const q: string[] = [];
      for (let i = 0; i < rest.length; i++) {
        const t = rest[i];
        if (t === '--sector') f.sector = rest[++i];
        else if (t === '--stage') f.stage = rest[++i]?.toUpperCase().replace(/[ -]/g, '_');
        else if (t === '--min') { const v = parseMoney(rest[++i] ?? ''); if (v == null) return { kind: 'out', err: true, out: '[ERR] bad --min value (try 5m, 500k)' }; f.minUsd = v; }
        else if (t.startsWith('--')) return { kind: 'out', err: true, out: `[ERR] unknown flag ${t} — try filter --help` };
        else q.push(t);
      }
      if (q.length) f.q = q.join(' ');
      return { kind: 'filter', filters: f, out: Object.keys(f).length ? `[OK] filter ${JSON.stringify(f)}` : '[OK] filters reset' };
    }
    default: return { kind: 'out', err: true, out: `[ERR] command not found: ${cmd} — try help` };
  }
}
export function complete(partial: string): string[] { const p = partial.trim().toLowerCase(); return p ? COMMANDS.filter(c => c.startsWith(p)) : COMMANDS; }
