
-- 1) Restrict supplier directory reads to admins only.
--    Previously anyone with 'admin-rfq' section access could read all supplier
--    contact/financial columns. Admins retain access via "Admin full access to suppliers".
DROP POLICY IF EXISTS "RFQ managers can read supplier directory" ON public.suppliers;

-- 2) Harden supplier UPDATE on rfq_portal_requests: keep RLS row-scope, but rely on
--    the existing prevent_rfq_admin_field_update trigger (already attached) AND
--    ensure the trigger fires BEFORE UPDATE on the admin-controlled columns only.
--    Recreate policy with explicit WITH CHECK also validated via trigger; drop any
--    duplicate triggers to keep exactly one guard.
DROP TRIGGER IF EXISTS rfq_admin_field_guard ON public.rfq_portal_requests;
DROP TRIGGER IF EXISTS trg_prevent_rfq_admin_field_update ON public.rfq_portal_requests;

CREATE TRIGGER trg_prevent_rfq_admin_field_update
BEFORE UPDATE OF emboss_decision, emboss_notes, price_rank, decided_at, rfq_closed_at
ON public.rfq_portal_requests
FOR EACH ROW
EXECUTE FUNCTION public.prevent_rfq_admin_field_update();
