# Roadmap

- [x] Add and deploy the `sync-dispatch` endpoint with the approved hardcoded sync key.
- [x] Enforce unique dispatch identity using `po_id` and `lr_number`.
- [x] Verify authentication, validation, and successful no-op synchronization.
- [x] Auto-load and show full tracking details for every shipment with aggregate delivery progress.
- [x] Configure both Zoho sync cron jobs to read protected service-role authorization without embedding credentials.
- [x] Refresh scheduled authorization from the live function runtime binding and verify a real scheduled HTTP 200 summary.
- [x] Make both scheduled Zoho runs enqueue every linked supplier page with unchanged schedules and protected authorization; run coverage regression checks.
- [ ] Verify actual PO/invoice updates beyond the first batch — blocked by n8n Zoho upstream timeouts; scheduled HTTP 200 responses cover all 25 suppliers but report zero upserts and upstream errors.
