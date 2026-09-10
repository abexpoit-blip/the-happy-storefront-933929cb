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

/** Gates selected for this shop (CheckerCCV dashboard list). */
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
  const { key } = creds();
  let p = (await call(GATES_URL, { key })) as unknown;
  if (p && typeof p === "object" && Array.isArray((p as { data?: unknown[] }).data)) {
    p = (p as { data: unknown[] }).data;
  }
  const gates = (Array.isArray(p) ? p : []) as CheckerGate[];
  const live = enabledOnly ? gates.filter((g) => g.isEnabled === true) : gates;
  // API থেকে description/credit না এলে আমাদের catalog থেকে পূরণ করি
  return live.map((g) => {
    const known = GATE_CATALOG.find((c) => c.id === g.id);
    return {
      ...g,
      description: g.description || known?.description || String(g.id),
      creditGate: Number(g.creditGate ?? known?.creditGate ?? 0),
    };
  });
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
  const p = (await call(`${API_BASE}/tasks/result.php`, {
    task_id: taskId,
    cursor,
    limit,
  })) as {
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

/** CheckerCCV categories → our live/dead verdict. */
export function verdict(category?: string): "live" | "dead" | null {
  const c = (category ?? "").toLowerCase();
  if (!c) return null;
  if (c.includes("live") || c.includes("charge") || c.includes("approved") || c.includes("cvv")) {
    return "live";
  }
  if (c.includes("die") || c.includes("dead") || c.includes("declin")) return "dead";
  return null; // error / unknown / skipped — leave pending
}
