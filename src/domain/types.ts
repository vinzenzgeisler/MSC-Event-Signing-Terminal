export type Locale = "de-DE" | "en-GB" | "cs-CZ" | "pl-PL";
export type VehicleType = "auto" | "moto";

export type EventSnapshot = {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  location: string;
};

export type PersonSnapshot = {
  id: string;
  displayName?: string;
  identityProtected?: boolean;
  firstName: string | null;
  lastName: string | null;
  birthdate: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
};

export type SigningVehicle = {
  id: string;
  vehicleType: VehicleType;
  make: string;
  model: string;
  year: number | null;
  startNumber: string | null;
  ownerName: string | null;
  role: "primary" | "backup";
};

export type SigningEntry = {
  id: string;
  className: string;
  orgaCode: string | null;
  startNumber: string | null;
  codriver: PersonSnapshot | null;
  vehicles: SigningVehicle[];
};

export type WaiverContractSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type WaiverContractSnapshot = {
  documentId: "haftverzicht";
  locale: Locale;
  version: string;
  textHash: string;
  title: string;
  fullText: string;
  authoritativeLocale?: "de-DE";
  authoritativeTitle?: string;
  authoritativeFullText?: string;
  authoritativeTextHash?: string;
  // Structured form of the same text, for rendering with proper headings/paragraphs/bullets
  // instead of one flattened block. Optional for backward compatibility with mocked contexts.
  authoritativeIntro?: string[];
  authoritativeSections?: WaiverContractSection[];
  translation?: {
    locale: Locale;
    title: string;
    fullText: string;
    textHash: string;
    intro?: string[];
    sections?: WaiverContractSection[];
    binding: false;
  } | null;
  source: "backend_contract_context" | "mock_backend_context";
};

export type SigningCase = {
  id: string;
  event: EventSnapshot;
  driver: PersonSnapshot;
  signer?: PersonSnapshot & {
    role: "driver" | "codriver";
    label: string;
  };
  isMinor: boolean;
  requiresMedicalCertificate: boolean;
  contract: WaiverContractSnapshot;
  entries: SigningEntry[];
  status: "open" | "signed";
  signedAt: string | null;
};

export type PrecheckResult = {
  identityChecked: boolean;
  signerPresent: boolean;
  medicalCertificateChecked: boolean;
  guardianPresent: boolean;
  guardianAuthorityChecked: boolean;
};

export type SignerIdentity = {
  type: "driver" | "codriver" | "guardian";
  guardianName: string | null;
  guardianRelationship: string | null;
};

export type AuditRecord = {
  auditSchemaVersion: "signing-terminal-v1";
  evidenceId: string;
  caseId: string;
  eventId: string;
  driverPersonId: string;
  entryIds: string[];
  vehicleIds: string[];
  signer: SignerIdentity;
  waiver: {
    locale: Locale;
    version: string;
    textHash: string;
    displayedAt: string;
    acceptedAt: string;
  };
  precheck: PrecheckResult;
  operator: {
    id: string;
    displayName: string;
  };
  signature: {
    capturedAt: string;
    imageSha256: string;
  };
  document: {
    sha256: string;
    s3Key: string;
  };
};

export type StoredEvidenceReference = {
  evidenceId: string;
  documentS3Key: string;
  auditS3Key: string;
  documentSha256: string;
  auditSha256: string;
  storedAt: string;
  backendStatusUpdate: "mocked" | "pending_real_endpoint";
};
