import type { SigningCase } from "./types";

export function signingCaseFromPayload(payload: unknown): SigningCase | null {
  if (!payload || typeof payload !== "object") return null;

  const contract = (payload as { contract?: unknown }).contract;
  return contract && typeof contract === "object" ? payload as SigningCase : null;
}
