import { describe, expect, it } from "vitest";
import { buildPixPayload, crc16 } from "./pix";

describe("pix", () => {
  it("CRC16-CCITT confere com o vetor de teste", () => {
    expect(crc16("123456789")).toBe("29B1");
  });
  it("monta o payload com valor, txid e CRC", () => {
    const p = buildPixPayload({
      key: "contato@imperium.com.br",
      merchantName: "Imperium Tec Refrigeração",
      merchantCity: "São Paulo",
      amount: 189.9,
      txid: "IMP123",
    });
    expect(p.startsWith("000201")).toBe(true);
    expect(p).toContain("br.gov.bcb.pix");
    expect(p).toContain("5406189.90");
    expect(p).toContain("5925IMPERIUM TEC REFRIGERACAO");
    expect(p).toContain("6009SAO PAULO");
    expect(p).toContain("62100506IMP123");
    expect(p.slice(-8, -4)).toBe("6304");
    expect(crc16(p.slice(0, -4))).toBe(p.slice(-4));
  });
});
