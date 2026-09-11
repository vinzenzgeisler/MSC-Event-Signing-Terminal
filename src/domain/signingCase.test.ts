import { describe, expect, it } from "vitest";
import { signingCaseFromPayload } from "./signingCase";

describe("signingCaseFromPayload", () => {
  it("does not treat a participant data-entry payload as a signing case", () => {
    expect(signingCaseFromPayload({
      workflowType: "regular_codriver_registration",
      event: { id: "event-id", name: "Testlauf" },
      driver: { id: "driver-id", firstName: "Max", lastName: "Muster" },
      entries: []
    })).toBeNull();
  });

  it("accepts a payload once the waiver contract is present", () => {
    const payload = { contract: { documentId: "haftverzicht" } };
    expect(signingCaseFromPayload(payload)).toBe(payload);
  });

  it("rejects malformed contract values", () => {
    expect(signingCaseFromPayload({ contract: null })).toBeNull();
    expect(signingCaseFromPayload({ contract: "missing" })).toBeNull();
  });
});
