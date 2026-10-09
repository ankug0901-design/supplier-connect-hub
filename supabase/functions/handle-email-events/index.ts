import { createEmailWebhookHandler } from 'npm:@lovable.dev/email-js@0.3.1'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { recordEmailOutcome } from './record-outcome.ts'

function client() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('Email outcome storage is not configured')
  return createClient(url, key)
}

const handler = createEmailWebhookHandler({
  apiKey: Deno.env.get('LOVABLE_API_KEY')!,
  on: {
    'email.bounced': async (event) => {
      await recordEmailOutcome(client(), event, 'bounce')
    },
    'email.complaint': async (event) => {
      await recordEmailOutcome(client(), event, 'complaint')
    },
    'email.unsubscribed': async (event) => {
      await recordEmailOutcome(client(), event, 'unsubscribe')
    },
  },
})

Deno.serve((req) => handler(req))
