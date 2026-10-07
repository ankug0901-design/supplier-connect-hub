# Roadmap

- [x] Add and deploy the `sync-dispatch` endpoint with the approved hardcoded sync key.
- [x] Enforce unique dispatch identity using `po_id` and `lr_number`.
- [x] Verify authentication, validation, and successful no-op synchronization.
- [x] Auto-load and show full tracking details for every shipment with aggregate delivery progress.
- [x] Configure both Zoho sync cron jobs to read protected service-role authorization without embedding credentials.
- [x] Refresh scheduled authorization from the live function runtime binding and verify a real scheduled HTTP 200 summary.
- [ ] Restore single-batch scheduling and resolve email queue 403 responses caused by shared credential refresh.
- [ ] Add a protected rolling cursor for two-minute syncs; keep hourly offset zero.
- [ ] Verify real scheduled responses and cursor advancement across consecutive ticks, including wraparound.
