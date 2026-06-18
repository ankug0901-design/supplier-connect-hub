import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useReadOnly } from '@/contexts/AuthContext';
import { confirmPoDeliveryDates } from '@/services/api';


type Item = {
  id: string;
  item_name?: string;
  description?: string;
  quantity?: number;
  confirmedDeliveryDate?: string | null;
};

export function DeliveryDateConfirmation({
  poDbId,
  items,
  deliveryDatesConfirmedAt,
  expectedDelivery,
  onSaved,
}: {
  poDbId: string;
  items: Item[];
  deliveryDatesConfirmedAt: string | null;
  expectedDelivery?: string | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const isReadOnly = useReadOnly();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

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
    const missing = payload.filter((p) => !p.confirmed_delivery_date).length;
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
    if (missing > 0) {
      // intentional: keep banner visible until all dates set
    }
  };

  if (!itemsWithId.length) return null;

  return (
    <div
      className={`rounded-xl border p-5 shadow-card ${
        confirmed ? 'border-success/30 bg-success/5' : 'border-warning/40 bg-warning/5'
      }`}
    >
      <div className="mb-4 flex items-start gap-3">
        {confirmed ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />
        ) : (
          <AlertTriangle className="mt-0.5 h-5 w-5 text-warning" />
        )}
        <div className="flex-1">
          <h3 className="font-semibold text-foreground">
            {confirmed ? 'Delivery dates confirmed' : 'Confirm delivery dates'}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {confirmed
              ? `All line item delivery dates have been recorded. You can now download the PO and upload invoices.`
              : `Please record the expected delivery date for every line item. Until all dates are saved you cannot download the PO or upload invoices against it.`}
            {expectedDelivery && !confirmed && (
              <>
                {' '}
                <span className="text-foreground">PO expected delivery:</span>{' '}
                {new Date(expectedDelivery).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </>
            )}
          </p>
        </div>
      </div>

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
    </div>
  );
}
