import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import Seo from "@/components/Seo";
import { PageHero, StatCard } from "@/components/PageHero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useServerFn } from "@tanstack/react-start";
import { myApiAccess, requestApiAccess, type MyApiAccess } from "@/lib/apiAccess.functions";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { KeyRound, Terminal, Wallet, ShieldCheck, Copy } from "lucide-react";
import { BuildBotBanner } from "@/components/BuildBotBanner";

const BASE = typeof window !== "undefined" ? window.location.origin : "https://zoru.cc";

const Snippet = ({ title, code }: { title: string; code: string }) => (
  <div className="rounded-xl border border-[#e6e6e6] bg-[#0f1729] text-[#d7e2ff] overflow-hidden">
    <div className="flex items-center justify-between px-4 py-2 bg-black/30 text-[12px] uppercase tracking-wide">
      <span>{title}</span>
      <button
        onClick={() => { navigator.clipboard.writeText(code); toast.success("Copied"); }}
        className="inline-flex items-center gap-1 opacity-80 hover:opacity-100"
      >
        <Copy className="h-3.5 w-3.5" /> copy
      </button>
    </div>
    <pre className="p-4 text-[12.5px] leading-relaxed overflow-x-auto"><code>{code}</code></pre>
  </div>
);

const ApiAccess = () => {
  const load = useServerFn(myApiAccess);
  const request = useServerFn(requestApiAccess);

  const [info, setInfo] = useState<MyApiAccess | null>(null);
  const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false);
  const [freshKey, setFreshKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try { setInfo(await load({})); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load"); }
  }, [load]);

  useEffect(() => { refresh(); }, [refresh]);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await request({ data: { purpose: purpose.trim() || undefined } });
      setFreshKey(res.key);
      toast.success("Payment accepted — your API key is ready");
      setPurpose("");
      refresh();
    } catch (e) {
      const m = e instanceof Error ? e.message : "Failed";
      if (m.startsWith("insufficient_balance")) {
        toast.error(`You need $${m.split(":")[1] ?? "100"} in your balance. Please deposit first.`);
      } else if (m === "request_already_pending") toast.error("You already have a pending request");
      else if (m === "api_already_active") toast.error("You already have an active API key");
      else toast.error(m);
    }
    setBusy(false);
  };

  const fee = info?.fee ?? 100;
  const price = info?.pricePerCard ?? 0.02;
  const balance = info?.balance ?? 0;
  const enough = balance >= fee;

  return (
    <AppShell>
      <Seo title="Checker API | Zoru Shop" description="Use the Zoru card checker from your own bot or site." path="/api-access" />
      <PageHero
        eyebrow="Developer access"
        eyebrowIcon={Terminal}
        title="Checker"
        highlight="API"
        description="Run card checks from your own bot, site or script — straight from our server."
      />

      <BuildBotBanner className="mb-5" />


      <div className="grid gap-4 sm:grid-cols-3 mb-5">
        <StatCard label="Access fee" value={`$${fee.toFixed(2)}`} icon={KeyRound} hint={`Then $${(info?.pricePerCard ?? 0.02).toFixed(2)} per card checked`} />
        <StatCard label="Your balance" value={`$${balance.toFixed(2)}`} icon={Wallet} tone="green" />
        <StatCard
          label="Status"
          value={info?.key ? (info.key.active ? "Active" : "Disabled") : (info?.status ?? "none")}
          icon={ShieldCheck} tone="amber"
        />
      </div>

      {freshKey && (
        <div className="rounded-2xl border border-[#c8e6c9] bg-[#f3fbf4] p-5 space-y-2 mt-5">
          <div className="font-semibold text-[#1b5e20]">Your API key — copy it now, it is shown only once</div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-[13px] bg-white border border-[#c8e6c9] rounded px-3 py-2 break-all">{freshKey}</code>
            <Button
              variant="outline"
              onClick={() => { navigator.clipboard.writeText(freshKey); toast.success("Copied"); }}
            >
              <Copy className="h-4 w-4 mr-2" />Copy
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-[#e6e6e6] bg-white p-5 space-y-4 mt-5">
        {info?.key ? (
          <>
            <div className="font-semibold">Your API key</div>
            <div className="text-[13px] text-[#555]">
              <code className="font-mono">{info.key.prefix}…</code> · {info.key.credits} credits · ${price.toFixed(2)} per card ·
              {" "}{info.key.lockedIp ? `locked to ${info.key.lockedIp}` : "IP locks on first call"}
            </div>
            <div className="text-[12.5px] text-[#777]">
              The full key was shown once when it was issued. Lost it? Open a support ticket and we will re-issue.
            </div>
          </>
        ) : info?.status === "pending" ? (
          <div className="text-[13px]">
            Your request is <b>pending</b>. The ${fee.toFixed(2)} fee is already paid — we will issue your key shortly.
          </div>
        ) : (
          <>
            <div className="font-semibold">Request API access</div>
            <div className="text-[13px] text-[#555]">
              API access costs <b>${fee.toFixed(2)}</b>, taken from your balance once.
              After payment your private key is issued instantly, bound to your account and to one server IP. Each card you check through the API then costs
              <b> ${price.toFixed(2)}</b>, taken from your key credits first and from your account balance after that.
            </div>
            <Input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="What will you use it for? (bot, site, shop…)"
            />
            {enough ? (
              <Button onClick={submit} disabled={busy}>
                <KeyRound className="h-4 w-4 mr-2" />{busy ? "Processing…" : `Pay $${fee.toFixed(2)} and get key`}
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[13px] text-rose-600">
                  You need ${(fee - balance).toFixed(2)} more in your balance.
                </span>
                <Link to="/recharge"><Button variant="outline">Deposit now</Button></Link>
              </div>
            )}
            {info?.status === "rejected" && info.adminNote && (
              <div className="text-[12.5px] text-rose-600">Last request rejected: {info.adminNote}</div>
            )}
          </>
        )}
      </div>

      <div className="rounded-2xl border border-[#e6e6e6] bg-white p-5 space-y-4 mt-5">
        <div className="flex items-center gap-2 font-semibold"><Terminal className="h-4 w-4" /> API documentation</div>
        <div className="text-[13px] text-[#555]">
          Base URL <code className="font-mono">{BASE}</code>. Send your key in the <code>x-api-key</code> header on every
          request. Every card costs <b>${price.toFixed(2)}</b>: the credits on your key are used first, and anything
          left over is taken from your account balance. Cards the gateway never answers are refunded automatically.
        </div>

        <div className="rounded-xl border border-[#ffe0b2] bg-[#fff8e8] p-4 text-[12.5px] text-[#6b5417] leading-relaxed">
          <b>Keep your checker topped up.</b> Requests fail with <code>insufficient_balance</code> the moment your key
          credits and your account balance both run out, so keep credits on the key and money in your balance at all
          times. Check <code>/api/public/checker/balance</code> before every batch (it returns
          {" "}<code>cards_affordable</code>) and deposit early — a bot that runs dry stops mid-run.
        </div>


        <Snippet
          title="1. Start a check — POST /api/public/checker/check"
          code={`curl -X POST ${BASE}/api/public/checker/check \\
  -H "x-api-key: YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "cards": ["4111111111111111|01|2030|123"],
    "gate": "CCV_Braintree_Auth"
  }'

# → { "status":"success", "task_id":"...", "total":1,
#     "price_per_card":0.02, "cost_usd":0.02,
#     "credits_charged":20, "balance_charged":0,
#     "credits_left":9980, "balance_left":42.5 }`}
        />

        <Snippet
          title="2. Get results — POST /api/public/checker/result"
          code={`curl -X POST ${BASE}/api/public/checker/result \\
  -H "x-api-key: YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "task_id": "TASK_ID" }'

# → { "status":"success", "done":true, "total":1, "answered":1,
#     "credits_refunded":0, "balance_refunded":0,
#     "results":[{ "card":"411111****1111", "status":"live",
#                  "category":"Approved", "msg":"..." }] }`}
        />

        <Snippet
          title="3. Balance — GET /api/public/checker/balance"
          code={`curl ${BASE}/api/public/checker/balance -H "x-api-key: YOUR_KEY"

# → { "status":"success", "label":"my-bot", "credits":9980,
#     "balance":42.5, "price_per_card":0.02, "cards_affordable":2624 }`}
        />

        <div className="text-[12.5px] text-[#777] leading-relaxed">
          Errors return <code>{`{ "status":"error", "message":"..." }`}</code>:
          {" "}<code>missing_api_key</code> (401), <code>key_disabled</code> / <code>ip_not_allowed</code> (403),
          {" "}<code>insufficient_balance</code> / <code>insufficient_credits</code> / <code>daily_limit_reached</code> (402),
          {" "}<code>no_valid_cards</code> / <code>invalid_body</code> (400).
          <br />Card format: <code>PAN|MM|YYYY|CVV</code>, max 500 cards per request. Poll results every 10–15 seconds.
        </div>
      </div>
    </AppShell>
  );
};

export default ApiAccess;
