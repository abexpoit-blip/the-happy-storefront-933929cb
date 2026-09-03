import { Link } from "react-router-dom";
import Seo from "@/components/Seo";
import { useAuth } from "@/hooks/useAuth";
import { ArrowRight } from "lucide-react";

/**
 * Public landing page — Zoru Shop style:
 * dark navy nav, white/light content, blue #2196f3 primary, teal #4fc3f7 accent.
 */
export default function Landing() {
  const { user } = useAuth();
  const primaryHref = user ? "/shop" : "/auth";
  const primaryLabel = user ? "Enter the shop" : "Create account";

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-[#1f2d3d]" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <Seo
        title="Zoru Shop — Verified Marketplace"
        description="Zoru Shop verified marketplace with instant delivery and secure settlement."
        path="/"
      />

      {/* NAV */}
      <header className="bg-[#1f2d3d] text-white">
        <div className="mx-auto max-w-[1400px] px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-wide">
            <span className="h-2.5 w-2.5 rounded-full bg-[#4fc3f7]" />
            Zoru Shop
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-[13px] text-white/80">
            <a href="#catalog" className="hover:text-[#4fc3f7]">Catalog</a>
            <a href="#trust" className="hover:text-[#4fc3f7]">Trust</a>
            <a href="#rules" className="hover:text-[#4fc3f7]">Rules</a>
          </nav>
          <div className="flex items-center gap-3">
            {!user && (
              <Link to="/auth" className="hidden sm:inline text-[13px] text-white/80 hover:text-[#4fc3f7]">
                Sign in
              </Link>
            )}
            <Link
              to={primaryHref}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-sm bg-[#2196f3] hover:bg-[#1976d2] text-white text-[13px] font-medium transition"
            >
              {primaryLabel} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="mx-auto max-w-[1200px] px-6 py-20 lg:py-28">
        <div className="text-[11px] tracking-[0.22em] uppercase text-[#4fc3f7] font-semibold mb-4">
          Verified marketplace
        </div>
        <h1 className="text-4xl md:text-6xl font-bold leading-[1.05] text-[#1f2d3d] max-w-3xl">
          Fast, secure, and verified delivery.
        </h1>
        <p className="mt-6 text-[15px] text-[#4a5568] max-w-2xl leading-relaxed">
          Zoru Shop is a curated marketplace. Every seller is vetted, every order delivered
          the moment payment clears — 40+ countries, sub-30-second fulfillment.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            to={primaryHref}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-sm bg-[#2196f3] hover:bg-[#1976d2] text-white text-sm font-semibold transition"
          >
            {primaryLabel} <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="#trust"
            className="inline-flex items-center px-5 py-3 rounded-sm bg-white border border-[#e6e6e6] text-[#1f2d3d] text-sm font-semibold hover:border-[#2196f3] transition"
          >
            Why Zoru Shop
          </a>
        </div>

        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { k: "99.4%", v: "Valid rate" },
            { k: "40+", v: "Countries" },
            { k: "< 30s", v: "Delivery" },
            { k: "24/7", v: "Support" },
          ].map((s) => (
            <div key={s.v} className="bg-white border border-[#e6e6e6] rounded-sm px-5 py-4">
              <div className="text-2xl font-bold text-[#1f2d3d]">{s.k}</div>
              <div className="text-[11px] tracking-wider uppercase text-[#7a8899] mt-1">{s.v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* SELLERS & RATES */}
      <section id="sellers" className="border-t border-[#e6e6e6] bg-white">
        <div className="mx-auto max-w-[1200px] px-6 py-16">
          <h2 className="text-2xl font-bold text-[#1f2d3d]">Sellers &amp; validity rates</h2>
          <p className="mt-3 text-[14px] text-[#4a5568] max-w-3xl leading-relaxed">
            Every base on Zoru Shop is uploaded by a vetted seller and published with its own
            live-check percentage. The percentage shown next to a base is the share of cards that
            passed the last checker run — for example, a base marked <strong>80%</strong> means
            roughly 8 out of 10 cards come back live. Refundable bases are marked
            <strong> REFUND: YES</strong> in the shop table and are covered by the replacement policy;
            bases marked <strong>REFUND: NO</strong> are sold as-is at a lower price.
          </p>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { t: "Seller share", d: "Sellers keep 80% of every sale. Zoru Shop keeps a 20% platform fee that covers checking, hosting and support." },
              { t: "Live rate on every base", d: "Each base carries a published live percentage (e.g. 70–90%). Buy 10 cards from an 80% base and about 7–8 should check live." },
              { t: "Refund coverage", d: "Refundable bases: dead cards replaced within the refund window. Non-refundable bases are priced lower and sold final." },
            ].map((c) => (
              <div key={c.t} className="rounded-lg border border-[#e6e6e6] bg-gradient-to-b from-white to-[#f7f9fb] p-5 shadow-[0_12px_30px_-22px_rgba(31,45,61,0.7)]">
                <div className="h-1 w-8 bg-[#2196f3] mb-3 rounded-full" />
                <div className="font-semibold text-[#1f2d3d]">{c.t}</div>
                <p className="text-[13px] text-[#4a5568] mt-2 leading-relaxed">{c.d}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 overflow-x-auto rounded-lg border border-[#e6e6e6]">
            <table className="w-full min-w-[520px] text-[13px]">
              <thead>
                <tr className="bg-gradient-to-b from-[#f7f9fb] to-[#eceff1] text-[#455a64] text-[12px]">
                  {["Seller tier", "Live rate", "Refund", "Seller share"].map((h) => (
                    <th key={h} className="p-2.5 text-left font-semibold uppercase tracking-wide border-b border-[#e0e0e0]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["Verified Pro", "85–95%", "Yes", "80%"],
                  ["Verified", "70–85%", "Yes", "80%"],
                  ["Standard", "50–70%", "No", "75%"],
                ].map((r) => (
                  <tr key={r[0]} className="border-b border-[#f0f0f0] odd:bg-white even:bg-[#fcfdfe]">
                    {r.map((cell, i) => (
                      <td key={i} className="p-2.5 text-[#37474f]">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* TRUST */}
      <section id="trust" className="border-t border-[#e6e6e6] bg-white">
        <div className="mx-auto max-w-[1200px] px-6 py-16">
          <h2 className="text-2xl font-bold text-[#1f2d3d]">Why Zoru Shop</h2>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { t: "Verified sellers", d: "Every seller passes identity, stock and fulfillment checks before listing." },
              { t: "Instant delivery", d: "Automated release the moment payment clears. No manual handoff." },
              { t: "Auto replacement", d: "Invalid orders replaced within 5 minutes, no ticket needed." },
            ].map((c) => (
              <div key={c.t} className="border border-[#e6e6e6] rounded-sm p-5">
                <div className="h-1 w-8 bg-[#2196f3] mb-3" />
                <div className="font-semibold text-[#1f2d3d]">{c.t}</div>
                <p className="text-[13px] text-[#4a5568] mt-2 leading-relaxed">{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-[#e6e6e6] bg-[#1f2d3d] text-white/70">
        <div className="mx-auto max-w-[1200px] px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
          <div>© {new Date().getFullYear()} Zoru Shop. All rights reserved.</div>
          <a
            href="https://t.me/scorpionccstore02"
            target="_blank"
            rel="noreferrer"
            className="hover:text-[#4fc3f7]"
          >
            Telegram · @scorpionccstore02
          </a>
        </div>
      </footer>
    </div>
  );
}
