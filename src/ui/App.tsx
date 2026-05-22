import { CheckCircle2, FileCheck2, Link2, Loader2, PenLine, RotateCcw, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { signingApiAdapter, type DeviceSigningSession } from "../adapters/signingApiAdapter";
import type { SigningCase } from "../domain/types";
import { SignaturePad } from "./SignaturePad";

type Step = "pair" | "waiting" | "detail" | "waiver" | "signature" | "success";

function fullName(person: { firstName: string; lastName: string }) {
  return `${person.firstName} ${person.lastName}`;
}

function languageLabel(locale: string) {
  if (locale === "en-GB") return "Englisch";
  if (locale === "cs-CZ") return "Tschechisch";
  if (locale === "pl-PL") return "Polnisch";
  return "Deutsch";
}

function asSigningCase(session: DeviceSigningSession | null): SigningCase | null {
  if (!session || !session.sessionPayload || typeof session.sessionPayload !== "object") {
    return null;
  }
  return session.sessionPayload as SigningCase;
}

export function App() {
  const [deviceToken, setDeviceToken] = useState(() => signingApiAdapter.getStoredDeviceToken());
  const [pairingCode, setPairingCode] = useState("");
  const [deviceName, setDeviceName] = useState("Signing Terminal");
  const [session, setSession] = useState<DeviceSigningSession | null>(null);
  const [step, setStep] = useState<Step>(() => (signingApiAdapter.getStoredDeviceToken() ? "waiting" : "pair"));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [displayedAt, setDisplayedAt] = useState<string | null>(null);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);

  const signingCase = useMemo(() => asSigningCase(session), [session]);
  const signer = (session?.signerPayload ?? {}) as { type?: "driver" | "guardian"; guardianName?: string | null; guardianRelationship?: string | null };

  async function pairDevice() {
    const normalized = pairingCode.replace(/\D/g, "").slice(0, 6);
    if (normalized.length !== 6) {
      setMessage("Bitte den sechsstelligen Pairing-Code eingeben.");
      return;
    }
    setBusy(true);
    try {
      const token = await signingApiAdapter.claimDevice(normalized, deviceName.trim() || "Signing Terminal");
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
    if (!deviceToken || step === "signature" || step === "waiver" || step === "detail" || step === "success") {
      return;
    }
    try {
      const current = await signingApiAdapter.getCurrentSession(deviceToken);
      if (current) {
        setSession(current);
        setDisplayedAt(new Date().toISOString());
        setSignatureDataUrl(null);
        setStep("detail");
      }
    } catch (error) {
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

  async function complete() {
    if (!session || !deviceToken || !displayedAt || !signatureDataUrl) {
      return;
    }
    setBusy(true);
    try {
      await signingApiAdapter.completeSession(session.id, deviceToken, {
        displayedAt,
        signedAt: new Date().toISOString(),
        signatureDataUrl
      });
      setStep("success");
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Abschluss fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  function resetPairing() {
    signingApiAdapter.forgetDeviceToken();
    setDeviceToken(null);
    setSession(null);
    setStep("pair");
  }

  return (
    <main>
      <header className="app-header">
        <div>
          <div className="eyebrow">MSC Signing Terminal</div>
          <h1>Haftverzicht</h1>
        </div>
        <button className="secondary icon-button" type="button" onClick={resetPairing} title="Gerätekopplung zurücksetzen">
          <RotateCcw size={20} />
        </button>
      </header>

      {message ? <div className="screen warning-box">{message}</div> : null}

      {step === "pair" ? (
        <section className="screen pair-screen">
          <Link2 size={52} />
          <h2>Signaturgerät koppeln</h2>
          <p>Der Operator erzeugt den Pairing-Code im Nennungstool.</p>
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
          <Loader2 size={54} className="spin" />
          <h2>Bereit für die nächste Unterschrift</h2>
          <p>Der Operator startet die Haftverzicht-Session im Nennungstool.</p>
        </section>
      ) : null}

      {step === "detail" && signingCase ? (
        <section className="screen">
          <div className="screen-title">
            <div>
              <h2>{fullName(signingCase.driver)}</h2>
              <p>{signingCase.event.name} · {signingCase.event.startsAt} bis {signingCase.event.endsAt}</p>
            </div>
            <button className="primary" type="button" onClick={() => setStep("waiver")}>
              Haftverzicht lesen
            </button>
          </div>
          <div className="summary-band">
            <div><strong>Unterzeichner</strong><span>{signer.type === "guardian" ? `${signer.guardianName ?? "-"} (${signer.guardianRelationship ?? "-"})` : "Fahrer selbst"}</span></div>
            <div><strong>Sprache</strong><span>{languageLabel(signingCase.contract.locale)}</span></div>
            <div><strong>Version</strong><span>{signingCase.contract.version}</span></div>
            <div><strong>Text-Hash</strong><span className="hash">{signingCase.contract.textHash}</span></div>
          </div>
          <div className="entry-list">
            {signingCase.entries.map((entry) => (
              <article className="entry-card" key={entry.id}>
                <div>
                  <div className="eyebrow">{entry.className}</div>
                  <h3>{entry.startNumber ? `Startnummer ${entry.startNumber}` : "Ohne Startnummer"}</h3>
                  <p>Beifahrer: {entry.codriver ? fullName(entry.codriver) : "nicht angegeben"}</p>
                </div>
                <div className="vehicle-list">
                  {entry.vehicles.map((vehicle) => (
                    <div className="vehicle-pill" key={vehicle.id}>
                      <strong>{vehicle.role === "backup" ? "Ersatz" : "Fahrzeug"}</strong>
                      <span>{vehicle.make} {vehicle.model}</span>
                      <span>{vehicle.year ?? "-"}</span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {step === "waiver" && signingCase ? (
        <section className="screen">
          <div className="screen-title">
            <div>
              <h2>{signingCase.contract.title}</h2>
              <p>{languageLabel(signingCase.contract.locale)} · Version {signingCase.contract.version}</p>
            </div>
            <button className="primary" type="button" onClick={() => setStep("signature")}>
              Zur Unterschrift
            </button>
          </div>
          <div className="hash-panel">
            <strong>Text-Hash</strong>
            <span>{signingCase.contract.textHash}</span>
          </div>
          <article className="waiver-text">{signingCase.contract.fullText}</article>
        </section>
      ) : null}

      {step === "signature" && signingCase ? (
        <section className="screen">
          <div className="screen-title">
            <div>
              <h2>Unterschrift</h2>
              <p>{signer.type === "guardian" ? "Erziehungsberechtigter unterschreibt." : "Fahrer unterschreibt selbst."}</p>
            </div>
            <button className="primary" type="button" disabled={!signatureDataUrl || busy} onClick={() => void complete()}>
              {busy ? <Loader2 size={20} className="spin" /> : <PenLine size={20} />}
              Abschließen
            </button>
          </div>
          <SignaturePad onChange={setSignatureDataUrl} />
        </section>
      ) : null}

      {step === "success" ? (
        <section className="screen success-panel">
          <FileCheck2 size={54} />
          <h2>Unterschrift gespeichert</h2>
          <p>Der Operator sieht den Abschluss im Nennungstool.</p>
          <CheckCircle2 size={42} />
          <button className="primary" type="button" onClick={() => {
            setSession(null);
            setStep("waiting");
          }}>
            Bereit für nächste Session
          </button>
        </section>
      ) : null}
    </main>
  );
}
