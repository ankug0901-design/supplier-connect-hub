
CREATE TABLE public.vendor_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL,
  company text NOT NULL,
  score integer NOT NULL,
  grade text NOT NULL,
  strengths jsonb NOT NULL DEFAULT '[]'::jsonb,
  weaknesses jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendation text,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  scored_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vendor_scores_supplier ON public.vendor_scores(supplier_id, scored_at DESC);
CREATE INDEX idx_vendor_scores_scored_at ON public.vendor_scores(scored_at DESC);

ALTER TABLE public.vendor_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to vendor_scores"
ON public.vendor_scores
FOR ALL
USING (is_admin())
WITH CHECK (is_admin());
