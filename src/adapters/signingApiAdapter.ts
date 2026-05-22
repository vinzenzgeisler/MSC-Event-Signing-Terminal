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

async function requestJson<T>(path: string, options: { method?: string; body?: unknown; deviceToken?: string | null } = {}): Promise<T> {
  const response = await fetch(`${baseUrl()}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.deviceToken ? { "X-Signing-Device-Token": options.deviceToken } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload?.message === "string" ? payload.message : `Request failed (${response.status})`);
  }
  return payload as T;
}

export type DeviceSigningSession = {
  id: string;
  status: "pending" | "displayed" | "completed" | "cancelled" | "failed";
  sessionPayload: unknown;
  precheckPayload: unknown;
  signerPayload: unknown;
};

export const signingApiAdapter = {
  getStoredDeviceToken() {
    return localStorage.getItem(TOKEN_KEY);
  },

  forgetDeviceToken() {
    localStorage.removeItem(TOKEN_KEY);
  },

  async claimDevice(pairingCode: string, deviceName: string) {
    const response = await requestJson<{ ok: true; deviceToken: string }>("/signing/device/claim", {
      method: "POST",
      body: { pairingCode, deviceName }
    });
    localStorage.setItem(TOKEN_KEY, response.deviceToken);
    return response.deviceToken;
  },

  async getCurrentSession(deviceToken: string) {
    const response = await requestJson<{ ok: true; session: DeviceSigningSession | null }>("/signing/device/current-session", {
      deviceToken
    });
    return response.session;
  },

  async completeSession(sessionId: string, deviceToken: string, input: { displayedAt: string; signedAt: string; signatureDataUrl: string }) {
    return requestJson<{ ok: true }>(`/signing/sessions/${sessionId}/complete`, {
      method: "POST",
      deviceToken,
      body: input
    });
  }
};
