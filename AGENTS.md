# Project Architecture Rules

- Keep item production history scoped to its PO and matching-or-null item ID, with PO-wide activity counts; reuse existing media and stage helpers to preserve update workflows.

- Render dispatch details independently of courier tracking availability; centralize and test order-delivery completion so authoritative overall delivery and all-shipment delivery both complete the stepper.

- Keep per-item stage editing in the production updates page and persist through `poTrackerRpc`'s `set_stages` action; pure slug/reorder helpers are independently tested to preserve the existing update workflows.

- Route general frontend n8n calls through `n8nPost`; the PO Tracker's logistics shipment fetch and email send are explicit direct-webhook exceptions required by their unauthenticated workflows.
- Keep single-location dispatch entry in `AdminDispatchForm`; multi-location logistics synchronization belongs inside `ItemUpdateForm` and writes authenticated `po_dispatch` records before posting the production update.
- External dispatch synchronization belongs in the `sync-dispatch` edge function and identifies records by the unique `po_id` plus `lr_number` pair.
- Scheduled Zoho sync requests resolve authorization from Vault at execution time; authorized syncs refresh that credential from the live runtime binding through a service-role-only RPC, without exposing credentials or embedding them in cron commands.
- Rolling Zoho syncs process one four-supplier page using a service-role-only leased cursor; hourly syncs always use offset zero, and manual syncs never modify the cursor, preserving bounded requests independently of schedule frequency.
- Zoho credential refresh uses a dedicated Vault secret and never overwrites the email queue credential, preventing cross-function authorization conflicts.
- Zoho item sync matches stored line IDs and upserts on the existing primary key because the partial Zoho unique index cannot be inferred by PostgREST; omit production fields and prune only stale identified items with an explicitly zero history count.
