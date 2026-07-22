// Aggressive client-side image compression for evidence photos (return
// inspections etc.) — target ~20KB so uploads fly on Nigerian mobile data
// and storage stays tiny. Strategy: draw to a canvas, then walk dimensions
// and JPEG quality down until the blob fits (or we hit the floor and accept
// the smallest we got — a slightly-over photo beats a failed upload).
export async function compressImage(file, maxBytes = 20 * 1024) {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file; // not an image the browser can decode — send as-is

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const attempt = (maxDim, quality) => new Promise((resolve) => {
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(resolve, 'image/jpeg', quality);
  });

  let best = null;
  for (const [dim, q] of [[900, 0.6], [700, 0.5], [560, 0.45], [440, 0.4], [360, 0.35], [300, 0.3]]) {
    const blob = await attempt(dim, q);
    if (!blob) continue;
    if (!best || blob.size < best.size) best = blob;
    if (blob.size <= maxBytes) { best = blob; break; }
  }
  bitmap.close?.();
  if (!best) return file;
  return new File([best], (file.name || 'photo').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}
