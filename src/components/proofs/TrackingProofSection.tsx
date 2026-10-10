import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ProofMediaGrid } from './ProofMediaGrid';
import { proofLink, proofTypeLabel, type Proof } from '@/lib/proofApproval';

export function TrackingProofSection({ proofs }: { proofs: Proof[] }) {
  if (!proofs.length) return null;
  return <section className="proof-public" aria-label="Digital Proofs">
    <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Digital Proofs</h2>
    <div className="space-y-3">
      {proofs.map(proof => <div key={proof.id} className="rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0"><h3 className="break-words font-semibold">{proof.title}</h3><p className="text-xs text-muted-foreground">{proofTypeLabel(proof.proof_type)}{proof.revision_number > 1 && ` · Revision ${proof.revision_number}`}</p></div>
          <Badge variant="outline" className={proof.status === 'approved' ? 'border-success/20 bg-success/10 text-success' : proof.status === 'pending' ? 'border-warning/30 bg-warning/10 text-foreground' : 'border-warning/40 bg-warning/20 text-foreground'}>
            {proof.status === 'pending' ? '⏳ Awaiting Review' : proof.status === 'approved' ? '✅ Approved' : '✏️ Changes Requested'}
          </Badge>
        </div>
        {proof.media_urls?.length > 0 && <div className="mt-3"><ProofMediaGrid media={proof.media_urls.slice(0, 4)} compact /></div>}
        {proof.status === 'pending' && proof.approval_token && <Button asChild className="mt-3"><a href={proofLink(proof.approval_token)}>Review Proof</a></Button>}
        {proof.status === 'approved' && proof.client_response_at && <p className="mt-3 text-xs text-muted-foreground">Approved on {new Date(proof.client_response_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>}
        {proof.status === 'revision_requested' && proof.client_comment && <p className="mt-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">{proof.client_comment}</p>}
      </div>)}
    </div>
  </section>;
}