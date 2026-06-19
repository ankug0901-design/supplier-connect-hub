import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, AlertTriangle, ShieldAlert, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useReadOnly } from '@/contexts/AuthContext';
import { confirmPoDeliveryDates, requestPoException } from '@/services/api';

type Item = {
  id: string;
  item_name?: string;
  description?: string;
  quantity?: number;
  confirmedDeliveryDate?: string | null;
};

const formatDate = (d?: string | null) =>
  d
    ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

export function DeliveryDateConfirmation({
  poDbId,
  poNumber,
  items,
  deliveryDatesConfirmedAt,
  expectedDelivery,
  releaseAt,
  daysSinceRelease,
  exceptionPending,
  exceptionApprovedAt,
  exceptionRejectedAt,
  needsExceptionRequest,
  onSaved,
}: {
  poDbId: string;
  poNumber?: string;
  items: Item[];
  deliveryDatesConfirmedAt: string | null;
  expectedDelivery?: string | null;
  releaseAt?: string | null;
  daysSinceRelease?: number;
  exceptionPending?: boolean;
  exceptionApprovedAt?: string | null;
  exceptionRejectedAt?: string | null;
  needsExceptionRequest?: boolean;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const isReadOnly = useReadOnly();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState('');
  const [submittingException, setSubmittingException] = useState(false);

  useEffect(() => {
    const initial: Record<string, string> = {};
    items.forEach((it) => {
      initial[it.id] = it.confirmedDeliveryDate || '';
    });
    setDraft(initial);
  }, [poDbId, items]);

  const confirmed = !!deliveryDatesConfirmedAt;
  const itemsWithId = items.filter((it) => it.id);

  const handleSave = async () => {
    const payload = itemsWithId.map((it) => ({
      id: it.id,
      confirmed_delivery_date: draft[it.id] || null,
    }));
    setSaving(true);
    try {
      const res = await confirmPoDeliveryDates(poDbId, payload);
      toast({
        title: res.confirmed ? 'Delivery dates confirmed' : 'Saved',
        description: res.confirmed
          ? 'You can now download the PO and upload invoices.'
          : `${res.remaining} item(s) still need a delivery date.`,
        variant: res.confirmed ? 'default' : 'destructive',
      });
      onSaved();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message || 'Try again', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleRequestException = async () => {
    if (reason.trim().length < 5) {
      toast({
        title: 'Reason required',
        description: 'Please describe why delivery dates cannot be confirmed (min 5 characters).',
        variant: 'destructive',
      });
      return;
    }
    setSubmittingException(true);
    try {
      await requestPoException(poDbId, reason.trim());
      toast({
        title: 'Exception request submitted',
        description: 'Admins have been notified. You will be able to download the PO and upload invoices once approved.',
      });
      setReason('');
      onSaved();
    } catch (e: any) {
      toast({ title: 'Request failed', description: e?.message || 'Try again', variant: 'destructive' });
    } finally {
      setSubmittingException(false);
    }
  };

  if (!itemsWithId.length) return null;

  // 1. Already confirmed
  if (confirmed) {
    return (
      <div className="rounded-xl border border-success/30 bg-success/5 p-5 shadow-card">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />
          <div>
            <h3 className="font-semibold text-foreground">Delivery dates confirmed</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              All line item delivery dates have been recorded. You can now download the PO and upload invoices.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 2. Exception approved
  if (exceptionApprovedAt) {
    return (
      <div className="rounded-xl border border-success/30 bg-success/5 p-5 shadow-card">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />
          <div>
            <h3 className="font-semibold text-foreground">Exception approved</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Admin approved your exception request on {formatDate(exceptionApprovedAt)}. You can now download the PO and
              upload invoices. Please still confirm delivery dates when known.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 3. Exception pending review
  if (exceptionPending) {
    return (
      <div className="rounded-xl border border-warning/40 bg-warning/5 p-5 shadow-card">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 h-5 w-5 text-warning" />
          <div>
            <h3 className="font-semibold text-foreground">Exception request submitted</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Your exception request for PO {poNumber || ''} is awaiting admin approval. You will be able to download the
              PO and upload invoices once approved. You may still confirm delivery dates below to unlock immediately.
            </p>
          </div>
        </div>
        <DeliveryDateTable
          itemsWithId={itemsWithId}
          draft={draft}
          setDraft={setDraft}
          handleSave={handleSave}
          saving={saving}
          isReadOnly={isReadOnly}
          confirmed={false}
        />
      </div>
    );
  }

  // 4. >= 3 days since release — must submit exception
  if (needsExceptionRequest) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 shadow-card space-y-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 text-destructive" />
          <div className="flex-1">
            <h3 className="font-semibold text-foreground">Action required: Submit exception request</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              It has been {daysSinceRelease || 0} day(s) since this PO was released and delivery dates have not been
              confirmed. To download the PO or upload invoices you must submit an exception request explaining the delay.
              The request will be reviewed by an admin.
            </p>
            {exceptionRejectedAt && (
              <p className="mt-2 text-sm text-destructive">
                A previous exception request was rejected on {formatDate(exceptionRejectedAt)}. You may submit a new one
                with additional context.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Reason for exception</label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why delivery dates cannot be confirmed yet (e.g., awaiting customer artwork, raw material delays)..."
            rows={4}
          />
        </div>

        <div className="flex items-center justify-end gap-3">
          {isReadOnly && (
            <span className="text-xs text-warning">Read-only (viewing as supplier)</span>
          )}
          <Button onClick={handleRequestException} disabled={submittingException || isReadOnly} variant="destructive">
            {submittingException && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit exception request
          </Button>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-xs text-muted-foreground mb-3">
            Or, if you can now confirm delivery dates, save them below to unlock immediately:
          </p>
          <DeliveryDateTable
            itemsWithId={itemsWithId}
            draft={draft}
            setDraft={setDraft}
            handleSave={handleSave}
            saving={saving}
            isReadOnly={isReadOnly}
            confirmed={false}
          />
        </div>
      </div>
    );
  }

  // 5. Within 3-day window: ask for delivery dates
  return (
    <div className="rounded-xl border border-warning/40 bg-warning/5 p-5 shadow-card">
      <div className="mb-4 flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 text-warning" />
        <div className="flex-1">
          <h3 className="font-semibold text-foreground">Confirm delivery dates</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Please record the expected delivery date for every line item. Until all dates are saved you cannot download
            the PO or upload invoices against it.
            {expectedDelivery && (
              <>
                {' '}<span className="text-foreground">PO expected delivery:</span>{' '}
                {formatDate(expectedDelivery)}
              </>
            )}
          </p>
          {releaseAt && (
            <p className="mt-2 text-xs text-muted-foreground">
              Released on {formatDate(releaseAt)} ({daysSinceRelease || 0} day(s) ago). If not confirmed within{' '}
              <strong>3 days of release</strong>, you will be required to submit an exception request.
            </p>
          )}
        </div>
      </div>

      <DeliveryDateTable
        itemsWithId={itemsWithId}
        draft={draft}
        setDraft={setDraft}
        handleSave={handleSave}
        saving={saving}
        isReadOnly={isReadOnly}
        confirmed={false}
      />
    </div>
  );
}

function DeliveryDateTable({
  itemsWithId,
  draft,
  setDraft,
  handleSave,
  saving,
  isReadOnly,
  confirmed,
}: {
  itemsWithId: Item[];
  draft: Record<string, string>;
  setDraft: (fn: (d: Record<string, string>) => Record<string, string>) => void;
  handleSave: () => void;
  saving: boolean;
  isReadOnly: boolean;
  confirmed: boolean;
}) {
  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left">
              <th className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Item</th>
              <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Qty</th>
              <th className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Confirmed Delivery Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {itemsWithId.map((it) => (
              <tr key={it.id}>
                <td className="px-4 py-3 text-sm">{it.item_name || it.description || '—'}</td>
                <td className="px-4 py-3 text-right text-sm">{it.quantity ?? 0}</td>
                <td className="px-4 py-3">
                  <Input
                    type="date"
                    value={draft[it.id] || ''}
                    onChange={(e) => setDraft((d) => ({ ...d, [it.id]: e.target.value }))}
                    className="max-w-[180px]"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-end gap-3">
        {isReadOnly && (
          <span className="text-xs text-warning">Read-only (viewing as supplier)</span>
        )}
        <Button onClick={handleSave} disabled={saving || isReadOnly} title={isReadOnly ? 'Read-only: exit "View as" to save' : undefined}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {confirmed ? 'Update dates' : 'Save delivery dates'}
        </Button>
      </div>
    </>
  );
}
