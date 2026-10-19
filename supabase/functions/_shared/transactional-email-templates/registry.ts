import type { ComponentType } from 'npm:react@18.3.1'
import { inviteTemplate, recoveryTemplate } from './supplier-account.tsx'
import { template as poReleaseTemplate } from './po-release.tsx'
import { template as supplierPaymentTemplate } from './supplier-payment.tsx'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

/**
 * Template registry — maps template names to their React Email components.
 * Import and register new templates here after creating them in this directory.
 *
 * Example:
 *   import { template as welcomeTemplate } from './welcome.tsx'
 *   // then add to TEMPLATES: 'welcome': welcomeTemplate
 */
export const TEMPLATES: Record<string, TemplateEntry> = {
  invite: inviteTemplate,
  recovery: recoveryTemplate,
  'po-release': poReleaseTemplate,
  'supplier-payment': supplierPaymentTemplate,
}
