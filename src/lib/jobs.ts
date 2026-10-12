import { runIngest } from './ingest/pipeline';
import { runReconcile } from './reconcile';
import { generateBrief } from './brief';
import { previousWeekStart, weekStartIST } from './normalize';

export type Job = 'ingest' | 'reconcile' | 'brief' | 'build-brief' | 'test-email' | 'daily';
export async function runJob(job: Job, opts: { week?: string } = {}) {
  switch (job) {
    case 'ingest': return runIngest({ deadlineMs: 240_000 });
    case 'reconcile': return runReconcile();
    case 'brief': return generateBrief({ send: true, week: opts.week });
    case 'build-brief': return generateBrief({ week: opts.week });
    case 'test-email': return generateBrief({ test: true, week: opts.week });
    case 'daily': {
      // Hobby-plan friendly: one daily cron that branches by weekday (UTC, 00:30 = 06:00 IST)
      const dow = new Date().getUTCDay(); const out: Record<string, unknown> = {};
      out.ingest = await runIngest({ deadlineMs: dow === 1 ? 150_000 : 230_000 });
      if (dow === 0) out.reconcile = await runReconcile();
      if (dow === 1) out.brief = await generateBrief({ send: true, week: previousWeekStart() });
      return out;
    }
  }
}
export { weekStartIST };
