import { useRef, useState } from 'react';
import { Upload, Loader2, X, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const ACCEPTED_EXT = ['xlsx', 'xls', 'csv'];
const ACCEPT_ATTR = '.xlsx,.xls,.csv';
const MAX_BYTES = 25 * 1024 * 1024;
// 10 years — matches other private-bucket signed URL usage in the project.
const SIGNED_URL_EXPIRY = 60 * 60 * 24 * 365 * 10;

interface Props {
  bucket: 'rfq-boq-templates' | 'rfq-boq-responses';
  folder: string;
  onUploaded: (args: { url: string; name: string; path: string }) => void;
  disabled?: boolean;
  label?: string;
}

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
}

export function BoqUpload({ bucket, folder, onUploaded, disabled, label }: Props) {
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ACCEPTED_EXT.includes(ext)) {
      toast.error(`Unsupported file type .${ext}. Allowed: ${ACCEPTED_EXT.join(', ')}`);
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('File exceeds 25 MB limit');
      return;
    }
    setBusy(true);
    try {
      const ts = Date.now();
      const safeName = sanitize(file.name);
      const path = `${folder}/${ts}_${safeName}`;
      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (upErr) throw upErr;
      const { data: signed, error: sErr } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, SIGNED_URL_EXPIRY);
      if (sErr || !signed?.signedUrl) throw sErr || new Error('Could not create link');
      onUploaded({ url: signed.signedUrl, name: file.name, path });
      toast.success('BOQ uploaded');
    } catch (e: any) {
      toast.error(`Upload failed: ${e.message || 'Unknown error'}`);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (disabled || busy) return;
        const f = e.dataTransfer.files?.[0];
        if (f) handleFile(f);
      }}
      className={`flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-4 text-center transition-colors ${
        dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 bg-muted/20'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="hidden"
        disabled={disabled || busy}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
      {busy ? (
        <>
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">Uploading…</p>
        </>
      ) : (
        <>
          <Upload className="h-5 w-5 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            {label || 'Drag & drop an Excel/CSV here, or'}{' '}
            <button
              type="button"
              className="font-medium text-primary underline underline-offset-2"
              onClick={() => inputRef.current?.click()}
              disabled={disabled}
            >
              browse
            </button>
          </p>
          <p className="text-[10px] text-muted-foreground">XLSX, XLS, CSV · max 25 MB</p>
        </>
      )}
    </div>
  );
}

export function BoqFileBadge({ name, url, onClear }: { name: string; url?: string; onClear?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
      <div className="flex items-center gap-2 min-w-0">
        <FileSpreadsheet className="h-4 w-4 shrink-0" />
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="truncate underline underline-offset-2">{name}</a>
        ) : (
          <span className="truncate">{name}</span>
        )}
      </div>
      {onClear && (
        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-emerald-800 hover:bg-emerald-100" onClick={onClear}>
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
