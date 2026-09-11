import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json } from "@/lib/apiAuth.server";
import { digits, maskPan, parseCardLine } from "@/lib/cardLine";
import { CLIENT_FEE_PERCENT, withFee } from "@/lib/fees";
import {
  adminDb,
  botAccountSnapshot,
  botSecretOk,
  getOrCreateBotAccount,
  siteOrigin,
} from "@/lib/botApi.server";

const baseSchema = z.object({
  telegram_id: z.number().int().positive(),
  username: z.string().max(64).nullish(),
  first_name: z.string().max(64).nullish(),
  ref: z.string().max(32).nullish(),
});

const pending = (line: string) => ({
  card: maskPan(digits(line.split("|")[0] ?? "")),
  status: "skipped" as const,
  category: "Pending",
  msg: "Waiting for gateway result",
  pending: true,
});

export const Route = createFileRoute("/api/public/bot/$action")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!botSecretOk(request)) return json({ status: "error", message: "unauthorized" }, 401);

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return json({ status: "error", message: "invalid_body" }, 400);
        }

        let base: z.infer<typeof baseSchema>;
        try {
          base = baseSchema.parse(body);
        } catch {
          return json({ status: "error", message: "invalid_body" }, 400);
        }

        const action = params.action;
        const db = await adminDb();

        let account;
        try {
          account = await getOrCreateBotAccount({
            telegramId: base.telegram_id,
            username: base.username ?? null,
            firstName: base.first_name ?? null,
            ref: base.ref ?? null,
          });
        } catch (e) {
          return json(
            { status: "error", message: e instanceof Error ? e.message : "account_error" },
            500,
          );
        }

        const snapshot = await botAccountSnapshot(account);
        if (snapshot.blocked && action !== "session") {
          return json({ status: "error", message: "account_banned" }, 403);
        }

        try {
          switch (action) {
            /* ---------------- account ---------------- */
            case "session":
              return json({ status: "success", account: snapshot });

            /* ---------------- gates ---------------- */
            case "gates": {
              const { listGates, GATE_CATALOG } = await import("@/lib/checkerccv.server");
              let gates;
              try {
                gates = await listGates(true);
              } catch {
                gates = [];
              }
              const list = (gates.length ? gates : GATE_CATALOG).map((g) => ({
                id: String(g.id),
                description: String(g.description ?? g.id),
              }));
              return json({ status: "success", gates: list, selected: snapshot.gate ?? snapshot.default_gate });
            }

            case "setgate": {
              const gate = String(body["gate"] ?? "").trim().slice(0, 80);
              if (!gate) return json({ status: "error", message: "gate_required" }, 400);
              await db.from("telegram_accounts").update({ gate }).eq("telegram_id", account.telegramId);
              return json({ status: "success", gate });
            }

            /* ---------------- deposit ---------------- */
            case "deposit": {
              const amount = Number(body["amount"] ?? 0);
              if (!Number.isFinite(amount) || amount < 1 || amount > 100000) {
                return json({ status: "error", message: "invalid_amount" }, 400);
              }
              const { createLtcInvoice } = await import("@/lib/plisio.server");
              const { credit, fee, charged } = withFee(amount);
              const origin = siteOrigin(request);

              await db.rpc("expire_stale_deposits");
              const { data: dep, error } = await db
                .from("deposits")
                .insert({
                  user_id: account.userId,
                  amount: credit,
                  method: "crypto",
                  status: "pending",
                  crypto_currency: "LTC",
                  fee_percent: CLIENT_FEE_PERCENT,
                  fee_amount: fee,
                  charged_amount: charged,
                })
                .select("id")
                .single();
              if (error || !dep) return json({ status: "error", message: "deposit_create_failed" }, 500);

              let inv;
              try {
                inv = await createLtcInvoice({
                  usdAmount: charged,
                  orderNumber: dep.id,
                  callbackUrl: `${origin}/api/public/deposit-callback`,
                  successUrl: `${origin}/recharge?payment=success&deposit=${dep.id}`,
                  failUrl: `${origin}/recharge?payment=failed&deposit=${dep.id}`,
                });
              } catch (e) {
                const detail = e instanceof Error ? e.message : String(e);
                await db
                  .from("deposits")
                  .update({ status: "rejected", admin_note: `Gateway error: ${detail}`.slice(0, 400) })
                  .eq("id", dep.id);
                return json({ status: "error", message: detail }, 502);
              }

              const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
              await db
                .from("deposits")
                .update({
                  invoice_id: inv.txn_id,
                  wallet_address: inv.wallet_hash,
                  crypto_amount: String(inv.amount),
                  reference: inv.txn_id,
                  invoice_url: inv.invoice_url ?? null,
                  expires_at: expiresAt,
                })
                .eq("id", dep.id);

              return json({
                status: "success",
                deposit_id: dep.id,
                credit,
                fee,
                charged,
                currency: "LTC",
                wallet_address: inv.wallet_hash,
                crypto_amount: String(inv.amount),
                invoice_url: inv.invoice_url ?? null,
                expires_ms: Date.parse(expiresAt),
              });
            }

            case "deposits": {
              const { data } = await db
                .from("deposits")
                .select("id, amount, status, crypto_amount, invoice_url, created_at")
                .eq("user_id", account.userId)
                .order("created_at", { ascending: false })
                .limit(10);
              return json({ status: "success", deposits: data ?? [] });
            }

            /* ---------------- checking ---------------- */
            case "check": {
              const raw = Array.isArray(body["cards"]) ? (body["cards"] as unknown[]) : [];
              const lines = [
                ...new Set(raw.map((c) => parseCardLine(String(c))).filter(Boolean) as string[]),
              ].slice(0, 500);
              if (!lines.length) return json({ status: "error", message: "no_valid_cards" }, 400);

              const gate =
                String(body["gate"] ?? "").trim() || snapshot.gate || snapshot.default_gate;

              const { data: cost, error: chargeError } = await db.rpc("bot_charge_check", {
                _user_id: account.userId,
                _cards: lines.length,
              });
              if (chargeError) {
                return json({ status: "error", message: chargeError.message }, 402);
              }

              let taskId: string;
              try {
                const { createTask } = await import("@/lib/checkerccv.server");
                taskId = await createTask(gate, lines);
              } catch (e) {
                await db.rpc("bot_refund_check", { _user_id: account.userId, _amount: Number(cost ?? 0) });
                return json(
                  { status: "error", message: e instanceof Error ? e.message : "gateway_error" },
                  502,
                );
              }

              await db.from("self_checks").insert({
                user_id: account.userId,
                task_id: taskId,
                gate,
                total: lines.length,
                cost: Number(cost ?? 0),
                status: "running",
                source: "bot",
                submitted_cards: lines.map(pending),
                full_cards: lines.map((line) => ({
                  m: maskPan(digits(line.split("|")[0] ?? "")),
                  c: line,
                })),
              });

              return json({
                status: "success",
                task_id: taskId,
                total: lines.length,
                gate,
                cost: Number(cost ?? 0),
              });
            }

            case "result": {
              const taskId = String(body["task_id"] ?? "").trim();
              if (!taskId) return json({ status: "error", message: "task_id_required" }, 400);

              const { data: task } = await db
                .from("self_checks")
                .select("*")
                .eq("task_id", taskId)
                .eq("user_id", account.userId)
                .maybeSingle();
              if (!task) return json({ status: "error", message: "task_not_found" }, 404);

              const { getResults, verdict } = await import("@/lib/checkerccv.server");
              const stored = Array.isArray(task.results) ? task.results : [];
              const rows = [...stored] as {
                card: string;
                status: string;
                category: string;
                msg: string;
              }[];
              let cursor = rows.length;
              let state = String(task.status ?? "running");

              for (let page = 0; page < 4; page++) {
                const res = await getResults(taskId, cursor, 500);
                state = res.status;
                const mapped = res.results.map((r) => {
                  const pan = digits(String(r.card ?? "").split("|")[0] ?? "");
                  const v = verdict(r.category);
                  const cat = String(r.category ?? "").toLowerCase();
                  return {
                    card: maskPan(pan),
                    status: v ?? (cat.includes("skip") ? "skipped" : "error"),
                    category: String(r.category ?? ""),
                    msg: String(r.result?.msg ?? ""),
                  };
                });
                for (const row of mapped) {
                  const i = rows.findIndex((c) => c.card === row.card);
                  if (i >= 0) rows[i] = row;
                  else rows.push(row);
                }
                const next = res.nextCursor > cursor ? res.nextCursor : cursor + mapped.length;
                if (mapped.length === 0 || next <= cursor) break;
                cursor = next;
              }

              const done = state === "completed" || state === "cancelled";
              const total = Number(task.total ?? 0);
              const answered = rows.filter((r) => r.status === "live" || r.status === "dead").length;
              let refunded = Number(task.refunded_usd ?? 0);

              if (done) {
                const perCard = total > 0 ? Number(task.cost ?? 0) / total : 0;
                const owed = Math.round((Math.max(0, total - answered) * perCard - refunded) * 100) / 100;
                if (owed > 0) {
                  await db.rpc("bot_refund_check", { _user_id: account.userId, _amount: owed });
                  refunded += owed;
                }
              }

              await db
                .from("self_checks")
                .update({
                  results: rows,
                  status: done ? "completed" : "running",
                  refunded_usd: refunded,
                })
                .eq("id", task.id);

              return json({
                status: "success",
                done,
                total,
                answered,
                refunded,
                live: rows.filter((r) => r.status === "live").length,
                dead: rows.filter((r) => r.status === "dead").length,
                rows,
              });
            }

            case "tasks": {
              const { data } = await db
                .from("self_checks")
                .select("task_id, gate, total, cost, status, created_at")
                .eq("user_id", account.userId)
                .order("created_at", { ascending: false })
                .limit(10);
              return json({ status: "success", tasks: data ?? [] });
            }

            /* ---------------- API access ---------------- */
            case "apikey": {
              const { data: key, error } = await db.rpc("bot_purchase_api_key", {
                _user_id: account.userId,
              });
              if (error) return json({ status: "error", message: error.message }, 402);
              return json({ status: "success", key, fee: snapshot.api_fee });
            }

            default:
              return json({ status: "error", message: "unknown_action" }, 404);
          }
        } catch (e) {
          return json(
            { status: "error", message: e instanceof Error ? e.message : "server_error" },
            500,
          );
        }
      },
    },
  },
});
