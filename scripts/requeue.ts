// Re-apply the current pre-filter to queued articles (after tuning patterns).
import { config } from 'dotenv'; config({ path: '.env.local' });
import { db } from '../src/lib/db';
import { prefilter } from '../src/lib/prefilter';
async function main() {
  const { data } = await db().from('raw_articles').select('id,title,summary').eq('prefilter_pass', true).eq('extract_status', 'pending');
  const drop = (data ?? []).filter(a => !prefilter(a.title, a.summary ?? '').pass).map(a => a.id);
  for (let i = 0; i < drop.length; i += 100) await db().from('raw_articles').update({ prefilter_pass: false, extract_status: 'skipped' }).in('id', drop.slice(i, i + 100));
  console.log(`[OK] requeue: ${data?.length} pending → dropped ${drop.length}, kept ${(data?.length ?? 0) - drop.length}`);
}
main();
