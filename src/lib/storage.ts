import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";

/**
 * Armazena arquivos (fotos de OM, assinaturas, comprovantes).
 * Produção: Vercel Blob (BLOB_READ_WRITE_TOKEN). Desenvolvimento: public/uploads.
 */
export async function storeFile(
  folder: "om" | "assinaturas" | "comprovantes" | "equipamentos" | "anexos",
  file: Blob,
  originalName = "arquivo",
): Promise<string> {
  const ext = (originalName.split(".").pop() || mimeExt(file.type) || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const name = `${folder}/${new Date().toISOString().slice(0, 7)}/${nanoid(16)}.${ext}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const res = await put(name, file, { access: "public", contentType: file.type || undefined });
    return res.url;
  }

  if (process.env.VERCEL) {
    throw new Error("Armazenamento de arquivos não configurado (BLOB_READ_WRITE_TOKEN).");
  }
  const dest = path.join(process.cwd(), "public", "uploads", name);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await file.arrayBuffer()));
  return `/uploads/${name}`;
}

/** Converte data URL (assinatura em canvas) em Blob. */
export function dataUrlToBlob(dataUrl: string) {
  const [meta, b64] = dataUrl.split(",");
  const mime = /data:(.*?);base64/.exec(meta)?.[1] ?? "image/png";
  return new Blob([Buffer.from(b64, "base64")], { type: mime });
}

function mimeExt(mime: string) {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "application/pdf": "pdf",
  };
  return map[mime];
}

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
