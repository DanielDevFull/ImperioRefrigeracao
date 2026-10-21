/**
 * Gera o "Pix copia e cola" (BR Code estático, padrão EMV do Banco Central)
 * para cobrar um valor específico com um identificador (txid).
 */

function field(id: string, value: string) {
  const len = String(value.length).padStart(2, "0");
  return `${id}${len}${value}`;
}

/** Remove acentos e caracteres fora do conjunto aceito pelos apps bancários. */
export function sanitizePixText(value: string, max: number) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .,\-/]/g, "")
    .trim()
    .slice(0, max);
}

export function crc16(payload: string) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export type PixInput = {
  key: string;
  merchantName: string;
  merchantCity: string;
  amount?: number;
  /** Até 25 caracteres alfanuméricos */
  txid?: string;
  description?: string;
};

export function buildPixPayload({ key, merchantName, merchantCity, amount, txid, description }: PixInput) {
  const gui = field("00", "br.gov.bcb.pix");
  const keyField = field("01", key.trim());
  const desc = description ? field("02", sanitizePixText(description, 40)) : "";
  const merchantAccount = field("26", gui + keyField + desc);
  const cleanTxid = (txid ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";

  let payload =
    field("00", "01") +
    merchantAccount +
    field("52", "0000") +
    field("53", "986") +
    (amount && amount > 0 ? field("54", amount.toFixed(2)) : "") +
    field("58", "BR") +
    field("59", sanitizePixText(merchantName, 25).toUpperCase() || "IMPERIUM") +
    field("60", sanitizePixText(merchantCity, 15).toUpperCase() || "BRASIL") +
    field("62", field("05", cleanTxid));

  payload += "6304";
  return payload + crc16(payload);
}

/** txid estável para uma conta a receber: "IMP" + 22 caracteres do id. */
export function txidFor(id: string) {
  return `IMP${id.replace(/-/g, "").slice(0, 22)}`.toUpperCase();
}
