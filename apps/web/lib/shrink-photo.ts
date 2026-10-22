/**
 * Reduce la foto en el navegador y la vuelve JPEG. Redibujarla en un canvas descarta el EXIF,
 * incluida la ubicación GPS que traen las fotos del celular.
 */
export async function shrinkPhoto(file: File, maxSide = 2000): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error("toBlob devolvió null");
  return { blob, width, height };
}
