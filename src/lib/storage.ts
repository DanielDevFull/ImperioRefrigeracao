import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";

export { MAX_UPLOAD_BYTES, ACCEPTED_UPLOAD_TYPES } from "./upload";

export type StorageFolder = "om" | "assinaturas" | "comprovantes" | "equipamentos" | "anexos";

/** Prefixo das URLs servidas pela rota autenticada src/app/arquivos/[...path]. */
export const FILES_PREFIX = "/arquivos/";

const LOCAL_DIR = path.join(process.cwd(), ".data", "uploads");

/**
 * Armazena arquivos (fotos de OM, assinaturas, comprovantes, anexos) de forma PRIVADA.
 * Produção: Vercel Blob com acesso privado (BLOB_READ_WRITE_TOKEN). Desenvolvimento: .data/uploads.
 * Devolve uma URL interna (/arquivos/…) que só abre para quem tem permissão.
 */
export async function storeFile(folder: StorageFolder, file: Blob, originalName = "arquivo"): Promise<string> {
  const ext = (originalName.split(".").pop() || mimeExt(file.type) || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const name = `${folder}/${new Date().toISOString().slice(0, 7)}/${nanoid(20)}.${ext}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    await put(name, file, { access: "private", contentType: file.type || undefined, addRandomSuffix: false });
    return FILES_PREFIX + name;
  }
  if (process.env.VERCEL) {
    throw new Error("Armazenamento de arquivos não configurado (BLOB_READ_WRITE_TOKEN).");
  }
  const dest = path.join(LOCAL_DIR, name);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await file.arrayBuffer()));
  return FILES_PREFIX + name;
}

/** Lê um arquivo armazenado (para a rota autenticada). */
export async function readStoredFile(name: string): Promise<{ body: ReadableStream<Uint8Array> | Buffer; contentType: string } | null> {
  if (name.includes("..") || name.startsWith("/")) return null;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { get } = await import("@vercel/blob");
    const res = await get(name, { access: "private" });
    if (!res || res.statusCode !== 200) return null;
    return { body: res.stream, contentType: res.blob.contentType || "application/octet-stream" };
  }
  try {
    const buf = await readFile(path.join(LOCAL_DIR, name));
    return { body: buf, contentType: mimeFromExt(name) };
  } catch {
    return null;
  }
}

/** Remove um arquivo armazenado (best-effort). */
export async function deleteStoredFile(url: string | null | undefined) {
  if (!url?.startsWith(FILES_PREFIX)) return;
  const name = url.slice(FILES_PREFIX.length);
  try {
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { del } = await import("@vercel/blob");
      await del(name);
    } else {
      const { rm } = await import("node:fs/promises");
      await rm(path.join(LOCAL_DIR, name), { force: true });
    }
  } catch {
    // arquivo órfão não impede a operação
  }
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

function mimeFromExt(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    heic: "image/heic",
    pdf: "application/pdf",
  };
  return map[ext ?? ""] ?? "application/octet-stream";
}
