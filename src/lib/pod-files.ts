// Helpers to prepare Proof-of-Delivery files for the supplier-bill-upload webhook.
// - Returns plain base64 (no data:...;base64, prefix)
// - Preserves real mimeType
// - Compresses images so each file stays under MAX_BYTES (~2.5 MB target)

const MAX_BYTES = 2_500_000; // ~2.5 MB target per file
const MAX_DIMENSION = 2000; // cap longest edge for images before compression

export type PodFile = {
  filename: string;
  mimeType: string;
  base64: string;
};

const fileToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

async function compressImage(file: File): Promise<Blob> {
  // Load into an image element
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });

  let { width, height } = img;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, width, height);

  // PNGs with transparency: keep PNG. Otherwise re-encode as JPEG and step quality down.
  const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  let quality = 0.85;
  let blob: Blob = file;
  for (let i = 0; i < 6; i++) {
    blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b || file), outType, outType === 'image/jpeg' ? quality : undefined),
    );
    if (blob.size <= MAX_BYTES) break;
    quality -= 0.15;
    if (quality < 0.3) break;
  }
  return blob;
}

export async function preparePodFile(file: File): Promise<PodFile> {
  let blob: Blob = file;
  let mimeType = file.type || 'application/octet-stream';
  let filename = file.name;

  if (mimeType.startsWith('image/') && file.size > MAX_BYTES) {
    try {
      blob = await compressImage(file);
      // If we re-encoded a non-PNG to JPEG, reflect that in name + type
      if (file.type !== 'image/png' && blob.type === 'image/jpeg') {
        mimeType = 'image/jpeg';
        filename = filename.replace(/\.(jpe?g|png|webp|heic|heif)$/i, '') + '.jpg';
      } else {
        mimeType = blob.type || mimeType;
      }
    } catch {
      // fall back to original
      blob = file;
    }
  }

  const base64 = await fileToBase64(blob);
  return { filename, mimeType, base64 };
}

export async function preparePodFiles(files: File[]): Promise<PodFile[]> {
  return Promise.all(files.map(preparePodFile));
}
