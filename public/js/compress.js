// conversor integrado: imagen → webp en cliente (canvas, patrón twoitter simplificado)

const MAX_DIM = 1600;
const QUALITY = 0.82;

export async function compressImage(file) {
  if (file.type === "image/gif") return file; // gif animado: tal cual

  let bmp;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    return file; // formato raro: que decida el server
  }

  const scale = Math.min(1, MAX_DIM / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));

  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
  bmp.close();

  const blob = await canvas.convertToBlob({ type: "image/webp", quality: QUALITY });
  if (blob.size >= file.size && scale === 1) return file; // ya pesaba menos

  const name = (file.name || "imatge").replace(/\.\w+$/, "") + ".webp";
  return new File([blob], name, { type: "image/webp" });
}
