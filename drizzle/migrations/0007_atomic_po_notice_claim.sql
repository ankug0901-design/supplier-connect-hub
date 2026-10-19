ALTER TABLE public.purchase_orders ADD COLUMN release_email_claimed_at timestamptz;
CREATE OR REPLACE FUNCTION public.claim_po_release_email(p_po_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE claimed uuid;
BEGIN
 UPDATE public.purchase_orders SET release_email_claimed_at = now() WHERE id = p_po_id AND delivery_notification_sent_at IS NULL AND delivery_first_notified_at IS NULL AND (release_email_claimed_at IS NULL OR release_email_claimed_at < now() - interval '15 minutes') RETURNING id INTO claimed;
 RETURN claimed IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_po_release_email(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_po_release_email(uuid) TO service_role;