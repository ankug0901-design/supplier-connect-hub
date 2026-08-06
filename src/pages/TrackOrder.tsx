import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { prettyStage } from "@/lib/stageTemplates";
import { Check, Loader2, Package, Truck, CheckCircle2, Play, X, Copy } from "lucide-react";

const TEAL = "#0d7377";
const ENDPOINT = "https://n8n.srv1141999.hstgr.cloud/webhook/po-track";

type MediaItem = { url: string; type?: string };

type TrackData = {
  ok?: boolean;
  order?: {
    order_number?: string;
    client_name?: string;
    order_date?: string;
    expected_delivery?: string;
    overall_status?: string;
    delivery_proof_urls?: (string | MediaItem)[];
    delivered_at?: string;
  };
  items?: Array<{
    id?: string;
    item_name?: string;
    quantity?: number | string;
    current_stage?: string;
    production_stages?: string[];
    completed_stages?: string[];
  }>;
  production_updates?: Array<{
    id?: string;
    stage?: string;
    note?: string;
    created_at?: string;
    media_urls?: (string | MediaItem)[];
  }>;
  dispatch?: Array<{
    id?: string;
    vehicle_number?: string;
    transporter_name?: string;
    lr_number?: string;
    expected_arrival?: string;
    vehicle_photo_url?: string;
  }>;
};

const STEPS = [
  { key: "order_received", label: "Order Received" },
  { key: "material_sourced", label: "Material Sourced" },
  { key: "in_production", label: "In Production" },
  { key: "dispatched", label: "Dispatched" },
  { key: "delivered", label: "Delivered" },
];

