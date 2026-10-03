# Dispatch Sync Endpoint

## Build
- Add a `sync-dispatch` Edge Function accepting POST requests and cross-origin preflight requests.
- Validate the `x-sync-key` header and every dispatch record before any database write.
- Classify each valid record as new or existing using `po_id` plus `lr_number`, then upsert the batch.
- Return inserted and updated counts plus validation or database errors in the requested JSON shape.
- Store the supplied sync key as a backend secret rather than exposing it in source code.

## Database
- Confirm `po_dispatch` has no duplicate `po_id` and `lr_number` pairs.
- Add the unique database constraint required for conflict-based upserts if it is missing.

## Technical details
- Use the backend service-role environment binding so external n8n calls can write through RLS safely.
- Keep CORS headers on success and every error response.
- Deploy the function and verify unauthorized access, invalid input handling, and a safe empty-record request.
