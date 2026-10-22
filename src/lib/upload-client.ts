/**
 * Preparação de uploads no navegador: reduz imagens e divide envios grandes para que cada
 * requisição fique abaixo de MAX_UPLOAD_BYTES. Só para componentes cliente (usa canvas/DOM).
 */
import { compressImage } from "./offline/image";
import { MAX_UPLOAD_BYTES } from "./upload";

/** Folga para os cabeçalhos do multipart e os demais campos do formulário. */
const FORM_OVERHEAD_BYTES = 64 * 1024;

/** Quanto os arquivos de um único envio podem somar. */
export const UPLOAD_BUDGET_BYTES = MAX_UPLOAD_BYTES - FORM_OVERHEAD_BYTES;

export function isImageFile(file: File) {
  return file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name);
}

function dataUrlToFile(dataUrl: string, name: string) {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: "image/jpeg", lastModified: Date.now() });
}

/**
 * Reduz uma imagem antes do envio (lado maior até `maxSide` px, JPEG de no máximo `maxBytes`).
 * Devolve o próprio arquivo quando não é imagem, já é pequeno ou o navegador não consegue
 * decodificá-lo (ex.: HEIC fora do Safari); quem chama confere o tamanho final.
 */
export async function fitImage(
  file: File,
  { maxSide = 1600, maxBytes = 1.5 * 1024 * 1024, keepBelow = 600 * 1024 } = {},
): Promise<File> {
  if (!isImageFile(file) || file.size <= keepBelow) return file;
  try {
    const { dataUrl } = await compressImage(file, { maxSide, maxBytes });
    const out = dataUrlToFile(dataUrl, `${file.name.replace(/\.[^.]+$/, "") || "foto"}.jpg`);
    return out.size < file.size ? out : file;
  } catch {
    return file;
  }
}

/**
 * Agrupa arquivos (na ordem) em lotes que somam até `budget` bytes, com no máximo `maxCount` cada.
 * Um arquivo maior que o limite fica sozinho no lote; confira antes com UPLOAD_BUDGET_BYTES.
 */
export function batchBySize(files: File[], budget = UPLOAD_BUDGET_BYTES, maxCount = Number.POSITIVE_INFINITY): File[][] {
  const batches: File[][] = [];
  let current: File[] = [];
  let size = 0;
  for (const f of files) {
    if (current.length && (size + f.size > budget || current.length >= maxCount)) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(f);
    size += f.size;
  }
  if (current.length) batches.push(current);
  return batches;
}

/** Coloca os arquivos (já reduzidos) de volta no <input type="file">. */
export function setInputFiles(input: HTMLInputElement, files: File[]) {
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  input.files = dt.files;
}