const STAGE_COLORS: Record<string, string> = {
  order_received: "bg-slate-100 text-slate-700 border-slate-200",
  material_sourced: "bg-blue-50 text-blue-700 border-blue-200",
  in_production: "bg-amber-50 text-amber-700 border-amber-200",
  dispatched: "bg-purple-50 text-purple-700 border-purple-200",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

function titleize(v?: string) {
  if (!v) return "—";
  return prettyStage(v.replace(/-/g, "_"));
}

function fmtDate(v?: string) {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(v?: string) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function relative(v?: string) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

function normalizeMedia(list?: (string | MediaItem)[]): MediaItem[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((m) => (typeof m === "string" ? { url: m } : m))
    .filter((m) => m && m.url)
    .map((m) => ({
      url: m.url,
      type: m.type || (/\.(mp4|mov|webm|avi|m4v)(\?|$)/i.test(m.url) ? "video" : "photo"),
    }));
}

function Brand() {
  return (
    <div>
      <div className="text-lg font-extrabold tracking-tight sm:text-xl">
        <span style={{ color: TEAL }}>EMBOSS</span> <span className="text-slate-900">MARKETING</span>
      </div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-[11px]">
        Printing · Packaging · POS Materials
      </div>
    </div>
  );
}

export default function TrackOrder() {
  const [params] = useSearchParams();
  const token = params.get("t") || "";
  const [data, setData] = useState<TrackData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lightbox, setLightbox] = useState<MediaItem | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(
    async (initial = false) => {
      if (!token) {
        setError(true);
        setLoading(false);
        return;
      }
      if (initial) setLoading(true);
      try {
        const res = await fetch(`${ENDPOINT}?t=${encodeURIComponent(token)}`);
        const raw = await res.json();
        const json: TrackData = Array.isArray(raw) ? raw[0] : raw;
        if (!res.ok || !json || json.ok === false || !json.order) {
          setError(true);
        } else {
          setData(json);
          setError(false);
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    load(true);
    const id = setInterval(() => load(false), 60000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    document.title = "Track Your Order · Emboss Marketing";
  }, []);

  const order = data?.order;
  const status = (order?.overall_status || "order_received").toLowerCase();
  const currentIdx = Math.max(0, STEPS.findIndex((s) => s.key === status));
  const dispatchList = data?.dispatch || [];
  const updates = [...(data?.production_updates || [])].sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );
  const proofs = normalizeMedia(order?.delivery_proof_urls);

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Header */}
      <header className="border-b border-slate-100 bg-white">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Brand />
          {order && (
            <div className="text-left sm:text-right">
              <div className="text-sm font-bold text-slate-900">{order.order_number || "—"}</div>
              <div className="text-xs text-slate-500">Ordered {fmtDate(order.order_date)}</div>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        {loading && <Skeleton />}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-100 bg-slate-50/60 px-6 py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm">
              <Package className="h-7 w-7 text-slate-400" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Order not found</h1>
            <p className="mt-2 max-w-sm text-sm text-slate-500">
              This tracking link is invalid or has expired. Please check the link shared with you, or contact your
              Emboss Marketing representative.
            </p>
          </div>
        )}

        {!loading && !error && order && (
          <div className="space-y-8">
            {/* Greeting */}
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Hello{order.client_name ? `, ${order.client_name}` : ""} 👋
              </h1>
              <p className="mt-1 text-sm text-slate-500">Here's the live status of your order.</p>
              <button
                onClick={copyLink}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <Copy className="h-3.5 w-3.5" /> {copied ? "Link copied" : "Copy tracking link"}
              </button>
            </div>

            {/* Progress */}
            <section className="rounded-2xl border border-slate-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-6">
              <div className="flex items-start">
                {STEPS.map((s, i) => {
                  const done = i < currentIdx || status === "delivered";
                  const active = i === currentIdx && status !== "delivered";
                  return (
                    <div key={s.key} className="flex flex-1 flex-col items-center">
                      <div className="flex w-full items-center">
                        <div className={`h-0.5 flex-1 ${i === 0 ? "bg-transparent" : done || active ? "" : "bg-slate-200"}`} style={i !== 0 && (done || active) ? { backgroundColor: TEAL } : undefined} />
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${active ? "animate-pulse" : ""}`}
                          style={
                            done || active
                              ? { backgroundColor: TEAL, borderColor: TEAL }
                              : { backgroundColor: "#fff", borderColor: "#e2e8f0" }
                          }
                        >
                          {done ? (
                            <Check className="h-4 w-4 text-white" />
                          ) : active ? (
                            <Loader2 className="h-4 w-4 animate-spin text-white" />
                          ) : (
                            <div className="h-2 w-2 rounded-full bg-slate-300" />
                          )}
                        </div>
                        <div className={`h-0.5 flex-1 ${i === STEPS.length - 1 ? "bg-transparent" : i < currentIdx ? "" : "bg-slate-200"}`} style={i !== STEPS.length - 1 && i < currentIdx ? { backgroundColor: TEAL } : undefined} />
                      </div>
                      <div
                        className={`mt-2 px-0.5 text-center text-[10px] font-medium leading-tight sm:text-xs ${
                          done || active ? "text-slate-900" : "text-slate-400"
                        }`}
                      >
                        {s.label}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-center text-sm">
                <span className="text-slate-500">Estimated delivery: </span>
                <span className="font-semibold" style={{ color: TEAL }}>
                  {fmtDate(order.expected_delivery)}
                </span>
              </div>
            </section>

            {/* Delivered banner */}
            {status === "delivered" && (
              <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                  <div className="font-semibold text-emerald-800">
                    Delivered on {fmtDate(order.delivered_at || order.expected_delivery)}
                  </div>
                </div>
                {proofs.length > 0 && (
                  <MediaGrid items={proofs} onOpen={setLightbox} className="mt-4" />
                )}
              </section>
            )}

            {/* Items */}
            {(data?.items?.length || 0) > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Order Items</h2>
                <div className="space-y-3">
                  {data!.items!.map((it, idx) => {
                    const completed = (it.completed_stages || []).map((s) => s.toLowerCase());
                    return (
                      <div key={it.id || idx} className="rounded-2xl border border-slate-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="font-semibold text-slate-900">{it.item_name || "Item"}</div>
                            <div className="text-xs text-slate-500">Qty: {it.quantity ?? "—"}</div>
                          </div>
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                              STAGE_COLORS[(it.current_stage || "").toLowerCase()] || "bg-slate-100 text-slate-700 border-slate-200"
                            }`}
                          >
                            {titleize(it.current_stage)}
                          </span>
                        </div>
                        {(it.production_stages?.length || 0) > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {it.production_stages!.map((st) => {
                              const done = completed.includes(st.toLowerCase());
                              return (
                                <span
                                  key={st}
                                  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                                    done
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                      : "border-slate-200 bg-slate-50 text-slate-400"
                                  }`}
                                >
                                  {titleize(st)}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Timeline */}
            {updates.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Production Updates</h2>
                <div className="relative pl-6">
                  <div className="absolute bottom-2 left-[7px] top-2 w-px bg-slate-200" />
                  <div className="space-y-6">
                    {updates.map((u, idx) => {
                      const media = normalizeMedia(u.media_urls);
                      return (
                        <div key={u.id || idx} className="relative">
                          <div
                            className="absolute -left-6 top-1.5 h-[15px] w-[15px] rounded-full border-2 border-white"
                            style={{ backgroundColor: idx === 0 ? TEAL : "#cbd5e1", boxShadow: "0 0 0 1px #e2e8f0" }}
                          />
                          <div className="font-semibold text-slate-900">{titleize(u.stage)}</div>
                          <div className="text-xs text-slate-400">
                            {relative(u.created_at)} · {fmtDateTime(u.created_at)}
                          </div>
                          {u.note && <p className="mt-1.5 text-sm text-slate-600">{u.note}</p>}
                          {media.length > 0 && <MediaGrid items={media} onOpen={setLightbox} className="mt-3" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}

            {/* Dispatch */}
            {dispatchList.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Dispatch Details</h2>
                <div className="space-y-3">
                  {dispatchList.map((d, idx) => (
                    <div key={d.id || idx} className="rounded-2xl border border-slate-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                      <div className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
                        <Truck className="h-4 w-4" style={{ color: TEAL }} /> In Transit
                      </div>
                      <dl className="grid grid-cols-2 gap-3 text-sm">
                        <Field label="Vehicle Number" value={d.vehicle_number} />
                        <Field label="Transporter" value={d.transporter_name} />
                        <Field label="LR Number" value={d.lr_number} />
                        <Field label="Expected Arrival" value={fmtDate(d.expected_arrival)} />
                      </dl>
                      {d.vehicle_photo_url && (
                        <MediaGrid
                          items={[{ url: d.vehicle_photo_url, type: "photo" }]}
                          onOpen={setLightbox}
                          className="mt-4"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      <footer className="mt-10 border-t border-slate-100 py-8 text-center">
        <Brand />
        <p className="mt-3 text-xs text-slate-400">Emboss Marketing LLP · Gurugram, Haryana</p>
      </footer>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setLightbox(null)}
        >
          <button className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white" onClick={() => setLightbox(null)}>
            <X className="h-5 w-5" />
          </button>
          {lightbox.type === "video" ? (
            <video src={lightbox.url} controls autoPlay className="max-h-[85vh] max-w-full rounded-lg" onClick={(e) => e.stopPropagation()} />
          ) : (
            <img src={lightbox.url} alt="Order update" className="max-h-[85vh] max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="font-medium text-slate-800">{value || "—"}</dd>
    </div>
  );
}

function MediaGrid({ items, onOpen, className = "" }: { items: MediaItem[]; onOpen: (m: MediaItem) => void; className?: string }) {
  return (
    <div className={`grid grid-cols-3 gap-2 sm:grid-cols-4 ${className}`}>
      {items.map((m, i) => (
        <button
          key={i}
          onClick={() => onOpen(m)}
          className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
        >
          {m.type === "video" ? (
            <>
              <video src={m.url} className="h-full w-full object-cover" muted />
              <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                <Play className="h-6 w-6 fill-white text-white" />
              </span>
            </>
          ) : (
            <img src={m.url} alt="Update media" loading="lazy" className="h-full w-full object-cover" />
          )}
        </button>
      ))}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-2/3 rounded bg-slate-100" />
      <div className="h-28 rounded-2xl bg-slate-100" />
      <div className="h-24 rounded-2xl bg-slate-100" />
      <div className="h-24 rounded-2xl bg-slate-100" />
      <div className="h-40 rounded-2xl bg-slate-100" />
    </div>
  );
}
