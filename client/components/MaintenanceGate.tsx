import { useCallback, useEffect, useState } from 'react';
import { Wrench } from 'lucide-react';
import { api } from '@/lib/api-client';

/**
 * Public app-config contract: GET /api/public/app-config (no auth) ->
 * { success: boolean, data: { maintenance_mode: boolean, announcement: ... } }
 */
interface AppConfigBody {
  success?: boolean;
  data?: { maintenance_mode?: boolean };
  maintenance_mode?: boolean;
}

const POLL_INTERVAL_MS = 60 * 1000;

function readMaintenanceFlag(body: AppConfigBody | undefined | null): boolean {
  if (!body) return false;
  return body?.data?.maintenance_mode === true || body?.maintenance_mode === true;
}

/**
 * Full-screen branded maintenance page shown while maintenance_mode is on.
 */
export function MaintenanceScreen() {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden bg-[#0B0F1A] px-6 text-center">
      {/* Ambient glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/3 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600/20 blur-[120px]"
      />
      <div className="relative flex w-full max-w-md flex-col items-center gap-6">
        <img
          src="/Assets/logo.png"
          alt="Metricorex"
          className="h-16 w-16 rounded-2xl shadow-lg shadow-blue-900/40"
        />
        <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/5 backdrop-blur">
          <Wrench className="h-9 w-9 animate-pulse text-blue-400" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white sm:text-3xl">
            We&rsquo;ll be back soon
          </h1>
          <p className="mx-auto max-w-sm text-sm leading-relaxed text-white/60">
            Metricorex is undergoing scheduled maintenance to make things better
            for you. Please check back in a little while — this page will
            refresh automatically once we&rsquo;re done.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/40">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
          </span>
          Monitoring status — you&rsquo;ll be let back in automatically
        </div>
      </div>
    </div>
  );
}

/**
 * MaintenanceGate wraps the whole app. It polls /api/public/app-config every
 * 60 seconds (and on window focus) and, while maintenance_mode is on, renders
 * the branded maintenance screen INSTEAD of the app content — for
 * authenticated and unauthenticated routes alike.
 *
 * Rendering is never blocked: children render immediately while the first
 * check is in-flight, and any fetch failure just keeps the app up.
 */
export function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const [maintenance, setMaintenance] = useState(false);

  const check = useCallback(async () => {
    try {
      const res = await api.get<AppConfigBody>('/public/app-config', {
        timeout: 10_000,
      });
      setMaintenance(readMaintenanceFlag(res?.data));
    } catch {
      // Unreachable backend should NOT look like maintenance — keep the app up.
      setMaintenance(false);
    }
  }, []);

  useEffect(() => {
    check();
    const interval = window.setInterval(check, POLL_INTERVAL_MS);
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [check]);

  if (maintenance) return <MaintenanceScreen />;
  return <>{children}</>;
}

export default MaintenanceGate;
