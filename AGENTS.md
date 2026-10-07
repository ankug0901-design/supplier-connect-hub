# Project Architecture Rules

- Route general frontend n8n calls through `n8nPost`; the PO Tracker's logistics shipment fetch and email send are explicit direct-webhook exceptions required by their unauthenticated workflows.
- Keep single-location dispatch entry in `AdminDispatchForm`; multi-location logistics synchronization belongs inside `ItemUpdateForm` and writes authenticated `po_dispatch` records before posting the production update.
- External dispatch synchronization belongs in the `sync-dispatch` edge function and identifies records by the unique `po_id` plus `lr_number` pair.
- Scheduled Zoho sync requests resolve service-role authorization from the existing protected Vault secret at execution time; never embed credentials in cron commands, so both schedules avoid stale anon-key comparisons.
