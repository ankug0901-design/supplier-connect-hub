# Roadmap

- [ ] Add per-item Define Stages dialog with templates, reordering, confirmation and stage saving; verify controls and slug rules.

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
