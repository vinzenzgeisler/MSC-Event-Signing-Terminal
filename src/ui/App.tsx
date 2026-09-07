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
import { useRegisterSW } from "virtual:pwa-register/react";
import { signingApiAdapter, type DeviceSigningSession, type ParticipantDraft } from "../adapters/signingApiAdapter";
import type { SigningCase } from "../domain/types";
import { SignaturePad } from "./SignaturePad";

type Step = "pair" | "waiting" | "signing" | "success";
const DEVICE_NAME_KEY = "msc-signing-device-name";

const emptyParticipantDraft = (): ParticipantDraft => ({
  locale: "de-DE",
  firstName: "",
  lastName: "",
  birthdate: "",
  country: "DE",
  street: "",
  zip: "",
  city: "",
  email: "",
  phone: "",
  emergencyContactFirstName: "",
  emergencyContactLastName: "",
  emergencyContactPhone: "",
  motorsportHistory: "",
  guardianFullName: null,
  guardianEmail: null,
  guardianPhone: null,
  guardianRelationship: null
});

const formTexts = {
  "de-DE": { title: "Beifahrer-Daten", intro: "Bitte alle Angaben vollständig ausfüllen.", submit: "Daten zur Prüfung senden", waiting: "Angaben gesendet", waitingInfo: "Das Anmeldungsteam prüft deine Angaben. Bitte am Tablet bleiben.", firstName: "Vorname", lastName: "Nachname", birthdate: "Geburtsdatum", country: "Land", street: "Straße und Hausnummer", zip: "PLZ", city: "Ort", email: "E-Mail", phone: "Telefon", emergencyFirst: "Notfallkontakt Vorname", emergencyLast: "Notfallkontakt Nachname", emergencyPhone: "Notfallkontakt Telefon", history: "Motorsportliche Erfahrung (optional)", guardian: "Sorgeberechtigte Person (bei Minderjährigen)", guardianName: "Name", guardianRelation: "Verhältnis", privacy: "Ich habe die Datenschutzhinweise gelesen und akzeptiert.", waiver: "Ich habe die Haftverzichtserklärung gelesen und verstanden." },
  "en-GB": { title: "Co-driver details", intro: "Please complete all required fields.", submit: "Send details for review", waiting: "Details submitted", waitingInfo: "The registration team is reviewing your details. Please stay at the tablet.", firstName: "First name", lastName: "Last name", birthdate: "Date of birth", country: "Country", street: "Street and house number", zip: "Postcode", city: "City", email: "Email", phone: "Phone", emergencyFirst: "Emergency contact first name", emergencyLast: "Emergency contact last name", emergencyPhone: "Emergency contact phone", history: "Motorsport experience (optional)", guardian: "Legal guardian (for minors)", guardianName: "Name", guardianRelation: "Relationship", privacy: "I have read and accept the privacy notice.", waiver: "I have read and understood the waiver." },
  "cs-CZ": { title: "Údaje spolujezdce", intro: "Vyplňte prosím všechna povinná pole.", submit: "Odeslat údaje ke kontrole", waiting: "Údaje odeslány", waitingInfo: "Registrační tým kontroluje vaše údaje. Zůstaňte prosím u tabletu.", firstName: "Jméno", lastName: "Příjmení", birthdate: "Datum narození", country: "Země", street: "Ulice a číslo", zip: "PSČ", city: "Město", email: "E-mail", phone: "Telefon", emergencyFirst: "Nouzový kontakt – jméno", emergencyLast: "Nouzový kontakt – příjmení", emergencyPhone: "Nouzový telefon", history: "Zkušenosti v motorsportu (volitelné)", guardian: "Zákonný zástupce (u nezletilých)", guardianName: "Jméno", guardianRelation: "Vztah", privacy: "Přečetl/a jsem si zásady ochrany osobních údajů a souhlasím s nimi.", waiver: "Přečetl/a jsem si prohlášení o zproštění odpovědnosti a rozumím mu." },
  "pl-PL": { title: "Dane pilota", intro: "Proszę wypełnić wszystkie wymagane pola.", submit: "Wyślij dane do sprawdzenia", waiting: "Dane wysłane", waitingInfo: "Zespół rejestracyjny sprawdza dane. Proszę pozostać przy tablecie.", firstName: "Imię", lastName: "Nazwisko", birthdate: "Data urodzenia", country: "Kraj", street: "Ulica i numer domu", zip: "Kod pocztowy", city: "Miejscowość", email: "E-mail", phone: "Telefon", emergencyFirst: "Kontakt alarmowy – imię", emergencyLast: "Kontakt alarmowy – nazwisko", emergencyPhone: "Telefon alarmowy", history: "Doświadczenie motorsportowe (opcjonalne)", guardian: "Opiekun prawny (dla niepełnoletnich)", guardianName: "Imię i nazwisko", guardianRelation: "Relacja", privacy: "Przeczytałem(-am) i akceptuję informacje o ochronie danych.", waiver: "Przeczytałem(-am) i rozumiem oświadczenie o zrzeczeniu się roszczeń." }
} as const;

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
  const [privacyAcceptedAt, setPrivacyAcceptedAt] = useState<string | null>(null);
  const [participantDraft, setParticipantDraft] = useState<ParticipantDraft>(emptyParticipantDraft);
  const [nowTick, setNowTick] = useState(Date.now());
  const {
    needRefresh: [pwaUpdateAvailable],
    updateServiceWorker
  } = useRegisterSW();

  const signingCase = useMemo(() => asSigningCase(session), [session]);
  const signingPerson = signingCase?.signer ?? signingCase?.driver ?? null;
  const isParticipantWorkflow = session?.workflowType === "regular_codriver_registration" || session?.workflowType === "charity_codriver_registration";
  const participantPayload = session?.sessionPayload && typeof session.sessionPayload === "object" ? session.sessionPayload as Record<string, unknown> : null;
  const participantProfile = (participantPayload?.participant ?? session?.draftPayload ?? participantDraft) as ParticipantDraft;
  const formT = formTexts[participantDraft.locale];
  const sessionExpiresAtMs = session?.expiresAt ? new Date(session.expiresAt).getTime() : Number.NaN;
  const remainingSeconds = Number.isFinite(sessionExpiresAtMs) ? Math.max(0, Math.ceil((sessionExpiresAtMs - nowTick) / 1000)) : null;
  useEffect(() => {
    if (pwaUpdateAvailable && step !== "signing") {
      void updateServiceWorker(true);
    }
  }, [pwaUpdateAvailable, step, updateServiceWorker]);

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
        setPrivacyAcceptedAt(null);
        setSignatureDataUrl(null);
        setParticipantDraft(current.draftPayload && typeof current.draftPayload === "object" ? current.draftPayload as ParticipantDraft : emptyParticipantDraft());
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
        if (current.workflowStage === "ready_to_sign" && session.workflowStage !== "ready_to_sign") {
          setDisplayedAt(new Date().toISOString());
          setPrivacyAcceptedAt(null);
          setWaiverAcceptedAt(null);
          setSignatureDataUrl(null);
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
    if (isParticipantWorkflow && !privacyAcceptedAt) {
      setMessage("Bitte zuerst die Datenschutzhinweise bestätigen.");
      return;
    }
    if (!signatureDataUrl) {
      setMessage("Bitte zuerst im Unterschriftenfeld unterschreiben.");
      return;
    }
    setBusy(true);
    try {
      const input = {
        displayedAt,
        waiverAcceptedAt,
        signedAt: new Date().toISOString(),
        signatureDataUrl
      };
      if (isParticipantWorkflow) {
        await signingApiAdapter.completeParticipantSession(session.id, deviceToken, { ...input, privacyAcceptedAt: privacyAcceptedAt! });
      } else {
        await signingApiAdapter.completeSession(session.id, deviceToken, input);
      }
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

  async function submitParticipantData() {
    if (!session || !deviceToken) return;
    setBusy(true);
    setMessage("");
    try {
      const updated = await signingApiAdapter.submitParticipantDraft(session.id, deviceToken, participantDraft);
      setSession(updated);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Eingaben konnten nicht gespeichert werden.");
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
            <h1>Event-Terminal</h1>
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

      {step === "signing" && isParticipantWorkflow && session?.workflowStage === "collecting_data" ? (
        <section className="screen participant-form-screen">
          <div className="screen-title onepage-title">
            <div><div className="eyebrow">MSC Event</div><h2>{formT.title}</h2><p>{formT.intro}</p></div>
            {remainingSeconds !== null ? <div className="session-countdown">{Math.floor(remainingSeconds / 60)}:{String(remainingSeconds % 60).padStart(2, "0")}</div> : null}
          </div>
          <form className="participant-form" onSubmit={(event) => { event.preventDefault(); void submitParticipantData(); }}>
            <label className="full-field">Sprache / Language / Jazyk / Język
              <select value={participantDraft.locale} onChange={(event) => setParticipantDraft((current) => ({ ...current, locale: event.target.value as ParticipantDraft["locale"] }))}>
                <option value="de-DE">Deutsch</option><option value="en-GB">English</option><option value="cs-CZ">Čeština</option><option value="pl-PL">Polski</option>
              </select>
            </label>
            {([
              ["firstName", formT.firstName, "text"], ["lastName", formT.lastName, "text"], ["birthdate", formT.birthdate, "date"], ["country", formT.country, "text"],
              ["street", formT.street, "text"], ["zip", formT.zip, "text"], ["city", formT.city, "text"], ["email", formT.email, "email"], ["phone", formT.phone, "tel"],
              ["emergencyContactFirstName", formT.emergencyFirst, "text"], ["emergencyContactLastName", formT.emergencyLast, "text"], ["emergencyContactPhone", formT.emergencyPhone, "tel"]
            ] as Array<[keyof ParticipantDraft, string, string]>).map(([key, label, type]) => (
              <label key={key}>{label}<input required type={type} value={String(participantDraft[key] ?? "")} onChange={(event) => setParticipantDraft((current) => ({ ...current, [key]: event.target.value }))} /></label>
            ))}
            <label className="full-field">{formT.history}<textarea value={participantDraft.motorsportHistory ?? ""} onChange={(event) => setParticipantDraft((current) => ({ ...current, motorsportHistory: event.target.value }))} /></label>
            <fieldset className="full-field guardian-fields">
              <legend>{formT.guardian}</legend>
              <label>{formT.guardianName}<input value={participantDraft.guardianFullName ?? ""} onChange={(event) => setParticipantDraft((current) => ({ ...current, guardianFullName: event.target.value || null }))} /></label>
              <label>E-Mail<input type="email" value={participantDraft.guardianEmail ?? ""} onChange={(event) => setParticipantDraft((current) => ({ ...current, guardianEmail: event.target.value || null }))} /></label>
              <label>Telefon<input type="tel" value={participantDraft.guardianPhone ?? ""} onChange={(event) => setParticipantDraft((current) => ({ ...current, guardianPhone: event.target.value || null }))} /></label>
              <label>{formT.guardianRelation}<input value={participantDraft.guardianRelationship ?? ""} onChange={(event) => setParticipantDraft((current) => ({ ...current, guardianRelationship: event.target.value || null }))} /></label>
            </fieldset>
            <button className="primary full-field" type="submit" disabled={busy}>{busy ? <Loader2 size={20} className="spin" /> : <ClipboardCheck size={20} />}{formT.submit}</button>
          </form>
        </section>
      ) : null}

      {step === "signing" && isParticipantWorkflow && session?.workflowStage === "awaiting_operator_approval" ? (
        <section className="screen wait-screen"><ClipboardCheck size={58} /><h2>{formT.waiting}</h2><p>{formT.waitingInfo}</p></section>
      ) : null}

      {step === "signing" && signingCase && (!isParticipantWorkflow || session?.workflowStage === "ready_to_sign") ? (
        <section className="screen onepage-signing">
          <div className="screen-title onepage-title">
            <div>
              <div className="eyebrow">Bitte Angaben prüfen und unterschreiben</div>
              <h2>{isParticipantWorkflow ? `${participantProfile.firstName} ${participantProfile.lastName}` : signingPerson ? fullName(signingPerson) : fullName(signingCase.driver)}</h2>
              {(isParticipantWorkflow || signingCase.signer?.role === "codriver") ? <p>Beifahrer von {fullName(signingCase.driver)}</p> : null}
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
            {isParticipantWorkflow ? <button className={`read-confirmation ${privacyAcceptedAt ? "selected" : ""}`} type="button" onClick={() => setPrivacyAcceptedAt((current) => current ?? new Date().toISOString())}>
              <span className="toggle-icon">{privacyAcceptedAt ? <CheckCircle2 size={20} /> : <ShieldCheck size={20} />}</span>
              <span><strong>{formTexts[participantProfile.locale ?? "de-DE"].privacy}</strong><small>{checkedLabel(privacyAcceptedAt)}</small></span>
            </button> : null}
            <button className={`read-confirmation ${waiverAcceptedAt ? "selected" : ""}`} type="button" onClick={() => setWaiverAcceptedAt((current) => current ?? new Date().toISOString())}>
              <span className="toggle-icon">{waiverAcceptedAt ? <CheckCircle2 size={20} /> : <ClipboardCheck size={20} />}</span>
              <span>
                <strong>{isParticipantWorkflow ? formTexts[participantProfile.locale ?? "de-DE"].waiver : "Ich habe die Haftverzichtserklärung gelesen und verstanden."}</strong>
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
