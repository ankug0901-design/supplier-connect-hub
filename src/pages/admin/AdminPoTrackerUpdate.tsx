import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Loader2, RefreshCw, Factory, Images, X, CheckCircle2, Clock, Send, ChevronDown, ChevronUp, Settings2, Plus, Play, Mail, Truck, Trash2, MapPin, Route,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { poTrackerRpc } from '@/lib/poTracker';
import { STAGE_TEMPLATES, prettyStage } from '@/lib/stageTemplates';
import { moveStage, stageSlug } from '@/lib/stageEditing';
import { n8nPost } from '@/lib/n8n';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const MEDIA_BUCKET = 'po-tracker-media';
const MAX_FILES = 10;
const CUSTOM_STAGE = '__custom__';

const isVideoItem = (m: { type?: string; filename?: string; url?: string }) =>
  (m.type || '').startsWith('video') ||
  /\.(mp4|mov|webm|m4v|avi|mkv)$/i.test(m.filename || m.url || '');

type MediaItem = { url: string; type: string; filename: string };

interface TrackItem {
  id: string;
  item_name: string | null;
  description: string | null;
  quantity: number | string | null;
  current_stage: string | null;
  production_stages: string[] | null;
  completed_stages: string[] | null;
}

interface TrackPO {
  id: string;
  po_number: string;
  status: string | null;
  date: string | null;
  updated_at: string | null;
  supplier: { company: string | null; name: string | null } | null;
  client_order: {
    id: string;
    order_number: string | null;
    client_name: string | null;
    client_email: string | null;
    tracking_token: string | null;
    overall_status: string | null;
    order_date: string | null;
  } | null;
  items: TrackItem[];
}

interface RecentUpdate {
  id: string;
  stage: string;
  status: string | null;
  note: string | null;
  media_urls: any;
  updated_by: string | null;
  created_at: string | null;
  po: { po_number: string | null } | null;
}

interface LogisticsShipment {
  lr_number: string | null;
  courier: string | null;
  current_status: string | null;
  dispatch_date: string | null;
  pickup_date: string | null;
  qty: string | number | null;
  depot_name: string | null;
  depot_code: string | null;
  dm_name: string | null;
  dm_contact: string | null;
  awb_number: string | null;
  item_name: string | null;
}

function stagesFor(item: TrackItem): string[] {
  if (Array.isArray(item.production_stages) && item.production_stages.length > 0) {
    return item.production_stages;
  }
  return STAGE_TEMPLATES.paper_print.stages;
}

function mediaList(raw: any): MediaItem[] {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((m: any) => (typeof m === 'string' ? { url: m, type: 'image', filename: '' } : m))
    .filter((m: any) => m?.url);
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
}

function emailStageLabel(stage?: string | null): string {
  const key = (stage || '').trim().toLowerCase().replace(/\s+/g, '_');
  return key === 'material_sourced' ? 'Material Ordered' : stage ? prettyStage(stage) : 'Not started';
}

