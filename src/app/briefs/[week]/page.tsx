import { db } from '@/lib/db';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ week: string }> }) {
  const { week } = await params;
  const { data } = await db().from('weeks').select('brief_html,brief_subject,sent_at').eq('week_start', week).maybeSingle();
  return (<main className="p-3 max-w-[760px] mx-auto"><div className="mb-2"><a href="/briefs">[ ARCHIVE ]</a> <a href="/">[ DASHBOARD ]</a> <span className="dim">{data?.brief_subject}</span></div>
    {data?.brief_html ? <iframe title={`brief ${week}`} srcDoc={data.brief_html} style={{ width: '100%', height: '85vh', border: '1px solid #1f521f', background: '#0a0a0a' }} sandbox="allow-popups allow-popups-to-escape-sandbox" />
      : <p className="err">[ERR] no brief stored for week {week} — generate one from the dashboard</p>}</main>);
}
