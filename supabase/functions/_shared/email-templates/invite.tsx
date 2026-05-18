/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body,
  Head,
  Html,
  Preview,
} from 'npm:@react-email/components@0.0.22'

interface InviteEmailProps {
  siteName?: string
  siteUrl?: string
  confirmationUrl: string
  recipient?: string
  email?: string
}

export const InviteEmail = ({
  confirmationUrl,
  recipient,
  email,
}: InviteEmailProps) => {
  const to = recipient || email || ''
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>You're invited to join the Emboss Supplier Connect Hub</Preview>
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
                    🎉 You're invited to join our Supplier Connect Hub
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '32px' }}>
                    <p style={{ margin: '0 0 16px', fontSize: '14px', lineHeight: 1.6 }}>Dear Partner,</p>
                    <p style={{ margin: '0 0 16px', fontSize: '14px', lineHeight: 1.6 }}>
                      Greetings from <strong>Emboss Marketing LLP</strong>. As part of our ongoing effort to digitise procurement and make doing business with us faster and more transparent, we have built the <strong>Supplier Connect Hub</strong> — a dedicated end-to-end portal for our trusted printing, packaging, and POS-display partners.
                    </p>
                    <p style={{ margin: '0 0 20px', fontSize: '14px', lineHeight: 1.6 }}>
                      Once your account is set up, the portal will be your one-stop window for everything you do with us — from initial RFQ to final payment.
                    </p>

                    <div style={{ background: '#f9f9f9', borderLeft: '3px solid #1a6b3c', padding: '14px 18px', marginBottom: '14px' }}>
                      <p style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 'bold', color: '#1a1a2e' }}>📋 Quoting &amp; RFQs</p>
                      <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12.5px', color: '#444', lineHeight: 1.7 }}>
                        <li>Receive all RFQs from Emboss in one place — no more buried emails</li>
                        <li>Submit competitive quotes through a structured form (price, GST, lead time, payment terms)</li>
                        <li>See your provisional price rank instantly after submission</li>
                        <li>Track live RFQs, submitted quotes, and award decisions</li>
                      </ul>
                    </div>

                    <div style={{ background: '#f9f9f9', borderLeft: '3px solid #1a6b3c', padding: '14px 18px', marginBottom: '14px' }}>
                      <p style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 'bold', color: '#1a1a2e' }}>📦 Purchase Orders &amp; Shipments</p>
                      <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12.5px', color: '#444', lineHeight: 1.7 }}>
                        <li>Receive Purchase Orders digitally — acknowledge and accept with one click</li>
                        <li>Update production status and expected dispatch dates</li>
                        <li>Upload shipment details, courier / transporter info, LR copies, and dispatch photos</li>
                        <li>Maintain a clean delivery history against each PO</li>
                      </ul>
                    </div>

                    <div style={{ background: '#f9f9f9', borderLeft: '3px solid #1a6b3c', padding: '14px 18px', marginBottom: '20px' }}>
                      <p style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 'bold', color: '#1a1a2e' }}>💰 Invoicing &amp; Payments</p>
                      <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12.5px', color: '#444', lineHeight: 1.7 }}>
                        <li>Upload tax invoices directly against each Purchase Order</li>
                        <li>Track invoice status — received, under verification, approved, paid</li>
                        <li>View real-time payment status and outstanding balance</li>
                        <li>Access UTR / transaction references for all payments made</li>
                        <li>Download payment statements and ledger summaries anytime</li>
                      </ul>
                    </div>

                    <table cellPadding={0} cellSpacing={0} style={{ margin: '24px 0' }}>
                      <tr>
                        <td style={{ background: '#1a6b3c', borderRadius: '4px' }}>
                          <a href={confirmationUrl} style={{ display: 'inline-block', padding: '14px 32px', color: '#ffffff', textDecoration: 'none', fontWeight: 'bold', fontSize: '14px' }}>
                            Set Up Your Account →
                          </a>
                        </td>
                      </tr>
                    </table>

                    <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#666', lineHeight: 1.6 }}>
                      The link above is unique to you. Clicking it will let you create a password and complete your supplier profile in under 2 minutes.
                    </p>
                    <p style={{ margin: '0 0 20px', fontSize: '12px', color: '#666', lineHeight: 1.6 }}>
                      If the button doesn't work, copy and paste this link into your browser:<br />
                      <a href={confirmationUrl} style={{ color: '#1a6b3c', wordBreak: 'break-all' }}>{confirmationUrl}</a>
                    </p>

                    <div style={{ borderTop: '1px solid #eee', paddingTop: '16px', marginTop: '24px' }}>
                      <p style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 'bold', color: '#1a1a2e' }}>A few quick notes</p>
                      <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: '#555', lineHeight: 1.7 }}>
                        <li>The portal is <strong>free</strong> to use — no fees, subscriptions, or charges of any kind</li>
                        <li>Your pricing and commercial information remains <strong>strictly confidential</strong> to Emboss</li>
                        <li>You can continue to receive RFQs and exchange documents by email — the portal is a complement, not a replacement</li>
                        <li>For any questions, simply reply to this email</li>
                      </ul>
                    </div>

                    <p style={{ margin: '24px 0 4px', fontSize: '13px', color: '#444' }}>Looking forward to a long and rewarding partnership.</p>
                    <p style={{ margin: 0, fontSize: '13px', fontWeight: 'bold' }}>Procurement Team</p>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#666' }}>Emboss Marketing LLP</p>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#666' }}>✉ procurement@embossmarketing.in</p>
                  </td>
                </tr>
                <tr>
                  <td style={{ background: '#f0f0f0', padding: '14px 32px', textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: '11px', color: '#999' }}>
                      Emboss Marketing LLP | Printing · Packaging · POS Displays<br />
                      This invitation was sent to {to}. If you weren't expecting this, please ignore this email.
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

export default InviteEmail
