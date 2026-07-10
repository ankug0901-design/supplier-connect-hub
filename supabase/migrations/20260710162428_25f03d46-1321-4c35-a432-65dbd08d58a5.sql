
CREATE TABLE public.rfq_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id text NOT NULL,
  item_number int NOT NULL,
  product_category text,
  product_name text NOT NULL,
  quantity text NOT NULL,
  dimensions text,
  material text,
  print_process text,
  finish text,
  colours text,
  artwork_status text,
  extra_specs text,
  attachment_url text,
  attachment_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rfq_id, item_number)
);
CREATE INDEX idx_rfq_items_rfq_id ON public.rfq_items(rfq_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rfq_items TO authenticated;
GRANT ALL ON public.rfq_items TO service_role;
ALTER TABLE public.rfq_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage rfq_items" ON public.rfq_items FOR ALL TO authenticated
USING (public.is_admin() OR public.has_section_access('admin-rfq'))
WITH CHECK (public.is_admin() OR public.has_section_access('admin-rfq'));
CREATE POLICY "Suppliers view items for their RFQs" ON public.rfq_items FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.rfq_portal_requests r
  JOIN public.suppliers s ON lower(s.email) = lower(r.supplier_email)
  WHERE r.rfq_id = rfq_items.rfq_id AND s.user_id = auth.uid()
));
CREATE TRIGGER update_rfq_items_updated_at BEFORE UPDATE ON public.rfq_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.rfq_item_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id text NOT NULL,
  item_number int NOT NULL,
  supplier_email text NOT NULL,
  quoted_unit_price numeric(12,2),
  quoted_gst_percent numeric(5,2),
  total_price numeric(12,2),
  unit_basis text,
  lead_time_days int,
  setup_charges numeric(12,2),
  quote_notes text,
  quote_source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rfq_id, item_number, supplier_email)
);
CREATE INDEX idx_rfq_item_quotes_rfq_id ON public.rfq_item_quotes(rfq_id);
CREATE INDEX idx_rfq_item_quotes_supplier_email ON public.rfq_item_quotes(lower(supplier_email));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rfq_item_quotes TO authenticated;
GRANT ALL ON public.rfq_item_quotes TO service_role;
ALTER TABLE public.rfq_item_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage rfq_item_quotes" ON public.rfq_item_quotes FOR ALL TO authenticated
USING (public.is_admin() OR public.has_section_access('admin-rfq'))
WITH CHECK (public.is_admin() OR public.has_section_access('admin-rfq'));
CREATE POLICY "Suppliers view own item quotes" ON public.rfq_item_quotes FOR SELECT TO authenticated
USING (lower(supplier_email) = lower((SELECT email FROM public.suppliers WHERE user_id = auth.uid() LIMIT 1)));
CREATE POLICY "Suppliers insert own item quotes" ON public.rfq_item_quotes FOR INSERT TO authenticated
WITH CHECK (lower(supplier_email) = lower((SELECT email FROM public.suppliers WHERE user_id = auth.uid() LIMIT 1)));
CREATE POLICY "Suppliers update own item quotes" ON public.rfq_item_quotes FOR UPDATE TO authenticated
USING (lower(supplier_email) = lower((SELECT email FROM public.suppliers WHERE user_id = auth.uid() LIMIT 1)))
WITH CHECK (lower(supplier_email) = lower((SELECT email FROM public.suppliers WHERE user_id = auth.uid() LIMIT 1)));
CREATE TRIGGER update_rfq_item_quotes_updated_at BEFORE UPDATE ON public.rfq_item_quotes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.rfq_portal_requests
  ADD COLUMN IF NOT EXISTS is_multi_item boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS item_count int NOT NULL DEFAULT 1;

-- Backfill items (one per distinct rfq_id)
INSERT INTO public.rfq_items (
  rfq_id, item_number, product_category, product_name, quantity,
  dimensions, material, print_process, finish, colours,
  artwork_status, extra_specs, attachment_url, created_at
)
SELECT DISTINCT ON (r.rfq_id)
  r.rfq_id, 1, r.product_category,
  COALESCE(NULLIF(r.product_name, ''), 'Item'),
  COALESCE(NULLIF(r.quantity, ''), '1'),
  r.dimensions, r.material, r.print_process, r.finish, r.colours,
  r.artwork_status, r.extra_specs, r.artwork_drive_url,
  COALESCE(r.created_at, now())
FROM public.rfq_portal_requests r
WHERE r.rfq_id IS NOT NULL
ORDER BY r.rfq_id, r.created_at ASC
ON CONFLICT (rfq_id, item_number) DO NOTHING;

-- Backfill quotes
INSERT INTO public.rfq_item_quotes (
  rfq_id, item_number, supplier_email,
  quoted_unit_price, quoted_gst_percent, total_price,
  lead_time_days, setup_charges, quote_notes, quote_source, created_at
)
SELECT
  r.rfq_id, 1, r.supplier_email,
  r.quoted_unit_price, r.quoted_gst_percent, r.total_price,
  r.lead_time_days, r.setup_charges, r.supplier_notes,
  'backfill',
  COALESCE(r.quote_submitted_at, r.created_at, now())
FROM public.rfq_portal_requests r
WHERE r.rfq_id IS NOT NULL
  AND r.supplier_email IS NOT NULL
  AND r.quoted_unit_price IS NOT NULL
ON CONFLICT (rfq_id, item_number, supplier_email) DO NOTHING;
