// Lightweight client-side CSV export
type Row = Record<string, any>;

function escape(v: any): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportToCsv(filename: string, rows: Row[], columns?: { key: string; header: string }[]) {
  if (!rows || rows.length === 0) {
    // still emit headers if columns provided so users get a non-empty file
    if (!columns || columns.length === 0) {
      throw new Error('No data to export');
    }
  }
  const cols = columns ?? Object.keys(rows[0] || {}).map((k) => ({ key: k, header: k }));
  const header = cols.map((c) => escape(c.header)).join(',');
  const body = rows.map((r) => cols.map((c) => escape(r[c.key])).join(',')).join('\n');
  const csv = `${header}\n${body}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
