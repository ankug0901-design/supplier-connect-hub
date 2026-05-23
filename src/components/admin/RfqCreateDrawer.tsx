import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Loader2, Plus, Trash2, Zap, Paperclip, X } from 'lucide-react';
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

const N8N_CREATE = 'https://n8n.srv1141999.hstgr.cloud/webhook/rfq-automation-form';

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
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB cap for base64 payload

type Supplier = { company: string; email: string; selectedId?: string };
type DirectorySupplier = { id: string; company: string; name: string; email: string };
type Attachment = { name: string; type: string; size: number; data: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export function RfqCreateDrawer({ open, onOpenChange, onSuccess }: Props) {
  const { user, supplier } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  // Client
  const [clientCompany, setClientCompany] = useState('');
  const [clientContact, setClientContact] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [requiredBy, setRequiredBy] = useState<Date | undefined>();
  const [clientBudget, setClientBudget] = useState('');
  // Product
  const [productCategory, setProductCategory] = useState('');
  const [productName, setProductName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [dimensions, setDimensions] = useState('');
  const [material, setMaterial] = useState('');
  const [printProcess, setPrintProcess] = useState('');
  const [finish, setFinish] = useState('');
  const [colours, setColours] = useState('');
  const [artworkStatus, setArtworkStatus] = useState('');
  const [extraSpecs, setExtraSpecs] = useState('');
  // Timing
  const [closingDate, setClosingDate] = useState<Date | undefined>();
  const [closingTime, setClosingTime] = useState('17:00');
  // Suppliers
  const [suppliers, setSuppliers] = useState<Supplier[]>([{ company: '', email: '' }]);
  const [directory, setDirectory] = useState<DirectorySupplier[]>([]);
  // Attachments
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  // Submitted by
  const [submittedByName, setSubmittedByName] = useState('');
  const [submittedByEmail, setSubmittedByEmail] = useState('');

  useEffect(() => {
    if (!open) return;
    setSubmittedByName(supplier?.name || user?.user_metadata?.name || '');
    setSubmittedByEmail(supplier?.email || user?.email || '');
    // Load supplier directory for the dropdown (only when drawer opens)
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, company, name, email')
        .order('company', { ascending: true });
      if (!cancelled && !error && data) setDirectory(data as DirectorySupplier[]);
    })();
    return () => { cancelled = true; };
    // Intentionally exclude supplier/user — they change reference on every auth
    // token refresh and would cause the form to re-fetch and reset repeatedly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const reset = () => {
    setClientCompany(''); setClientContact(''); setClientEmail(''); setRequiredBy(undefined); setClientBudget('');
    setProductCategory(''); setProductName(''); setQuantity(''); setDimensions(''); setMaterial('');
    setPrintProcess(''); setFinish(''); setColours(''); setArtworkStatus(''); setExtraSpecs('');
    setClosingDate(undefined); setClosingTime('17:00');
    setSuppliers([{ company: '', email: '' }]);
    setAttachments([]);
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

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const accepted: Attachment[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_BYTES) {
        toast.error(`${file.name} exceeds 8 MB limit`);
        continue;
      }
      try {
        const data = await fileToBase64(file);
        accepted.push({ name: file.name, type: file.type || 'application/octet-stream', size: file.size, data });
      } catch {
        toast.error(`Failed to read ${file.name}`);
      }
    }
    if (accepted.length) setAttachments((prev) => [...prev, ...accepted]);
  };
  const removeAttachment = (i: number) => setAttachments((prev) => prev.filter((_, idx) => idx !== i));

  const submit = async () => {
    // Required validation
    if (!clientCompany || !clientContact || !clientEmail || !requiredBy) {
      toast.error('Please fill all required client details');
      return;
    }
    if (!productName || !quantity) {
      toast.error('Product name and quantity are required');
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
    const validSuppliers = suppliers.filter((s) => s.company.trim() && s.email.trim());
    if (validSuppliers.length === 0) {
      toast.error('At least one supplier (with company and email) is required');
      return;
    }

    const payload = {
      client_name: clientContact,
      client_company: clientCompany,
      client_email: clientEmail,
      required_by_date: format(requiredBy, 'yyyy-MM-dd'),
      client_budget: clientBudget,
      product_category: productCategory,
      product_name: productName,
      quantity,
      dimensions,
      material,
      print_process: printProcess,
      finish,
      colours,
      artwork_status: artworkStatus,
      extra_specs: extraSpecs,
      closing_date: format(closingDate, 'yyyy-MM-dd'),
      closing_time: closingTime,
      response_deadline: format(closingDate, 'yyyy-MM-dd'),
      suppliers: validSuppliers.map((s) => ({ name: s.company, email: s.email })),
      attachments: attachments.map((a) => ({
        filename: a.name,
        mime_type: a.type,
        size: a.size,
        content_base64: a.data,
      })),
      submitted_by: submittedByName,
      submitted_by_name: submittedByName,
      submitted_by_email: submittedByEmail,
    };

    setSubmitting(true);
    try {
      let res: Response;
      try {
        res = await fetch(N8N_CREATE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          mode: 'cors',
        });
      } catch (networkErr: any) {
        console.error('RFQ submit network error:', networkErr);
        throw new Error(`Network error reaching RFQ service: ${networkErr?.message || 'unknown'}`);
      }
      const bodyText = await res.text().catch(() => '');
      let parsed: any = null;
      try { parsed = bodyText ? JSON.parse(bodyText) : null; } catch { /* non-JSON */ }
      const isSuccess = res.ok && (parsed?.success === true || parsed?.success === 'true' || (parsed && parsed.success === undefined));
      if (!isSuccess) {
        const errMsg = parsed?.error || parsed?.message || bodyText || `HTTP ${res.status}`;
        console.error('RFQ submit failed', res.status, bodyText);
        throw new Error(typeof errMsg === 'string' ? errMsg.slice(0, 300) : `HTTP ${res.status}`);
      }
      toast.success('RFQ submitted — suppliers will be notified ✅');
      onOpenChange(false);
      reset();
      setTimeout(() => { onSuccess?.(); }, 3000);
    } catch (e: any) {
      toast.error(`Failed to submit RFQ: ${e.message || 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  };

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

          {/* Product Details */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Product Details</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Product Category</Label>
                <Select value={productCategory} onValueChange={setProductCategory}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>{PRODUCT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Product Name / Item Description *</Label>
                <Input value={productName} onChange={(e) => setProductName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Quantity Required *</Label>
                <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 5000 pcs" />
              </div>
              <div className="space-y-1">
                <Label>Size / Dimensions</Label>
                <Input value={dimensions} onChange={(e) => setDimensions(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Material</Label>
                <Select value={material} onValueChange={setMaterial}>
                  <SelectTrigger><SelectValue placeholder="Select material" /></SelectTrigger>
                  <SelectContent>{MATERIALS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Print Process</Label>
                <Select value={printProcess} onValueChange={setPrintProcess}>
                  <SelectTrigger><SelectValue placeholder="Select process" /></SelectTrigger>
                  <SelectContent>{PRINT_PROCESSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Finish</Label>
                <Select value={finish} onValueChange={setFinish}>
                  <SelectTrigger><SelectValue placeholder="Select finish" /></SelectTrigger>
                  <SelectContent>{FINISHES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Colours</Label>
                <Input value={colours} onChange={(e) => setColours(e.target.value)} placeholder="e.g. 4+0 CMYK" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Artwork Status</Label>
                <Select value={artworkStatus} onValueChange={setArtworkStatus}>
                  <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                  <SelectContent>{ARTWORK_STATUSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Additional Specifications</Label>
                <Textarea value={extraSpecs} onChange={(e) => setExtraSpecs(e.target.value)} rows={3} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Attachments</Label>
                <div className="flex items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent">
                    <Paperclip className="h-4 w-4" />
                    <span>Choose files</span>
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
                    />
                  </label>
                  <span className="text-xs text-muted-foreground">Max 8 MB per file</span>
                </div>
                {attachments.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {attachments.map((a, i) => (
                      <li key={i} className="flex items-center justify-between rounded border px-2 py-1 text-sm">
                        <span className="truncate">{a.name} <span className="text-xs text-muted-foreground">({Math.round(a.size / 1024)} KB)</span></span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeAttachment(i)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
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
