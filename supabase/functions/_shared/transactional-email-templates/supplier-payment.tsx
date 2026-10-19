import * as React from 'npm:react@18.3.1';
import { Html, Head, Preview, Body, Container, Section, Heading, Text, Button } from 'npm:@react-email/components@0.0.22';
import type { TemplateEntry } from './registry.ts';

interface Props { supplierName?: string; paymentNumber?: string; invoiceNumber?: string; amount?: string; paymentDate?: string; paymentMode?: string; reference?: string }
const SupplierPaymentEmail = ({ supplierName = 'Supplier', paymentNumber = '', invoiceNumber = '', amount = '', paymentDate = '', paymentMode = '', reference = '' }: Props) => (
  <Html lang="en"><Head /><Preview>Payment {paymentNumber} made against invoice {invoiceNumber}</Preview>
    <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Arial,sans-serif', color: '#1f2937' }}>
      <Container style={{ maxWidth: '640px', padding: '24px' }}>
        <Section style={{ backgroundColor: '#0d7377', padding: '24px' }}><Heading style={{ color: '#ffffff', fontSize: '24px', margin: 0 }}>EMBOSS MARKETING</Heading></Section>
        <Heading style={{ fontSize: '20px' }}>Supplier payment made</Heading>
        <Text>Dear {supplierName},</Text><Text>A payment has been recorded for your account.</Text>
        <Text><strong>Payment:</strong> {paymentNumber}<br /><strong>Invoice:</strong> {invoiceNumber}<br /><strong>Amount:</strong> {amount}<br /><strong>Date:</strong> {paymentDate}<br /><strong>Reference:</strong> {reference}</Text>
        {paymentMode && <Text><strong>Payment mode:</strong> {paymentMode}</Text>}
        <Button href="https://supplierconnect.embossmarketing.in/payments" style={{ backgroundColor: '#0d7377', color: '#ffffff', padding: '12px 20px', borderRadius: '6px', marginTop: '20px' }}>View payment</Button>
        <Text style={{ fontSize: '12px', color: '#6b7280', marginTop: '28px' }}>This is an automated notice from Supplier Connect.</Text>
      </Container>
    </Body>
  </Html>
);
export const template = {
  component: SupplierPaymentEmail,
  subject: (data: Record<string, any>) => `Payment made — ${data.paymentNumber || data.invoiceNumber}`,
  displayName: 'Supplier payment made',
  previewData: { supplierName: 'Supplier', paymentNumber: 'PAY-001', invoiceNumber: 'INV-001', amount: '₹10,000.00', paymentDate: '19 October 2026', reference: 'PAY-001' },
} satisfies TemplateEntry;