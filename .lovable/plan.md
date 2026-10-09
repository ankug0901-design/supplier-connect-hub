# Client order/tracking emails — code findings

This is a read-only report, not an implementation proposal. No application code was changed or published.

## Main client-email file

**`src/pages/admin/AdminPoTrackerUpdate.tsx`** contains the shared tracking-email HTML and three client-email send locations:

| Location | Trigger | Subject |
| --- | --- | --- |
| `wrapEmailHtml`, lines **112–190** | Shared HTML builder for all three emails | Set by each caller |
| `ItemUpdateForm`, lines **465–488** | After successful multi-location dispatch synchronization, when there are new shipments and a client email | `Dispatch Update — Order ${order_number || po_number} — ${pending.length} shipments` |
| `AdminDispatchForm.submit`, lines **813–838** | After successful single-location dispatch, when a client email exists | `Dispatch Update — Order ${order_number || po_number}` |
| `POCard.sendEmail`, lines **1071–1104** | Admin manually sends a production-update email | Defaults to `Production Update — PO ${po.po_number}`; editable |

**All three post their generated HTML to the external n8n `send-email` webhook.** These tracking emails do not call the managed `sendTemplateEmail` helper. The webhook's actual delivery implementation is outside this repository and was not inspected.

## Tracking-link HTML

**`src/pages/admin/AdminPoTrackerUpdate.tsx:149–154`**, exact excerpt:

```typescript
const trackButton = meta.trackingToken
  ? `<div style="margin-top:24px;text-align:center;">` +
    `<a href="https://supplierconnect.embossmarketing.in/track?t=${encodeURIComponent(meta.trackingToken)}" ` +
    `style="display:inline-block;background-color:#0d7377;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Track Your Order</a>` +
    `</div>`
  : '';
```

The button only appears when `trackingToken` is present. Each client-email caller passes `po.client_order?.tracking_token`.

## Shared branded email template

**`src/pages/admin/AdminPoTrackerUpdate.tsx:112–190`** builds:

- An **EMBOSS MARKETING** header and **PRINTING · PACKAGING · POS MATERIALS** subtitle.
- Order Number and Client rows when provided.
- The caller's message/body HTML.
- An Item / Status table with stage badges.
- The **Track Your Order** button above.
- Footer: **Emboss Marketing LLP · Gurugram, Haryana**.

Exact outer HTML returned by the helper, lines **155–189**:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Emboss Marketing</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f3f4f6">
    <tr><td align="center" style="padding:24px 0;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr>
          <td style="background-color:#0d7377;padding:24px 32px;">
            <div style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:0.5px;">EMBOSS MARKETING</div>
            <div style="color:#a5f3f3;font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;margin-top:4px;">PRINTING · PACKAGING · POS MATERIALS</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;font-size:14px;line-height:1.6;color:#374151;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="font-size:14px;color:#374151;line-height:1.5;margin-bottom:24px;">${rowsHtml}</table>
            ${noteBlock}
            ${itemsTable}
            ${trackButton}
          </td>
        </tr>
        <tr>
          <td style="background-color:#f9fafb;padding:16px 32px;text-align:center;color:#6b7280;font-size:12px;line-height:1.5;">
            Emboss Marketing LLP · Gurugram, Haryana
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

The interpolated sections are built at **117–148**. Order/client values and item names/stages use `escapeHtml`; `contentHtml` is inserted into `noteBlock` as supplied.

## Single-location dispatch email body

**`src/pages/admin/AdminPoTrackerUpdate.tsx:817–824`**, exact HTML construction:

```typescript
const dispatchHtml = `<p>Your order has been dispatched!</p>` +
  `<table style="border-collapse:collapse;width:100%;margin:16px 0">` +
  (form.transporter_name ? `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Transporter</td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(form.transporter_name)}</td></tr>` : '') +
  (form.vehicle_number ? `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Vehicle</td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(form.vehicle_number)}</td></tr>` : '') +
  (form.lr_number ? `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">LR / Docket</td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(form.lr_number)}</td></tr>` : '') +
  (form.dispatch_quantity ? `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Quantity</td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(form.dispatch_quantity)}</td></tr>` : '') +
  (form.expected_arrival ? `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Expected Arrival</td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(form.expected_arrival)}</td></tr>` : '') +
  `</table>`;
