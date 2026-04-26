import { useEffect, useRef, useState } from 'react';
import { Loader2, Download, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PdfViewerProps {
  base64Data: string;
  filename: string;
  title?: string;
  onClose: () => void;
}

declare global {
  interface Window {
    pdfjsLib?: any;
  }
}

const PDFJS_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

function loadPdfJs(): Promise<any> {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${PDFJS_SRC}"]`) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(window.pdfjsLib));
      existing.addEventListener('error', () => reject(new Error('Failed to load PDF viewer')));
      if (window.pdfjsLib) resolve(window.pdfjsLib);
      return;
    }
    const script = document.createElement('script');
    script.src = PDFJS_SRC;
    script.async = true;
    script.onload = () => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
        resolve(window.pdfjsLib);
      } else {
        reject(new Error('PDF viewer failed to initialize'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load PDF viewer'));
    document.head.appendChild(script);
  });
}

export function PdfViewer({ base64Data, filename, title = 'Document', onClose }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjsLib = await loadPdfJs();
        // Ensure worker is configured before any getDocument call
        pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
        // CRITICAL: strip all whitespace before atob — base64 from API may have newlines
        const cleanBase64 = base64Data.replace(/\s/g, '');
        const binary = atob(cleanBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setLoading(false);
      } catch (e: any) {
        if (cancelled) return;
        console.error('PDF load error:', e);
        setError(e?.message || 'Failed to render PDF');
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [base64Data]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const page = await pdfDoc.getPage(currentPage);
        const viewport = page.getViewport({ scale: 1.4 });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to render page');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, currentPage]);

  const handleDownload = () => {
    const cleanBase64 = base64Data.replace(/\s/g, '');
    const bytes = Uint8Array.from(atob(cleanBase64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in-0"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-[80vw] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex min-w-0 items-baseline gap-3">
            <span className="text-base font-semibold text-foreground">{title}</span>
            <span className="truncate text-sm text-muted-foreground">{filename}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* PDF Canvas */}
        <div className="flex flex-1 items-start justify-center overflow-auto bg-muted/40 p-6">
          {loading && (
            <div className="flex flex-col items-center gap-3 self-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading PDF…</p>
            </div>
          )}
          {error && !loading && (
            <div className="self-center text-center">
              <p className="text-sm font-medium text-destructive">Could not render PDF</p>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            </div>
          )}
          <canvas
            ref={canvasRef}
            className="shadow-card"
            style={{ display: loading || error ? 'none' : 'block' }}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-6 py-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1 || loading || !!error}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {currentPage} of {numPages || '—'}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
              disabled={currentPage >= numPages || loading || !!error}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button onClick={handleDownload} disabled={loading || !!error} className="gap-2">
              <Download className="h-4 w-4" />
              Download
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
