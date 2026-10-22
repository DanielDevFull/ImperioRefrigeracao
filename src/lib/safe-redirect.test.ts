import { describe, expect, it } from "vitest";
import { safeInternalPath } from "./safe-redirect";

describe("safeInternalPath", () => {
  it("aceita caminhos internos", () => {
    expect(safeInternalPath("/admin/oms?status=aberta")).toBe("/admin/oms?status=aberta");
  });
  it("recusa redirecionamentos externos", () => {
    expect(safeInternalPath("//evil.com")).toBeUndefined();
    expect(safeInternalPath("https://evil.com")).toBeUndefined();
    expect(safeInternalPath("/\\evil.com")).toBeUndefined();
    expect(safeInternalPath("javascript:alert(1)")).toBeUndefined();
    expect(safeInternalPath(undefined)).toBeUndefined();
  });
});
