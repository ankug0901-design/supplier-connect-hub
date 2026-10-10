import { jsPDF } from 'jspdf';

export type ApprovalCertificate = {
  orderNumber: string; clientName: string; itemName?: string; clientPoRef?: string; approvedOn: string;
};
export function certificateFields(details: ApprovalCertificate): [string, string][] {
  return [
    ['Order Number', details.orderNumber], ['Client Name', details.clientName || '—'],
    ...(details.itemName ? [['Item', details.itemName] as [string, string]] : []),
    ...(details.clientPoRef ? [['Client PO Reference', details.clientPoRef] as [string, string]] : []),
    ['Approved On', new Date(details.approvedOn).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })],
  ];
}
export function downloadApprovalCertificate(details: ApprovalCertificate) {
  const pdf = new jsPDF();
  pdf.setFillColor('#0d7377');
  pdf.rect(0, 0, 210, 45, 'F');
  pdf.setTextColor('#ffffff');
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(24);
  pdf.text('EMBOSS MARKETING', 20, 24);
  pdf.setFontSize(9); pdf.text('PRINTING · PACKAGING · POS MATERIALS', 20, 34);
  pdf.setTextColor('#0d7377'); pdf.setFontSize(17);
  pdf.text('PROOF APPROVAL CERTIFICATE', 20, 65);
  let y = 84;
  for (const [label, value] of certificateFields(details)) {
    const lines: string[] = pdf.splitTextToSize(value, 170);
    const needed = 13 + lines.length * 6;
    if (y + needed > 255) { pdf.addPage(); y = 25; }
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor('#0d7377');
    pdf.text(label, 20, y);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(12); pdf.setTextColor('#1f2937');
    pdf.text(lines, 20, y + 7); y += needed;
  }
  if (y > 235) { pdf.addPage(); y = 25; }
  pdf.setFontSize(12);
  pdf.text(pdf.splitTextToSize('This certifies that the above proof has been reviewed and approved for production.', 170), 20, y + 8);
  pdf.setFontSize(9); pdf.setTextColor('#6b7280');
  pdf.text('This is a digitally generated certificate. No signature required.', 105, 280, { align: 'center' });
  pdf.save(`Approval_Certificate_${details.orderNumber.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Proof'}.pdf`);
}