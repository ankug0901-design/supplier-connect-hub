import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { AssetInput, assetLabel, errorMessage } from '@/lib/assetLibrary';
import { ASSET_TYPES } from '@/lib/assetRules';
type LinkOption = { id: string; label: string };
function LinkSearch({ kind, value, onChange }: { kind: 'po' | 'rfq'; value: string | null; onChange: (id: string | null) => void }) {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<LinkOption[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      const term = search.replace(/[,%()]/g, '').trim();
      const query = kind === 'po' ? supabase.from('purchase_orders').select('id,po_number').ilike('po_number', `%${term}%`).order('date', { ascending: false }).limit(30) : supabase.from('rfq_portal_requests').select('rfq_id,product_name').ilike('rfq_id', `%${term}%`).order('created_at', { ascending: false }).limit(60);
      const { data, error: err } = await query;
      if (!active) return;
      setError(err ? errorMessage(err) : '');
      const options = (data || []).map(r => 'po_number' in r ? { id: r.id, label: r.po_number } : { id: r.rfq_id, label: `${r.rfq_id} · ${r.product_name}` });
      setRows([...new Map(options.map(r => [r.id, r])).values()]);
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [kind, search]);
  return <div className="space-y-2"><Input aria-label={`Search linked ${kind.toUpperCase()}`} placeholder={`Search ${kind.toUpperCase()} number`} value={search} onChange={e => setSearch(e.target.value)} /><Select value={value || 'none'} onValueChange={v => onChange(v === 'none' ? null : v)}><SelectTrigger aria-label={`Linked ${kind.toUpperCase()}`}><SelectValue placeholder="Not linked" /></SelectTrigger><SelectContent><SelectItem value="none">Not linked</SelectItem>{value && !rows.some(r => r.id === value) && <SelectItem value={value}>{value}</SelectItem>}{rows.map(r => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}</SelectContent></Select>{error && <p role="alert" className="text-xs text-destructive">{error}</p>}</div>;
}
export const emptyAssetInput: AssetInput = { name: '', description: '', asset_type: 'artwork', category: '', sub_category: '', client_name: '', tags: [], linked_po_id: null, linked_rfq_id: null, status: 'draft' };
export function AssetFields({ value, onChange, clients, showName = true }: { value: AssetInput; onChange: (value: AssetInput) => void; clients: string[]; showName?: boolean }) {
  const [tag, setTag] = useState('');
  const patch = (field: keyof AssetInput, data: string | string[] | null) => onChange({ ...value, [field]: data });
  return <div className="space-y-4">
    {showName && <div className="space-y-1.5"><Label htmlFor="asset-name">Name *</Label><Input id="asset-name" value={value.name} onChange={e => patch('name', e.target.value)} required maxLength={250} /></div>}
    <div className="space-y-1.5"><Label htmlFor="asset-description">Description</Label><Textarea id="asset-description" value={value.description || ''} onChange={e => patch('description', e.target.value)} rows={3} /></div>
    <div className="space-y-1.5"><Label>Asset Type</Label><Select value={value.asset_type} onValueChange={v => patch('asset_type', v)}><SelectTrigger aria-label="Asset Type"><SelectValue /></SelectTrigger><SelectContent>{ASSET_TYPES.map(type => <SelectItem key={type} value={type}>{assetLabel(type)}</SelectItem>)}</SelectContent></Select></div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="asset-category">Category</Label><Input id="asset-category" list="asset-categories" value={value.category || ''} onChange={e => patch('category', e.target.value)} /><datalist id="asset-categories">{['Packaging', 'POSM', 'Label', 'Brochure', 'Sticker', 'Poster', 'Danglers', 'Shelf Strip', 'Standee'].map(c => <option key={c} value={c} />)}</datalist></div><div className="space-y-1.5"><Label htmlFor="asset-subcategory">Sub-category</Label><Input id="asset-subcategory" value={value.sub_category || ''} onChange={e => patch('sub_category', e.target.value)} /></div></div>
    <div className="space-y-1.5"><Label htmlFor="asset-client">Client Name</Label><Input id="asset-client" list="asset-clients" value={value.client_name || ''} onChange={e => patch('client_name', e.target.value)} /><datalist id="asset-clients">{clients.map(c => <option key={c} value={c} />)}</datalist></div>
    <div className="space-y-2"><Label htmlFor="asset-tags">Tags</Label><Input id="asset-tags" value={tag} placeholder="Add a tag" onChange={e => setTag(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const trimmed = tag.trim(); if (trimmed && !(value.tags || []).some(t => t.toLowerCase() === trimmed.toLowerCase())) patch('tags', [...(value.tags || []), trimmed]); setTag(''); } }} /><div className="flex flex-wrap gap-1">{(value.tags || []).map(t => <Badge variant="secondary" key={t} className="gap-1">{t}<Button type="button" size="icon" variant="ghost" className="h-4 w-4" aria-label={`Remove tag ${t}`} onClick={() => patch('tags', (value.tags || []).filter(v => v !== t))}><X className="h-3 w-3" /></Button></Badge>)}</div></div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label>Linked PO</Label><LinkSearch kind="po" value={value.linked_po_id} onChange={v => patch('linked_po_id', v)} /></div><div className="space-y-1.5"><Label>Linked RFQ</Label><LinkSearch kind="rfq" value={value.linked_rfq_id} onChange={v => patch('linked_rfq_id', v)} /></div></div>
  </div>;
}