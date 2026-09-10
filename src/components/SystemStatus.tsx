import { useCallback, useEffect, useState } from "react";
import { systemStatus, type SystemStatus as Status } from "@/lib/status.functions";
import { Activity, RefreshCw } from "lucide-react";

/** Poll the live health probe every 60s. */
export function useSystemStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await systemStatus());
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  return { status, loading, refresh };
}

const allOnline = (s: Status | null) => !!s && s.checker.state === "online" && s.payments.state === "online";

/** Compact online/offline pill for the header. */
export function SystemStatusBadge({ className = "" }: { className?: string }) {
  const { status, loading } = useSystemStatus();
  const up = allOnline(status);
  const partial = !!status && !up && (status.checker.state === "online" || status.payments.state === "online");
  const color = loading && !status ? "#9aa4ae" : up ? "#2fb344" : partial ? "#f9a825" : "#e53935";
  const label = loading && !status ? "Checking…" : up ? "All systems online" : partial ? "Partial outage" : "Offline";

  return (
    <span
      title={
        status
          ? `Checker: ${status.checker.state}${status.checker.note ? ` (${status.checker.note})` : ""} · Payments: ${status.payments.state}${status.payments.note ? ` (${status.payments.note})` : ""}`
          : "Checking services…"
      }
      className={`inline-flex items-center gap-1.5 rounded-full border border-[#e6e6e6] px-2.5 py-1 text-[12px] ${className}`}
      style={{ color }}
    >
      <span className="relative flex h-2 w-2">
        {up && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: color }} />}
        <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: color }} />
      </span>
      {label}
    </span>
  );
}

/** Detailed per-service status panel (dark UI). */
export function SystemStatusPanel({ className = "" }: { className?: string }) {
  const { status, loading, refresh } = useSystemStatus();

  const Row = ({ name, s }: { name: string; s?: { state: string; ms: number; note?: string } }) => {
    const online = s?.state === "online";
    return (
      <div className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
        <span className="flex items-center gap-2 text-white/70">
          <span className={`h-2 w-2 rounded-full ${online ? "bg-[#7ee08a]" : "bg-[#ff8a80]"}`} />
          {name}
        </span>
        <span className={`font-mono text-[12px] ${online ? "text-[#7ee08a]" : "text-[#ff8a80]"}`}>
          {s ? (online ? `online · ${s.ms}ms` : `offline${s.note ? ` · ${s.note}` : ""}`) : "…"}
        </span>
      </div>
    );
  };

  return (
    <div className={`overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] ${className}`}>
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <span className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/55">
          <Activity className="h-3.5 w-3.5" /> System status
        </span>
        <button
          onClick={() => void refresh()}
          className="flex items-center gap-1 rounded-md border border-white/12 px-2 py-1 text-[11px] text-white/60 hover:text-white"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Check
        </button>
      </div>
      <Row name="Checker API" s={status?.checker} />
      <div className="h-px bg-white/8" />
      <Row name="Payment API" s={status?.payments} />
    </div>
  );
}
