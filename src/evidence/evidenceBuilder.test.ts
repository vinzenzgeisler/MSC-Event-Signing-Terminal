import { describe, expect, it } from "vitest";
import { signingCases } from "../domain/mockData";
import { buildEvidenceDocumentHtml, validatePrecheck } from "./evidenceBuilder";

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

  it("uses publication names for protected people in terminal evidence", () => {
    const source = signingCases[0];
    const protectedCase = {
      ...source,
      driver: {
        ...source.driver,
        displayName: "Der Blitz",
        identityProtected: true,
        firstName: null,
        lastName: null,
        birthdate: null
      }
    };
    const html = buildEvidenceDocumentHtml({
      signingCase: protectedCase,
      precheck: {
        identityChecked: true,
        signerPresent: true,
        medicalCertificateChecked: false,
        guardianPresent: false,
        guardianAuthorityChecked: false
      },
      signer: { type: "driver", guardianName: null, guardianRelationship: null },
      operator: { id: "operator-1", displayName: "Operator" },
      displayedAt: "2026-09-08T10:00:00.000Z",
      acceptedAt: "2026-09-08T10:01:00.000Z",
      signatureDataUrl: "data:image/png;base64,dGVzdA=="
    });
    expect(html).toContain("Der Blitz");
    expect(html).not.toContain(`${source.driver.firstName ?? "Max"} ${source.driver.lastName ?? "Mustermann"}`);
  });
});
