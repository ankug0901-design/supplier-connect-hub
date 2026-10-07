# Project Architecture Rules

- Route general frontend n8n calls through `n8nPost`; the PO Tracker's logistics shipment fetch and email send are explicit direct-webhook exceptions required by their unauthenticated workflows.
- Keep single-location dispatch entry in `AdminDispatchForm`; multi-location logistics synchronization belongs inside `ItemUpdateForm` and writes authenticated `po_dispatch` records before posting the production update.
- External dispatch synchronization belongs in the `sync-dispatch` edge function and identifies records by the unique `po_id` plus `lr_number` pair.
- Scheduled Zoho sync requests resolve authorization from Vault at execution time; authorized syncs refresh that credential from the live runtime binding through a service-role-only RPC, without exposing credentials or embedding them in cron commands.
- Two-minute Zoho syncs process one four-supplier page using a service-role-only leased cursor; hourly syncs always use offset zero, and manual syncs never modify the cursor.
- Zoho credential refresh uses a dedicated Vault secret and never overwrites the email queue credential, preventing cross-function authorization conflicts.
