import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  Clock,
  Send,
  Upload,
  Layers,
  Sparkles,
  Play,
  Pause,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileText,
  Zap,
  DollarSign,
  ChevronRight,
  Database,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import {
  adminPublishFullCards,
  adminCreateAnnouncement,
  type FullCardInput,
  type Category,
} from "@/lib/store";
import { parseAndFormat, dedupe, detectBrand, toPipeFormat } from "@/lib/cardFormatter";
import {
  broadcastChannelAlert,
  createDripQueue,
  listDripQueues,
  updateDripQueue,
  triggerDripRelease,
  type DripQueueRow,
} from "@/lib/cardAutomation.functions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  onUploadSuccess?: () => void;
}

export const BackdateCardUploadDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  categories,
  onUploadSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<"backdate" | "drip">("backdate");

  // ==========================================
  // SYSTEM 1: BACK-DATE CARD UPLOAD STATE
  // ==========================================
  const [backdateRaw, setBackdateRaw] = useState("");
  // Default start date = 180 days ago (approx 6 months ago)
  const defaultSixMonthsAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 180);
    return d.toISOString().slice(0, 10);
  }, []);
  const [startDate, setStartDate] = useState(defaultSixMonthsAgo);
  const [cardsPerDay, setCardsPerDay] = useState("20");
  const [backdatePrice, setBackdatePrice] = useState("1.50");
  const [backdateRefundable, setBackdateRefundable] = useState(false);
  const [backdateCategoryId, setBackdateCategoryId] = useState<string>("");
  const [postAnnouncements, setPostAnnouncements] = useState(true);
  const [notifyTelegramLatest, setNotifyTelegramLatest] = useState(true);

  const [backdateBusy, setBackdateBusy] = useState(false);
  const [backdateProgress, setBackdateProgress] = useState<{
    currentDay: number;
    totalDays: number;
    currentDate: string;
    totalUploaded: number;
    totalExpected: number;
  } | null>(null);

  // File drag & drop ref
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, target: "backdate" | "drip") => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = String(evt.target?.result || "");
      if (target === "backdate") setBackdateRaw(text);
      else setDripRaw(text);
      toast.success(`Loaded ${file.name} (${text.length} chars)`);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Parsing preview for backdate
  const backdatePreview = useMemo(() => {
    if (!backdateRaw.trim()) return null;
    const { lines, failed } = parseAndFormat(backdateRaw);
    const { unique, dropped } = dedupe(lines);
    const brands: Record<string, number> = {};
    for (const c of unique) {
      const b = detectBrand(c.cc) || "OTHER";
      brands[b] = (brands[b] || 0) + 1;
    }
    const perDayNum = Math.max(1, parseInt(cardsPerDay, 10) || 20);
    const daysNeeded = Math.ceil(unique.length / perDayNum);

    // Date range simulation
    const s = new Date(startDate || defaultSixMonthsAgo);
    s.setHours(12, 0, 0, 0);
    const endDate = new Date(s.getTime() + (daysNeeded - 1) * 86_400_000);

    return {
      totalLines: backdateRaw.split("\n").filter((l) => l.trim()).length,
      valid: unique.length,
      dupes: dropped,
      failed: failed.length,
      brands,
      cards: unique,
      daysNeeded,
      startDateFormatted: s.toISOString().slice(0, 10),
      endDateFormatted: endDate.toISOString().slice(0, 10),
    };
  }, [backdateRaw, cardsPerDay, startDate, defaultSixMonthsAgo]);

  // Execute Back-Date Upload
  const runBackdateUpload = async () => {
    if (!backdatePreview || backdatePreview.valid === 0) {
      return toast.error("No valid cards to upload");
    }
    const perDay = Math.max(1, parseInt(cardsPerDay, 10) || 20);
    const price = parseFloat(backdatePrice) || 1.5;
    const allCards = backdatePreview.cards;
    const totalDays = Math.ceil(allCards.length / perDay);

    setBackdateBusy(true);
    let uploadedCount = 0;
    let latestBaseCreated = "";
    let latestBaseCount = 0;
    let latestBrand = "VISA";
    let latestCountries: string[] = [];

    try {
      const s = new Date(startDate || defaultSixMonthsAgo);
      s.setHours(12, 0, 0, 0);

      for (let dayIdx = 0; dayIdx < totalDays; dayIdx++) {
        const curDate = new Date(s.getTime() + dayIdx * 86_400_000);
        const yyyy = curDate.getUTCFullYear();
        const mm = String(curDate.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(curDate.getUTCDate()).padStart(2, "0");
        const dateStr = `${yyyy}_${mm}_${dd}`;
        const dayCards = allCards.slice(dayIdx * perDay, (dayIdx + 1) * perDay);

        setBackdateProgress({
          currentDay: dayIdx + 1,
          totalDays,
          currentDate: dateStr,
          totalUploaded: uploadedCount,
          totalExpected: allCards.length,
        });

        // Group cards for this day by brand so bases are named e.g. ADMIN_2026_03_15_VISA
        const byBrand = new Map<string, typeof dayCards>();
        for (const card of dayCards) {
          const brand = detectBrand(card.cc) || "OTHER";
          const list = byBrand.get(brand) || [];
          list.push(card);
          byBrand.set(brand, list);
        }

        for (const [brand, brandCards] of byBrand.entries()) {
          const baseName = `ADMIN_${dateStr}_${brand}`;
          latestBaseCreated = baseName;
          latestBaseCount = brandCards.length;
          latestBrand = brand;
          latestCountries = brandCards.map((c) => c.country).filter(Boolean);

          const fullCardInputs: FullCardInput[] = brandCards.map((c) => ({
            cc: c.cc,
            month: c.month,
            year: c.year,
            cvv: c.cvv,
            name: c.name,
            addr: c.addr,
            city: c.city,
            state: c.state,
            zip: c.zip,
            country: c.country,
            tel: c.tel,
            email: c.email,
            brand: brand,
            bin: c.cc.replace(/\D/g, "").slice(0, 6),
            base: baseName,
            price: price,
            refundable: backdateRefundable,
            category_id: backdateCategoryId || null,
            created_at: curDate.toISOString(),
          }));

          // 1. Insert cards into database
          await adminPublishFullCards(fullCardInputs);
          uploadedCount += brandCards.length;

          // 2. Post dated announcement if enabled
          if (postAnnouncements) {
            const pubName = `${dateStr}_${brand}`;
            await adminCreateAnnouncement({
              title: `Base Update: ${pubName}`,
              body: `Fresh batch of verified cards added for base ${pubName}. Available now in shop.`,
              kind: "update",
              created_at: curDate.toISOString(),
            }).catch(() => {});
          }
        }
      }

      // 3. Telegram channel alert for latest base if enabled
      if (notifyTelegramLatest && latestBaseCreated) {
        try {
          await broadcastChannelAlert({
            data: {
              baseName: latestBaseCreated,
              count: latestBaseCount,
              brand: latestBrand,
              country: latestCountries.slice(0, 3).join(", ") || "MIX",
              price: price,
              customNote: `Back-date upload of ${uploadedCount} cards completed successfully.`,
            },
          });
        } catch (tgErr) {
          console.warn("Telegram broadcast error:", tgErr);
        }
      }

      toast.success(
        `Successfully back-dated ${uploadedCount} cards across ${totalDays} days (${startDate} to ${backdatePreview.endDateFormatted})!`
      );
      setBackdateRaw("");
      setBackdateProgress(null);
      onUploadSuccess?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Back-date upload failed");
    } finally {
      setBackdateBusy(false);
    }
  };

  // ==========================================
  // SYSTEM 2: AUTO-DRIP QUEUE STATE
  // ==========================================
  const [dripRaw, setDripRaw] = useState("");
  const [dripName, setDripName] = useState("Daily Drip Queue");
  const [dripPerDay, setDripPerDay] = useState("20");
  const [dripPrice, setDripPrice] = useState("1.50");
  const [dripRefundable, setDripRefundable] = useState(false);
  const [dripCategoryId, setDripCategoryId] = useState("");
  const [dripAutoAnnounce, setDripAutoAnnounce] = useState(true);
  const [dripTgBroadcast, setDripTgBroadcast] = useState(true);
  const [dripCreating, setDripCreating] = useState(false);

  const [dripQueues, setDripQueues] = useState<DripQueueRow[]>([]);
  const [loadingQueues, setLoadingQueues] = useState(false);
  const [releasingQueueId, setReleasingQueueId] = useState<string | null>(null);

  // Parsing preview for drip
  const dripPreview = useMemo(() => {
    if (!dripRaw.trim()) return null;
    const { lines, failed } = parseAndFormat(dripRaw);
    const { unique, dropped } = dedupe(lines);
    const brands: Record<string, number> = {};
    for (const c of unique) {
      const b = detectBrand(c.cc) || "OTHER";
      brands[b] = (brands[b] || 0) + 1;
    }
    const perDayNum = Math.max(1, parseInt(dripPerDay, 10) || 20);
    const days = Math.ceil(unique.length / perDayNum);
    return {
      valid: unique.length,
      dupes: dropped,
      failed: failed.length,
      brands,
      cards: unique,
      estimatedDays: days,
    };
  }, [dripRaw, dripPerDay]);

  const loadQueues = async () => {
    setLoadingQueues(true);
    try {
      const rows = await listDripQueues();
      setDripQueues(rows);
    } catch {
      /* ignore */
    } finally {
      setLoadingQueues(false);
    }
  };

  useEffect(() => {
    if (open && activeTab === "drip") {
      loadQueues();
    }
  }, [open, activeTab]);

  const createQueueHandler = async () => {
    if (!dripPreview || dripPreview.valid === 0) {
      return toast.error("No valid cards to enqueue");
    }
    setDripCreating(true);
    try {
      const items = dripPreview.cards.map((c) => ({
        card_line: toPipeFormat(c),
        cc: c.cc,
        brand: detectBrand(c.cc) || "OTHER",
        bin: c.cc.replace(/\D/g, "").slice(0, 6),
        country: c.country,
        state: c.state,
        city: c.city,
        zip: c.zip,
        month: c.month,
        year: c.year,
        cvv: c.cvv,
        name: c.name,
        addr: c.addr,
        tel: c.tel,
        email: c.email,
      }));

      const res = await createDripQueue({
        data: {
          name: dripName.trim() || `Drip Queue ${new Date().toLocaleDateString()}`,
          per_day: Math.max(1, parseInt(dripPerDay, 10) || 20),
          price: parseFloat(dripPrice) || 1.5,
          refundable: dripRefundable,
          category_id: dripCategoryId || null,
          auto_announce: dripAutoAnnounce,
          telegram_broadcast: dripTgBroadcast,
          items,
        },
      });

      toast.success(`Drip queue created with ${res.total_cards} cards!`);
      setDripRaw("");
      loadQueues();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create drip queue");
    } finally {
      setDripCreating(false);
    }
  };

  const handleQueueAction = async (queueId: string, action: "pause" | "resume" | "delete") => {
    try {
      await updateDripQueue({ data: { queue_id: queueId, action } });
      toast.success(`Queue ${action}d`);
      loadQueues();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  };

  const handleManualRelease = async (queueId: string) => {
    setReleasingQueueId(queueId);
    try {
      const res = await triggerDripRelease({ data: { queue_id: queueId } });
      toast.success(
        `Released ${res.released} cards under base ${res.base}! (${res.remaining} remaining in queue)`
      );
      if (res.telegram === "sent") {
        toast.info("Telegram notification sent to @zorushop!");
      }
      loadQueues();
      onUploadSuccess?.();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Manual release failed");
    } finally {
      setReleasingQueueId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto bg-[#0f141c] text-white border-primary/30 p-6 rounded-2xl shadow-2xl">
        <DialogHeader className="mb-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/20 text-primary-glow border border-primary/30">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-display tracking-wider text-primary-glow">
                ADVANCED CARD AUTOMATION ENGINE
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Back-date past card drops across historical dates or schedule automatic daily drip releases to shop & Telegram.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "backdate" | "drip")} className="w-full">
          <TabsList className="grid grid-cols-2 bg-[#121c3b] p-1.5 border border-slate-700/80 rounded-xl mb-6 shadow-md">
            <TabsTrigger
              value="backdate"
              className="flex items-center justify-center gap-2 text-xs font-bold py-2.5 rounded-lg transition-all text-slate-300 data-[state=active]:bg-[#38bdf8] data-[state=active]:text-[#07101f] data-[state=active]:shadow-lg"
            >
              <Calendar className="h-4 w-4" />
              1. Back-Date Card Upload
            </TabsTrigger>
            <TabsTrigger
              value="drip"
              className="flex items-center justify-center gap-2 text-xs font-bold py-2.5 rounded-lg transition-all text-slate-300 data-[state=active]:bg-[#38bdf8] data-[state=active]:text-[#07101f] data-[state=active]:shadow-lg"
            >
              <Clock className="h-4 w-4" />
              2. Daily Auto-Drip Scheduler
            </TabsTrigger>
          </TabsList>

          {/* ========================================================= */}
          {/* TAB 1: BACK-DATE CARD UPLOAD */}
          {/* ========================================================= */}
          <TabsContent value="backdate" className="space-y-5">
            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 text-xs text-slate-300 flex items-start gap-3 shadow-md">
              <Zap className="h-5 w-5 text-[#38bdf8] flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-[#38bdf8] mb-1">
                  How Historical Back-Date Upload Works:
                </p>
                <p className="leading-relaxed">
                  You provide raw bulk card lines (any format — auto-format cleans and dedupes automatically).
                  The system distributes your cards <b>day by day</b> from your specified Start Date up to today
                  (e.g. 20 cards per day for the last 6 months). For each day, cards are created with that day's
                  timestamp, dated BASE name (<code className="text-[#38bdf8] font-bold">2026_03_15_VISA</code>), stock ticker
                  updates, and site announcements so customers see a legitimate history of stock updates!
                </p>
              </div>
            </div>

            {/* Input & Parameters Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs font-semibold text-slate-200 mb-1.5 block">Start Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-[#121c3b] border-slate-700 text-white font-medium text-xs rounded-lg h-10 px-3 focus:border-[#38bdf8] shadow-inner"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Default: 6 months ago ({defaultSixMonthsAgo})
                </span>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-200 mb-1.5 block">Cards Per Day</Label>
                <Input
                  type="number"
                  min="1"
                  max="500"
                  value={cardsPerDay}
                  onChange={(e) => setCardsPerDay(e.target.value)}
                  placeholder="20"
                  className="bg-[#121c3b] border-slate-700 text-white font-mono font-medium text-xs rounded-lg h-10 px-3 focus:border-[#38bdf8] shadow-inner"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Standard recommendation: 20 pcs / day
                </span>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-200 mb-1.5 block">Default Card Price ($)</Label>
                <Input
                  type="number"
                  step="0.10"
                  min="0.1"
                  value={backdatePrice}
                  onChange={(e) => setBackdatePrice(e.target.value)}
                  placeholder="1.50"
                  className="bg-[#121c3b] border-slate-700 text-white font-mono font-medium text-xs rounded-lg h-10 px-3 focus:border-[#38bdf8] shadow-inner"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">Default: $1.50 / card</span>
              </div>
            </div>

            {/* Secondary Options */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3.5 rounded-xl bg-[#121c3b]/80 border border-slate-700/80 text-xs shadow-md">
              <div>
                <Label className="text-xs font-semibold text-slate-200 mb-1.5 block">Category</Label>
                <select
                  value={backdateCategoryId}
                  onChange={(e) => setBackdateCategoryId(e.target.value)}
                  className="w-full bg-[#162348] border border-slate-700 text-white rounded-lg h-10 px-2.5 text-xs focus:border-[#38bdf8] shadow-inner"
                >
                  <option value="">(None / General)</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#162348] border border-slate-700/80">
                <div>
                  <div className="font-semibold text-xs text-white">Post Announcements</div>
                  <div className="text-[11px] text-slate-400">Add dated news on site</div>
                </div>
                <Switch checked={postAnnouncements} onCheckedChange={setPostAnnouncements} />
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#162348] border border-slate-700/80">
                <div>
                  <div className="font-semibold text-xs text-white">Notify TG Channel</div>
                  <div className="text-[11px] text-slate-400">Alert @zorushop channel</div>
                </div>
                <Switch checked={notifyTelegramLatest} onCheckedChange={setNotifyTelegramLatest} />
              </div>
            </div>

            {/* Raw Cards Input Area */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-xs font-semibold text-slate-200">
                  Paste Cards or Upload .txt File (Auto-formatting applies automatically):
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => handleFileUpload(e, "backdate")}
                    accept=".txt,.csv"
                    className="hidden"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-8 px-3 text-xs bg-[#1e293b] hover:bg-[#334155] border border-[#38bdf8]/50 text-[#38bdf8] font-bold rounded-lg transition"
                  >
                    <Upload className="h-3.5 w-3.5 mr-1 text-[#38bdf8]" />
                    Load .txt File
                  </Button>
                </div>
              </div>
              <Textarea
                rows={6}
                value={backdateRaw}
                onChange={(e) => setBackdateRaw(e.target.value)}
                placeholder="4147202100000000|12|2028|123|John Doe|123 Main St|New York|NY|10001|US&#10;Any delimiter, format or headers are auto-detected..."
                className="font-mono text-xs bg-[#080d1e] border-slate-700 text-slate-100 placeholder:text-slate-500 rounded-xl p-3 focus:border-[#38bdf8] shadow-inner"
              />
            </div>

            {/* Real-Time Preview Simulation */}
            {backdatePreview && (
              <div className="p-4 rounded-xl bg-[#121c3b] border border-[#38bdf8]/40 space-y-3 shadow-lg">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs font-bold text-emerald-300">
                      {backdatePreview.valid.toLocaleString()} Valid Cards Ready
                    </span>
                    {backdatePreview.dupes > 0 && (
                      <Badge variant="secondary" className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        {backdatePreview.dupes} Dupes Filtered
                      </Badge>
                    )}
                    {backdatePreview.failed > 0 && (
                      <Badge variant="secondary" className="text-[10px] bg-red-500/20 text-red-300 border border-red-500/30">
                        {backdatePreview.failed} Unparseable Lines Skipped
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {Object.entries(backdatePreview.brands).map(([b, count]) => (
                      <Badge key={b} className="text-[10px] bg-[#162348] border border-[#38bdf8]/40 text-[#38bdf8] font-mono">
                        {b}: {count}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 rounded-lg bg-[#0c1430] border border-slate-700/60 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold">TOTAL DAYS SPANNED:</span>
                    <span className="font-mono font-black text-[#38bdf8] text-sm">
                      {backdatePreview.daysNeeded} Days
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold">HISTORICAL DATE RANGE:</span>
                    <span className="font-mono text-xs text-white font-semibold">
                      {backdatePreview.startDateFormatted} <ArrowRight className="inline h-3 w-3 mx-1 text-[#38bdf8]" /> {backdatePreview.endDateFormatted}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold">DAILY PACE:</span>
                    <span className="font-mono text-xs text-white font-bold">
                      {cardsPerDay} cards / base per day
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Live Upload Progress */}
            {backdateProgress && (
              <div className="p-4 rounded-xl bg-blue-500/10 border border-[#38bdf8]/40 space-y-2 shadow-md">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[#38bdf8] font-bold">
                    Uploading Day {backdateProgress.currentDay} / {backdateProgress.totalDays} ({backdateProgress.currentDate})...
                  </span>
                  <span className="font-mono text-xs text-slate-300">
                    {backdateProgress.totalUploaded} / {backdateProgress.totalExpected} cards
                  </span>
                </div>
                <Progress
                  value={(backdateProgress.currentDay / backdateProgress.totalDays) * 100}
                  className="h-2 bg-[#162348]"
                />
              </div>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <Button
                type="button"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={backdateBusy}
                className="h-9 px-4 bg-[#1e293b] hover:bg-[#334155] text-slate-200 border border-slate-700 font-semibold rounded-lg transition"
              >
                Close
              </Button>
              <Button
                size="sm"
                onClick={runBackdateUpload}
                disabled={backdateBusy || !backdatePreview || backdatePreview.valid === 0}
                className="h-9 px-5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 text-white font-bold rounded-lg shadow-lg shadow-emerald-500/20 transition disabled:opacity-40"
              >
                {backdateBusy ? (
                  <>
                    <Clock className="h-3.5 w-3.5 mr-1.5 animate-spin text-white" />
                    Back-Dating Cards...
                  </>
                ) : (
                  <>
                    <Calendar className="h-3.5 w-3.5 mr-1.5 text-white" />
                    Start Back-Date Upload ({backdatePreview?.valid || 0} Cards)
                  </>
                )}
              </Button>
            </div>
          </TabsContent>

          {/* ========================================================= */}
          {/* TAB 2: DAILY AUTO-DRIP SCHEDULER */}
          {/* ========================================================= */}
          <TabsContent value="drip" className="space-y-6">
            <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-xs text-slate-300 flex items-start gap-3 shadow-md">
              <Clock className="h-5 w-5 text-[#38bdf8] flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-[#38bdf8] mb-1">
                  How Daily Auto-Drip Scheduler Works:
                </p>
                <p className="leading-relaxed">
                  Upload your bulk cards here. They are saved in a staged staging queue.
                  Every day, the system automatically cuts the exact daily batch (e.g. 20 cards),
                  publishes them to the store with today's date base, updates the stock ticker and news,
                  and broadcasts an automated announcement directly to the <b>@zorushop</b> Telegram channel!
                  You can also click <b>"Release Today's Batch Now"</b> at any time for instant manual dispatch.
                </p>
              </div>
            </div>

            {/* Create Queue Section */}
            <div className="p-5 rounded-xl bg-[#121c3b]/80 border border-slate-700/80 space-y-4 shadow-lg">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#38bdf8] flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Create New Staged Drip Queue
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-slate-200 mb-1.5 block">Queue Name</Label>
                  <Input
                    value={dripName}
                    onChange={(e) => setDripName(e.target.value)}
                    placeholder="e.g. VISA US Bulk 500"
                    className="bg-[#162348] border-slate-700 text-white font-medium text-xs rounded-lg h-10 px-3 focus:border-[#38bdf8] shadow-inner"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-200 mb-1.5 block">Release Per Day</Label>
                  <Input
                    type="number"
                    min="1"
                    value={dripPerDay}
                    onChange={(e) => setDripPerDay(e.target.value)}
                    placeholder="20"
                    className="bg-[#162348] border-slate-700 text-white font-mono font-medium text-xs rounded-lg h-10 px-3 focus:border-[#38bdf8] shadow-inner"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-200 mb-1.5 block">Price Per Card ($)</Label>
                  <Input
                    type="number"
                    step="0.10"
                    value={dripPrice}
                    onChange={(e) => setDripPrice(e.target.value)}
                    placeholder="1.50"
                    className="bg-[#162348] border-slate-700 text-white font-mono font-medium text-xs rounded-lg h-10 px-3 focus:border-[#38bdf8] shadow-inner"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div>
                  <Label className="text-xs font-semibold text-slate-200 mb-1.5 block">Category</Label>
                  <select
                    value={dripCategoryId}
                    onChange={(e) => setDripCategoryId(e.target.value)}
                    className="w-full bg-[#162348] border border-slate-700 rounded-lg h-10 px-2.5 text-xs text-white focus:border-[#38bdf8] shadow-inner"
                  >
                    <option value="">(None / General)</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#162348] border border-slate-700/80">
                  <div>
                    <div className="font-semibold text-xs text-white">Auto Announcement</div>
                    <div className="text-[11px] text-slate-400">Post to site on daily release</div>
                  </div>
                  <Switch checked={dripAutoAnnounce} onCheckedChange={setDripAutoAnnounce} />
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#162348] border border-slate-700/80">
                  <div>
                    <div className="font-semibold text-xs text-white">Telegram Broadcast</div>
                    <div className="text-[11px] text-slate-400">Alert @zorushop daily</div>
                  </div>
                  <Switch checked={dripTgBroadcast} onCheckedChange={setDripTgBroadcast} />
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-200 mb-1.5 block">
                  Paste Cards or Upload .txt File:
                </Label>
                <Textarea
                  rows={4}
                  value={dripRaw}
                  onChange={(e) => setDripRaw(e.target.value)}
                  placeholder="Paste raw cards here to enqueue for daily automatic release..."
                  className="font-mono text-xs bg-[#080d1e] border-slate-700 text-slate-100 placeholder:text-slate-500 rounded-xl p-3 focus:border-[#38bdf8] shadow-inner"
                />
              </div>

              {dripPreview && (
                <div className="p-3.5 rounded-xl bg-[#162348] border border-[#38bdf8]/40 flex items-center justify-between text-xs flex-wrap gap-2 shadow-md">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span className="font-bold text-emerald-300">
                      {dripPreview.valid} Cards Ready
                    </span>
                    <span className="text-slate-300">
                      (Will drip over approx ~{dripPreview.estimatedDays} days @ {dripPerDay} pcs/day)
                    </span>
                  </div>
                  <Button
                    size="sm"
                    onClick={createQueueHandler}
                    disabled={dripCreating || dripPreview.valid === 0}
                    className="bg-[#38bdf8] hover:bg-[#0ea5e9] text-[#07101f] font-bold h-9 px-4 rounded-lg shadow-md transition"
                  >
                    {dripCreating ? "Saving..." : "Create & Start Drip Queue"}
                  </Button>
                </div>
              )}
            </div>

            {/* Active Queues Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Database className="h-4 w-4 text-[#38bdf8]" />
                  Active Drip Queues ({dripQueues.length})
                </h3>
                <Button
                  size="sm"
                  onClick={loadQueues}
                  disabled={loadingQueues}
                  className="h-8 px-3 text-xs bg-[#121c3b] hover:bg-[#1a2954] text-slate-200 border border-slate-700 font-semibold rounded-lg transition"
                >
                  <RefreshCw className={`mr-1.5 h-3 w-3 ${loadingQueues ? "animate-spin text-[#38bdf8]" : "text-[#38bdf8]"}`} />
                  Refresh
                </Button>
              </div>

              {dripQueues.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400 border border-dashed border-slate-700/80 rounded-xl bg-[#0c1430]">
                  No active drip queues. Create one above to begin automated daily releases.
                </div>
              ) : (
                <div className="space-y-3">
                  {dripQueues.map((q) => {
                    const pct =
                      q.total_cards > 0
                        ? Math.round(((q.total_cards - q.cards_remaining) / q.total_cards) * 100)
                        : 100;
                    return (
                      <div
                        key={q.id}
                        className="p-4 rounded-xl bg-[#121c3b] border border-slate-700/80 space-y-3 hover:border-[#38bdf8]/50 transition shadow-lg"
                      >
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-white">{q.name}</span>
                            <Badge
                              className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-md ${
                                q.status === "active"
                                  ? "border border-emerald-500/50 text-emerald-300 bg-emerald-500/20"
                                  : q.status === "paused"
                                  ? "border border-amber-500/50 text-amber-300 bg-amber-500/20"
                                  : "border border-slate-600 text-slate-400 bg-slate-800"
                              }`}
                            >
                              {q.status}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleManualRelease(q.id)}
                              disabled={releasingQueueId === q.id || q.cards_remaining <= 0}
                              className="h-8 px-3 text-xs bg-gradient-to-r from-[#409eff] to-[#4fc3f7] hover:brightness-110 text-white font-bold rounded-lg shadow-md transition"
                            >
                              <Zap className="h-3.5 w-3.5 mr-1" />
                              {releasingQueueId === q.id
                                ? "Releasing..."
                                : `Release Today's Batch (${Math.min(q.per_day, q.cards_remaining)}) Now`}
                            </Button>

                            {q.status === "active" ? (
                              <Button
                                size="sm"
                                onClick={() => handleQueueAction(q.id, "pause")}
                                className="h-8 px-3 text-xs bg-[#1e293b] hover:bg-[#334155] text-slate-200 border border-slate-600 font-semibold rounded-lg transition"
                              >
                                <Pause className="h-3.5 w-3.5 mr-1 text-amber-400" /> Pause
                              </Button>
                            ) : q.status === "paused" ? (
                              <Button
                                size="sm"
                                onClick={() => handleQueueAction(q.id, "resume")}
                                className="h-8 px-3 text-xs bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/50 font-semibold rounded-lg transition"
                              >
                                <Play className="h-3.5 w-3.5 mr-1 text-emerald-400" /> Resume
                              </Button>
                            ) : null}

                            <Button
                              size="sm"
                              onClick={() => handleQueueAction(q.id, "delete")}
                              className="h-8 w-8 p-0 bg-red-950/60 hover:bg-red-900 text-red-300 border border-red-500/50 font-semibold rounded-lg transition"
                              title="Delete queue"
                            >
                              <Trash2 className="h-3.5 w-3.5 mx-auto" />
                            </Button>
                          </div>
                        </div>

                        {/* Progress bar and details */}
                        <div className="space-y-1.5 text-xs">
                          <div className="flex items-center justify-between text-slate-300 text-[11px]">
                            <span>
                              Remaining: <b className="text-[#38bdf8] font-bold font-mono">{q.cards_remaining}</b> / {q.total_cards} cards
                            </span>
                            <span className="font-mono font-bold text-slate-200">{pct}% Dispatched</span>
                          </div>
                          <Progress value={pct} className="h-2 bg-[#0c1430]" />
                        </div>

                        <div className="flex items-center gap-4 text-[11px] text-slate-300 pt-1.5 border-t border-slate-700/60 flex-wrap">
                          <span>
                            Pace: <b className="text-white font-bold">{q.per_day} cards/day</b>
                          </span>
                          <span>
                            Price: <b className="text-emerald-400 font-mono font-bold">${Number(q.price).toFixed(2)}</b>
                          </span>
                          <span>
                            Last Run:{" "}
                            <b className="text-white font-semibold">
                              {q.last_run_at ? new Date(q.last_run_at).toLocaleString() : "Not run yet"}
                            </b>
                          </span>
                          {q.telegram_broadcast && (
                            <span className="text-[#38bdf8] font-semibold flex items-center gap-1">
                              <Send className="h-3 w-3" /> TG Broadcast Active (@zorushop)
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
