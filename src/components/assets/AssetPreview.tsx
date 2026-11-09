import { useEffect, useState } from 'react';
import { FileText, FileImage, Loader2, AlertCircle } from 'lucide-react';
import { Asset, assetFileUrl } from '@/lib/assetLibrary';
export function AssetPreview({ asset, large = false }: { asset: Asset; large?: boolean }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  const image = asset.mime_type?.startsWith('image/') && asset.mime_type !== 'image/svg+xml';
  const pdf = asset.mime_type === 'application/pdf' || asset.file_name.toLowerCase().endsWith('.pdf');
  useEffect(() => { let active = true; setUrl(''); setFailed(false); if (image || pdf) assetFileUrl(asset).then(value => { if (active) setUrl(value); }).catch(() => { if (active) setFailed(true); }); return () => { active = false; }; }, [asset.file_url, image, pdf]);
  const Icon = failed ? AlertCircle : image ? FileImage : FileText;
  return <div className={`relative flex w-full items-center justify-center overflow-hidden bg-muted ${large ? 'min-h-64' : 'h-full'}`}>
    {!failed && (image || pdf) && !url ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : image && url && !failed ? <img src={url} alt={asset.name} className={`h-full w-full object-contain ${large ? 'max-h-[55vh]' : ''}`} onError={() => setFailed(true)} /> : pdf && url && !failed ? <iframe src={`${url}#toolbar=${large ? 1 : 0}&navpanes=0`} title={`${asset.name} PDF preview`} className={`w-full border-0 ${large ? 'h-[55vh]' : 'pointer-events-none h-full'}`} tabIndex={large ? 0 : -1} /> : <div className="flex flex-col items-center gap-2 p-4 text-muted-foreground"><Icon className={large ? 'h-16 w-16' : 'h-10 w-10'} /><span className="text-xs">{failed ? 'Preview unavailable' : asset.file_name.split('.').pop()?.toUpperCase()}</span></div>}
  </div>;
}