export const metadata = { title: 'COMPONENTS_MAP // STARTUP_FUNDING_PULSE' };

export default function Page() {
  return (
    <main className="p-3 max-w-[1500px] mx-auto">
      <div className="mb-2 flex flex-wrap gap-3 items-center"><a href="/">[ DASHBOARD ]</a><a href="/components-map.png" download>[ DOWNLOAD PNG ]</a><span className="dim">swimlane map: lanes = who does the work, columns = trigger → output</span></div>
      <div className="pane overflow-x-auto" style={{ background: '#f8f4ed' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/components-map.svg" alt="Startup Funding Pulse components map: scheduler, news sources, system, AI models, email service and Aarav, across trigger, input, context, processing, AI and output columns" style={{ width: '100%', minWidth: 900, height: 'auto', display: 'block' }} />
      </div>
    </main>
  );
}
