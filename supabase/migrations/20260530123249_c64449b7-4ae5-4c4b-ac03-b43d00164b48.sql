-- Fix privilege escalation: prevent suppliers from changing their own role
DROP POLICY IF EXISTS "Suppliers can update own profile" ON public.suppliers;

CREATE POLICY "Suppliers can update own profile"
ON public.suppliers
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id AND role = 'supplier');

-- Defense in depth: attach the existing prevent_role_escalation trigger
DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.suppliers;
CREATE TRIGGER trg_prevent_role_escalation
BEFORE UPDATE ON public.suppliers
FOR EACH ROW
EXECUTE FUNCTION public.prevent_role_escalation();

-- Add realtime channel authorization: only allow authenticated users to subscribe
-- (table-level RLS still enforces what rows they actually see)
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can receive broadcasts" ON realtime.messages;
CREATE POLICY "Authenticated users can receive broadcasts"
ON realtime.messages
FOR SELECT
TO authenticated
USING (true);