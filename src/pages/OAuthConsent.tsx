import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Sparkles } from "lucide-react";

// Typed shim: supabase.auth.oauth is currently beta and may not be in the SDK types.
type OAuthNs = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
};
const oauth = (supabase.auth as any).oauth as OAuthNs;

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) return setError("Missing authorization_id");
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/?next=" + encodeURIComponent(next);
        return;
      }
      if (!oauth) return setError("OAuth namespace unavailable in this SDK build.");
      const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) return setError(error.message);
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    const { data, error } = approve
      ? await oauth.approveAuthorization(authorizationId)
      : await oauth.denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      return setError("No redirect returned by the authorization server.");
    }
    window.location.href = target;
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="max-w-md p-6 space-y-2">
          <h1 className="text-lg font-semibold">Authorization error</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </Card>
      </main>
    );
  }
  if (!details) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  const clientName = details.client?.name ?? "an external app";
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md p-6 space-y-5">
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-primary/10 p-2">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-xl font-semibold">Connect {clientName}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {clientName} is requesting access to your Emboss supplier account. It will be able to
          read your purchase orders, invoices, payments, and profile on your behalf.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" disabled={busy} onClick={() => decide(false)}>
            Deny
          </Button>
          <Button variant="gradient" className="flex-1" disabled={busy} onClick={() => decide(true)}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve"}
          </Button>
        </div>
      </Card>
    </main>
  );
}
