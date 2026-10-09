import * as React from 'npm:react@18.3.1';
import { InviteEmail } from '../email-templates/invite.tsx';
import { RecoveryEmail } from '../email-templates/recovery.tsx';
import type { TemplateEntry } from './registry.ts';

interface Props { confirmationUrl?: string }
const Invite = ({ confirmationUrl = '' }: Props) => (
  <InviteEmail siteName="embosssupplierportal" siteUrl="https://supplierconnect.embossmarketing.in" confirmationUrl={confirmationUrl} />
);
const Recovery = ({ confirmationUrl = '' }: Props) => (
  <RecoveryEmail siteName="embosssupplierportal" confirmationUrl={confirmationUrl} />
);

export const inviteTemplate = {
  component: Invite,
  subject: "You've been invited",
  displayName: 'Supplier invitation',
  previewData: { confirmationUrl: 'https://supplierconnect.embossmarketing.in/reset-password' },
} satisfies TemplateEntry;

export const recoveryTemplate = {
  component: Recovery,
  subject: 'Reset your password',
  displayName: 'Supplier password reset',
  previewData: { confirmationUrl: 'https://supplierconnect.embossmarketing.in/reset-password' },
} satisfies TemplateEntry;