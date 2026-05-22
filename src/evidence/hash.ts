export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function createEvidenceId(caseId: string, capturedAt: string): string {
  const compactTime = capturedAt.replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${caseId}-${compactTime}`;
}
