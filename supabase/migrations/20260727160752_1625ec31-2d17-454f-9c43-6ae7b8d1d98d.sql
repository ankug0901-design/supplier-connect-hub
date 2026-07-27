DROP POLICY IF EXISTS "rfq_documents_select_all" ON public.rfq_documents;
DROP POLICY IF EXISTS "rfq_documents_select" ON public.rfq_documents;
DROP POLICY IF EXISTS "rfq_documents_insert_service" ON public.rfq_documents;
DROP POLICY IF EXISTS "rfq_documents_delete_service" ON public.rfq_documents;

CREATE POLICY "rfq_documents_select" ON public.rfq_documents
  FOR SELECT USING (true);

CREATE POLICY "rfq_documents_insert_service" ON public.rfq_documents
  FOR INSERT WITH CHECK (false);

CREATE POLICY "rfq_documents_delete_service" ON public.rfq_documents
  FOR DELETE USING (false);