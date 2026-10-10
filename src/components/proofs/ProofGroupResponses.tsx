import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { proofRpc, type GroupResponse } from '@/lib/proofApproval';

export function ProofGroupResponses({ groupId, refreshKey }: { groupId: string; refreshKey: string }) {
  const [responses, setResponses] = useState<GroupResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    void proofRpc({ action: 'list_group_responses', proof_group_id: groupId }).then(result => {
      if (active) setResponses(result.responses || result.group_responses || []);
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Unable to load responses'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [groupId, refreshKey, retry]);
  return <section className="space-y-2 border-l-2 border-border pl-3">
    <h4 className="text-sm font-semibold">Responses</h4>
    {loading ? <p role="status" className="text-xs text-muted-foreground">Loading responses…</p> : error ? <div role="alert" className="flex items-center gap-2 text-sm text-destructive">{error}<Button size="sm" variant="outline" onClick={() => setRetry(value => value + 1)}><RefreshCw />Retry</Button></div> : responses.map(response => <div key={response.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2">
      <div className="min-w-0"><p className="break-words text-sm font-medium">{response.client_name || response.email_recipient}</p>{response.client_name && <p className="break-all text-xs text-muted-foreground">{response.email_recipient}</p>}<p className="text-xs text-muted-foreground">{response.client_response_at ? new Date(response.client_response_at).toLocaleString('en-IN') : 'Awaiting response'}</p></div>
      <Badge variant="outline" className={response.status === 'approved' ? 'border-success/30 bg-success/10 text-success' : response.status === 'revision_requested' ? 'border-warning/30 bg-warning/10 text-warning' : 'border-border bg-muted text-muted-foreground'}>{response.status === 'approved' ? 'Approved' : response.status === 'revision_requested' ? 'Changes Requested' : 'Pending'}</Badge>
    </div>)}
  </section>;
}