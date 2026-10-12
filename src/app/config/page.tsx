import { ConfigEditor } from '@/components/ConfigEditor';
export const metadata = { title: 'CONFIG // STARTUP_FUNDING_PULSE' };
export default function Page() { return (<main className="p-3 max-w-[1200px] mx-auto"><h1 className="glow">$ vi ~/.pulse/config</h1><ConfigEditor /></main>); }
