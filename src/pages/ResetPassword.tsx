import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

const RESET_SESSION_KEY = 'passwordResetSessionReadyAt';
const RESET_SESSION_MAX_AGE_MS = 30 * 60 * 1000;

function markResetSessionReady() {
  sessionStorage.setItem(RESET_SESSION_KEY, String(Date.now()));
}

function hasRecentResetSession() {
  const readyAt = Number(sessionStorage.getItem(RESET_SESSION_KEY) || 0);
  return readyAt > 0 && Date.now() - readyAt < RESET_SESSION_MAX_AGE_MS;
}

function getUrlParams() {
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return {
    search: url.searchParams,
    hash,
    get: (key: string) => url.searchParams.get(key) || hash.get(key),
  };
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) {
        markResetSessionReady();
        setReady(true);
      }
    });

    (async () => {
      try {
        const params = getUrlParams();

        // Error in URL (e.g. otp_expired)
        const errDesc = params.get('error_description') || params.get('error_code');
        if (errDesc) {
          setError(decodeURIComponent(errDesc));
          return;
        }

        // 1) PKCE code flow: ?code=...
        const code = params.get('code');
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          markResetSessionReady();
          window.history.replaceState({}, document.title, '/reset-password');
          setReady(true);
          return;
        }

        // 2) Token hash flow: ?token_hash=...&type=recovery|invite
        const tokenHash = params.get('token_hash');
        const type = params.get('type') as 'recovery' | 'invite' | null;
        if (tokenHash && type) {
          if (type !== 'recovery' && type !== 'invite') throw new Error('This link is not a password reset link.');
          const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
          if (error) throw error;
          markResetSessionReady();
          window.history.replaceState({}, document.title, '/reset-password');
          setReady(true);
          return;
        }

        // 3) Implicit flow: #access_token=...&refresh_token=...
        const accessToken = params.hash.get('access_token');
        const refreshToken = params.hash.get('refresh_token');
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (error) throw error;
          markResetSessionReady();
          window.history.replaceState({}, document.title, '/reset-password');
          setReady(true);
          return;
        }

        // 4) Allow refresh only after this tab has already validated a reset/invite link.
        const { data } = await supabase.auth.getSession();
        if (data.session && hasRecentResetSession()) {
          setReady(true);
          return;
        }

        setError('This link is invalid or has expired. Please request a new one.');
      } catch (e: any) {
        setError(e?.message || 'This link is invalid or has expired. Please request a new one.');
      }
    })();

    return () => subscription.unsubscribe();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return setError('Password must be at least 6 characters');
    if (password !== confirm) return setError('Passwords do not match');
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    sessionStorage.removeItem(RESET_SESSION_KEY);
    setSuccess(true);
    toast({ title: 'Password set', description: 'You can now sign in with your new password.' });
    setTimeout(() => navigate('/', { replace: true }), 1500);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md p-8 space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold">Set your password</h1>
          <p className="text-sm text-muted-foreground">
            Choose a new password for your supplier portal account.
          </p>
        </div>

        {success ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-success" />
            <p className="font-medium">Password updated. Redirecting…</p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="pl-10 pr-10"
                  disabled={!ready || loading}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  aria-label={show ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Confirm Password</Label>
              <Input
                type={show ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={!ready || loading}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" variant="gradient" size="lg" disabled={!ready || loading}>
              {loading ? 'Saving…' : ready ? 'Save Password' : 'Validating link…'}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
