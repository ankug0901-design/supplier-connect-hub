const PRODUCTION_PORTAL_ORIGIN = 'https://supplierconnect.embossmarketing.in';

export function getPasswordResetRedirectUrl() {
  if (typeof window === 'undefined') return `${PRODUCTION_PORTAL_ORIGIN}/reset-password`;

  const host = window.location.hostname;
  const isLocalPreview = host === 'localhost' || host === '127.0.0.1';
  const origin = isLocalPreview ? window.location.origin : PRODUCTION_PORTAL_ORIGIN;

  return `${origin}/reset-password`;
}