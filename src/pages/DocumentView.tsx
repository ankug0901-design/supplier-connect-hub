import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, ExternalLink, FileText, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DocumentTypeBadge } from '@/components/documents/DocumentTypeBadge';
import { documentFileUrl, documentRpc, formatFileSize, type DocumentResult } from '@/lib/documentHub';

function Brand() {
  return <div><div className="text-lg font-extrabold sm:text-xl"><span className="text-primary">EMBOSS</span> MARKETING</div><div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70 sm:text-[11px]">Printing · Packaging · POS Materials</div></div>;
}
export default function DocumentView() {
  const [params] = useSearchParams();
  const token = params.get('t') || '';
  const [data, setData] = useState<DocumentResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const epoch = useRef(0);
  const load = useCallback(async () => {
    const request = ++epoch.current;
    setLoading(true); setData(null); setError(false);
    try {
      if (!token) throw new Error('Missing token');
      const result = await documentRpc({ action: 'get_document_by_token', access_token: token });
      if (!result.document || !documentFileUrl(result.document.file_url)) throw new Error('Document not found');
      if (request === epoch.current) setData(result);
    } catch { if (request === epoch.current) setError(true); }
    finally { if (request === epoch.current) setLoading(false); }
  }, [token]);
  useEffect(() => { void load(); return () => { epoch.current++; }; }, [load]);
  useEffect(() => { document.title = 'Document · Emboss Marketing'; }, []);
  const doc = data?.document;
  const isImage = doc && /\.(jpe?g|png|gif|webp)(\?|$)/i.test(doc.file_name || doc.file_url);
  const isPdf = doc && /\.pdf(\?|$)/i.test(doc.file_name || doc.file_url);
  return <div className="proof-public min-h-screen bg-background text-foreground">
    <header className="border-b border-border bg-background"><div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6"><Brand /><p className="text-xs text-muted-foreground">Order Document</p></div></header>
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      {loading && <div role="status" aria-label="Loading document" className="animate-pulse space-y-6 motion-reduce:animate-none"><div className="h-8 w-2/3 rounded bg-muted" /><div className="h-24 rounded-lg bg-muted" /><div className="h-72 rounded-lg bg-muted" /></div>}
      {!loading && error && <div className="rounded-lg border border-border bg-muted/60 px-6 py-16 text-center"><FileText className="mx-auto mb-4 h-12 w-12 text-muted-foreground" /><h1 className="text-xl font-bold">Document not found</h1><p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">This document link is invalid or unavailable. Please check the link or contact your Emboss Marketing representative.</p><Button variant="outline" onClick={load} className="mt-5"><RefreshCw />Try again</Button></div>}
      {!loading && !error && doc && <div className="space-y-6">
        <div><DocumentTypeBadge type={doc.document_type} /><h1 className="mt-3 break-words text-2xl font-bold sm:text-3xl">{doc.title}</h1><p className="mt-2 text-sm text-muted-foreground">{doc.client_name}</p></div>
        <dl className="grid gap-4 border-y border-border py-4 sm:grid-cols-3">{[['Client Name', doc.client_name], ['PO Reference', doc.po_id], ['Client PO#', doc.client_po_number]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm font-semibold">{value || '—'}</dd></div>)}</dl>
        {doc.description && <p className="whitespace-pre-wrap break-words text-sm leading-6">{doc.description}</p>}
        <div className="rounded-lg border border-border bg-card p-5"><p className="break-all text-sm font-semibold">{doc.file_name || 'Document'}</p><p className="mt-1 text-xs text-muted-foreground">{formatFileSize(doc.file_size_bytes)} · Uploaded {new Date(doc.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p></div>
        {isImage && <img src={documentFileUrl(doc.file_url)} alt={doc.title} className="max-h-[600px] w-full rounded-lg object-contain" />}
        <div className="flex flex-wrap gap-3"><Button asChild size="lg"><a href={documentFileUrl(doc.file_url)} target="_blank" rel="noopener noreferrer"><Download />Download Document</a></Button>{isPdf && <Button asChild variant="outline" size="lg"><a href={documentFileUrl(doc.file_url)} target="_blank" rel="noopener noreferrer"><ExternalLink />Open PDF in browser</a></Button>}</div>
      </div>}
    </main>
    <footer className="mt-10 border-t border-border py-8 text-center"><Brand /><p className="mt-3 text-xs text-muted-foreground/70">Emboss Marketing LLP · Gurugram, Haryana</p></footer>
  </div>;
}