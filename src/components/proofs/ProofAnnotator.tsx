import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { addProofAnnotation, isProofVideo, MAX_PROOF_ANNOTATIONS, type ProofAnnotation, type ProofMedia } from '@/lib/proofApproval';

type Props = { media: ProofMedia[]; annotations: ProofAnnotation[]; onAnnotationsChange: (annotations: ProofAnnotation[]) => void; disabled?: boolean };

export function ProofAnnotator({ media, annotations, onAnnotationsChange, disabled = false }: Props) {
  const remove = (number: number) => onAnnotationsChange(annotations.filter(a => a.number !== number));
  if (!media.some(file => !isProofVideo(file))) return null;
  return <section aria-label="Proof annotations" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted-foreground">Tap/click on the image to mark areas that need changes</p><span className="text-xs text-muted-foreground" role="status">{annotations.length}/{MAX_PROOF_ANNOTATIONS}</span></div>
    {media.map((file, mediaIndex) => {
      if (isProofVideo(file)) return null;
      const marks = annotations.filter(a => a.media_index === mediaIndex);
      return <div key={`${file.url}-${mediaIndex}`} className="space-y-3">
        <div className="relative overflow-hidden rounded-lg border border-border">
          <img src={file.url} alt={file.filename || `Proof image ${mediaIndex + 1}`} draggable={false} className="block h-auto w-full" />
          <Button type="button" variant="ghost" aria-label={`Mark area on ${file.filename || `proof image ${mediaIndex + 1}`}`} disabled={disabled || annotations.length >= MAX_PROOF_ANNOTATIONS} className="absolute inset-0 h-full w-full cursor-crosshair rounded-none p-0 hover:bg-transparent" onClick={event => {
            const rect = event.currentTarget.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            onAnnotationsChange(addProofAnnotation(annotations, mediaIndex, ((event.clientX - rect.left) / rect.width) * 100, ((event.clientY - rect.top) / rect.height) * 100));
          }} />
          {marks.map(mark => <Button key={mark.number} type="button" variant="ghost" disabled={disabled} aria-label={`Remove marker ${mark.number}`} title={`Remove marker ${mark.number}`} className="proof-marker absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 p-0 text-xs font-bold hover:opacity-90" style={{ left: `${mark.x_percent}%`, top: `${mark.y_percent}%` }} onClick={() => remove(mark.number)}>{mark.number}</Button>)}
        </div>
        <ol className="space-y-2">{marks.map(mark => <li key={mark.number} className="flex items-center gap-2"><span className="proof-marker flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold">{mark.number}</span><Input aria-label={`Comment for marker ${mark.number}`} value={mark.comment} disabled={disabled} className="min-w-0" onChange={event => onAnnotationsChange(annotations.map(a => a.number === mark.number ? { ...a, comment: event.target.value } : a))} /><Button type="button" variant="ghost" size="icon" className="shrink-0" disabled={disabled} aria-label={`Delete marker ${mark.number}`} title={`Remove marker ${mark.number}`} onClick={() => remove(mark.number)}><X /></Button></li>)}</ol>
      </div>;
    })}
  </section>;
}