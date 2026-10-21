"use client";

/** Tamanho aproximado (bytes) de um data URL base64. */
export function dataUrlBytes(dataUrl: string) {
  const i = dataUrl.indexOf(",");
  return Math.floor(((dataUrl.length - i - 1) * 3) / 4);
}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* formatos que o navegador não decodifica como bitmap: tenta com <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw new Error("Não foi possível ler a foto. Tente tirar de novo.", { cause: e });
  }
}

/**
 * Reduz a foto no aparelho antes de enviar: lado maior até `maxSide` px, JPEG ~0.8.
 * Se ainda passar de `maxBytes`, baixa a qualidade e depois o tamanho.
 */
export async function compressImage(file: Blob, { maxSide = 1600, quality = 0.8, maxBytes = 2 * 1024 * 1024 } = {}) {
  const img = await decode(file);
  try {
    let side = maxSide;
    let q = quality;
    for (let attempt = 0; attempt < 6; attempt++) {
      const scale = Math.min(1, side / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Seu navegador não conseguiu processar a foto.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img.source, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", q);
      if (dataUrlBytes(dataUrl) <= maxBytes) return { dataUrl, width: w, height: h };
      if (q > 0.6) q -= 0.1;
      else side = Math.round(side * 0.8);
    }
    throw new Error("A foto ficou grande demais mesmo depois de reduzida.");
  } finally {
    img.close();
  }
}
