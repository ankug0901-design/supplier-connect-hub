import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, ChevronDown, ChevronRight, Loader2, Plus, Trash2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { n8nPost } from '@/lib/n8n';
import { RfqAttachmentUpload, UploadedFileBadge } from '@/components/RfqAttachmentUpload';

const PRODUCT_CATEGORIES = [
  'Offset Printing', 'Flexographic Printing', 'Digital Printing', 'Screen Printing',
  'Corrugated Packaging', 'Rigid Box / Gift Box', 'Mono Carton / Folding Carton',
  'Flexible Packaging', 'Labels & Stickers', 'POS Display Stand',
  'Wobbler / Shelf Talker', 'Standee / Banner', 'Brochure / Catalogue',
  'CTU', 'Parasite', 'Category Branding', 'Power Wing', 'End cap branding',
  'Bay Breaker', 'Window Kit', 'Shelf Strips', 'Shelf Talker', 'Clip-on',
  'Other',
];
const MATERIALS = [
  'Art Paper', 'Kraft Paper', 'Duplex Board', 'Corrugated (3-ply)', 'Corrugated (5-ply)',
  'SBS Board', 'BOPP', 'PVC', 'Vinyl', 'Fabric/Non-woven', 'Foam Board/Sunboard',
  'Acrylic', 'Metal', 'Wood', 'Plastic', 'Combination of material', 'As per specs',
  'Not sure / Supplier to suggest',
];
const PRINT_PROCESSES = ['Offset CMYK', 'Offset Pantone', 'Digital', 'Flexo', 'Screen Print', 'UV Print', 'Other'];
const FINISHES = [
  'Gloss Lamination', 'Matte Lamination', 'Soft Touch', 'UV Spot', 'Foil Stamping',
  'Powder coating', 'Duco Paint', 'PU Paint', 'UV reverse Printing', 'Other as specified',
  'None', 'Combination',
];
const ARTWORK_STATUSES = ['Final artwork ready', 'Draft artwork attached', 'Artwork in progress', 'No artwork'];

const MANUAL_SUPPLIER = '__manual__';

type Supplier = { company: string; email: string; selectedId?: string };
type DirectorySupplier = { id: string; company: string; name: string; email: string };

type Item = {
  product_category: string;
  product_name: string;
  quantity: string;
  dimensions: string;
  material: string;
  print_process: string;
  finish: string;
  colours: string;
  artwork_status: string;
  extra_specs: string;
  attachment_url: string;
  attachment_name: string;
};

