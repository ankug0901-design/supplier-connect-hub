# Project Architecture Rules

- Proof review uses the existing token-scoped `proof_manage` actions through a checked `proofRpc`; admin proof controls are order-scoped and share one media preview component so review and revision behavior stays consistent.
- Tracking proof lists use `proof_manage`'s tracking-token-scoped read action, never public order-ID-only listing; failures leave order tracking available and responses omit admin email fields.
- Proof emails use the production page's unchanged email wrapper via authenticated `n8nPost('send-email')`; save the proof before sending and mark sent only after success to retain recoverable records on notification failure.
- The proof RPC restricts management actions to existing admin/tracker-admin checks and public responses to nonempty tokens; require revision comments server-side because UI checks alone are not authorization or validation.

- Public order tracking reads `po_tracker_manage` directly with the token-scoped `track_by_token` action, avoiding the unreliable n8n lookup while retaining existing RPC security.

- Keep `po_tracker_manage(jsonb)` and `_po_recalc_status(uuid)` on an empty search path with schema-qualified application references so caller-controlled objects cannot replace their dependencies.

- Client tracking emails share the inline table-based wrapper in the production updates page; optional PO/item-scoped thumbnail lookups and current order-summary refreshes fail open to preserve all three existing webhook sends.

- Admin email outcomes read the existing RLS-protected audit log using exact server-side counts and stable pagination; distinguish accepted sends from confirmed delivery and never alter sending or suppression workflows for reporting.

- Existing email features send synchronously through the managed email SDK (registered templates for account invitations, direct sends for runtime-composed HTML); retain checked audit writes and notification-only outcome mirrors, never local send-gating or queue mechanics, to preserve workflows and history.

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
