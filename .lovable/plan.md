# Digital Asset Management

## What you’ll get
- An admin **Asset Library** at `/admin/assets`, linked from the sidebar and styled like the existing RFQ and PO pages.
- Summary counts, searchable/filterable assets, grid and table views, previews, downloads, and sharing.
- A right-side upload drawer supporting multiple files, editable metadata, tags, client suggestions, and searchable PO/RFQ links.
- Asset details with metadata editing, approval/rejection/archive actions, version history, audit activity, and threaded comments.

## Technical details
- Use the existing `assets`, `asset_audit_log`, `asset_comments`, and `dam-assets` bucket through the existing client; no tables, functions, or migrations.
- Generate daily `AST-YYYYMMDD-NNNN` codes by looking up the current maximum; retry unique-code conflicts.
- New versions point to the selected current version, increment its version, and retire its latest flag. Handle partial failures explicitly, because direct client requests cannot form a database transaction.
- Retain existing admin access checks and storage permissions. Public sharing is available only if the existing bucket permits public access; do not change its visibility silently.
- Test code generation and version rules, then verify uploads, metadata, comments, status changes, and read-back in the signed-in admin page where an authorized session is available.

## Assumptions
- Library views show the latest versions; full version chains remain accessible in asset details.
- Multiple uploads share entered metadata but have individually editable names and unique asset codes.
- Sharing copies the stored file URL; no new public review page or email workflow is included.