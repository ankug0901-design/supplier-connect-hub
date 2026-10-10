import { useState } from 'react';
import { Download, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { downloadProofFile, isProofVideo, proofFilename, proofMedia, type ProofMedia } from '@/lib/proofApproval';

export function ProofMediaGrid({ media, compact = false }: { media: unknown; compact?: boolean }) {
  const [active, setActive] = useState<ProofMedia | null>(null);
  const items = proofMedia(media);
  if (!items.length) return null;
  return <>
    <div className={compact ? 'flex flex-wrap gap-2' : 'grid grid-cols-2 gap-3 sm:grid-cols-3'}>
      {items.map((m, i) => <Button type="button" key={`${m.url}-${i}`} variant="ghost" onClick={() => setActive(m)} aria-label={`View ${m.filename || `proof media ${i + 1}`}`} className={`relative overflow-hidden rounded-lg border border-border bg-muted p-0 hover:bg-muted ${compact ? 'h-16 w-16' : 'h-auto w-full aspect-square'}`}>
        {isProofVideo(m) ? <><video src={m.url} muted playsInline className="h-full w-full object-cover" /><span className="absolute inset-0 flex items-center justify-center bg-foreground/30 text-primary-foreground"><Play /></span></> : <img src={m.url} alt={m.filename || 'Proof image'} loading="lazy" className="h-full w-full object-cover" />}
      </Button>)}
    </div>
    <Dialog open={!!active} onOpenChange={open => { if (!open) setActive(null); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader><DialogTitle>{active?.filename || 'Proof preview'}</DialogTitle></DialogHeader>
        {active && (isProofVideo(active) ? <video src={active.url} controls autoPlay className="max-h-[75vh] w-full object-contain" /> : <img src={active.url} alt={active.filename || 'Proof preview'} className="max-h-[75vh] w-full object-contain" />)}
        {active && <div className="flex justify-end"><Button type="button" variant="outline" size="sm" onClick={() => void downloadProofFile(active.url, proofFilename(active))}><Download />Download</Button></div>}
      </DialogContent>
    </Dialog>
  </>;
}