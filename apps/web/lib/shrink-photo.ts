/**
 * Reduce la foto en el navegador y la vuelve JPEG. Redibujarla en un canvas descarta el EXIF,
 * incluida la ubicación GPS que traen las fotos del celular. `square` recorta al centro (avatares).
 */
export async function shrinkPhoto(file: File, maxSide = 2000, { square = false } = {}): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const side = Math.min(bitmap.width, bitmap.height);
  const [sw, sh] = square ? [side, side] : [bitmap.width, bitmap.height];
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const width = Math.round(sw * scale);
  const height = Math.round(sh * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - sw) / 2, (bitmap.height - sh) / 2, sw, sh, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error("toBlob devolvió null");
  return { blob, width, height };
}