const emptyItem = (): Item => ({
  product_category: '', product_name: '', quantity: '', dimensions: '',
  material: '', print_process: '', finish: '', colours: '',
  artwork_status: '', extra_specs: '', attachment_url: '', attachment_name: '',
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}



export function RfqCreateDrawer({ open, onOpenChange, onSuccess }: Props) {
  const { user, supplier } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  // Client
  const [clientCompany, setClientCompany] = useState('');
  const [clientContact, setClientContact] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [requiredBy, setRequiredBy] = useState<Date | undefined>();
  const [clientBudget, setClientBudget] = useState('');
  // Items
  const [items, setItems] = useState<Item[]>([emptyItem()]);
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  // Timing
  const [closingDate, setClosingDate] = useState<Date | undefined>();
  const [closingTime, setClosingTime] = useState('17:00');
  // Suppliers
  const [suppliers, setSuppliers] = useState<Supplier[]>([{ company: '', email: '' }]);
  const [directory, setDirectory] = useState<DirectorySupplier[]>([]);
  // Special instructions
  const [instructions, setInstructions] = useState('');
  // CC emails
  const [ccEmails, setCcEmails] = useState('');
  // Submitted by
  const [submittedByName, setSubmittedByName] = useState('');
  const [submittedByEmail, setSubmittedByEmail] = useState('');
  // Stable per-drawer-open folder used for uploads before an rfq_id exists.
  const draftFolder = useMemo(() => `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, [open]);

  useEffect(() => {
    if (!open) return;
    setSubmittedByName(supplier?.name || user?.user_metadata?.name || '');
    setSubmittedByEmail(supplier?.email || user?.email || '');
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, company, name, email')
        .order('company', { ascending: true });
      if (!cancelled && !error && data) setDirectory(data as DirectorySupplier[]);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const reset = () => {
    setClientCompany(''); setClientContact(''); setClientEmail(''); setRequiredBy(undefined); setClientBudget('');
    setItems([emptyItem()]); setCollapsed({});
    setClosingDate(undefined); setClosingTime('17:00');
    setSuppliers([{ company: '', email: '' }]);
    setInstructions('');
    setCcEmails('');
  };

  const isUrgent = (() => {
    if (!closingDate) return false;
    const [h, m] = closingTime.split(':').map(Number);
    const target = new Date(closingDate);
    target.setHours(h, m, 0, 0);
    const diff = target.getTime() - Date.now();
    const todayStr = new Date().toDateString();
    return target.toDateString() === todayStr && diff > 0 && diff < 2 * 60 * 60 * 1000;
  })();

  const updateItem = (i: number, patch: Partial<Item>) =>
    setItems((s) => s.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const addItem = () => {
    if (items.length >= 10) return;
    setItems((s) => [...s, emptyItem()]);
  };
  const removeItem = (i: number) => {
    if (items.length === 1) return;
    setItems((s) => s.filter((_, idx) => idx !== i));
    setCollapsed((c) => {
      const next: Record<number, boolean> = {};
      Object.entries(c).forEach(([k, v]) => {
        const n = Number(k);
        if (n < i) next[n] = v;
        else if (n > i) next[n - 1] = v;
      });
      return next;
    });
  };

  const updateSupplier = (i: number, patch: Partial<Supplier>) => {
    setSuppliers((s) => s.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  };
  const addSupplier = () => {
    if (suppliers.length >= 10) return;
    setSuppliers((s) => [...s, { company: '', email: '' }]);
  };
  const removeSupplier = (i: number) => {
    if (i === 0) return;
    setSuppliers((s) => s.filter((_, idx) => idx !== i));
  };
  const pickDirectorySupplier = (i: number, value: string) => {
    if (value === MANUAL_SUPPLIER) {
      updateSupplier(i, { selectedId: MANUAL_SUPPLIER, company: '', email: '' });
      return;
    }
    const found = directory.find((d) => d.id === value);
    if (found) {
      updateSupplier(i, { selectedId: found.id, company: found.company || found.name, email: found.email });
    }
  };

  const validateItems = () => {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.product_name.trim() || !it.quantity.trim()) {
        toast.error(`Item ${i + 1}: product name and quantity are required`);
        return false;
      }
      if (it.attachment_url.trim()) {
        try { new URL(it.attachment_url); } catch {
          toast.error(`Item ${i + 1}: attachment link is not a valid URL`);
          return false;
        }
        if (!it.attachment_name.trim()) {
          toast.error(`Item ${i + 1}: please provide an attachment filename`);
          return false;
        }
      }
    }
    return true;
  };

  const submit = async () => {
    if (!clientCompany || !clientContact || !clientEmail || !requiredBy) {
      toast.error('Please fill all required client details');
      return;
    }
    if (!closingDate || !closingTime) {
      toast.error('RFQ closing date and time are required');
      return;
    }
    const [h, m] = closingTime.split(':').map(Number);
    const closeTarget = new Date(closingDate);
    closeTarget.setHours(h, m, 0, 0);
    if (closeTarget.getTime() <= Date.now()) {
      toast.error('Closing date/time must be in the future');
      return;
    }
    if (!validateItems()) return;
    const validSuppliers = suppliers.filter((s) => s.company.trim() && s.email.trim());
    if (validSuppliers.length === 0) {
      toast.error('At least one supplier (with company and email) is required');
      return;
    }

    const itemsPayload = items.map((it, idx) => ({
      item_number: idx + 1,
      product_category: it.product_category,
      product_name: it.product_name,
      quantity: it.quantity,
      dimensions: it.dimensions,
      material: it.material,
      print_process: it.print_process,
      finish: it.finish,
      colours: it.colours,
      artwork_status: it.artwork_status,
      extra_specs: it.extra_specs,
      attachment_url: it.attachment_url,
      attachment_name: it.attachment_name,
    }));

    const isMulti = items.length > 1;
    const first = items[0];
    // Flat summary fields (backward compatible with existing n8n workflows)
    const joinedNames = isMulti
      ? items.map((it) => it.product_name).filter(Boolean).join(' + ')
      : first.product_name;
    const summaryCategory = isMulti
      ? (items.every((it) => it.product_category === first.product_category) ? first.product_category : 'Multiple')
      : first.product_category;
    const summaryQty = isMulti ? 'Multiple items' : first.quantity;

    const payload: any = {
      client_name: clientContact,
      client_company: clientCompany,
      client_email: clientEmail,
      required_by_date: format(requiredBy, 'yyyy-MM-dd'),
      client_budget: clientBudget,
      // Flat product fields (mirror item 1 for single-item, summary values for multi)
      product_category: summaryCategory,
      product_name: joinedNames,
      quantity: summaryQty,
      dimensions: first.dimensions,
      material: first.material,
      print_process: first.print_process,
      finish: first.finish,
      colours: first.colours,
      artwork_status: first.artwork_status,
      extra_specs: first.extra_specs,
      attachment_url: first.attachment_url,
      attachment_name: first.attachment_name,
      // Timing
      closing_date: format(closingDate, 'yyyy-MM-dd'),
      closing_time: closingTime,
      response_deadline: format(closingDate, 'yyyy-MM-dd'),
      // Suppliers
      suppliers: validSuppliers.map((s) => ({ name: s.company, email: s.email })),
      // Items (new)
      items: itemsPayload,
      is_multi_item: isMulti,
      item_count: items.length,
      // Instructions + submitter
      instructions,
      special_instructions: instructions,
      submitted_by: submittedByName,
      submitted_by_name: submittedByName,
      submitted_by_email: submittedByEmail,
    };

    setSubmitting(true);
    try {
      let res: Awaited<ReturnType<typeof n8nPost>>;
      try {
        res = await n8nPost('rfq-automation-form', payload);
      } catch (networkErr: any) {
        console.error('RFQ submit network error:', networkErr);
        throw new Error(`Network error reaching RFQ service: ${networkErr?.message || 'unknown'}`);
      }
      const bodyText = res.text || '';
      const parsed = res.data;
      const isSuccess = res.ok && (parsed?.success === true || parsed?.success === 'true' || (parsed && parsed.success === undefined));
      if (!isSuccess) {
        const errMsg = parsed?.error || parsed?.message || bodyText || `HTTP ${res.status}`;
        console.error('RFQ submit failed', res.status, bodyText);
        throw new Error(typeof errMsg === 'string' ? errMsg.slice(0, 300) : `HTTP ${res.status}`);
      }
      toast.success(
        isMulti
          ? `RFQ submitted with ${items.length} items — suppliers will be notified ✅`
          : 'RFQ submitted — suppliers will be notified ✅'
      );
      onOpenChange(false);
      reset();
      setTimeout(() => { onSuccess?.(); }, 3000);
    } catch (e: any) {
      toast.error(`Failed to submit RFQ: ${e.message || 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleCollapse = (i: number) =>
    setCollapsed((c) => ({ ...c, [i]: !c[i] }));

  const shouldAutoCollapse = items.length >= 3;

  return (
    <Sheet open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Create New RFQ</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-8">
          {/* Client Details */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Client Details</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Client Company Name *</Label>
                <Input value={clientCompany} onChange={(e) => setClientCompany(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Client Contact Person *</Label>
                <Input value={clientContact} onChange={(e) => setClientContact(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Client Email *</Label>
                <Input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Client Required By *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !requiredBy && 'text-muted-foreground')}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {requiredBy ? format(requiredBy, 'PPP') : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={requiredBy} onSelect={setRequiredBy} disabled={(d) => d < new Date(new Date().toDateString())} initialFocus className={cn('p-3 pointer-events-auto')} />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Client Budget</Label>
                <Input value={clientBudget} onChange={(e) => setClientBudget(e.target.value)} placeholder="optional" />
              </div>
            </div>
          </section>

          {/* Items */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Items ({items.length}/10)
              </h3>
            </div>
            <div className="space-y-3">
              {items.map((it, i) => {
                const isCollapsed = collapsed[i] ?? (shouldAutoCollapse && i > 0);
                return (
                  <div key={i} className="rounded-md border">
                    <button
                      type="button"
                      onClick={() => toggleCollapse(i)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        <span className="text-sm font-semibold">
                          Item {i + 1}: {it.product_name || 'New item'}
                        </span>
                        {it.quantity && (
                          <span className="text-xs text-muted-foreground">· {it.quantity}</span>
                        )}
                      </div>
                      {items.length > 1 && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); removeItem(i); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); removeItem(i); } }}
                          className="rounded p-1 hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`Remove item ${i + 1}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </span>
                      )}
                    </button>
                    {!isCollapsed && (
                      <div className="grid grid-cols-1 gap-3 border-t p-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label>Product Category</Label>
                          <Select value={it.product_category} onValueChange={(v) => updateItem(i, { product_category: v })}>
                            <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                            <SelectContent>{PRODUCT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label>Product Name *</Label>
                          <Input value={it.product_name} onChange={(e) => updateItem(i, { product_name: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label>Quantity *</Label>
                          <Input value={it.quantity} onChange={(e) => updateItem(i, { quantity: e.target.value })} placeholder="e.g. 5000 pcs" />
                        </div>
                        <div className="space-y-1">
                          <Label>Size / Dimensions</Label>
                          <Input value={it.dimensions} onChange={(e) => updateItem(i, { dimensions: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label>Material</Label>
                          <Select value={it.material} onValueChange={(v) => updateItem(i, { material: v })}>
                            <SelectTrigger><SelectValue placeholder="Select material" /></SelectTrigger>
                            <SelectContent>{MATERIALS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label>Print Process</Label>
                          <Select value={it.print_process} onValueChange={(v) => updateItem(i, { print_process: v })}>
                            <SelectTrigger><SelectValue placeholder="Select process" /></SelectTrigger>
                            <SelectContent>{PRINT_PROCESSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label>Finish</Label>
                          <Select value={it.finish} onValueChange={(v) => updateItem(i, { finish: v })}>
                            <SelectTrigger><SelectValue placeholder="Select finish" /></SelectTrigger>
                            <SelectContent>{FINISHES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label>Colours</Label>
                          <Input value={it.colours} onChange={(e) => updateItem(i, { colours: e.target.value })} placeholder="e.g. 4+0 CMYK" />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <Label>Artwork Status</Label>
                          <Select value={it.artwork_status} onValueChange={(v) => updateItem(i, { artwork_status: v })}>
                            <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                            <SelectContent>{ARTWORK_STATUSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <Label>Additional Specifications</Label>
                          <Textarea value={it.extra_specs} onChange={(e) => updateItem(i, { extra_specs: e.target.value })} rows={2} />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label>Attachment (optional)</Label>
                          <RfqAttachmentUpload
                            folder={draftFolder}
                            prefix={String(i + 1)}
                            onUploaded={({ url, name }) => updateItem(i, { attachment_url: url, attachment_name: name })}
                          />
                          {it.attachment_url && it.attachment_name && (
                            <UploadedFileBadge
                              name={it.attachment_name}
                              onClear={() => updateItem(i, { attachment_url: '', attachment_name: '' })}
                            />
                          )}
                          <div className="relative py-1 text-center text-[10px] uppercase tracking-wide text-muted-foreground">
                            <span className="bg-background px-2 relative z-10">or paste a link</span>
                            <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
                          </div>
                          <Input
                            value={it.attachment_url}
                            onChange={(e) => updateItem(i, { attachment_url: e.target.value })}
                            placeholder="https://drive.google.com/file/d/..."
                          />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <Label>Attachment Filename</Label>
                          <Input
                            value={it.attachment_name}
                            onChange={(e) => updateItem(i, { attachment_name: e.target.value })}
                            placeholder="e.g. Quantity_Sheet.xlsx"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {items.length < 10 && (
              <Button variant="outline" size="sm" onClick={addItem}>
                <Plus className="mr-1 h-4 w-4" /> Add another item
              </Button>
            )}
          </section>

          {/* Timing */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">RFQ Timing</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>RFQ Closing Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !closingDate && 'text-muted-foreground')}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {closingDate ? format(closingDate, 'PPP') : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={closingDate} onSelect={setClosingDate} disabled={(d) => d < new Date(new Date().toDateString())} initialFocus className={cn('p-3 pointer-events-auto')} />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1">
                <Label>RFQ Closing Time *</Label>
                <Input type="time" value={closingTime} onChange={(e) => setClosingTime(e.target.value)} />
                <p className="text-xs text-muted-foreground">Time is in IST (Indian Standard Time)</p>
              </div>
            </div>
            {isUrgent && (
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                <Zap className="mr-1 h-3 w-3" /> Urgent closure
              </Badge>
            )}
          </section>

          {/* Suppliers */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Suppliers ({suppliers.length}/10)</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Pick from registered suppliers — or choose "Enter manually" to add an unregistered one.
              Suppliers are shared across all items.
            </p>
            <div className="space-y-3">
              {suppliers.map((s, i) => (
                <div key={i} className="space-y-2 rounded-md border p-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Supplier {i + 1}{i === 0 ? ' *' : ''}</Label>
                    {i > 0 && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeSupplier(i)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <Select
                    value={s.selectedId || ''}
                    onValueChange={(v) => pickDirectorySupplier(i, v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select registered supplier or enter manually" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={MANUAL_SUPPLIER}>✎ Enter manually</SelectItem>
                      {directory.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.company || d.name} — {d.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Input
                      placeholder="Company"
                      value={s.company}
                      onChange={(e) => updateSupplier(i, { company: e.target.value, selectedId: MANUAL_SUPPLIER })}
                    />
                    <Input
                      type="email"
                      placeholder="Email"
                      value={s.email}
                      onChange={(e) => updateSupplier(i, { email: e.target.value, selectedId: MANUAL_SUPPLIER })}
                    />
                  </div>
                </div>
              ))}
            </div>
            {suppliers.length < 10 && (
              <Button variant="outline" size="sm" onClick={addSupplier}>
                <Plus className="mr-1 h-4 w-4" /> Add another supplier
              </Button>
            )}
          </section>

          {/* Special instructions */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Special Instructions</h3>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Any instructions that apply to all items (e.g. delivery location, packaging)"
              rows={3}
            />
          </section>

          {/* Submitted by */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Submitted By</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Your Name</Label>
                <Input value={submittedByName} onChange={(e) => setSubmittedByName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Your Email</Label>
                <Input type="email" value={submittedByEmail} onChange={(e) => setSubmittedByEmail(e.target.value)} />
              </div>
            </div>
          </section>

          <div className="sticky bottom-0 -mx-6 flex justify-end gap-2 border-t bg-background px-6 py-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
            <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={submit} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit RFQ
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
