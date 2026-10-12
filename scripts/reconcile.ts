// Usage: npm run reconcile -- --weeks 1
import { config } from 'dotenv'; config({ path: '.env.local' });
import { runReconcile } from '../src/lib/reconcile';
async function main() {
  const i = process.argv.indexOf('--weeks'); const weeks = i > 0 ? Number(process.argv[i + 1]) : 1;
  const r = await runReconcile({ weeks });
  console.log(JSON.stringify(r.map(x => ({ week: x.week, matched: x.matched, missed: x.missed, total: x.total, coverage: x.coverage, mismatched: x.mismatched.length })), null, 1));
}
main();
