import { createServerFn } from "@tanstack/react-start";

export type ServiceState = "online" | "offline";

export interface SystemStatus {
  checker: { state: ServiceState; ms: number; note?: string };
  payments: { state: ServiceState; ms: number; note?: string };
  checkedAt: string;
}

/**
 * Live health probe: hits the checking gateway and the payment gateway and
 * reports online/offline. No secrets or provider payloads are returned.
 */
export const systemStatus = createServerFn({ method: "POST" }).handler(async (): Promise<SystemStatus> => {
  const probe = async (fn: () => Promise<unknown>) => {
    const t0 = Date.now();
    try {
      await fn();
      return { state: "online" as const, ms: Date.now() - t0 };
    } catch (e) {
      const raw = e instanceof Error ? e.message : "unreachable";
      const note = raw.includes("not_configured")
        ? "not configured"
        : /ip/i.test(raw)
          ? "ip not allowed"
          : "unreachable";
      return { state: "offline" as const, ms: Date.now() - t0, note };
    }
  };

  const [checker, payments] = await Promise.all([
    probe(async () => {
      const { checkCredit } = await import("@/lib/checkerccv.server");
      await checkCredit();
    }),
    probe(async () => {
      const { gatewayPing } = await import("@/lib/plisio.server");
      await gatewayPing();
    }),
  ]);

  return { checker, payments, checkedAt: new Date().toISOString() };
});
