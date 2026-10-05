# Upfront Multi-Shipment Tracking

## Build
- Remove the separate shipment summary table and its mobile cards.
- Automatically request tracking details for every dispatch with an LR or AWB after order data loads.
- Cache each response by shipment key so the main progress stepper immediately aggregates all shipment statuses.
- Render every shipment’s full tracking card directly, without accordion controls.
- Pass each cached response into `ShipmentTracking` as `initialInfo`, preserving its existing header, info cards, dates, timeline, loading, and retry states.

## Technical details
- Keep the changes within `src/pages/TrackOrder.tsx`.
- Share one tracking request helper between background loading and each card’s retry behavior.
- Prevent duplicate background requests when the order refreshes every minute.
- Verify desktop and mobile layouts plus the current build state.
