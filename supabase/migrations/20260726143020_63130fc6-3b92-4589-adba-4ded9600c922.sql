CREATE TABLE IF NOT EXISTS public.rfq_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rfq_id TEXT NOT NULL,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('artwork','boq_template','reference','technical_drawing','specification','other')),
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT,
  uploaded_by TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  item_number INT,
  notes TEXT
);

GRANT SELECT ON public.rfq_documents TO authenticated;
GRANT SELECT ON public.rfq_documents TO anon;
GRANT ALL ON public.rfq_documents TO service_role;

CREATE INDEX IF NOT EXISTS idx_rfq_documents_rfq_id ON public.rfq_documents(rfq_id);
CREATE INDEX IF NOT EXISTS idx_rfq_documents_rfq_type ON public.rfq_documents(rfq_id, doc_type);

ALTER TABLE public.rfq_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rfq_documents_select_all"
  ON public.rfq_documents FOR SELECT
  USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.rfq_documents;