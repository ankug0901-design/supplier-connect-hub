import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { prettyStage } from '@/lib/stageTemplates';

import {
  Factory, Loader2, RefreshCw, ChevronLeft, Camera, Images, X, CheckCircle2,
  Truck, Clock, AlertTriangle, Package, Send, Trash2,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { poTrackerRpc } from '@/lib/poTracker';
import { n8nPost } from '@/lib/n8n';
import { cn } from '@/lib/utils';

const MEDIA_BUCKET = 'po-tracker-media';
const MAX_FILES = 5;

type MediaItem = { url: string; type: string; filename: string };

interface ProdItem {
  id: string;
  item_name: string;
  quantity: number | string;
  current_stage: string | null;
  completed_stages: string[] | null;
  production_stages: string[] | null;
}

interface ProdPO {
  id?: string;
  po_id?: string;
  po_number: string;
  status?: string;
  expected_delivery?: string | null;
  client_order?: {
    id?: string;
    client_order_id?: string;
    order_number?: string;
    client_name?: string;
    expected_delivery?: string | null;
    overall_status?: string;
    tracking_token?: string | null;
  } | null;
  items?: ProdItem[];
  production_updates?: any[];
}




function daysUntil(date?: string | null) {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function DueBadge({ date }: { date?: string | null }) {
  const days = daysUntil(date);
  if (days === null) return null;
  const overdue = days < 0;
  const soon = days >= 0 && days < 3;
  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1 border',
        overdue
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : soon
            ? 'border-warning/30 bg-warning/10 text-warning'
            : 'border-border bg-muted text-muted-foreground'
      )}
    >
      <Clock className="h-3 w-3" />
      {overdue ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d left`}
    </Badge>
  );
}

/** Compress an image to max 1920px wide, JPEG 80%. Non-images pass through. */
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1920 / bitmap.width);
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.8));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

function MediaUploader({
  files,
  setFiles,
  uploading,
  onUpload,
  label = 'Photos / Video',
}: {
  files: MediaItem[];
  setFiles: (f: MediaItem[]) => void;
  uploading: boolean;
  onUpload: (fileList: FileList | null) => void;
  label?: string;
}) {
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="flex gap-2">
        <input
          ref={camRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => { onUpload(e.target.files); e.target.value = ''; }}
        />
        <input
          ref={galRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => { onUpload(e.target.files); e.target.value = ''; }}
        />
        <Button type="button" variant="outline" className="h-12 flex-1 gap-2" disabled={uploading} onClick={() => camRef.current?.click()}>
          <Camera className="h-5 w-5" /> Camera
        </Button>
        <Button type="button" variant="outline" className="h-12 flex-1 gap-2" disabled={uploading} onClick={() => galRef.current?.click()}>
          <Images className="h-5 w-5" /> Gallery
        </Button>
      </div>
      {uploading && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
        </p>
      )}
      {files.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {files.map((f, i) => (
            <div key={f.url + i} className="relative overflow-hidden rounded-lg border border-border">
              {f.type.startsWith('video') ? (
                <video src={f.url} className="h-20 w-full object-cover" />
              ) : (
                <img src={f.url} alt={f.filename} className="h-20 w-full object-cover" />
              )}
              <button
                type="button"
                onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                className="absolute right-1 top-1 rounded-full bg-background/90 p-1 shadow"
                aria-label="Remove file"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Max {MAX_FILES} files.</p>
    </div>
  );
}

export default function ProductionOrders() {
  const { toast } = useToast();
  const { supplier, isReadOnly } = useAuth();
  const [pos, setPos] = useState<ProdPO[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ProdPO | null>(null);
  const [detail, setDetail] = useState<ProdPO | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supplier?.id) return;
    setLoading(true);
    try {
      const data = await poTrackerRpc({ action: 'supplier_items', supplier_id: supplier.id });
      const raw: any[] = Array.isArray(data) ? data : (data?.rows ?? data?.orders ?? data?.data ?? []);
      const list: ProdPO[] = Array.isArray(raw)
        ? raw
            .filter((r: any) => r && r.po_number)
            .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
        : [];
      setPos(list);
    } catch (e: any) {
      toast({ title: 'Could not load production orders', description: e?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [supplier?.id, toast]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (po: ProdPO) => {
    setSelected(po);
    setDetail(po);
    setDetailLoading(true);
    try {
      const orderId = po.client_order?.id || po.client_order?.client_order_id;
      if (orderId) {
        const data = await poTrackerRpc({ action: 'get_detail', order_id: orderId });
        const d = Array.isArray(data) ? data[0] : (data?.data ?? data);
        const poList: any[] = d?.purchase_orders || d?.pos || [];
        const match = poList.find((p: any) => p.po_number === po.po_number);
        if (match) {
          setDetail({ ...po, ...match, client_order: po.client_order, production_updates: d?.production_updates || match.production_updates || [] });
        } else if (d?.production_updates) {
          setDetail({ ...po, production_updates: d.production_updates });
        }
      }
    } catch {
      /* keep list data */
    } finally {
      setDetailLoading(false);
    }
  };

  if (selected && detail) {
    return (
      <PODetailView
        po={detail}
        loading={detailLoading}
        readOnly={isReadOnly}
        supplierName={supplier?.name || ''}
        onBack={() => { setSelected(null); setDetail(null); load(); }}
        onRefresh={async () => { await load(); await openDetail(selected); }}
        onLightbox={setLightbox}
        lightbox={lightbox}
        closeLightbox={() => setLightbox(null)}
      />
    );
  }

  return (
    <DashboardLayout
      title="Production Orders"
      subtitle="Update production progress and dispatch details"
      actions={
        <Button variant="outline" className="h-11 gap-2" onClick={load} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Refresh
        </Button>
      }
    >
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : pos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Factory className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">No production orders yet</p>
            <p className="text-sm text-muted-foreground">POs with production tracking enabled will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {pos.map((po, idx) => {
            const items = po.items || [];
            const totalStages = items.reduce((s, i) => s + (i.production_stages?.length || 0), 0);
            const doneStages = items.reduce((s, i) => s + (i.completed_stages?.length || 0), 0);
            const pct = totalStages ? Math.round((doneStages / totalStages) * 100) : 0;
            const due = po.expected_delivery || po.client_order?.expected_delivery;
            return (
              <button
                key={(po.po_id || po.id || po.po_number) + idx}
                onClick={() => openDetail(po)}
                className="rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-bold">{po.po_number}</p>
                    <p className="text-xs text-muted-foreground">Emboss Marketing</p>
                  </div>
                  <DueBadge date={due} />
                </div>

                <div className="mt-3 space-y-1.5">
                  {items.slice(0, 4).map((it) => (
                    <div key={it.id} className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm">{it.item_name}</span>
                      <Badge variant="secondary" className="shrink-0 text-[10px]">{prettyStage(it.current_stage)}</Badge>
                    </div>
                  ))}
                  {items.length > 4 && (
                    <p className="text-xs text-muted-foreground">+{items.length - 4} more items</p>
                  )}
                </div>

                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                    <span>Progress</span>
                    <span>{pct}%</span>
                  </div>
                  <Progress value={pct} className="h-2" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-3xl p-2">
          {lightbox && <img src={lightbox} alt="Update media" className="max-h-[80vh] w-full object-contain" />}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

/* ------------------------------- Detail view ------------------------------ */

function PODetailView({
  po, loading, readOnly, supplierName, onBack, onRefresh, onLightbox, lightbox, closeLightbox,
}: {
  po: ProdPO;
  loading: boolean;
  readOnly: boolean;
  supplierName: string;
  onBack: () => void;
  onRefresh: () => Promise<void>;
  onLightbox: (url: string) => void;
  lightbox: string | null;
  closeLightbox: () => void;
}) {
  const { toast } = useToast();
  const clientOrderId = po.client_order?.id || po.client_order?.client_order_id || null;
  const poId = po.po_id || po.id || null;
  const updates: any[] = po.production_updates || [];

  const uploadFiles = async (fileList: FileList | null, existing: MediaItem[], setBusy: (b: boolean) => void, setItems: (m: MediaItem[]) => void) => {
    if (!fileList || fileList.length === 0) return;
    const incoming = Array.from(fileList).slice(0, MAX_FILES - existing.length);
    if (incoming.length === 0) {
      toast({ title: `Maximum ${MAX_FILES} files`, variant: 'destructive' });
      return;
    }
    setBusy(true);
    const added: MediaItem[] = [];
    try {
      for (const original of incoming) {
        const file = await compressImage(original);
        // Uploads are scoped to the PO folder so storage policies can verify ownership.
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_');
        const path = `${poId}/${Date.now()}_${safeName}`;
        const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
          upsert: true, contentType: file.type,
        });
        if (error) throw error;
        const publicUrl = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
        added.push({ url: publicUrl, type: file.type, filename: file.name });
      }
      setItems([...existing, ...added]);
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e?.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashboardLayout
      title={po.po_number}
      subtitle="Emboss Marketing"
      actions={
        <Button variant="outline" className="h-11 gap-2" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
      }
    >
      {loading && (
        <p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading latest details…
        </p>
      )}

      <div className="space-y-4">
        {(po.items || []).map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            readOnly={readOnly}
            clientOrderId={clientOrderId}
            poId={poId}
            poNumber={po.po_number}
            clientOrder={po.client_order}
            supplierName={supplierName}
            uploadFiles={uploadFiles}
            onDone={onRefresh}
          />
        ))}

        {/* Update history */}
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Package className="h-4 w-4" /> Update History
            </h3>
            {updates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No updates yet.</p>
            ) : (
              <ol className="space-y-4 border-l border-border pl-4">
                {updates.map((u: any, i: number) => {
                  const media: any[] = Array.isArray(u.media_urls) ? u.media_urls : [];
                  return (
                    <li key={u.id || i} className="relative">
                      <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{prettyStage(u.stage)}</span>
                        <Badge variant="secondary" className="text-[10px]">{prettyStage(u.status)}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {u.created_at ? new Date(u.created_at).toLocaleString() : ''}
                        </span>
                      </div>
                      {u.note && <p className="mt-1 text-sm text-muted-foreground">{u.note}</p>}
                      {media.length > 0 && (
                        <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
                          {media.map((m: any, mi: number) => {
                            const url = typeof m === 'string' ? m : m.url;
                            const type = typeof m === 'string' ? '' : m.type || '';
                            return type.startsWith('video') ? (
                              <video key={mi} src={url} controls className="h-16 w-full rounded-md object-cover" />
                            ) : (
                              <img
                                key={mi}
                                src={url}
                                alt="Production update"
                                onClick={() => onLightbox(url)}
                                className="h-16 w-full cursor-pointer rounded-md object-cover"
                              />
                            );
                          })}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!lightbox} onOpenChange={(o) => !o && closeLightbox()}>
        <DialogContent className="max-w-3xl p-2">
          {lightbox && <img src={lightbox} alt="Update media" className="max-h-[80vh] w-full object-contain" />}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

/* -------------------------------- Item card ------------------------------- */

function ItemCard({
  item, readOnly, clientOrderId, poId, poNumber, clientOrder, supplierName, uploadFiles, onDone,
}: {
  item: ProdItem;
  readOnly: boolean;
  clientOrderId: string | null;
  poId: string | null;
  poNumber: string;
  clientOrder: ProdPO['client_order'];
  supplierName: string;
  uploadFiles: (fl: FileList | null, existing: MediaItem[], setBusy: (b: boolean) => void, setItems: (m: MediaItem[]) => void) => Promise<void>;
  onDone: () => Promise<void>;
}) {
  const { toast } = useToast();
  const stages = item.production_stages || [];
  const completed = item.completed_stages || [];
  const [showForm, setShowForm] = useState(false);
  const [stage, setStage] = useState(item.current_stage || stages[0] || '');
  const [status, setStatus] = useState<'in_progress' | 'completed'>('in_progress');
  const [note, setNote] = useState('');
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const readyForDispatch =
    item.current_stage === 'ready_for_dispatch' ||
    (stages.length > 0 && completed.length >= stages.length);

  const submit = async () => {
    if (!stage) { toast({ title: 'Select a stage', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const data = await poTrackerRpc({
        action: 'update_production',
        client_order_id: clientOrderId,
        po_id: poId,
        item_id: item.id,
        stage,
        status,
        note,
        media_urls: media,
        updated_by: supplierName,
      });
      if (data?.ok === false) throw new Error(data?.error || 'Update failed');
      toast({ title: 'Production update submitted' });
      n8nPost('notify-emboss-team', {
        po_number: poNumber,
        order_number: clientOrder?.order_number || '',
        client_name: clientOrder?.client_name || '',
        tracking_token: clientOrder?.tracking_token || '',
        item_name: item.item_name,
        stage,
        status,
        note,
        supplier_name: supplierName,
      }).catch(() => {});
      setShowForm(false);
      setNote('');
      setMedia([]);
      await onDone();
    } catch (e: any) {
      toast({ title: 'Update failed', description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{item.item_name}</p>
            <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
          </div>
          <Badge variant="secondary">{prettyStage(item.current_stage)}</Badge>
        </div>

        {/* Stage pills */}
        <div className="flex flex-wrap gap-2">
          {stages.map((s) => {
            const done = completed.includes(s);
            const current = item.current_stage === s;
            return (
              <button
                key={s}
                type="button"
                disabled={readOnly}
                onClick={() => { setStage(s); setStatus(done ? 'completed' : 'in_progress'); setShowForm(true); }}
                className={cn(
                  'inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors',
                  done
                    ? 'border-success/30 bg-success/10 text-success'
                    : current
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted'
                )}
              >
                {done && <CheckCircle2 className="h-4 w-4" />}
                {prettyStage(s)}
              </button>
            );
          })}
        </div>

        {!readOnly && (
          <Button className="h-12 w-full gap-2" variant={showForm ? 'outline' : 'default'} onClick={() => setShowForm((v) => !v)}>
            <Factory className="h-4 w-4" /> {showForm ? 'Cancel' : 'Update Status'}
          </Button>
        )}

        {showForm && !readOnly && (
          <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
            <div className="space-y-2">
              <Label>Stage</Label>
              <div className="flex flex-wrap gap-2">
                {stages.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStage(s)}
                    className={cn(
                      'min-h-[44px] rounded-lg border px-3 text-sm',
                      stage === s ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background'
                    )}
                  >
                    {prettyStage(s)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <div className="grid grid-cols-2 gap-2">
                {(['in_progress', 'completed'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={cn(
                      'min-h-[44px] rounded-lg border text-sm font-medium',
                      status === s ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'
                    )}
                  >
                    {s === 'in_progress' ? 'In Progress' : 'Completed'}
                  </button>
                ))}
              </div>
            </div>

            <MediaUploader
              files={media}
              setFiles={setMedia}
              uploading={busy}
              onUpload={(fl) => uploadFiles(fl, media, setBusy, setMedia)}
            />

            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Anything the team should know…" />
            </div>

            <Button className="h-12 w-full gap-2" onClick={submit} disabled={saving || busy}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit Update
            </Button>
          </div>
        )}

        {readyForDispatch && !readOnly && (
          <DispatchForm
            itemId={item.id}
            clientOrderId={clientOrderId}
            poId={poId}
            poNumber={poNumber}
            clientOrder={clientOrder}
            supplierName={supplierName}
            itemQuantity={item.quantity}
            uploadFiles={uploadFiles}
            onDone={onDone}
          />
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------ Dispatch form ----------------------------- */

function DispatchForm({
  itemId, clientOrderId, poId, poNumber, clientOrder, supplierName, itemQuantity, uploadFiles, onDone,
}: {
  itemId: string;
  clientOrderId: string | null;
  poId: string | null;
  poNumber: string;
  clientOrder: ProdPO['client_order'];
  supplierName: string;
  itemQuantity?: number | string;
  uploadFiles: (fl: FileList | null, existing: MediaItem[], setBusy: (b: boolean) => void, setItems: (m: MediaItem[]) => void) => Promise<void>;
  onDone: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    vehicle_number: '', dispatch_quantity: '', transporter_name: '', lr_number: '', driver_name: '',
    driver_phone: '', eway_bill_number: '', expected_arrival: '', notes: '',
  });
  const [vehicleMedia, setVehicleMedia] = useState<MediaItem[]>([]);
  const [ewayMedia, setEwayMedia] = useState<MediaItem[]>([]);
  const [busyA, setBusyA] = useState(false);
  const [busyB, setBusyB] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.vehicle_number.trim()) {
      toast({ title: 'Vehicle number is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const data = await poTrackerRpc({
        action: 'dispatch',
        client_order_id: clientOrderId,
        po_id: poId,
        item_id: itemId,
        ...form,
        dispatch_quantity: form.dispatch_quantity || null,
        vehicle_photo_url: vehicleMedia[0]?.url || null,
        eway_bill_url: ewayMedia[0]?.url || null,
        loading_photo_urls: vehicleMedia,
        updated_by: supplierName,
        notify_client: true,
      });
      if (data?.ok === false) throw new Error(data?.error || 'Dispatch failed');
      toast({ title: 'Dispatch details submitted' });
      n8nPost('notify-emboss-team', {
        po_number: poNumber,
        order_number: clientOrder?.order_number || '',
        client_name: clientOrder?.client_name || '',
        tracking_token: clientOrder?.tracking_token || '',
        item_name: '',
        stage: 'dispatched',
        status: 'completed',
        note: form.notes || form.vehicle_number,
        supplier_name: supplierName,
      }).catch(() => {});
      setOpen(false);
      await onDone();
    } catch (e: any) {
      toast({ title: 'Dispatch failed', description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center gap-2">
        <Truck className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">Ready for dispatch</p>
      </div>
      <Button className="mt-3 h-12 w-full gap-2" variant={open ? 'outline' : 'default'} onClick={() => setOpen((v) => !v)}>
        {open ? 'Cancel' : 'Submit Dispatch Details'}
      </Button>

      {open && (
        <div className="mt-4 space-y-3">
          {([
            ['vehicle_number', 'Vehicle number *'],
            ['dispatch_quantity', 'Quantity being dispatched'],
            ['transporter_name', 'Transporter name'],
            ['lr_number', 'LR / Docket number'],
            ['driver_name', 'Driver name'],
            ['driver_phone', 'Driver phone'],
            ['eway_bill_number', 'E-way bill number'],
          ] as const).map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <Label>{label}</Label>
              <Input
                className="h-12"
                type={key === 'dispatch_quantity' ? 'number' : 'text'}
                placeholder={key === 'dispatch_quantity' && itemQuantity ? `Ordered: ${itemQuantity}` : undefined}
                value={form[key]}
                onChange={set(key)}
              />
            </div>
          ))}
          <div className="space-y-1.5">
            <Label>Expected arrival</Label>
            <Input type="date" className="h-12" value={form.expected_arrival} onChange={set('expected_arrival')} />
          </div>

          <MediaUploader
            label="Vehicle loaded photo"
            files={vehicleMedia}
            setFiles={setVehicleMedia}
            uploading={busyA}
            onUpload={(fl) => uploadFiles(fl, vehicleMedia, setBusyA, setVehicleMedia)}
          />
          <MediaUploader
            label="E-way bill photo"
            files={ewayMedia}
            setFiles={setEwayMedia}
            uploading={busyB}
            onUpload={(fl) => uploadFiles(fl, ewayMedia, setBusyB, setEwayMedia)}
          />

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={3} value={form.notes} onChange={set('notes')} />
          </div>

          <Button className="h-12 w-full gap-2" onClick={submit} disabled={saving || busyA || busyB}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />} Submit Dispatch
          </Button>
        </div>
      )}
    </div>
  );
}
