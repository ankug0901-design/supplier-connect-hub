# Multi-Shipment Order Tracking

## Build
- Extend dispatch records with quantity, delivery status, notes, dispatch date, courier, and AWB fields.
- Replace the existing dispatch cards with a responsive shipment summary: a full table on larger screens and stacked shipment cards on mobile.
- Parse pipe-separated dispatch notes into city/consignee, item, and location values for clear shipment labels.
- Add the requested status badges for dispatched, in transit, picked up, out for delivery, and delivered shipments.
- Replace the single tracking panel with one accordion row per dispatch that has an LR or AWB number.
- Fetch courier tracking only when its accordion opens; preserve loaded results when users switch between shipments.
- Aggregate database delivery statuses and loaded courier tracking results so any in-transit shipment advances the main stepper, while Delivered appears only when every shipment is delivered.

## Technical details
- Keep all changes in `src/pages/TrackOrder.tsx`; no database or webhook changes are needed.
- Key loaded tracking results by dispatch ID or LR/AWB number, and update the parent through an identified callback rather than replacing one shared tracking value.
- Reuse the existing shipment journey UI inside each expanded panel and retain the current teal, rounded-card visual language.
- Verify type checking and inspect both desktop and mobile layouts in the running preview.
