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
      message_id: messageId,
      idempotency_key: `${opts.type}-${opts.email.toLowerCase()}-${messageId}`,
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

    // Look up existing user
    const { data: existingSupplier } = await admin
      .from('suppliers').select('user_id').eq('email', email).maybeSingle();
    let existingUserId: string | undefined = existingSupplier?.user_id ?? undefined;

    let userId: string | undefined;

    if (!existingUserId) {
      // Create user with no auto email — we send our own via the queue (avoids rate limits)
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { name, company },
      });
      if (createErr) {
        const msg = createErr.message?.toLowerCase() || '';
        if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
          const { data: list } = await admin.auth.admin.listUsers();
          const found = list?.users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
          existingUserId = found?.id;
        } else {
          throw createErr;
        }
      } else {
        userId = created.user?.id;
      }
    }

    if (existingUserId) {
      const { data: userRecord } = await admin.auth.admin.getUserById(existingUserId);
      const mergedMeta = { ...(userRecord?.user?.user_metadata || {}), name, company };
      await admin.auth.admin.updateUserById(existingUserId, { user_metadata: mergedMeta });
    }

    // Generate link via admin API (NOT rate-limited), then enqueue our own email.
    const linkType: 'invite' | 'recovery' = existingUserId ? 'recovery' : 'invite';
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: linkType,
      email,
      options: { redirectTo },
    });
    if (linkErr) throw linkErr;
    const actionLink = linkData?.properties?.action_link;
    if (!actionLink) throw new Error('Failed to generate action link');

    await enqueueAuthEmail(admin, { type: linkType, email, url: actionLink });

    userId = userId || existingUserId;

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
