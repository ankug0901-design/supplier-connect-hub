# Roadmap

- [ ] Add collapsed per-item production history including unassigned PO updates and a PO-header update count; verify filtering and display.

- [x] Restore dispatch information for all customer shipments and verify delivered-order progress on desktop/mobile; road/courier fixtures and delivery regression tests pass.

- [x] Add per-item Define Stages dialog with templates, reordering, confirmation and stage saving; slug/reorder tests pass and app compiles cleanly.
- [ ] Verify stage editing and saving in the signed-in admin page — blocked by unavailable requesting-user session; requires preview sign-in.

- [x] Add and deploy the `sync-dispatch` endpoint with the approved hardcoded sync key.
- [x] Enforce unique dispatch identity using `po_id` and `lr_number`.
- [x] Verify authentication, validation, and successful no-op synchronization.
- [x] Auto-load and show full tracking details for every shipment with aggregate delivery progress.
- [x] Configure both Zoho sync cron jobs to read protected service-role authorization without embedding credentials.
- [x] Refresh scheduled authorization from the live function runtime binding and verify a real scheduled HTTP 200 summary.
- [x] Restore single-batch scheduling and resolve email queue 403 responses caused by shared credential refresh; email processor verified HTTP 200.
- [x] Add a protected rolling cursor for two-minute syncs; keep hourly offset zero.
- [x] Verify real scheduled HTTP 200 responses and cursor progression 0 → 4 → 8 → 12 → 16 → 20 → 24 → 0, with no new 403s.
- [ ] Confirm actual Zoho PO/invoice updates — blocked by n8n upstream timeouts, despite verified cursor coverage and HTTP 200 responses.
