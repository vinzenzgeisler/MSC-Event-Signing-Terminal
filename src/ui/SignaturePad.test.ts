import { describe, expect, it } from "vitest";
import { isSignaturePointerAllowed } from "./SignaturePad";

describe("signature pointer filtering", () => {
  it("allows only pen input", () => {
    expect(isSignaturePointerAllowed("pen")).toBe(true);
    expect(isSignaturePointerAllowed("touch")).toBe(false);
    expect(isSignaturePointerAllowed("mouse")).toBe(false);
    expect(isSignaturePointerAllowed("")).toBe(false);
  });
});
