
-- 1. Add denormalized exception fields to purchase_orders
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS exception_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS exception_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS exception_rejected_at timestamptz;

-- 2. Create exception requests table
CREATE TABLE IF NOT EXISTS public.po_exception_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES auth.users(id),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  admin_notes text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT po_exception_status_chk CHECK (status IN ('pending','approved','rejected'))
);

CREATE INDEX IF NOT EXISTS po_exception_requests_po_id_idx ON public.po_exception_requests(po_id);
CREATE INDEX IF NOT EXISTS po_exception_requests_supplier_id_idx ON public.po_exception_requests(supplier_id);
CREATE INDEX IF NOT EXISTS po_exception_requests_status_idx ON public.po_exception_requests(status);

GRANT SELECT, INSERT, UPDATE ON public.po_exception_requests TO authenticated;
GRANT ALL ON public.po_exception_requests TO service_role;

ALTER TABLE public.po_exception_requests ENABLE ROW LEVEL SECURITY;

-- Suppliers can read their own requests; admins/super_users can read all
CREATE POLICY "po_exception_select"
  ON public.po_exception_requests FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.suppliers s
      WHERE s.id = po_exception_requests.supplier_id AND s.user_id = auth.uid()
    )
  );

-- Suppliers can insert a request for their own PO; admins can insert anything
CREATE POLICY "po_exception_insert"
  ON public.po_exception_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.suppliers s
      WHERE s.id = po_exception_requests.supplier_id AND s.user_id = auth.uid()
    )
  );

-- Only admins can update (approve/reject)
CREATE POLICY "po_exception_update_admin"
  ON public.po_exception_requests FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE TRIGGER set_po_exception_requests_updated_at
  BEFORE UPDATE ON public.po_exception_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Trigger: keep purchase_orders.exception_* in sync with latest decision
CREATE OR REPLACE FUNCTION public.sync_po_exception_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.purchase_orders
      SET exception_requested_at = COALESCE(exception_requested_at, NEW.created_at)
      WHERE id = NEW.po_id;
  END IF;

  IF NEW.status = 'approved' THEN
    UPDATE public.purchase_orders
      SET exception_approved_at = COALESCE(NEW.reviewed_at, now()),
          exception_rejected_at = NULL
      WHERE id = NEW.po_id;
  ELSIF NEW.status = 'rejected' THEN
    UPDATE public.purchase_orders
      SET exception_rejected_at = COALESCE(NEW.reviewed_at, now()),
          exception_approved_at = NULL
      WHERE id = NEW.po_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER po_exception_requests_sync
  AFTER INSERT OR UPDATE ON public.po_exception_requests
  FOR EACH ROW EXECUTE FUNCTION public.sync_po_exception_status();

-- 4. RPC: supplier requests an exception
CREATE OR REPLACE FUNCTION public.request_po_exception(_po_id uuid, _reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supplier_id uuid;
  v_user uuid := auth.uid();
  v_id uuid;
  v_existing uuid;
BEGIN
  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN
    RAISE EXCEPTION 'Reason is required';
  END IF;

  SELECT po.supplier_id INTO v_supplier_id
    FROM public.purchase_orders po WHERE po.id = _po_id;
  IF v_supplier_id IS NULL THEN
    RAISE EXCEPTION 'Purchase order not found';
  END IF;

  IF NOT (public.is_admin() OR EXISTS (
    SELECT 1 FROM public.suppliers s
    WHERE s.id = v_supplier_id AND s.user_id = v_user
  )) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- If there's already a pending request, return it
  SELECT id INTO v_existing
    FROM public.po_exception_requests
    WHERE po_id = _po_id AND status = 'pending'
    ORDER BY created_at DESC LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  INSERT INTO public.po_exception_requests (po_id, supplier_id, requested_by, reason, status)
    VALUES (_po_id, v_supplier_id, v_user, _reason, 'pending')
    RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 5. RPC: admin reviews an exception
CREATE OR REPLACE FUNCTION public.review_po_exception(_request_id uuid, _decision text, _admin_notes text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can review exception requests';
  END IF;
  IF _decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'Invalid decision';
  END IF;

  UPDATE public.po_exception_requests
    SET status = _decision,
        admin_notes = _admin_notes,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    WHERE id = _request_id
    RETURNING po_id INTO v_po_id;

  IF v_po_id IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  RETURN jsonb_build_object('request_id', _request_id, 'po_id', v_po_id, 'status', _decision);
END;
$$;
