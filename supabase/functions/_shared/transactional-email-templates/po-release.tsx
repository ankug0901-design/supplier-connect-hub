import * as React from 'npm:react@18.3.1';
import { Html, Head, Preview, Body, Container, Section, Heading, Text, Button, Row, Column } from 'npm:@react-email/components@0.0.22';
import type { TemplateEntry } from './registry.ts';

interface Props {
  supplierName?: string; poNumber?: string; poDate?: string; poUrl?: string;
  items?: { name: string; description?: string; qty: number }[];
}
const PoReleaseEmail = ({ supplierName = 'Supplier', poNumber = '', poDate = '', poUrl = '', items = [] }: Props) => (
  <Html lang="en"><Head /><Preview>New purchase order {poNumber} released — confirm delivery dates</Preview>
    <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Arial,sans-serif', color: '#1f2937' }}>
      <Container style={{ maxWidth: '640px', padding: '24px' }}>
        <Section style={{ backgroundColor: '#0d7377', padding: '24px' }}><Heading style={{ color: '#ffffff', fontSize: '24px', margin: 0 }}>EMBOSS MARKETING</Heading></Section>
        <Heading style={{ fontSize: '20px' }}>New purchase order released</Heading>
        <Text>Dear {supplierName},</Text>
        <Text>A new purchase order <strong>{poNumber}</strong> dated {poDate} has been released to you.</Text>
        <Text>Please log in to the supplier portal and confirm the expected delivery date for each line item. Until delivery dates are recorded, PO downloads and invoice uploads remain locked unless an exception request is approved.</Text>
        <Text>If you cannot confirm within 3 days of PO release, submit an Exception Request from the PO detail page.</Text>
        {items.map((item, index) => <Row key={index} style={{ borderBottom: '1px solid #e5e7eb', padding: '8px 0' }}>
          <Column><Text style={{ margin: '4px 0' }}>{item.name}</Text>{item.description && item.description !== item.name && <Text style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0' }}>{item.description}</Text>}</Column>
          <Column style={{ width: '70px', textAlign: 'right' }}><Text>{item.qty}</Text></Column>
        </Row>)}
        <Button href={poUrl} style={{ backgroundColor: '#0d7377', color: '#ffffff', padding: '12px 20px', borderRadius: '6px', marginTop: '20px' }}>View PO &amp; confirm delivery dates</Button>
        <Text style={{ fontSize: '12px', color: '#6b7280', marginTop: '28px' }}>This is an automated notice from Supplier Connect.</Text>
      </Container>
    </Body>
  </Html>
);
export const template = {
  component: PoReleaseEmail,
  subject: (data: Record<string, any>) => `New PO ${data.poNumber} released — confirm delivery dates`,
  displayName: 'Purchase order release',
  previewData: { supplierName: 'Supplier', poNumber: 'PO-001', poDate: '19 October 2026', poUrl: 'https://supplierconnect.embossmarketing.in/purchase-orders', items: [{ name: 'Printed packaging', qty: 20 }] },
} satisfies TemplateEntry;