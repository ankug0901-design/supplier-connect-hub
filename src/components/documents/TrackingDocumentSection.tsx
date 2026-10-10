import { Download, Files } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { documentFileUrl, documentTypeLabel, formatFileSize, type OrderDocument } from '@/lib/documentHub';
import { DocumentTypeBadge } from './DocumentTypeBadge';

export function TrackingDocumentSection({ documents }: { documents: OrderDocument[] }) {
  if (!documents.length) return null;
  const groups = documents.length > 5
    ? Array.from(new Set(documents.map(doc => doc.document_type))).map(type => ({ type, docs: documents.filter(doc => doc.document_type === type) }))
    : [{ type: '', docs: documents }];
  return <section className="proof-public" aria-label="Documents">
    <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground"><Files className="h-4 w-4" />Documents</h2>
    <div className="space-y-4">{groups.map(group => <div key={group.type} className="space-y-3">
      {group.type && <h3 className="text-sm font-semibold">{documentTypeLabel(group.type)}</h3>}
      {group.docs.map(doc => <article key={doc.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm">
        <div className="min-w-0 flex-1"><DocumentTypeBadge type={doc.document_type} /><h3 className="mt-2 break-words font-semibold">{doc.title}</h3><p className="mt-1 break-all text-xs text-muted-foreground">{doc.file_name}{doc.file_size_bytes ? ` · ${formatFileSize(doc.file_size_bytes)}` : ''}</p>{doc.item_name && <p className="mt-1 break-words text-xs text-muted-foreground">{doc.item_name}</p>}</div>
        {documentFileUrl(doc.file_url) && <Button asChild size="sm" variant="outline"><a href={documentFileUrl(doc.file_url)} target="_blank" rel="noopener noreferrer"><Download />Download</a></Button>}
      </article>)}
    </div>)}</div>
  </section>;
}