async function latestItemThumbnail(poId: string, itemId: string): Promise<string | undefined> {
  try {
    const { data, error } = await supabase
      .from('po_production_updates')
      .select('media_urls')
      .eq('po_id', poId)
      .eq('item_id', itemId)
      .not('media_urls', 'is', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return undefined;
    return mediaList(data?.media_urls).find((media) => !isVideoItem(media) && /^https?:\/\//i.test(media.url))?.url;
  } catch {
    // Optional imagery must never prevent the notification from being sent.
    return undefined;
  }
}

async function trackingEmailMeta(po: TrackPO) {
  const meta = {
    orderNumber: po.client_order?.order_number || po.po_number,
    clientName: po.client_order?.client_name,
    orderDate: po.client_order?.order_date,
    overallStatus: po.client_order?.overall_status,
    trackingToken: po.client_order?.tracking_token,
    clientPoRef: null as string | null,
  };
  if (!po.client_order?.id) return meta;
  try {
    // Dispatch can update the overall order status; do not use stale page state.
    const { data, error } = await supabase.from('client_orders')
      .select('order_date, overall_status, client_po_ref').eq('id', po.client_order.id).maybeSingle();
    if (!error && data) return { ...meta, orderDate: data.order_date, overallStatus: data.overall_status, clientPoRef: data.client_po_ref || null };
  } catch {
    // Keep the existing order details if refreshing the summary fails.
  }
  return meta;
}

function wrapEmailHtml(
  contentHtml: string,
  meta: { orderNumber?: string | null; clientName?: string | null; orderDate?: string | null; overallStatus?: string | null; trackingToken?: string | null; clientPoRef?: string | null },
  items?: Array<{ name: string; stage: string; thumbnailUrl?: string }>,
): string {
  const badge = (stage: string) => {
    const key = stage.toLowerCase().replace(/\s+/g, '_');
    const colors = key === 'delivered' || key === 'completed'
      ? { background: '#dcfce7', text: '#166534' }
      : key === 'dispatched' || key === 'in_transit'
        ? { background: '#dbeafe', text: '#1d4ed8' }
        : key === 'cancelled' || key === 'failed'
          ? { background: '#fee2e2', text: '#991b1b' }
          : key === 'pending' || key === 'not_started'
            ? { background: '#f3f4f6', text: '#4b5563' }
            : { background: '#e0f2f2', text: '#0d7377' };
    return `<span style="display:inline-block;background-color:${colors.background};color:${colors.text};font-size:12px;line-height:18px;font-weight:700;padding:6px 12px;border-radius:999px;">${escapeHtml(emailStageLabel(stage))}</span>`;
  };
  const date = meta.orderDate ? new Date(meta.orderDate) : null;
  const orderDate = date && !isNaN(date.getTime())
    ? date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';
  const summaryItems = [
    { label: 'Order Number', value: meta.orderNumber || '—' },
    { label: 'Client Name', value: meta.clientName || '—' },
    { label: 'Order Date', value: orderDate },
  ];
  if (meta.clientPoRef) {
    summaryItems.push({ label: 'Client PO#', value: meta.clientPoRef });
  }
  const colWidth = meta.clientPoRef ? '25%' : '33%';
  const summary = summaryItems.map(({ label, value }) => `<td width="${colWidth}" valign="top" style="padding:16px 8px;font-size:12px;line-height:18px;word-break:break-word;"><span style="color:#6b7280;">${label}</span><br><strong style="color:#1f2937;font-size:13px;">${escapeHtml(value)}</strong></td>`).join('');
  const itemsTable = items?.length
    ? `<table width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;font-size:14px;line-height:20px;color:#1f2937;">
      <thead><tr><th align="left" scope="col" style="padding:12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:12px;">PRODUCT</th><th align="left" scope="col" style="padding:12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:12px;">STAGE</th></tr></thead>
      <tbody>${items.map((item, index) => {
        const thumbnail = item.thumbnailUrl && /^https?:\/\//i.test(item.thumbnailUrl)
          ? `<td width="72" valign="middle" style="padding-right:12px;"><img src="${escapeHtml(item.thumbnailUrl)}" alt="${escapeHtml(item.name)}" width="60" height="60" style="border-radius:8px;object-fit:cover;"></td>` : '';
        return `<tr style="background-color:${index % 2 === 0 ? '#f9fafb' : '#ffffff'};"><td width="65%" valign="middle" style="padding:16px 12px;border-bottom:1px solid #e5e7eb;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>${thumbnail}<td valign="middle" style="font-size:14px;line-height:20px;font-weight:600;color:#1f2937;word-break:break-word;">${escapeHtml(item.name)}</td></tr></table></td><td valign="middle" style="padding:16px 12px;border-bottom:1px solid #e5e7eb;">${badge(item.stage)}</td></tr>`;
      }).join('')}</tbody></table>` : '';
  const trackButton = meta.trackingToken
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="padding:32px 0 8px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" bgcolor="#0d7377" style="border-radius:6px;box-shadow:0 3px 8px rgba(13,115,119,0.18);"><a href="https://supplierconnect.embossmarketing.in/track?t=${encodeURIComponent(meta.trackingToken)}" style="display:inline-block;background-color:#0d7377;color:#ffffff;font-size:15px;line-height:22px;font-weight:700;padding:16px 36px;border-radius:6px;text-decoration:none;">Track Your Order</a></td></tr></table></td></tr></table>` : '';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Emboss Marketing — Order Update</title></head>
<body style="margin:0;padding:0;background-color:#f9fafb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f9fafb"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;">
<tr><td style="background-color:#0d7377;padding:32px 28px 24px 28px;border-radius:12px 12px 0 0;"><div style="font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:34px;font-weight:900;color:#ffffff;letter-spacing:0.5px;">EMBOSS MARKETING</div><div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;font-weight:600;color:rgba(255,255,255,0.55);letter-spacing:3px;text-transform:uppercase;padding-top:6px;">PRINTING &middot; PACKAGING &middot; POS MATERIALS</div></td></tr>
<tr><td bgcolor="#f9fafb" style="padding:0 16px;border-bottom:1px solid #e5e7eb;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="table-layout:fixed;"><tr>${summary}</tr></table></td></tr>
<tr><td style="padding:24px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding-bottom:8px;font-size:12px;line-height:18px;color:#6b7280;">ORDER STATUS</td></tr><tr><td style="padding-bottom:24px;">${badge(meta.overallStatus || 'Status unavailable')}</td></tr>${(() => {
  const body = contentHtml.trim();
  if (body) return `<tr><td style="padding-bottom:24px;font-size:14px;line-height:24px;color:#1f2937;word-break:break-word;">${body}</td></tr>`;
  const statusKey = (meta.overallStatus || '').toLowerCase().replace(/\s+/g, '_');
  const isDispatch = statusKey === 'dispatched' || statusKey === 'in_transit';
  const defaultText = isDispatch
    ? `<p style="margin:0 0 12px;">We are pleased to inform you that your order has been dispatched. Please find the shipment and tracking details below.</p><p style="margin:0;">For any queries regarding this shipment, please reach out to your Emboss Marketing representative.</p>`
    : `<p style="margin:0 0 12px;">Please find below the latest update on your order. We are committed to delivering quality results on schedule.</p><p style="margin:0;">Should you have any questions, please don't hesitate to contact your Emboss Marketing representative.</p>`;
  return `<tr><td style="padding-bottom:24px;font-size:14px;line-height:24px;color:#1f2937;word-break:break-word;">${defaultText}</td></tr>`;
})()}<tr><td>${itemsTable}</td></tr><tr><td>${trackButton}</td></tr></table></td></tr>
<tr><td bgcolor="#f9fafb" align="center" style="padding:24px;border-top:1px solid #e5e7eb;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="font-size:13px;line-height:20px;font-weight:700;color:#1f2937;">Emboss Marketing LLP</td></tr><tr><td align="center" style="padding-top:4px;font-size:12px;line-height:18px;color:#6b7280;">Gurugram, Haryana</td></tr><tr><td align="center" style="padding-top:16px;font-size:11px;line-height:18px;color:#6b7280;">This is an automated notification. For queries, contact your Emboss Marketing representative.</td></tr><tr><td align="center" style="padding-top:16px;font-size:11px;line-height:18px;color:#6b7280;">Powered by Emboss Marketing</td></tr><tr><td align="center" style="padding-top:16px;font-size:10px;line-height:16px;color:#9ca3af;font-style:italic;">Private and Confidential — Not to be sent outside your organization</td></tr></table></td></tr>
</table></td></tr></table></body></html>`;
}

function fmt(ts?: string | null) {
  if (!ts) return '—';
  const d = new Date(ts);
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Horizontal stage progress bar, same visual language as the tracking page. */
function StageBar({ item }: { item: TrackItem }) {
  const stages = stagesFor(item);
  const completed = new Set(item.completed_stages || []);
  const currentIdx = item.current_stage ? stages.indexOf(item.current_stage) : -1;
  return (
    <div className="flex items-center gap-1">
      {stages.map((s, i) => {
        const done = completed.has(s) || (currentIdx >= 0 && i < currentIdx);
        const active = s === item.current_stage;
        return (
          <div key={s} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={cn(
                'h-1.5 w-full rounded-full',
                done ? 'bg-primary' : active ? 'bg-primary/50' : 'bg-muted'
              )}
            />
            <span
              className={cn(
                'hidden truncate text-[9px] leading-tight sm:block',
                active ? 'font-semibold text-primary' : 'text-muted-foreground'
              )}
              title={prettyStage(s)}
            >
              {prettyStage(s)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function EditStagesDialog({ item, open, onOpenChange, onDone }: {
  item: TrackItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const [names, setNames] = useState<string[]>([]);
  const [template, setTemplate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNames((item.production_stages ?? stagesFor(item)).map(prettyStage));
    setTemplate('');
  }, [open, item.id, item.production_stages]);

  const selectTemplate = (value: string) => {
    if (names.length > 0 && !window.confirm('Replace all current stages? Unsaved stage changes will be lost.')) return;
    setTemplate(value);
    setNames(value === CUSTOM_STAGE ? [] : (STAGE_TEMPLATES[value]?.stages ?? []).map(prettyStage));
  };

  const save = async () => {
    const slugs = names.map(stageSlug);
    if (slugs.some((slug) => !slug)) {
      toast({ title: 'Enter a name for each stage', variant: 'destructive' });
      return;
    }
    if (new Set(slugs).size !== slugs.length) {
      toast({ title: 'Each stage must have a unique name', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const result = await poTrackerRpc({ action: 'set_stages', item_id: item.id, stages: slugs });
      if (result?.ok === false) throw new Error(result.error || 'Unable to save stages');
      await onDone();
      toast({ title: 'Production stages saved' });
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: 'Unable to save stages', description: error?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!saving) onOpenChange(value); }}>
      <DialogContent className="flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Define Stages</DialogTitle>
          <p className="break-words text-sm text-muted-foreground">{item.item_name || item.description || 'Item'}</p>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto p-1">
          <div className="space-y-1.5">
            <Label htmlFor={`${item.id}-stage-template`}>Template</Label>
            <Select value={template} onValueChange={selectTemplate} disabled={saving}>
              <SelectTrigger id={`${item.id}-stage-template`}><SelectValue placeholder="Choose a template" /></SelectTrigger>
              <SelectContent>
                {Object.entries(STAGE_TEMPLATES).map(([key, value]) => (
                  <SelectItem key={key} value={key}>{value.label.split(' (')[0]}</SelectItem>
                ))}
                <SelectItem value={CUSTOM_STAGE}>Custom (start blank)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            {names.map((name, index) => (
              <div key={index} className="flex items-center gap-1.5">
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Move stage ${index + 1} up`} title="Move up" disabled={saving || index === 0} onClick={() => setNames((current) => moveStage(current, index, -1))}><ChevronUp className="h-4 w-4" /></Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Move stage ${index + 1} down`} title="Move down" disabled={saving || index === names.length - 1} onClick={() => setNames((current) => moveStage(current, index, 1))}><ChevronDown className="h-4 w-4" /></Button>
                <Input className="min-w-0 flex-1" aria-label={`Stage ${index + 1} name`} value={name} disabled={saving} placeholder="Stage name" onChange={(event) => setNames((current) => current.map((value, position) => position === index ? event.target.value : value))} />
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground" aria-label={`Delete stage ${index + 1}`} title="Delete stage" disabled={saving} onClick={() => setNames((current) => current.filter((_, position) => position !== index))}><X className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => setNames((current) => [...current, ''])}><Plus className="mr-2 h-4 w-4" />Add Stage</Button>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" disabled={saving} onClick={save}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Stages</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ItemUpdateForm({
  po,
  item,
  updatedBy,
  onDone,
}: {
  po: TrackPO;
  item: TrackItem;
  updatedBy: string;
  onDone: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const stages = stagesFor(item);
  const [stage, setStage] = useState<string>(item.current_stage || stages[0]);
  const [customStage, setCustomStage] = useState('');
  const [status, setStatus] = useState<'completed' | 'in_progress'>('completed');
  const [note, setNote] = useState('');
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dispatchType, setDispatchType] = useState<'single' | 'multi' | ''>('');
  const [shipments, setShipments] = useState<LogisticsShipment[]>([]);
  const [syncedLrNumbers, setSyncedLrNumbers] = useState<Set<string>>(new Set());
  const [fetchingShipments, setFetchingShipments] = useState(false);
  const [syncingShipments, setSyncingShipments] = useState(false);
  const [showSingleDispatch, setShowSingleDispatch] = useState(false);
  const [editStagesOpen, setEditStagesOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (fl: FileList | null) => {
    if (!fl?.length) return;
    const files = Array.from(fl).slice(0, MAX_FILES - media.length);
    setUploading(true);
    try {
      const next: MediaItem[] = [];
      for (const file of files) {
        const path = `${po.id}/${item.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]+/g, '_')}`;
        const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
          contentType: file.type || undefined,
          upsert: false,
        });
        if (error) throw error;
        const url = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
        const isVid =
          (file.type || '').startsWith('video/') || /\.(mp4|mov|webm|m4v|avi|mkv)$/i.test(file.name);
        next.push({ url, type: isVid ? 'video' : 'image', filename: file.name });
      }
      setMedia((m) => [...m, ...next]);
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e?.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const normalizedCustom = customStage.trim().toLowerCase().replace(/\s+/g, '_');
  const isCustom = stage === CUSTOM_STAGE;
  const effectiveStage = isCustom ? normalizedCustom : stage;

  const fetchShipments = async () => {
    const clientName = po.client_order?.client_name?.trim();
    if (!clientName) {
      toast({ title: 'Client name is missing', description: 'A client name is required to fetch logistics shipments.', variant: 'destructive' });
      return;
    }
    setFetchingShipments(true);
    try {
      const response = await fetch(
        `https://n8n.srv1141999.hstgr.cloud/webhook/fetch-logistics-shipments?client_name=${encodeURIComponent(clientName)}`,
      );
      const result = await response.json();
      if (!response.ok || result?.success !== true || !Array.isArray(result?.shipments)) {
        throw new Error(result?.error || `Logistics request failed (${response.status})`);
      }
      setShipments(result.shipments);
      setSyncedLrNumbers(new Set());
      toast({ title: `Fetched ${result.shipments.length} shipments` });
    } catch (e: any) {
      toast({ title: 'Could not fetch shipments', description: e?.message, variant: 'destructive' });
    } finally {
      setFetchingShipments(false);
    }
  };

  const syncShipments = async () => {
    if (shipments.length === 0) return;
    setSyncingShipments(true);
    try {
      const lrNumbers = shipments.map((shipment) => shipment.lr_number).filter((lr): lr is string => Boolean(lr));
      let existingLrs = new Set<string>();
      if (lrNumbers.length > 0) {
        const { data: existing, error: existingError } = await supabase
          .from('po_dispatch')
          .select('lr_number')
          .eq('po_id', po.id)
          .in('lr_number', lrNumbers);
        if (existingError) throw existingError;
        existingLrs = new Set((existing || []).map((row) => row.lr_number).filter((lr): lr is string => Boolean(lr)));
      }

      const seenLrs = new Set(existingLrs);
      const pending = shipments.filter((shipment) => {
        if (!shipment.lr_number) return true;
        if (seenLrs.has(shipment.lr_number)) return false;
        seenLrs.add(shipment.lr_number);
        return true;
      });
      if (pending.length > 0) {
        const { error: insertError } = await supabase.from('po_dispatch').insert(
          pending.map((shipment) => ({
            po_id: po.id,
            client_order_id: po.client_order?.id ?? null,
            item_id: item.id,
            lr_number: shipment.lr_number,
            courier_name: shipment.courier || '',
            dispatch_date: shipment.dispatch_date || shipment.pickup_date || null,
            delivery_status: 'dispatched',
            dispatch_quantity: parseInt(String(shipment.qty ?? ''), 10) || 0,
            receiver_name: shipment.dm_name || '',
            receiver_phone: shipment.dm_contact || '',
            awb_number: shipment.awb_number || '',
            notes: `City: ${shipment.depot_name || 'Unknown'}${shipment.depot_code ? ` (${shipment.depot_code})` : ''}${shipment.item_name ? ` | Item: ${shipment.item_name}` : ''}`,
          })),
        );
        if (insertError) throw insertError;
      }

      const data = await poTrackerRpc({
        action: 'update_production',
        client_order_id: po.client_order?.id ?? null,
        po_id: po.id,
        item_id: item.id,
        stage: 'dispatched',
        status,
        note: `Multi-location dispatch: ${pending.length} shipments synced from logistics`,
        media_urls: media,
        updated_by: updatedBy,
      });
      if (data?.ok === false) throw new Error(data?.error || 'Production update failed');

      setSyncedLrNumbers(new Set(shipments.map((shipment) => shipment.lr_number).filter((lr): lr is string => Boolean(lr))));

      // Auto-send multi-location dispatch email to client
      const clientEmail = po.client_order?.client_email;
      if (clientEmail && pending.length > 0) {
        try {
          const cities = [...new Set(shipments.map(s => s.depot_name).filter(Boolean))];
          const multiHtml = `<p>Your order has been dispatched to ${pending.length} locations!</p>` +
            `<table style="border-collapse:collapse;width:100%;margin:16px 0">` +
            `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Shipments</td><td style="padding:8px;border:1px solid #ddd">${pending.length}</td></tr>` +
            `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Cities</td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(cities.join(', ') || 'Multiple locations')}</td></tr>` +
            `</table>`;

          const thumbnailUrl = await latestItemThumbnail(po.id, item.id);
          const emailMeta = await trackingEmailMeta(po);

          await fetch('https://n8n.srv1141999.hstgr.cloud/webhook/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: clientEmail,
              subject: `Dispatch Update — Order ${po.client_order?.order_number || po.po_number} — ${pending.length} shipments`,
              html: wrapEmailHtml(multiHtml, emailMeta, [{ name: item.item_name || item.description || 'Item', stage: 'Dispatched', thumbnailUrl }]),
            }),
          });
        } catch (_) {
          // Email failure should not block the sync flow
        }
      }

      toast({ title: `Synced ${pending.length} shipments to PO Tracker` });
      setNote('');
      setMedia([]);
      await onDone();
    } catch (e: any) {
      toast({ title: 'Shipment sync failed', description: e?.message, variant: 'destructive' });
    } finally {
      setSyncingShipments(false);
    }
  };

  const submit = async () => {
    if (!effectiveStage) {
      toast({ title: 'Select or type a stage', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const data = await poTrackerRpc({
        action: 'update_production',
        client_order_id: po.client_order?.id ?? null,
        po_id: po.id,
        item_id: item.id,
        stage: effectiveStage,
        status,
        note,
        media_urls: media,
        updated_by: updatedBy,
      });
      if (data?.ok === false) throw new Error(data?.error || 'Update failed');
      toast({ title: 'Production update posted' });
      setNote('');
      setMedia([]);
      if (effectiveStage === 'dispatched' && dispatchType === 'single') setShowSingleDispatch(true);
      await onDone();
    } catch (e: any) {
      toast({ title: 'Update failed', description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="break-words text-sm font-semibold">{item.item_name || item.description}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setEditStagesOpen(true)}><Settings2 className="mr-2 h-3.5 w-3.5" />Define Stages</Button>
        </div>
        <Badge variant="outline" className="gap-1">
          <Factory className="h-3 w-3" />
          {prettyStage(item.current_stage)}
        </Badge>
      </div>

      <StageBar item={item} />
      <EditStagesDialog item={item} open={editStagesOpen} onOpenChange={setEditStagesOpen} onDone={onDone} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Stage</Label>
          <Select value={stage} onValueChange={(value) => {
            setStage(value);
            if (value !== 'dispatched') {
              setDispatchType('');
              setShipments([]);
              setShowSingleDispatch(false);
            }
          }}>
            <SelectTrigger><SelectValue placeholder="Select stage" /></SelectTrigger>
            <SelectContent className="bg-popover">
              {stages.map((s) => (
                <SelectItem key={s} value={s}>{prettyStage(s)}</SelectItem>
              ))}
              <SelectItem value="dispatched">Dispatched</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value={CUSTOM_STAGE}>Other (type a stage)…</SelectItem>
            </SelectContent>
          </Select>
          {isCustom && (
            <>
              <Input
                value={customStage}
                onChange={(e) => setCustomStage(e.target.value)}
                placeholder="Type stage name e.g. Printing"
              />
              {!normalizedCustom && (
                <p className="text-xs text-destructive">Enter a stage name to continue.</p>
              )}
            </>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="bg-popover">
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {stage === 'dispatched' && (
        <div className="space-y-3 rounded-md border bg-background p-3">
          <Label>Dispatch type</Label>
          <RadioGroup
            value={dispatchType}
            onValueChange={(value) => {
              setDispatchType(value as 'single' | 'multi');
              setShowSingleDispatch(false);
              if (value === 'single') setShipments([]);
            }}
            className="grid gap-3 sm:grid-cols-2"
          >
            <Label htmlFor={`${item.id}-single`} className="flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal">
              <RadioGroupItem id={`${item.id}-single`} value="single" className="mt-0.5" />
              <MapPin className="mt-0.5 h-4 w-4 text-primary" />
              <span><span className="block font-medium">Single Location Dispatch</span><span className="text-xs text-muted-foreground">Manual entry for one destination</span></span>
            </Label>
            <Label htmlFor={`${item.id}-multi`} className="flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal">
              <RadioGroupItem id={`${item.id}-multi`} value="multi" className="mt-0.5" />
              <Route className="mt-0.5 h-4 w-4 text-primary" />
              <span><span className="block font-medium">Multi Location Dispatch</span><span className="text-xs text-muted-foreground">Sync shipments from Logistics system</span></span>
            </Label>
          </RadioGroup>

          {dispatchType === 'multi' && (
            <div className="space-y-3 border-t pt-3">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={fetchShipments} disabled={fetchingShipments || syncingShipments}>
                  {fetchingShipments ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Fetch Shipments from Logistics
                </Button>
                {shipments.length > 0 && (
                  <Button type="button" onClick={syncShipments} disabled={syncingShipments}>
                    {syncingShipments ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Truck className="mr-2 h-4 w-4" />}
                    Sync All to PO Tracker
                  </Button>
                )}
              </div>
              {shipments.length > 0 && (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader><TableRow><TableHead>LR Number</TableHead><TableHead>Courier</TableHead><TableHead>Status</TableHead><TableHead>Dispatch Date</TableHead><TableHead>Qty</TableHead><TableHead>City/Depot</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {shipments.map((shipment, index) => {
                        const synced = Boolean(shipment.lr_number && syncedLrNumbers.has(shipment.lr_number));
                        return (
                          <TableRow key={`${shipment.lr_number || 'shipment'}-${index}`}>
                            <TableCell className="font-medium"><span className="flex items-center gap-2">{shipment.lr_number || '—'}{synced && <Badge variant="outline" className="gap-1 border-primary/30 text-primary"><CheckCircle2 className="h-3 w-3" /> Synced</Badge>}</span></TableCell>
                            <TableCell>{shipment.courier || '—'}</TableCell><TableCell>{shipment.current_status || '—'}</TableCell><TableCell>{shipment.dispatch_date || '—'}</TableCell><TableCell>{shipment.qty ?? '—'}</TableCell><TableCell>{shipment.depot_name || '—'}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What was done, any issues, quantities completed…"
        />
      </div>

      <div className="space-y-2">
        <Label>Photos & Videos ({media.length}/{MAX_FILES})</Label>
        <div className="flex flex-wrap gap-2">
          {media.map((m, i) => (
            <div key={m.url} className="relative">
              {isVideoItem(m) ? (
                <div className="relative h-16 w-16 overflow-hidden rounded-md bg-black">
                  <video src={m.url} muted playsInline className="h-full w-full object-cover" />
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <Play className="h-5 w-5 text-white drop-shadow" />
                  </div>
                </div>
              ) : (
                <img src={m.url} alt={m.filename || 'Update photo'} className="h-16 w-16 rounded-md object-cover" />
              )}
              <button
                type="button"
                onClick={() => setMedia((arr) => arr.filter((_, idx) => idx !== i))}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {media.length < MAX_FILES && (
            <Button
              type="button"
              variant="outline"
              className="h-16 w-16 flex-col gap-1"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Images className="h-4 w-4" />}
              <span className="text-[10px]">Add</span>
            </Button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => upload(e.target.files)}
        />
      </div>

      {dispatchType !== 'multi' && (
      <Button onClick={submit} disabled={saving || uploading || !effectiveStage || (stage === 'dispatched' && !dispatchType)} className="w-full sm:w-auto">
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
        Post update
      </Button>
      )}

      {showSingleDispatch && (
        <AdminDispatchForm po={po} item={item} updatedBy={updatedBy} onDone={onDone} />
      )}
    </div>
  );
}

function AdminDispatchForm({
  po,
  item,
  updatedBy,
  onDone,
}: {
  po: TrackPO;
  item: TrackItem;
  updatedBy: string;
  onDone: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(true);
  const [form, setForm] = useState({
    vehicle_number: '', dispatch_quantity: '', transporter_name: '', lr_number: '', driver_name: '',
    driver_phone: '', eway_bill_number: '', expected_arrival: '', notes: '',
  });
  const [vehicleMedia, setVehicleMedia] = useState<MediaItem[]>([]);
  const [ewayMedia, setEwayMedia] = useState<MediaItem[]>([]);
  const [busyA, setBusyA] = useState(false);
  const [busyB, setBusyB] = useState(false);
  const [saving, setSaving] = useState(false);
  const vehicleRef = useRef<HTMLInputElement>(null);
  const ewayRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const uploadTo = async (
    fl: FileList | null,
    existing: MediaItem[],
    setBusy: (b: boolean) => void,
    setItems: React.Dispatch<React.SetStateAction<MediaItem[]>>,
    inputRef: React.RefObject<HTMLInputElement>,
  ) => {
    if (!fl?.length) return;
    const files = Array.from(fl).slice(0, MAX_FILES - existing.length);
    setBusy(true);
    try {
      const next: MediaItem[] = [];
      for (const file of files) {
        const path = `${po.id}/${item.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]+/g, '_')}`;
        const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
          contentType: file.type || undefined,
          upsert: false,
        });
        if (error) throw error;
        const url = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
        const isVid =
          (file.type || '').startsWith('video/') || /\.(mp4|mov|webm|m4v|avi|mkv)$/i.test(file.name);
        next.push({ url, type: isVid ? 'video' : 'image', filename: file.name });
      }
      setItems((m) => [...m, ...next]);
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e?.message, variant: 'destructive' });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const submit = async () => {
    if (!form.vehicle_number.trim()) {
      toast({ title: 'Vehicle number is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const data = await poTrackerRpc({
        action: 'mark_dispatched',
        client_order_id: po.client_order?.id ?? null,
        po_id: po.id,
        item_id: item.id,
        ...form,
        dispatch_quantity: form.dispatch_quantity || null,
        vehicle_photo_url: vehicleMedia[0]?.url || null,
        eway_bill_url: ewayMedia[0]?.url || null,
        loading_photo_urls: vehicleMedia,
        updated_by: updatedBy,
        notify_client: true,
      });
      if (data?.ok === false) throw new Error(data?.error || 'Dispatch failed');

      // Auto-send dispatch email to client
      const clientEmail = po.client_order?.client_email;
      if (clientEmail) {
        try {
          const dispatchHtml = `<p>Your order has been dispatched!</p>` +
            `<table style="border-collapse:collapse;width:100%;margin:16px 0">` +
            (form.transporter_name ? `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Transporter</td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(form.transporter_name)}</td></tr>` : '') +
            (form.vehicle_number ? `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Vehicle</td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(form.vehicle_number)}</td></tr>` : '') +
            (form.lr_number ? `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">LR / Docket</td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(form.lr_number)}</td></tr>` : '') +
            (form.dispatch_quantity ? `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Quantity</td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(form.dispatch_quantity)}</td></tr>` : '') +
            (form.expected_arrival ? `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Expected Arrival</td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(form.expected_arrival)}</td></tr>` : '') +
            `</table>`;

          const thumbnailUrl = await latestItemThumbnail(po.id, item.id);
          const emailMeta = await trackingEmailMeta(po);

          await fetch('https://n8n.srv1141999.hstgr.cloud/webhook/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: clientEmail,
              subject: `Dispatch Update — Order ${po.client_order?.order_number || po.po_number}`,
              html: wrapEmailHtml(dispatchHtml, emailMeta, [{ name: item.item_name || item.description || 'Item', stage: 'Dispatched', thumbnailUrl }]),
            }),
          });
        } catch (_) {
          // Email failure should not block the dispatch flow
        }
      }

      toast({ title: 'Dispatch details submitted' });
      setOpen(false);
      await onDone();
    } catch (e: any) {
      toast({ title: 'Dispatch failed', description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const renderUploader = (
    label: string,
    files: MediaItem[],
    setFiles: React.Dispatch<React.SetStateAction<MediaItem[]>>,
    busy: boolean,
    inputRef: React.RefObject<HTMLInputElement>,
    setBusy: (b: boolean) => void,
  ) => (
    <div className="space-y-2">
      <Label>{label} ({files.length}/{MAX_FILES})</Label>
      <div className="flex flex-wrap gap-2">
        {files.map((m, i) => (
          <div key={m.url} className="relative">
            {isVideoItem(m) ? (
              <div className="relative h-16 w-16 overflow-hidden rounded-md bg-black">
                <video src={m.url} muted playsInline className="h-full w-full object-cover" />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <Play className="h-5 w-5 text-white drop-shadow" />
                </div>
              </div>
            ) : (
              <img src={m.url} alt={m.filename || label} className="h-16 w-16 rounded-md object-cover" />
            )}
            <button
              type="button"
              onClick={() => setFiles((arr) => arr.filter((_, idx) => idx !== i))}
              className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {files.length < MAX_FILES && (
          <Button
            type="button"
            variant="outline"
            className="h-16 w-16 flex-col gap-1"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Images className="h-4 w-4" />}
            <span className="text-[10px]">Add</span>
          </Button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => uploadTo(e.target.files, files, setBusy, setFiles, inputRef)}
      />
    </div>
  );

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center gap-2">
        <Truck className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">Ready for dispatch — {item.item_name || item.description}</p>
      </div>
      <Button className="mt-3 w-full gap-2 sm:w-auto" variant={open ? 'outline' : 'default'} onClick={() => setOpen((v) => !v)}>
        {open ? 'Cancel' : 'Submit Dispatch Details'}
      </Button>

      {open && (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
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
                  type={key === 'dispatch_quantity' ? 'number' : 'text'}
                  placeholder={key === 'dispatch_quantity' && item.quantity ? `Ordered: ${item.quantity}` : undefined}
                  value={form[key]}
                  onChange={set(key)}
                />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label>Expected arrival</Label>
              <Input type="date" value={form.expected_arrival} onChange={set('expected_arrival')} />
            </div>
          </div>

          {renderUploader('Vehicle loaded photo', vehicleMedia, setVehicleMedia, busyA, vehicleRef, setBusyA)}
          {renderUploader('E-way bill photo', ewayMedia, setEwayMedia, busyB, ewayRef, setBusyB)}

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={3} value={form.notes} onChange={set('notes')} />
          </div>

          <Button className="w-full gap-2 sm:w-auto" onClick={submit} disabled={saving || busyA || busyB}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />} Submit Dispatch
          </Button>
        </div>
      )}
    </div>
  );
}

function ItemUpdateHistory({ po_id, item_id }: { po_id: string; item_id: string }) {
  const [updates, setUpdates] = useState<Omit<RecentUpdate, 'po'>[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    const loadHistory = async () => {
      setLoading(true);
      setError(false);
      try {
        const { data, error: queryError } = await supabase
          .from('po_production_updates')
          .select('id, stage, status, note, media_urls, updated_by, created_at')
          .eq('po_id', po_id)
          .or(`item_id.eq.${item_id},item_id.is.null`)
          .order('created_at', { ascending: false });
        if (queryError) throw queryError;
        if (active) setUpdates(data || []);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadHistory();
    return () => { active = false; };
  }, [po_id, item_id]);

  return (
    <section className="min-w-0 space-y-2 border-t pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Production History</h3>
        <Button type="button" variant="ghost" size="sm" aria-expanded={open} aria-controls={`history-${item_id}`} onClick={() => setOpen((value) => !value)} className="gap-1.5">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {open ? 'Hide History' : 'Show History'}{!loading && !error ? ` (${updates.length})` : ''}
        </Button>
      </div>
      {open && (
        <div id={`history-${item_id}`} className="space-y-2">
          {loading ? <p className="text-xs text-muted-foreground">Loading history…</p> : error ? <p role="alert" className="text-xs text-destructive">Unable to load production history.</p> : updates.length === 0 ? <p className="text-xs text-muted-foreground">No production updates yet.</p> : updates.map((update) => (
            <article key={update.id} className="space-y-2 rounded-md border bg-background p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{prettyStage(update.stage)}</span>
                <Badge variant={update.status === 'completed' ? 'secondary' : 'outline'}>{prettyStage(update.status)}</Badge>
              </div>
              {update.note && <p className="whitespace-pre-wrap break-words text-sm">{update.note}</p>}
              {mediaList(update.media_urls).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {mediaList(update.media_urls).map((media, index) => (
                    <a key={`${media.url}-${index}`} href={media.url} target="_blank" rel="noreferrer" aria-label={media.filename || (isVideoItem(media) ? 'Open update video' : 'Open update photo')} className="relative block h-16 w-16 overflow-hidden rounded border bg-muted">
                      {isVideoItem(media) ? <><video src={media.url} muted playsInline preload="metadata" className="h-full w-full object-cover" /><span className="pointer-events-none absolute inset-0 flex items-center justify-center"><Play className="h-4 w-4 text-primary" /></span></> : <img src={media.url} alt={media.filename || 'Update photo'} loading="lazy" className="h-full w-full object-cover" />}
                    </a>
                  ))}
                </div>
              )}
              <p className="break-words text-xs text-muted-foreground">{fmt(update.created_at)} · {update.updated_by || 'Unknown'}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function POCard({
  po,
  expanded,
  onToggle,
  updatedBy,
  onDone,
}: {
  po: TrackPO;
  expanded: boolean;
  onToggle: () => void;
  updatedBy: string;
  onDone: () => Promise<void> | void;
}) {
  const lead = po.items[0];
  const { toast } = useToast();
  const [emailOpen, setEmailOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailCc, setEmailCc] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [updateCount, setUpdateCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const loadCount = async () => {
      try {
        const { count, error } = await supabase
          .from('po_production_updates')
          .select('id', { count: 'exact', head: true })
          .eq('po_id', po.id);
        if (active) setUpdateCount(error ? null : count);
      } catch {
        if (active) setUpdateCount(null);
      }
    };
    void loadCount();
    return () => { active = false; };
  }, [po.id]);

  const openEmail = () => {
    setEmailTo(po.client_order?.client_email || '');
    setEmailCc('');
    setEmailSubject(`Production Update — PO ${po.po_number}`);
    setEmailBody('');
    setEmailOpen(true);
  };

  const sendEmail = async () => {
    if (!emailTo.trim()) { toast({ title: 'Recipient is required', variant: 'destructive' }); return; }
    setSending(true);
    try {
      const mappedItems = await Promise.all((po.items || []).map(async (it) => ({
        name: it.item_name || it.description || 'Item',
        stage: emailStageLabel(it.current_stage),
        thumbnailUrl: await latestItemThumbnail(po.id, it.id),
      })));
      const emailMeta = await trackingEmailMeta(po);
      const emailRes = await fetch('https://n8n.srv1141999.hstgr.cloud/webhook/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: emailTo.trim(),
          cc: emailCc.trim(),
          subject: emailSubject,
          html: wrapEmailHtml(emailBody.replace(/\n/g, '<br/>'), emailMeta, mappedItems),
        }),
      });
      if (!emailRes.ok) throw new Error(`Email send failed (${emailRes.status})`);
      toast({ title: 'Email sent' });
      setEmailOpen(false);
    } catch (e: any) {
      toast({ title: 'Failed to send email', description: e?.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div role="button" tabIndex={0} onClick={onToggle} className="w-full cursor-pointer text-left">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">PO {po.po_number}</p>
                {updateCount !== null && <Badge variant="secondary">{updateCount} {updateCount === 1 ? 'update' : 'updates'}</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">
                {po.client_order?.client_name || 'Unlinked client'}
                {po.client_order?.order_number ? ` · Order ${po.client_order.order_number}` : ''}
              </p>
              <p className="text-xs text-muted-foreground">
                Supplier: {po.supplier?.company || po.supplier?.name || '—'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <Clock className="h-3 w-3" />
                {fmt(po.updated_at)}
              </Badge>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={(e) => { e.stopPropagation(); openEmail(); }}
              >
                <Mail className="h-3.5 w-3.5" /> Send Email
              </Button>
              <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
            </div>
          </div>
          {lead && (
            <div className="mt-3">
              <StageBar item={lead} />
            </div>
          )}
        </div>

        <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Send email — PO {po.po_number}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>To</Label>
                <Input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="client@example.com" />
              </div>
              <div className="space-y-1">
                <Label>Cc (comma separated)</Label>
                <Input value={emailCc} onChange={(e) => setEmailCc(e.target.value)} placeholder="optional" />
              </div>
              <div className="space-y-1">
                <Label>Subject</Label>
                <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Message</Label>
                <Textarea rows={6} value={emailBody} onChange={(e) => setEmailBody(e.target.value)} placeholder="Optional note to include…" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEmailOpen(false)} disabled={sending}>Cancel</Button>
              <Button onClick={sendEmail} disabled={sending} className="gap-2">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {expanded && (
          <div className="space-y-3 pt-1">
            {po.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No line items on this PO.</p>
            ) : (
              po.items.map((it) => (
                <div key={it.id} className="space-y-3">
                  <ItemUpdateForm po={po} item={it} updatedBy={updatedBy} onDone={onDone} />
                  <ItemUpdateHistory po_id={po.id} item_id={it.id} />
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminPoTrackerUpdate() {
  const { supplier, user } = useAuth();
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState<TrackPO[]>([]);
  const [updates, setUpdates] = useState<RecentUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();

  const updatedBy = supplier?.name || user?.email || 'Emboss Team';

  const handleDeleteUpdate = async (updateId: string) => {
    if (!window.confirm('Delete this update? This cannot be undone.')) return;
    setDeletingId(updateId);
    try {
      const data = await poTrackerRpc({ action: 'delete_update', update_id: updateId });
      if (data?.ok === false) throw new Error(data?.error || 'Delete failed');
      toast({ title: 'Update deleted' });
      await load();
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e?.message, variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: poRows }, { data: updRows }] = await Promise.all([
      supabase
        .from('purchase_orders')
        .select(
          'id, po_number, status, date, updated_at, supplier:suppliers(company, name), client_order:client_orders(id, order_number, client_name, client_email, tracking_token, overall_status, order_date), items:po_items(id, item_name, description, quantity, current_stage, production_stages, completed_stages)'
        )
        .not('status', 'in', '(cancelled,rejected,void)')
        .order('date', { ascending: false })
        .limit(300),
      supabase
        .from('po_production_updates')
        .select('id, stage, status, note, media_urls, updated_by, created_at, po:purchase_orders(po_number)')
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    setPos((poRows as any[] as TrackPO[]) || []);
    setUpdates((updRows as any[] as RecentUpdate[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pos.slice(0, 25);
    return pos
      .filter((p) =>
        [p.po_number, p.client_order?.client_name, p.client_order?.order_number]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      )
      .slice(0, 50);
  }, [pos, query]);

  return (
    <DashboardLayout
      title="PO Production Updates"
      subtitle="Post production progress on behalf of suppliers"
      actions={
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
          Refresh
        </Button>
      }
    >
      <div className="space-y-6">

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by PO number, client name or order number…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : results.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No matching purchase orders.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {results.map((po) => (
              <POCard
                key={po.id}
                po={po}
                expanded={expandedId === po.id}
                onToggle={() => setExpandedId((id) => (id === po.id ? null : po.id))}
                updatedBy={updatedBy}
                onDone={load}
              />
            ))}
          </div>
        )}

        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Recent updates</h2>
          {updates.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">No production updates yet.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {updates.map((u) => {
                const media = mediaList(u.media_urls);
                const isDeleting = deletingId === u.id;
                return (
                  <Card key={u.id}>
                    <CardContent className="relative flex flex-wrap items-start gap-3 p-4">
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => handleDeleteUpdate(u.id)}
                        className="absolute right-3 top-3 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                        aria-label="Delete update"
                        title="Delete update"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <CheckCircle2
                        className={cn('mt-0.5 h-4 w-4', u.status === 'completed' ? 'text-primary' : 'text-muted-foreground')}
                      />
                      <div className="min-w-0 flex-1 pr-6">
                        <p className="text-sm font-medium">
                          {prettyStage(u.stage)}
                          {u.po?.po_number ? ` · PO ${u.po.po_number}` : ''}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {u.updated_by || 'Unknown'} · {fmt(u.created_at)} · {u.status || 'completed'}
                        </p>
                        {u.note && <p className="mt-1 text-sm">{u.note}</p>}
                      </div>
                      {media.length > 0 && (
                        <div className="flex gap-1">
                          {media.slice(0, 4).map((m) => (
                            <a key={m.url} href={m.url} target="_blank" rel="noreferrer">
                              {isVideoItem(m) ? (
                                <div className="relative h-12 w-12 overflow-hidden rounded bg-black">
                                  <video src={m.url} muted playsInline className="h-full w-full object-cover" />
                                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                    <Play className="h-4 w-4 text-white drop-shadow" />
                                  </div>
                                </div>
                              ) : (
                                <img src={m.url} alt={m.filename || 'Update photo'} className="h-12 w-12 rounded object-cover" />
                              )}
                            </a>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