```

The send payload at **830–836** supplies `to: clientEmail`, the dispatch subject, and `wrapEmailHtml(dispatchHtml, …)` with order number, client name, tracking token, and the dispatched item's name/status.

## Multi-location dispatch email body

**`src/pages/admin/AdminPoTrackerUpdate.tsx:469–474`**, exact HTML construction:

```typescript
const cities = [...new Set(shipments.map(s => s.depot_name).filter(Boolean))];
const multiHtml = `<p>Your order has been dispatched to ${pending.length} locations!</p>` +
  `<table style="border-collapse:collapse;width:100%;margin:16px 0">` +
  `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Shipments</td><td style="padding:8px;border:1px solid #ddd">${pending.length}</td></tr>` +
  `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Cities</td><td style="padding:8px;border:1px solid #ddd">${cities.join(', ') || 'Multiple locations'}</td></tr>` +
  `</table>`;
```

The payload at **480–486** supplies `to: clientEmail`, the shipment-count subject, and the same wrapper/tracking token with the item's status set to `Dispatched`.

## Manual production-update email

**`src/pages/admin/AdminPoTrackerUpdate.tsx:1083–1100`**, exact body/payload construction:

```typescript
const mappedItems = (po.items || [])
  .map((it) => ({
    name: it.item_name || it.description || 'Item',
    stage: prettyStage(it.current_stage || '') || 'Not started',
  }));
// The send-email POST uses this JSON payload:
{
  to: emailTo.trim(),
  cc: emailCc.trim(),
  subject: emailSubject,
  html: wrapEmailHtml(emailBody.replace(/\n/g, '<br/>'), {
    orderNumber: po.client_order?.order_number,
    clientName: po.client_order?.client_name,
    trackingToken: po.client_order?.tracking_token,
  }, mappedItems),
}
```

There is no fixed greeting/message for this version: the message is composed by the admin, with newlines converted to `<br/>`.

## Related email with tracking link — internal, not client-facing

**`supabase/functions/n8n-proxy/index.ts:226–276`** handles `notify-emboss-team`, constructs an internal production-update email, and forwards it to n8n `send-email`.

- Subject: `Production Update: PO ${po_number} — ${item_name || 'Item'}`.
- Recipients: fixed internal Emboss team addresses, **not the client**.
- Rows: Order Number, Client, PO Number, Item, Stage, Status, optional Note, Supplier, and Timestamp.
- Same `/track?t=…` button at **253–258**.
- Branded outer HTML: `brandedEmailHtml`, **63–96**.

Exact content assembly at **259–263**:

```typescript
const htmlBody = brandedEmailHtml(
  `<h2 style="margin:0 0 20px;color:#111827;font-size:20px;font-weight:700;">Production Update</h2>` +
  `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="font-size:14px;color:#374151;line-height:1.5;">${rowsHtml}</table>` +
  trackButton
);
```

Its frontend triggers are **`src/pages/ProductionOrders.tsx:553–563`** after a production update and **747–757** after supplier dispatch, both using `n8nPost('notify-emboss-team', …)`.

## Initial order notification — flag found, no send implementation found

**`src/pages/admin/AdminPoTracker.tsx:493–511`** calls:

```typescript
poTrackerRpc({
  action: 'create_client_order',
  // Client details, linked POs, category, and stages also included.
  notify_client: notifyClient,
  notify_suppliers: notifySuppliers,
});
```

The **Notify client by email** switch is at **645–646**. The returned `tracking_url` is handled at **521–528**.

**`src/lib/poTracker.ts:8–13`** forwards this payload directly to the database function `po_tracker_manage`—not to n8n.

A read-only check of the current database definitions found no email-send code or handling of `notify_client` in `po_tracker_manage` or `auto_create_client_order_from_3wm`. Therefore, this order-creation flag alone does **not** establish that an initial tracking email is sent. No initial order-confirmation HTML was found in the searched codebase.

The registered managed app-email templates in **`supabase/functions/_shared/transactional-email-templates/registry.ts`** contain `invite` and `recovery`, not a client tracking-email template.

## Scope and limitations

Searched frontend pages, components, library files, edge functions, templates, and SQL migrations; also checked relevant live database function definitions. External n8n workflow contents and actual email delivery were not verified. No changes or deployment are proposed by this report.