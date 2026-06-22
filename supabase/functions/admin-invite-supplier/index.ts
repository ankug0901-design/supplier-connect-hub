import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import * as React from 'npm:react@18.3.1';
import { renderAsync } from 'npm:@react-email/components@0.0.22';
import { RecoveryEmail } from '../_shared/email-templates/recovery.tsx';
import { InviteEmail } from '../_shared/email-templates/invite.tsx';

const SITE_NAME = 'embosssupplierportal';
const SENDER_DOMAIN = 'notify.embossmarketing.in';
const FROM_DOMAIN = 'notify.embossmarketing.in';

async function enqueueAuthEmail(admin: any, opts: {
  type: 'recovery' | 'invite';
  email: string;
  url: string;
}) {
  const Template = opts.type === 'invite' ? InviteEmail : RecoveryEmail;
  const props: any = {
    siteName: SITE_NAME,
    siteUrl: 'https://supplierconnect.embossmarketing.in',
    recipient: opts.email,
    confirmationUrl: opts.url,
  };
  const html = await renderAsync(React.createElement(Template, props));
  const text = await renderAsync(React.createElement(Template, props), { plainText: true });
  const messageId = crypto.randomUUID();
  const subject = opts.type === 'invite' ? "You've been invited" : 'Reset your password';

  await admin.from('email_send_log').insert({
    message_id: messageId,
    template_name: opts.type,
    recipient_email: opts.email,
    status: 'pending',
  });

  const { error } = await admin.rpc('enqueue_email', {
    queue_name: 'auth_emails',
    payload: {
      run_id: messageId,
      message_id: messageId,
      to: opts.email,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject,
      html,
      text,
      purpose: 'transactional',
      label: opts.type,
      queued_at: new Date().toISOString(),
    },
  });
  if (error) throw error;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Verify caller is admin
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: callerSupplier } = await admin.from('suppliers').select('role').eq('user_id', userRes.user.id).maybeSingle();
    if (callerSupplier?.role !== 'admin' && callerSupplier?.role !== 'super_user') {
      return new Response(JSON.stringify({ error: 'Forbidden - admin only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    const { email, name, company, phone, gst_number, zoho_vendor_id } = body || {};
    if (!email || !name || !company) {
      return new Response(JSON.stringify({ error: 'email, name and company are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ALWAYS use the production URL — never trust client-supplied redirect_to.
    // If the admin invokes this from a preview/lovable.app origin, Supabase would
    // reject that redirect (not in the allowlist) and fall back to its default
    // site URL, landing the user on a generic signup page instead of our
    // /reset-password page. That breaks both the branding and the login flow.
    const redirectTo = 'https://supplierconnect.embossmarketing.in/reset-password';

    // Send invite (creates user + emails them a link to set password)
    const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { name, company },
    });

    let userId = inviteData?.user?.id;

    // If user already exists, fall back to a password reset email
    if (inviteErr) {
      const msg = inviteErr.message?.toLowerCase() || '';
      if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
        // Look up the existing user so we can flag this as a re-invite via
        // user_metadata. The auth-email-hook reads is_reinvite from
        // payload.data.user_metadata and renders the Invite email instead of
        // the Recovery email when true.
        const { data: existing } = await admin.from('suppliers').select('user_id').eq('email', email).maybeSingle();
        const existingUserId = existing?.user_id;

        if (existingUserId) {
          const { data: userRecord } = await admin.auth.admin.getUserById(existingUserId);
          const mergedMeta = {
            ...(userRecord?.user?.user_metadata || {}),
            name,
            company,
            is_reinvite: true,
          };
          await admin.auth.admin.updateUserById(existingUserId, { user_metadata: mergedMeta });
        }

        // IMPORTANT: admin.generateLink() only generates a token, it does NOT
        // send the email. Use the public auth endpoint via the anon client so
        // Supabase actually dispatches the recovery email (which then flows
        // through our auth-email-hook).
        const anonClient = createClient(SUPABASE_URL, ANON_KEY);
        const { error: resetErr } = await anonClient.auth.resetPasswordForEmail(email, {
          redirectTo,
        });
        if (resetErr) throw resetErr;
        userId = existingUserId;
      } else {
        throw inviteErr;
      }
    }

    // Upsert supplier row with provided details
    if (userId) {
      await admin.from('suppliers').upsert(
        {
          user_id: userId,
          name,
          email,
          company,
          phone: phone || null,
          gst_number: gst_number || null,
          zoho_vendor_id: zoho_vendor_id || null,
          role: 'supplier',
        },
        { onConflict: 'user_id' }
      );
    }

    return new Response(JSON.stringify({ success: true, user_id: userId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('admin-invite-supplier error', e);
    return new Response(JSON.stringify({ error: e.message || 'Server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
