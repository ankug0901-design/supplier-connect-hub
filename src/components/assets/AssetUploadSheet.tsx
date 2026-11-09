import { useRef, useState } from 'react';
import { UploadCloud, X, Loader2, File } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { AssetFields, emptyAssetInput } from './AssetFields';
import { Asset, Actor, AssetInput, createAsset, assetSize, errorMessage, assetLabel } from '@/lib/assetLibrary';
export function AssetUploadSheet({ open, onClose, onSaved, clients, actor, previous }: { open: boolean; onClose: () => void; onSaved: () => void; clients: string[]; actor: Actor; previous?: Asset }) {
  const [files, setFiles] = useState<{ file: File; name: string; id: string }[]>([]);
  const [input, setInput] = useState<AssetInput>(previous ? { name: previous.name, description: previous.description, asset_type: previous.asset_type, category: previous.category, sub_category: previous.sub_category, client_name: previous.client_name, tags: previous.tags, linked_po_id: previous.linked_po_id, linked_rfq_id: previous.linked_rfq_id, status: 'draft' } : emptyAssetInput);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [saveError, setSaveError] = useState('');
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = Array.from(list).map(file => ({ file, name: previous?.name || file.name.replace(/\.[^.]+$/, ''), id: crypto.randomUUID() }));
    if (previous && next.length !== 1) { toast.error('Select one file for a new version.'); return; }
    if (next.some(f => !f.file.size)) { toast.error('Empty files cannot be uploaded.'); return; }
    setFiles(current => previous ? next : [...current, ...next]);
  }
  async function save() {
    if (!files.length || files.some(f => !f.name.trim())) { toast.error('Select files and enter a name for each asset.'); return; }
    setBusy(true);
    setSaveError('');
    let saved = 0;
    try {
      for (const entry of files) {
        setProgress(`Uploading ${saved + 1} of ${files.length}…`);
        // Serialize uploads in this browser; database constraints remain authoritative across browsers.
        const create = () => createAsset(entry.file, { ...input, name: entry.name.trim() }, actor, previous);
        try {
          if (navigator.locks) await navigator.locks.request('dam-asset-create', create); else await create();
        } catch (error) {
          if (errorMessage(error).startsWith('Saved, but')) { saved++; setFiles(current => current.filter(f => f.id !== entry.id)); }
          throw error;
        }
        saved++;
        setFiles(current => current.filter(f => f.id !== entry.id));
      }
      toast.success(previous ? 'New version uploaded' : `${saved} asset${saved === 1 ? '' : 's'} uploaded`);
      onSaved(); onClose();
    } catch (error) { const message = `${saved} of ${files.length} assets saved. ${errorMessage(error)}`; toast.error(message); setSaveError(message); onSaved(); } finally { setBusy(false); setProgress(''); }
  }
  return <Sheet open={open} onOpenChange={v => { if (!v && !busy) onClose(); }}><SheetContent className="w-full overflow-y-auto sm:max-w-xl" onInteractOutside={e => { if (busy) e.preventDefault(); }}><SheetHeader className="mb-6"><SheetTitle>{previous ? `Upload New Version · v${previous.version + 1}` : 'Upload Asset'}</SheetTitle><SheetDescription>{previous ? previous.name : 'Asset files and metadata'}</SheetDescription></SheetHeader>
    {saveError && <p role="alert" className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{saveError}</p>}
    <fieldset disabled={busy} className="space-y-5">
      <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); if (!busy) addFiles(e.dataTransfer.files); }} className={`flex min-h-36 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-5 ${dragging ? 'border-primary bg-primary/10' : 'border-border bg-muted/50'}`}><UploadCloud className="h-8 w-8 text-primary" /><p className="text-sm text-muted-foreground">Drop {previous ? 'a file' : 'files'} here</p><Button variant="outline" type="button" onClick={() => picker.current?.click()}>Choose files</Button><input ref={picker} aria-label="Asset files" type="file" multiple={!previous} className="sr-only" onChange={e => { addFiles(e.target.files); e.target.value = ''; }} /></div>
      {files.map(entry => <div key={entry.id} className="space-y-2 border-b pb-3"><div className="flex min-w-0 items-center gap-2"><File className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="flex-1 truncate text-xs" title={entry.file.name}>{entry.file.name} · {assetSize(entry.file.size)}</span><Button type="button" variant="ghost" size="icon" aria-label={`Remove ${entry.file.name}`} onClick={() => setFiles(current => current.filter(f => f.id !== entry.id))}><X className="h-4 w-4" /></Button></div><Label htmlFor={`name-${entry.id}`}>Name *</Label><Input id={`name-${entry.id}`} value={entry.name} onChange={e => setFiles(current => current.map(f => f.id === entry.id ? { ...f, name: e.target.value } : f))} /></div>)}
      <AssetFields value={input} onChange={setInput} clients={clients} showName={false} />
      <div className="space-y-1.5"><Label>Status</Label><Select value={input.status} onValueChange={v => setInput({ ...input, status: v })}><SelectTrigger aria-label="Upload status"><SelectValue /></SelectTrigger><SelectContent>{['draft', 'pending_review'].map(s => <SelectItem key={s} value={s}>{assetLabel(s)}</SelectItem>)}</SelectContent></Select></div>
    </fieldset>
    <div className="sticky bottom-0 mt-6 flex justify-end gap-2 border-t bg-background py-4"><Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy || !files.length} onClick={save}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}{busy ? progress : 'Save Assets'}</Button></div>
  </SheetContent></Sheet>;
}