import type {
  AuditRecord,
  PrecheckResult,
  SignerIdentity,
  SigningCase,
  StoredEvidenceReference
} from "../domain/types";
import { createEvidenceId, sha256Hex } from "./hash";

export type EvidenceBuildInput = {
  signingCase: SigningCase;
  precheck: PrecheckResult;
  signer: SignerIdentity;
  operator: {
    id: string;
    displayName: string;
  };
  displayedAt: string;
  acceptedAt: string;
  signatureDataUrl: string;
};

function escapeHtml(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatVehicle(vehicle: SigningCase["entries"][number]["vehicles"][number]): string {
  return [
    vehicle.role === "backup" ? "Ersatzfahrzeug" : "Fahrzeug",
    vehicle.startNumber ? `#${vehicle.startNumber}` : null,
    vehicle.make,
    vehicle.model,
    vehicle.year ? String(vehicle.year) : null,
    vehicle.ownerName ? `Eigentümer: ${vehicle.ownerName}` : null
  ]
    .filter(Boolean)
    .join(" · ");
}

export function validatePrecheck(signingCase: SigningCase, precheck: PrecheckResult, signer: SignerIdentity): string[] {
  const missing: string[] = [];
  if (!precheck.identityChecked) {
    missing.push("Ausweis beziehungsweise Identität geprüft");
  }
  if (!precheck.signerPresent) {
    missing.push("Fahrer beziehungsweise unterschreibende Person ist persönlich anwesend");
  }
  if (signingCase.requiresMedicalCertificate && !precheck.medicalCertificateChecked) {
    missing.push("Ärztliches Attest geprüft");
  }
  if (signingCase.isMinor && signer.type !== "guardian") {
    missing.push("Erziehungsberechtigter unterschreibt bei minderjährigem Fahrer");
  }
  if (signingCase.isMinor && !precheck.guardianPresent) {
    missing.push("Erziehungsberechtigter ist anwesend");
  }
  if (signingCase.isMinor && !precheck.guardianAuthorityChecked) {
    missing.push("Berechtigung des Erziehungsberechtigten plausibel geprüft");
  }
  if (signingCase.isMinor && !signer.guardianName?.trim()) {
    missing.push("Name des Erziehungsberechtigten");
  }
  if (signingCase.isMinor && !signer.guardianRelationship?.trim()) {
    missing.push("Beziehung des Erziehungsberechtigten");
  }
  return missing;
}

export function buildEvidenceDocumentHtml(input: EvidenceBuildInput): string {
  const c = input.signingCase;
  const signerLabel =
    input.signer.type === "guardian"
      ? `Erziehungsberechtigter: ${input.signer.guardianName} (${input.signer.guardianRelationship})`
      : "Fahrer unterschreibt selbst";
  const entryRows = c.entries
    .map((entry) => {
      const codriver = entry.codriver ? `${entry.codriver.firstName} ${entry.codriver.lastName}` : "Kein Beifahrer";
      const vehicles = entry.vehicles.map((vehicle) => `<li>${escapeHtml(formatVehicle(vehicle))}</li>`).join("");
      return `<tr>
        <td>${escapeHtml(entry.className)}</td>
        <td>${escapeHtml(entry.startNumber ?? "-")}</td>
        <td>${escapeHtml(entry.orgaCode ?? "-")}</td>
        <td>${escapeHtml(codriver)}</td>
        <td><ul>${vehicles}</ul></td>
      </tr>`;
    })
    .join("");

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>Signing Evidence ${escapeHtml(c.id)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111827; margin: 36px; line-height: 1.45; }
    h1, h2 { margin: 0 0 12px; }
    h1 { font-size: 26px; }
    h2 { font-size: 18px; margin-top: 26px; border-bottom: 1px solid #d1d5db; padding-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #d1d5db; padding: 8px; vertical-align: top; text-align: left; }
    th { background: #f3f4f6; }
    .meta { display: grid; grid-template-columns: 170px 1fr; gap: 6px 12px; }
    .waiver { white-space: pre-wrap; border: 1px solid #d1d5db; padding: 16px; }
    .signature { width: 360px; height: 160px; border: 1px solid #111827; object-fit: contain; }
    ul { margin: 0; padding-left: 18px; }
  </style>
</head>
<body>
  <h1>Nachweis Haftverzicht vor Ort</h1>
  <div class="meta">
    <strong>Veranstaltung</strong><span>${escapeHtml(c.event.name)} (${escapeHtml(c.event.startsAt)} bis ${escapeHtml(c.event.endsAt)})</span>
    <strong>Fahrer</strong><span>${escapeHtml(c.driver.firstName)} ${escapeHtml(c.driver.lastName)} · ${escapeHtml(c.driver.birthdate ?? "-")}</span>
    <strong>Unterzeichner</strong><span>${escapeHtml(signerLabel)}</span>
    <strong>Operator</strong><span>${escapeHtml(input.operator.displayName)} (${escapeHtml(input.operator.id)})</span>
    <strong>Angezeigt</strong><span>${escapeHtml(input.displayedAt)}</span>
    <strong>Bestätigt</strong><span>${escapeHtml(input.acceptedAt)}</span>
    <strong>Unterschrieben</strong><span>${escapeHtml(input.acceptedAt)}</span>
  </div>

  <h2>Nennungen und Fahrzeuge</h2>
  <table>
    <thead><tr><th>Klasse</th><th>Startnummer</th><th>Orga-Code</th><th>Beifahrer</th><th>Fahrzeuge</th></tr></thead>
    <tbody>${entryRows}</tbody>
  </table>

  <h2>Vorprüfungen</h2>
  <ul>
    <li>Identität geprüft: ${input.precheck.identityChecked ? "ja" : "nein"}</li>
    <li>Unterzeichnende Person anwesend: ${input.precheck.signerPresent ? "ja" : "nein"}</li>
    <li>Ärztliches Attest geprüft: ${input.signingCase.requiresMedicalCertificate ? (input.precheck.medicalCertificateChecked ? "ja" : "nein") : "nicht erforderlich"}</li>
    <li>Erziehungsberechtigter anwesend: ${input.signingCase.isMinor ? (input.precheck.guardianPresent ? "ja" : "nein") : "nicht erforderlich"}</li>
    <li>Berechtigung plausibel geprüft: ${input.signingCase.isMinor ? (input.precheck.guardianAuthorityChecked ? "ja" : "nein") : "nicht erforderlich"}</li>
  </ul>

  <h2>Haftverzicht</h2>
  <div class="meta">
    <strong>Sprache</strong><span>${escapeHtml(c.contract.locale)}</span>
    <strong>Version</strong><span>${escapeHtml(c.contract.version)}</span>
    <strong>Text-Hash</strong><span>${escapeHtml(c.contract.textHash)}</span>
  </div>
  <div class="waiver">${escapeHtml(c.contract.fullText)}</div>

  <h2>Unterschrift</h2>
  <img class="signature" src="${escapeHtml(input.signatureDataUrl)}" alt="Unterschrift" />
</body>
</html>`;
}

export async function buildEvidence(input: EvidenceBuildInput): Promise<{
  audit: AuditRecord;
  documentHtml: string;
  reference: StoredEvidenceReference;
}> {
  const evidenceId = createEvidenceId(input.signingCase.id, input.acceptedAt);
  const documentHtml = buildEvidenceDocumentHtml(input);
  const documentSha256 = await sha256Hex(documentHtml);
  const signatureSha256 = await sha256Hex(input.signatureDataUrl);
  const baseS3Key = `signing/${input.signingCase.event.id}/${input.signingCase.driver.id}/${evidenceId}`;
  const audit: AuditRecord = {
    auditSchemaVersion: "signing-terminal-v1",
    evidenceId,
    caseId: input.signingCase.id,
    eventId: input.signingCase.event.id,
    driverPersonId: input.signingCase.driver.id,
    entryIds: input.signingCase.entries.map((entry) => entry.id),
    vehicleIds: input.signingCase.entries.flatMap((entry) => entry.vehicles.map((vehicle) => vehicle.id)),
    signer: input.signer,
    waiver: {
      locale: input.signingCase.contract.locale,
      version: input.signingCase.contract.version,
      textHash: input.signingCase.contract.textHash,
      displayedAt: input.displayedAt,
      acceptedAt: input.acceptedAt
    },
    precheck: input.precheck,
    operator: input.operator,
    signature: {
      capturedAt: input.acceptedAt,
      imageSha256: signatureSha256
    },
    document: {
      sha256: documentSha256,
      s3Key: `${baseS3Key}/evidence.html`
    }
  };
  const auditSha256 = await sha256Hex(JSON.stringify(audit));

  return {
    audit,
    documentHtml,
    reference: {
      evidenceId,
      documentS3Key: audit.document.s3Key,
      auditS3Key: `${baseS3Key}/audit.json`,
      documentSha256,
      auditSha256,
      storedAt: new Date().toISOString(),
      backendStatusUpdate: "mocked"
    }
  };
}
