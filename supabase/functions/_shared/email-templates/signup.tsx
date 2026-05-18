/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body,
  Head,
  Html,
  Preview,
} from 'npm:@react-email/components@0.0.22'

interface SignupEmailProps {
  siteName?: string
  siteUrl?: string
  recipient?: string
  email?: string
  confirmationUrl: string
}

export const SignupEmail = ({
  recipient,
  email,
  confirmationUrl,
}: SignupEmailProps) => {
  const to = recipient || email || ''
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Confirm your email for the Emboss Supplier Connect Hub</Preview>
      <Body style={{ margin: 0, padding: 0, background: '#f5f5f5', fontFamily: 'Arial, sans-serif', color: '#000' }}>
        <table width="100%" cellPadding={0} cellSpacing={0} style={{ background: '#f5f5f5', padding: '24px 0' }}>
          <tr>
            <td align="center">
              <table width={640} cellPadding={0} cellSpacing={0} style={{ background: '#ffffff', border: '1px solid #e0e0e0', maxWidth: '640px' }}>
                <tr>
                  <td style={{ background: '#1a1a2e', padding: '24px 32px' }}>
                    <div style={{ color: '#4ade80', fontSize: '22px', fontWeight: 'bold', letterSpacing: '1px' }}>EMBOSS MARKETING</div>
                    <div style={{ color: '#aaa', fontSize: '11px', letterSpacing: '2px', marginTop: '4px' }}>PRINTING · PACKAGING · POS DISPLAYS</div>
                  </td>
                </tr>
                <tr>
                  <td style={{ background: '#1a6b3c', padding: '10px 32px', color: 'white', fontSize: '13px', fontWeight: 'bold' }}>
                    ✉ Please confirm your email address
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '32px' }}>
                    <p style={{ margin: '0 0 16px', fontSize: '14px', lineHeight: 1.6 }}>Dear Partner,</p>
                    <p style={{ margin: '0 0 16px', fontSize: '14px', lineHeight: 1.6 }}>
                      Thank you for signing up to the <strong>Emboss Supplier Connect Hub</strong>. To complete your registration and activate your account, please confirm your email address by clicking the button below.
                    </p>

                    <table cellPadding={0} cellSpacing={0} style={{ margin: '24px 0' }}>
                      <tr>
                        <td style={{ background: '#1a6b3c', borderRadius: '4px' }}>
                          <a href={confirmationUrl} style={{ display: 'inline-block', padding: '14px 32px', color: '#ffffff', textDecoration: 'none', fontWeight: 'bold', fontSize: '14px' }}>
                            Confirm Email Address →
                          </a>
                        </td>
                      </tr>
                    </table>

                    <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#666', lineHeight: 1.6 }}>
                      This confirmation link is unique to you and will expire in 24 hours.
                    </p>
                    <p style={{ margin: '0 0 20px', fontSize: '12px', color: '#666', lineHeight: 1.6 }}>
                      If the button doesn't work, copy and paste this link into your browser:<br />
                      <a href={confirmationUrl} style={{ color: '#1a6b3c', wordBreak: 'break-all' }}>{confirmationUrl}</a>
                    </p>

                    <div style={{ background: '#fff7e6', borderLeft: '4px solid #d97706', padding: '12px 16px', fontSize: '12px', color: '#7c2d12', lineHeight: 1.6, margin: '20px 0' }}>
                      <strong>Didn't sign up?</strong> If you did not create an account on Supplier Connect Hub, please ignore this email. No account will be created without confirmation.
                    </div>

                    <p style={{ margin: '24px 0 4px', fontSize: '13px', color: '#444' }}>For any questions, simply reply to this email.</p>
                    <p style={{ margin: '8px 0 0', fontSize: '13px', color: '#444' }}>Best regards,</p>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', fontWeight: 'bold' }}>Procurement Team</p>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#666' }}>Emboss Marketing LLP</p>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#666' }}>✉ procurement@embossmarketing.in</p>
                  </td>
                </tr>
                <tr>
                  <td style={{ background: '#f0f0f0', padding: '14px 32px', textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: '11px', color: '#999' }}>
                      Emboss Marketing LLP | Printing · Packaging · POS Displays<br />
                      This email was sent to {to}.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </Body>
    </Html>
  )
}

export default SignupEmail
