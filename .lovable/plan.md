# Automatic dispatch emails

## Implementation
- After a successful single-location dispatch, send the branded dispatch email to the client before showing success.
- After a successful multi-location synchronization, send the branded shipment-count and destination email to the client.
- Keep email failures isolated so dispatch and synchronization still complete normally.

## Technical details
- Reuse the existing `escapeHtml` and `wrapEmailHtml` helpers.
- Post directly to the existing unauthenticated `send-email` webhook, matching the PO Tracker's current email exception.
- Change only `src/pages/admin/AdminPoTrackerUpdate.tsx`.

## Validation
- Run the existing TypeScript check and confirm the preview build remains healthy.
