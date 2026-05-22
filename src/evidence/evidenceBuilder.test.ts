import { describe, expect, it } from "vitest";
import { signingCases } from "../domain/mockData";
import { validatePrecheck } from "./evidenceBuilder";

describe("validatePrecheck", () => {
  it("requires guardian data for minor drivers", () => {
    const minor = signingCases.find((item) => item.isMinor);
    expect(minor).toBeDefined();
    const missing = validatePrecheck(
      minor!,
      {
        identityChecked: true,
        signerPresent: true,
        medicalCertificateChecked: false,
        guardianPresent: false,
        guardianAuthorityChecked: false
      },
      { type: "driver", guardianName: null, guardianRelationship: null }
    );
    expect(missing).toContain("Erziehungsberechtigter unterschreibt bei minderjährigem Fahrer");
    expect(missing).toContain("Erziehungsberechtigter ist anwesend");
  });

  it("requires a medical certificate when backend marks it required", () => {
    const senior = signingCases.find((item) => item.requiresMedicalCertificate);
    expect(senior).toBeDefined();
    const missing = validatePrecheck(
      senior!,
      {
        identityChecked: true,
        signerPresent: true,
        medicalCertificateChecked: false,
        guardianPresent: false,
        guardianAuthorityChecked: false
      },
      { type: "driver", guardianName: null, guardianRelationship: null }
    );
    expect(missing).toContain("Ärztliches Attest geprüft");
  });
});
