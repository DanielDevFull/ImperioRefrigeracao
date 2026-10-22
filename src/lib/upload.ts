/**
 * Limite de upload (fotos, comprovantes, anexos) — seguro para importar no cliente.
 * Vale por arquivo e também para o total de um envio: a Vercel recusa requisições acima de 4,5 MB
 * (e `serverActions.bodySizeLimit` em next.config.ts fica em 4,5 MB). Imagens são reduzidas no
 * navegador antes do envio (`fitImage` em `@/lib/upload-client`).
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** "4 MB", para dicas e mensagens. */
export const MAX_UPLOAD_LABEL = `${MAX_UPLOAD_BYTES / (1024 * 1024)} MB`;

export const ACCEPTED_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];
