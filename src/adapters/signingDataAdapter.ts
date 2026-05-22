import { signingCases } from "../domain/mockData";
import type { AuditRecord, SigningCase, StoredEvidenceReference } from "../domain/types";

const STORAGE_KEY = "msc-signing-terminal-cases";
const EVIDENCE_KEY = "msc-signing-terminal-evidence";

type StoredEvidence = {
  audit: AuditRecord;
  documentHtml: string;
  reference: StoredEvidenceReference;
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function readCases(): SigningCase[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return clone(signingCases);
  }
  try {
    return JSON.parse(raw) as SigningCase[];
  } catch {
    return clone(signingCases);
  }
}

function writeCases(cases: SigningCase[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
}

function readEvidence(): StoredEvidence[] {
  const raw = localStorage.getItem(EVIDENCE_KEY);
  if (!raw) {
    return [];
  }
  try {
    return JSON.parse(raw) as StoredEvidence[];
  } catch {
    return [];
  }
}

function writeEvidence(records: StoredEvidence[]) {
  localStorage.setItem(EVIDENCE_KEY, JSON.stringify(records));
}

export const signingDataAdapter = {
  async listOpenCases(): Promise<SigningCase[]> {
    return readCases().filter((item) => item.status === "open");
  },

  async getCase(caseId: string): Promise<SigningCase | null> {
    return readCases().find((item) => item.id === caseId) ?? null;
  },

  async storeEvidence(input: {
    caseId: string;
    audit: AuditRecord;
    documentHtml: string;
    reference: StoredEvidenceReference;
  }): Promise<StoredEvidenceReference> {
    const evidences = readEvidence();
    evidences.unshift({
      audit: input.audit,
      documentHtml: input.documentHtml,
      reference: input.reference
    });
    writeEvidence(evidences);

    const cases = readCases().map((item) =>
      item.id === input.caseId
        ? {
            ...item,
            status: "signed" as const,
            signedAt: input.audit.signature.capturedAt
          }
        : item
    );
    writeCases(cases);
    return input.reference;
  },

  async listEvidence(): Promise<StoredEvidence[]> {
    return readEvidence();
  },

  resetPrototypeState() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(EVIDENCE_KEY);
  }
};
