type RuntimeConfig = Partial<Record<string, string | boolean | null | undefined>>;

declare global {
  interface Window {
    __MSC_SIGNING_CONFIG__?: RuntimeConfig;
  }
}

const TOKEN_KEY = "msc-signing-device-token";

function baseUrl() {
  const runtime = window.__MSC_SIGNING_CONFIG__?.apiBaseUrl ?? window.__MSC_SIGNING_CONFIG__?.VITE_API_BASE_URL;
  if (runtime) {
    return String(runtime).replace(/\/$/, "");
  }
  const env = import.meta.env as Record<string, unknown>;
  return typeof env.VITE_API_BASE_URL === "string" ? env.VITE_API_BASE_URL.replace(/\/$/, "") : "";
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  deviceToken?: string | null;
  retryCount?: number;
  timeoutMs?: number;
};

export class SigningApiError extends Error {
  constructor(
    message: string,
    readonly kind: "network" | "timeout" | "http",
    readonly status?: number,
    readonly code?: string
  ) {
    super(message);
    this.name = "SigningApiError";
  }
}

export function isRetryableSigningApiError(error: unknown): error is SigningApiError {
  return error instanceof SigningApiError && (error.kind === "network" || error.kind === "timeout" || (error.status ?? 0) >= 500);
}

const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const retryCount = options.retryCount ?? 0;
  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);
    try {
      const response = await fetch(`${baseUrl()}${path}`, {
        method: options.method ?? "GET",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.deviceToken ? { "X-Signing-Device-Token": options.deviceToken } : {})
        },
        body: options.body ? JSON.stringify(options.body) : undefined
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = typeof payload?.message === "string" ? payload.message : `Serverfehler (${response.status})`;
        const detail = typeof payload?.details?.error === "string" ? payload.details.error : "";
        const code = typeof payload?.code === "string" ? payload.code : detail || undefined;
        const error = new SigningApiError(detail ? `${message}: ${detail}` : message, "http", response.status, code);
        if (response.status >= 500 && attempt < retryCount) {
          await wait(400 * (attempt + 1));
          continue;
        }
        throw error;
      }
      return payload as T;
    } catch (error) {
      if (error instanceof SigningApiError) throw error;
      const timedOut = error instanceof DOMException && error.name === "AbortError";
      if (attempt < retryCount) {
        await wait(400 * (attempt + 1));
        continue;
      }
      throw new SigningApiError(
        timedOut
          ? "Der Server antwortet zu langsam. Der Vorgang bleibt erhalten; bitte erneut versuchen."
          : "Verbindung kurz unterbrochen. Automatischer Neuversuch läuft.",
        timedOut ? "timeout" : "network"
      );
    } finally {
      window.clearTimeout(timeout);
    }
  }
  throw new SigningApiError("Verbindung zum Server fehlgeschlagen.", "network");
}

export type DeviceSigningSession = {
  id: string;
  status: "pending" | "displayed" | "completed" | "cancelled" | "failed";
  sessionPayload: unknown;
  precheckPayload: unknown;
  signerPayload: unknown;
  expiresAt: string;
  workflowType?: "waiver_signature" | "regular_codriver_registration" | "charity_codriver_registration";
  workflowStage?: "collecting_data" | "awaiting_operator_approval" | "ready_to_sign" | "completed" | "cancelled" | "failed";
  draftPayload?: unknown;
};

export type ParticipantDraft = {
  locale: "de-DE" | "en-GB" | "cs-CZ" | "pl-PL";
  firstName: string;
  lastName: string;
  birthdate: string;
  country: string;
  street: string;
  zip: string;
  city: string;
  email: string;
  phone: string;
  emergencyContactFirstName: string;
  emergencyContactLastName: string;
  emergencyContactPhone: string;
  motorsportHistory?: string | null;
  guardianFullName?: string | null;
  guardianEmail?: string | null;
  guardianPhone?: string | null;
  guardianRelationship?: string | null;
};

export const signingApiAdapter = {
  getStoredDeviceToken() {
    return localStorage.getItem(TOKEN_KEY);
  },

  forgetDeviceToken() {
    localStorage.removeItem(TOKEN_KEY);
  },

  async claimDevice(pairingCode: string, deviceName: string) {
    const response = await requestJson<{ ok: true; deviceToken: string }>("/terminal/device/claim", {
      method: "POST",
      body: { pairingCode, deviceName }
    });
    localStorage.setItem(TOKEN_KEY, response.deviceToken);
    return response.deviceToken;
  },

  async getCurrentSession(deviceToken: string) {
    const response = await requestJson<{ ok: true; session: DeviceSigningSession | null }>("/terminal/device/current-session", {
      deviceToken
    });
    return response.session;
  },

  async completeSession(sessionId: string, deviceToken: string, input: {
    displayedAt: string;
    waiverAcceptedAt: string;
    signedAt: string;
    signatureDataUrl: string;
    guardianEmail?: string;
  }) {
    return requestJson<{ ok: true }>(`/terminal/sessions/${sessionId}/complete`, {
      method: "POST",
      deviceToken,
      body: input,
      // Completion is idempotent on the server. Retrying also resolves the
      // important case where the server saved the signature but the response
      // was lost on unstable event Wi-Fi.
      retryCount: 2,
      timeoutMs: 28_000
    });
  },

  async submitParticipantDraft(sessionId: string, deviceToken: string, draft: ParticipantDraft) {
    const response = await requestJson<{ ok: true; session: DeviceSigningSession }>(`/terminal/sessions/${sessionId}/draft`, {
      method: "PUT",
      deviceToken,
      body: draft,
      retryCount: 1,
      timeoutMs: 15_000
    });
    return response.session;
  },

  async completeParticipantSession(sessionId: string, deviceToken: string, input: {
    displayedAt: string;
    privacyAcceptedAt: string;
    waiverAcceptedAt: string;
    signedAt: string;
    signatureDataUrl: string;
  }) {
    return requestJson<{ ok: true }>(`/terminal/sessions/${sessionId}/complete`, {
      method: "POST",
      deviceToken,
      body: input,
      retryCount: 2,
      timeoutMs: 28_000
    });
  }
};
