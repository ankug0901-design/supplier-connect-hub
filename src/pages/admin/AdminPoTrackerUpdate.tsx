import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Loader2, RefreshCw, Factory, Images, X, CheckCircle2, Clock, Send, ChevronDown,
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
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { poTrackerRpc } from '@/lib/poTracker';
import { STAGE_TEMPLATES, prettyStage } from '@/lib/stageTemplates';
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
    overall_status: string | null;
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
        <p className="text-sm font-semibold">{item.item_name || item.description}</p>
        <Badge variant="outline" className="gap-1">
          <Factory className="h-3 w-3" />
          {prettyStage(item.current_stage)}
        </Badge>
      </div>

      <StageBar item={item} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Stage</Label>
          <Select value={stage} onValueChange={setStage}>
            <SelectTrigger><SelectValue placeholder="Select stage" /></SelectTrigger>
            <SelectContent className="bg-popover">
              {stages.map((s) => (
                <SelectItem key={s} value={s}>{prettyStage(s)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        <Label>Photos ({media.length}/{MAX_FILES})</Label>
        <div className="flex flex-wrap gap-2">
          {media.map((m, i) => (
            <div key={m.url} className="relative">
              <img src={m.url} alt={m.filename || 'Update photo'} className="h-16 w-16 rounded-md object-cover" />
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
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => upload(e.target.files)}
        />
      </div>

      <Button onClick={submit} disabled={saving || uploading} className="w-full sm:w-auto">
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
        Post update
      </Button>
    </div>
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
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <button type="button" onClick={onToggle} className="w-full text-left">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold">PO {po.po_number}</p>
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
              <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
            </div>
          </div>
          {lead && (
            <div className="mt-3">
              <StageBar item={lead} />
            </div>
          )}
        </button>

        {expanded && (
          <div className="space-y-3 pt-1">
            {po.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No line items on this PO.</p>
            ) : (
              po.items.map((it) => (
                <ItemUpdateForm key={it.id} po={po} item={it} updatedBy={updatedBy} onDone={onDone} />
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

  const updatedBy = supplier?.name || user?.email || 'Emboss Team';

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: poRows }, { data: updRows }] = await Promise.all([
      supabase
        .from('purchase_orders')
        .select(
          'id, po_number, status, date, updated_at, supplier:suppliers(company, name), client_order:client_orders(id, order_number, client_name, overall_status), items:po_items(id, item_name, description, quantity, current_stage, production_stages, completed_stages)'
        )
        .not('status', 'in', '(closed,cancelled,rejected,void)')
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
                return (
                  <Card key={u.id}>
                    <CardContent className="flex flex-wrap items-start gap-3 p-4">
                      <CheckCircle2
                        className={cn('mt-0.5 h-4 w-4', u.status === 'completed' ? 'text-primary' : 'text-muted-foreground')}
                      />
                      <div className="min-w-0 flex-1">
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
                              <img src={m.url} alt={m.filename || 'Update photo'} className="h-12 w-12 rounded object-cover" />
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
