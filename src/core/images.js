import * as db from './db.js';

/* Réduit la photo à 1200 px max et la compresse (WebP) avant stockage. */
export async function compress(file, max = 1200) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return new Promise((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('Compression impossible'))), 'image/webp', 0.85));
}

const byOrder = (a, b) => a.order - b.order;
export const getAllImages = async () => (await db.getAll('images')).sort(byOrder);
export const listImages = async (articleId) => (await db.getByIndex('images', 'articleId', articleId)).sort(byOrder);
export const saveImage = (rec) => db.put('images', rec);
export const deleteImage = (id) => db.remove('images', id);
export async function deleteArticleImages(articleId) {
  for (const r of await listImages(articleId)) await db.remove('images', r.id);
}
