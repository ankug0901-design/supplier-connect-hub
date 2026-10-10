import { isProofVideo, type ProofAnnotation, type ProofMedia } from '@/lib/proofApproval';

export function ProofAnnotationView({ media, annotations }: { media: ProofMedia[]; annotations: ProofAnnotation[] }) {
  return <div className="space-y-5">{media.map((file, mediaIndex) => {
    const marks = annotations.filter(a => a.media_index === mediaIndex);
    if (isProofVideo(file) || !marks.length) return null;
    return <div key={`${file.url}-${mediaIndex}`} className="space-y-3">
      <div className="relative overflow-hidden rounded-lg border border-border">
        <img src={file.url} alt={file.filename || `Annotated proof ${mediaIndex + 1}`} className="block h-auto w-full" />
        {marks.map(mark => <span key={mark.number} className="proof-marker pointer-events-none absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-xs font-bold" style={{ left: `${mark.x_percent}%`, top: `${mark.y_percent}%` }}>{mark.number}</span>)}
      </div>
      <ol className="space-y-2">{marks.map(mark => <li key={mark.number} className="flex items-start gap-2 text-sm"><span className="proof-marker flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">{mark.number}</span><span className="min-w-0 whitespace-pre-wrap break-words">{mark.comment || '—'}</span></li>)}</ol>
    </div>;
  })}</div>;
}