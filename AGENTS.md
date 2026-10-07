# Project Architecture Rules

- Route general frontend n8n calls through `n8nPost`; the PO Tracker's logistics shipment fetch and email send are explicit direct-webhook exceptions required by their unauthenticated workflows.
- Keep single-location dispatch entry in `AdminDispatchForm`; multi-location logistics synchronization belongs inside `ItemUpdateForm` and writes authenticated `po_dispatch` records before posting the production update.
- External dispatch synchronization belongs in the `sync-dispatch` edge function and identifies records by the unique `po_id` plus `lr_number` pair.
- Scheduled Zoho sync requests resolve authorization from Vault at execution time; authorized syncs refresh that credential from the live runtime binding through a service-role-only RPC, without exposing credentials or embedding them in cron commands.
- Both scheduled Zoho jobs request a full pass; the edge function runs existing supplier pages sequentially until has_more is false, preserving bounded upstream concurrency and manual pagination.
