import {
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Link2,
  Loader2,
  PenLine,
  ShieldCheck
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { signingApiAdapter, type DeviceSigningSession } from "../adapters/signingApiAdapter";
import type { SigningCase } from "../domain/types";
import { SignaturePad } from "./SignaturePad";

type Step = "pair" | "waiting" | "signing" | "success";
const DEVICE_NAME_KEY = "msc-signing-device-name";

function fullName(person: { firstName: string; lastName: string }) {
  return `${person.firstName} ${person.lastName}`.trim();
}

function asSigningCase(session: DeviceSigningSession | null): SigningCase | null {
  if (!session || !session.sessionPayload || typeof session.sessionPayload !== "object") {
    return null;
  }
  return session.sessionPayload as SigningCase;
}

function checkedLabel(value: string | null) {
  return value ? new Date(value).toLocaleTimeString("de-DE") : "Offen";
}

function isUnauthorizedDeviceError(error: unknown) {
  return error instanceof Error && /unauthorized|SIGNING_DEVICE_UNAUTHORIZED/i.test(error.message);
}

export function App() {
  const [deviceToken, setDeviceToken] = useState(() => signingApiAdapter.getStoredDeviceToken());
  const [pairingCode, setPairingCode] = useState("");
  const [deviceName, setDeviceName] = useState(() => localStorage.getItem(DEVICE_NAME_KEY) ?? "Signaturterminal");
  const [session, setSession] = useState<DeviceSigningSession | null>(null);
  const [step, setStep] = useState<Step>(() => (signingApiAdapter.getStoredDeviceToken() ? "waiting" : "pair"));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [displayedAt, setDisplayedAt] = useState<string | null>(null);
  const [waiverAcceptedAt, setWaiverAcceptedAt] = useState<string | null>(null);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());

  const signingCase = useMemo(() => asSigningCase(session), [session]);
  const signingPerson = signingCase?.signer ?? signingCase?.driver ?? null;
  const sessionExpiresAtMs = session?.expiresAt ? new Date(session.expiresAt).getTime() : Number.NaN;
  const remainingSeconds = Number.isFinite(sessionExpiresAtMs) ? Math.max(0, Math.ceil((sessionExpiresAtMs - nowTick) / 1000)) : null;

  async function pairDevice() {
    const normalized = pairingCode.replace(/\D/g, "").slice(0, 6);
    if (normalized.length !== 6) {
      setMessage("Bitte den sechsstelligen Pairing-Code eingeben.");
      return;
    }
    setBusy(true);
    try {
      const token = await signingApiAdapter.claimDevice(normalized, deviceName.trim() || "Signaturterminal");
      localStorage.setItem(DEVICE_NAME_KEY, deviceName.trim() || "Signaturterminal");
      setDeviceToken(token);
      setStep("waiting");
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Pairing fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function pollSession() {
    if (!deviceToken || step !== "waiting") {
      return;
    }
    try {
      const current = await signingApiAdapter.getCurrentSession(deviceToken);
      if (current) {
        setSession(current);
        setDisplayedAt(new Date().toISOString());
        setWaiverAcceptedAt(null);
        setSignatureDataUrl(null);
        setMessage("");
        setStep("signing");
      }
    } catch (error) {
      if (isUnauthorizedDeviceError(error)) {
        signingApiAdapter.forgetDeviceToken();
        setDeviceToken(null);
        setSession(null);
        setDisplayedAt(null);
        setWaiverAcceptedAt(null);
        setSignatureDataUrl(null);
        setStep("pair");
        setMessage("Dieses Terminal ist nicht mehr gekoppelt. Bitte im Nennungstool neu koppeln.");
        return;
      }
      setMessage(error instanceof Error ? error.message : "Session konnte nicht geladen werden.");
    }
  }

  useEffect(() => {
    if (!deviceToken || step !== "waiting") {
      return;
    }
    void pollSession();
    const interval = window.setInterval(() => void pollSession(), 2500);
    return () => window.clearInterval(interval);
  }, [deviceToken, step]);

  useEffect(() => {
    if (step !== "signing") {
      return;
    }
    const interval = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [step]);

  useEffect(() => {
    if (step !== "signing" || remainingSeconds === null || remainingSeconds > 0) {
      return;
    }
    setSession(null);
    setDisplayedAt(null);
    setWaiverAcceptedAt(null);
    setSignatureDataUrl(null);
    setStep("waiting");
    setMessage("Die Signatur-Session ist abgelaufen. Bitte im Nennungstool neu starten.");
  }, [remainingSeconds, step]);

  useEffect(() => {
    if (!deviceToken || !session || step !== "signing") {
      return;
    }
    const pollActiveSession = async () => {
      try {
        const current = await signingApiAdapter.getCurrentSession(deviceToken);
        if (!current || current.id !== session.id) {
          setSession(null);
          setDisplayedAt(null);
          setWaiverAcceptedAt(null);
          setSignatureDataUrl(null);
          setStep("waiting");
          setMessage("Der Vorgang wurde im Nennungstool geschlossen.");
          return;
        }
        setSession(current);
      } catch (error) {
        if (isUnauthorizedDeviceError(error)) {
          signingApiAdapter.forgetDeviceToken();
          setDeviceToken(null);
          setSession(null);
          setDisplayedAt(null);
          setWaiverAcceptedAt(null);
          setSignatureDataUrl(null);
          setStep("pair");
          setMessage("Dieses Terminal ist nicht mehr gekoppelt. Bitte im Nennungstool neu koppeln.");
          return;
        }
        setMessage(error instanceof Error ? error.message : "Session konnte nicht aktualisiert werden.");
      }
    };
    const interval = window.setInterval(() => void pollActiveSession(), 2500);
    return () => window.clearInterval(interval);
  }, [deviceToken, session, step]);

  async function complete() {
    if (!session || !deviceToken || !displayedAt) {
      return;
    }
    if (!waiverAcceptedAt) {
      setMessage("Bitte zuerst bestätigen: gelesen und verstanden.");
      return;
    }
    if (!signatureDataUrl) {
      setMessage("Bitte zuerst im Unterschriftenfeld unterschreiben.");
      return;
    }
    setBusy(true);
    try {
      await signingApiAdapter.completeSession(session.id, deviceToken, {
        displayedAt,
        waiverAcceptedAt,
        signedAt: new Date().toISOString(),
        signatureDataUrl
      });
      setSession(null);
      setStep("success");
      setMessage("");
      window.setTimeout(() => {
        setStep("waiting");
      }, 2600);
    } catch (error) {
      if (isUnauthorizedDeviceError(error)) {
        signingApiAdapter.forgetDeviceToken();
        setDeviceToken(null);
        setSession(null);
        setDisplayedAt(null);
        setWaiverAcceptedAt(null);
        setSignatureDataUrl(null);
        setStep("pair");
        setMessage("Dieses Terminal ist nicht mehr gekoppelt. Bitte im Nennungstool neu koppeln.");
        return;
      }
      setMessage(error instanceof Error ? error.message : "Abschluss fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  function vehicleSummary() {
    if (!signingCase) return "";
    return signingCase.entries
      .flatMap((entry) =>
        entry.vehicles
          .filter((vehicle) => vehicle.role === "primary")
          .map((vehicle) => `${entry.startNumber ? `#${entry.startNumber} · ` : ""}${vehicle.make} ${vehicle.model}`)
      )
      .join(" · ");
  }

  function codriverSummary() {
    if (!signingCase) return "";
    const names = signingCase.entries.map((entry) => (entry.codriver ? fullName(entry.codriver) : null)).filter(Boolean);
    return Array.from(new Set(names)).join(" · ");
  }

  return (
    <main>
      <header className="app-header">
        <div className="brand-lockup">
          <img src="/msc-logo.png" alt="MSC Oberlausitzer Dreiländereck" className="brand-logo" />
          <div>
            <div className="eyebrow">MSC Event</div>
            <h1>Haftverzicht</h1>
          </div>
        </div>
      </header>

      {message ? <div className="screen warning-box">{message}</div> : null}

      {step === "pair" ? (
        <section className="screen pair-screen">
          <Link2 size={52} />
          <h2>Terminal koppeln</h2>
          <p>Der Code wird im Nennungstool angezeigt und ist nur für dieses Gerät bestimmt.</p>
          <input className="pair-code-input" value={pairingCode} onChange={(event) => setPairingCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" inputMode="numeric" />
          <input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} placeholder="Gerätename" />
          <button className="primary" type="button" disabled={busy} onClick={() => void pairDevice()}>
            {busy ? <Loader2 size={20} className="spin" /> : <ShieldCheck size={20} />}
            Koppeln
          </button>
        </section>
      ) : null}

      {step === "waiting" ? (
        <section className="screen wait-screen">
          <img src="/msc-logo.png" alt="" className="standby-logo" />
          <CheckCircle2 size={58} />
          <h2>Terminal bereit</h2>
          <p>{deviceName || "Signaturgerät"} · wartet auf Start durch das Anmeldungsteam</p>
        </section>
      ) : null}

      {step === "signing" && signingCase ? (
        <section className="screen onepage-signing">
          <div className="screen-title onepage-title">
            <div>
              <div className="eyebrow">Bitte Angaben prüfen und unterschreiben</div>
              <h2>{signingPerson ? fullName(signingPerson) : fullName(signingCase.driver)}</h2>
              {signingCase.signer?.role === "codriver" ? <p>Beifahrer von {fullName(signingCase.driver)}</p> : null}
              <p>{signingCase.event.name} · {vehicleSummary()}</p>
              {signingCase.signer?.role !== "codriver" && codriverSummary() ? <p>Beifahrer: {codriverSummary()}</p> : null}
            </div>
            {remainingSeconds !== null ? <div className="session-countdown">Noch {Math.floor(remainingSeconds / 60)}:{String(remainingSeconds % 60).padStart(2, "0")} Min.</div> : null}
          </div>

          <article className="waiver-text onepage-waiver">
            <h3>{signingCase.contract.title}</h3>
            {signingCase.contract.fullText}
          </article>

          <div className="read-confirmation-row">
            <button className={`read-confirmation ${waiverAcceptedAt ? "selected" : ""}`} type="button" onClick={() => setWaiverAcceptedAt((current) => current ?? new Date().toISOString())}>
              <span className="toggle-icon">{waiverAcceptedAt ? <CheckCircle2 size={20} /> : <ClipboardCheck size={20} />}</span>
              <span>
                <strong>Ich habe die Haftverzichtserklärung gelesen und verstanden.</strong>
                <small>{checkedLabel(waiverAcceptedAt)}</small>
              </span>
            </button>
          </div>

          <div className="onepage-signature-panel">
            <SignaturePad onChange={setSignatureDataUrl} />
            <button className="primary" type="button" disabled={busy} onClick={() => void complete()}>
              {busy ? <Loader2 size={20} className="spin" /> : <PenLine size={20} />}
              Unterschrift bestätigen
            </button>
          </div>
        </section>
      ) : null}

      {step === "success" ? (
        <section className="screen success-panel">
          <img src="/msc-logo.png" alt="" className="standby-logo" />
          <FileCheck2 size={54} />
          <h2>Erfolgreich gespeichert</h2>
        </section>
      ) : null}
    </main>
  );
}
