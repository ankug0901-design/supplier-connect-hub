
ALTER TABLE public.po_items
  ADD COLUMN IF NOT EXISTS confirmed_delivery_date date,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_by uuid;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS delivery_dates_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_notification_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_reminder_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_first_notified_at timestamptz;

-- RLS: allow suppliers (owner) and admins to update po_items confirmed_delivery_date
-- (po_items already has policies; we add a permissive UPDATE policy if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='po_items' AND policyname='Suppliers can update confirmed delivery on own po_items'
  ) THEN
    CREATE POLICY "Suppliers can update confirmed delivery on own po_items"
      ON public.po_items
      FOR UPDATE
      TO authenticated
      USING (
        public.is_admin() OR EXISTS (
          SELECT 1 FROM public.purchase_orders po
          JOIN public.suppliers s ON s.id = po.supplier_id
          WHERE po.id = po_items.po_id AND s.user_id = auth.uid()
        )
      )
      WITH CHECK (
        public.is_admin() OR EXISTS (
          SELECT 1 FROM public.purchase_orders po
          JOIN public.suppliers s ON s.id = po.supplier_id
          WHERE po.id = po_items.po_id AND s.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- RPC: suppliers (or admins) confirm per-line delivery dates
CREATE OR REPLACE FUNCTION public.confirm_po_delivery_dates(_po_id uuid, _items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed boolean;
  v_supplier_id uuid;
  rec jsonb;
  remaining int;
BEGIN
  SELECT po.supplier_id INTO v_supplier_id FROM public.purchase_orders po WHERE po.id = _po_id;
  IF v_supplier_id IS NULL THEN
    RAISE EXCEPTION 'Purchase order not found';
  END IF;

  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM public.suppliers WHERE id = v_supplier_id AND user_id = auth.uid()
  ) INTO allowed;
  IF NOT allowed THEN
    RAISE EXCEPTION 'Not authorized to confirm delivery dates for this PO';
  END IF;

  FOR rec IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    UPDATE public.po_items
      SET confirmed_delivery_date = NULLIF(rec->>'confirmed_delivery_date','')::date,
          confirmed_at = CASE WHEN NULLIF(rec->>'confirmed_delivery_date','') IS NOT NULL THEN now() ELSE NULL END,
          confirmed_by = CASE WHEN NULLIF(rec->>'confirmed_delivery_date','') IS NOT NULL THEN auth.uid() ELSE NULL END
    WHERE id = (rec->>'id')::uuid AND po_id = _po_id;
  END LOOP;

  SELECT count(*) INTO remaining
    FROM public.po_items
    WHERE po_id = _po_id AND confirmed_delivery_date IS NULL;

  IF remaining = 0 THEN
    UPDATE public.purchase_orders
      SET delivery_dates_confirmed_at = COALESCE(delivery_dates_confirmed_at, now())
      WHERE id = _po_id;
  ELSE
    UPDATE public.purchase_orders
      SET delivery_dates_confirmed_at = NULL
      WHERE id = _po_id;
  END IF;

  RETURN jsonb_build_object('po_id', _po_id, 'remaining', remaining, 'confirmed', remaining = 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_po_delivery_dates(uuid, jsonb) TO authenticated;
