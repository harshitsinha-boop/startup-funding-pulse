import { db } from '@/lib/db';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'BRIEF_ARCHIVE // STARTUP_FUNDING_PULSE' };
export default async function Page() {
  const { data } = await db().from('weeks').select('week_start,brief_subject,sent_at,generated_at,coverage_pct').not('brief_html', 'is', null).order('week_start', { ascending: false });
  return (<main className="p-3 max-w-[900px] mx-auto"><h1 className="glow">$ ls briefs/</h1>
    {(data ?? []).length === 0 && <p className="dim">[..] no briefs yet — use [ GENERATE BRIEF NOW ] on the dashboard</p>}
    {(data ?? []).map(w => <div key={w.week_start} className="wrap py-1 border-b border-dashed border-border"><a href={`/briefs/${w.week_start}`}>[ {w.week_start} ]</a> {w.brief_subject} <span className="dim">{w.sent_at ? '· sent' : '· not sent'}</span></div>)}
    <p><a href="/">[ BACK ]</a></p></main>);
}
