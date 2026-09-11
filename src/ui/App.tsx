import {
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Link2,
  Loader2,
  PenLine,
  ShieldCheck
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { SigningApiError, signingApiAdapter, type DeviceSigningSession, type ParticipantDraft } from "../adapters/signingApiAdapter";
import { ageAtEvent } from "../domain/age";
import type { PersonSnapshot, SigningCase } from "../domain/types";
import { SignaturePad } from "./SignaturePad";

type Step = "pair" | "waiting" | "signing" | "success";
const DEVICE_NAME_KEY = "msc-signing-device-name";
const SESSION_DRAFT_KEY = "msc-signing-active-draft";

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

function personDisplayName(person: Pick<PersonSnapshot, "displayName" | "firstName" | "lastName">) {
  return person.displayName?.trim() || `${person.firstName ?? ""} ${person.lastName ?? ""}`.trim() || "Teilnehmer";
}

type ParticipantSessionProfile = Partial<ParticipantDraft> & {
  displayName?: string;
  identityProtected?: boolean;
  firstName?: string | null;
  lastName?: string | null;
};

function participantDisplayName(person: ParticipantSessionProfile) {
  return person.displayName?.trim() || `${person.firstName ?? ""} ${person.lastName ?? ""}`.trim() || "Beifahrer";
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

const terminalErrorMessages: Record<string, string> = {
  SIGNING_PAIRING_CODE_INVALID: "Der Pairing-Code ist ungültig oder abgelaufen.",
  PARTICIPANT_DRAFT_REQUIRED: "Die Teilnehmerdaten fehlen. Bitte das Anmeldungsteam informieren.",
  BIRTHDATE_OUT_OF_RANGE: "Bitte ein gültiges Geburtsdatum eingeben.",
  GUARDIAN_REQUIRED: "Bei Minderjährigen bitte alle Angaben zur sorgeberechtigten Person ausfüllen.",
  CODRIVER_EMAIL_MUST_DIFFER: "Die E-Mail-Adresse des Beifahrers muss sich von der des Fahrers unterscheiden.",
  CODRIVER_NAME_MUST_DIFFER: "Fahrer und Beifahrer dürfen nicht dieselbe Person sein.",
  EMAIL_ALREADY_USED_BY_DIFFERENT_PERSON: "Diese E-Mail-Adresse ist bereits einer anderen Person zugeordnet. Bitte das Anmeldungsteam informieren.",
  CODRIVER_ALREADY_ASSIGNED: "Für diese Nennung ist bereits ein Beifahrer eingetragen.",
  CHARITY_CODRIVER_ALREADY_ACTIVE: "Dieser Charity-Beifahrer ist bereits eingetragen.",
  WAIVER_ALREADY_SIGNED: "Für diese Person wurde der aktuelle Haftverzicht bereits unterschrieben.",
  SIGNING_GUARDIAN_EMAIL_REQUIRED: "Bitte die E-Mail-Adresse der sorgeberechtigten Person eingeben.",
  SIGNATURE_INVALID: "Die Unterschrift konnte nicht gelesen werden. Bitte neu unterschreiben.",
  SIGNING_TIMESTAMPS_INVALID: "Der Vorgang ist nicht mehr gültig. Bitte das Anmeldungsteam informieren.",
  SIGNING_SESSION_NOT_ACTIVE: "Der Vorgang wurde beendet. Bitte das Anmeldungsteam informieren.",
  SIGNING_SESSION_EXPIRED: "Der Vorgang ist abgelaufen. Bitte das Anmeldungsteam informieren.",
  TERMINAL_SESSION_NOT_ACTIVE: "Der Vorgang wurde beendet. Bitte das Anmeldungsteam informieren.",
  TERMINAL_SESSION_NOT_EDITABLE: "Die Eingaben können gerade nicht geändert werden. Bitte das Anmeldungsteam informieren."
};

function terminalErrorMessage(error: unknown, fallback: string) {
  if (error instanceof SigningApiError) {
    if (error.code && terminalErrorMessages[error.code]) return terminalErrorMessages[error.code];
    if (/validation failed/i.test(error.message)) return "Bitte alle Pflichtfelder vollständig und korrekt ausfüllen.";
    if (error.kind === "network" || error.kind === "timeout" || (error.status ?? 0) >= 500) {
      return "Speichern derzeit nicht möglich. Bitte das Anmeldungsteam informieren.";
    }
  }
  if (error instanceof Error) {
    const knownCode = Object.keys(terminalErrorMessages).find((code) => error.message.includes(code));
    if (knownCode) return terminalErrorMessages[knownCode];
  }
  return fallback;
}

function isClosedSessionError(error: unknown) {
  return error instanceof SigningApiError && [
    "SIGNING_SESSION_NOT_ACTIVE",
    "SIGNING_SESSION_EXPIRED",
    "TERMINAL_SESSION_NOT_ACTIVE",
    "TERMINAL_SESSION_NOT_EDITABLE"
  ].includes(error.code ?? "");
}

function loadSavedDraft(sessionId: string) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_DRAFT_KEY) ?? "null") as Record<string, unknown> | null;
    return saved?.sessionId === sessionId ? saved : null;
  } catch {
    sessionStorage.removeItem(SESSION_DRAFT_KEY);
    return null;
  }
}

// The contract text's first line repeats its own title (see flattenWaiverDocument on the
// backend), which would otherwise show the same heading twice: once large as <h3>, once
// again as the first line of the scrollable body text.
function stripLeadingTitle(text: string, title: string): string {
  if (!text.startsWith(title)) return text;
  return text.slice(title.length).replace(/^\n+/, "");
}

function ContractScroll({ title, text, onRead }: { title: string; text: string; onRead: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const body = stripLeadingTitle(text, title);
  const checkRead = () => {
    const element = ref.current;
    if (element && element.scrollTop + element.clientHeight >= element.scrollHeight - 8) onRead();
  };
  useEffect(() => {
    const frame = window.requestAnimationFrame(checkRead);
    return () => window.cancelAnimationFrame(frame);
  }, [body]);
  return <div ref={ref} className="contract-scroll" onScroll={checkRead}>
    <h3>{title}</h3>
    <div className="contract-copy">{body}</div>
  </div>;
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
  const [authoritativeRead, setAuthoritativeRead] = useState(false);
  const [translationRead, setTranslationRead] = useState(false);
  const [germanExpanded, setGermanExpanded] = useState(false);
  const [guardianEmail, setGuardianEmail] = useState("");
  const [participantDraft, setParticipantDraft] = useState<ParticipantDraft>(emptyParticipantDraft);
  const [nowTick, setNowTick] = useState(Date.now());
  const pollInFlightRef = useRef(false);
  const completionInFlightRef = useRef(false);
  const {
    needRefresh: [pwaUpdateAvailable],
    updateServiceWorker
  } = useRegisterSW();

  const signingCase = useMemo(() => asSigningCase(session), [session]);
  const signingPerson = signingCase?.signer ?? signingCase?.driver ?? null;
  const signingGuardian = session?.signerPayload && typeof session.signerPayload === "object"
    ? session.signerPayload as { guardianName?: string | null }
    : null;
  const isParticipantWorkflow = session?.workflowType === "regular_codriver_registration" || session?.workflowType === "charity_codriver_registration";
  const participantPayload = session?.sessionPayload && typeof session.sessionPayload === "object" ? session.sessionPayload as Record<string, unknown> : null;
  const participantProfile = (participantPayload?.participant ?? session?.draftPayload ?? participantDraft) as ParticipantSessionProfile;
  const formT = formTexts[participantDraft.locale];
  const participantEvent = participantPayload?.event && typeof participantPayload.event === "object" ? participantPayload.event as { startsAt?: string } : null;
  const participantAge = ageAtEvent(participantDraft.birthdate, participantEvent?.startsAt);
  const participantIsMinor = participantAge !== null && participantAge < 18;
  const translation = signingCase?.contract.translation ?? null;
  const contractRead = authoritativeRead && (!translation || translationRead);
  const sessionExpiresAtMs = session?.expiresAt ? new Date(session.expiresAt).getTime() : Number.NaN;
  const remainingSeconds = Number.isFinite(sessionExpiresAtMs) ? Math.max(0, Math.ceil((sessionExpiresAtMs - nowTick) / 1000)) : null;
  useEffect(() => {
    if (pwaUpdateAvailable && step !== "signing") {
      void updateServiceWorker(true);
    }
  }, [pwaUpdateAvailable, step, updateServiceWorker]);

  useEffect(() => {
    const preventKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (event.key === "F5" || ((event.ctrlKey || event.metaKey) && ["r", "+", "-", "=", "0"].includes(key)) || (event.altKey && ["arrowleft", "arrowright"].includes(key))) {
        event.preventDefault();
      }
    };
    const preventZoomWheel = (event: WheelEvent) => { if (event.ctrlKey || event.metaKey) event.preventDefault(); };
    const preventMultiTouch = (event: TouchEvent) => { if (event.touches.length > 1) event.preventDefault(); };
    const preventGesture = (event: Event) => event.preventDefault();
    const preventDoubleClick = (event: MouseEvent) => event.preventDefault();
    const holdHistory = () => window.history.pushState({ mscTerminalGuard: true }, "", window.location.href);
    holdHistory();
    window.addEventListener("popstate", holdHistory);
    window.addEventListener("keydown", preventKey);
    window.addEventListener("wheel", preventZoomWheel, { passive: false });
    window.addEventListener("touchmove", preventMultiTouch, { passive: false });
    window.addEventListener("gesturestart", preventGesture, { passive: false } as AddEventListenerOptions);
    window.addEventListener("gesturechange", preventGesture, { passive: false } as AddEventListenerOptions);
    window.addEventListener("gestureend", preventGesture, { passive: false } as AddEventListenerOptions);
    window.addEventListener("dblclick", preventDoubleClick, { passive: false });
    return () => {
      window.removeEventListener("popstate", holdHistory);
      window.removeEventListener("keydown", preventKey);
      window.removeEventListener("wheel", preventZoomWheel);
      window.removeEventListener("touchmove", preventMultiTouch);
      window.removeEventListener("gesturestart", preventGesture);
      window.removeEventListener("gesturechange", preventGesture);
      window.removeEventListener("gestureend", preventGesture);
      window.removeEventListener("dblclick", preventDoubleClick);
    };
  }, []);

  useEffect(() => {
    const preventUnload = (event: BeforeUnloadEvent) => {
      if (step !== "signing") return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventUnload);
    return () => window.removeEventListener("beforeunload", preventUnload);
  }, [step]);

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
      setMessage(terminalErrorMessage(error, "Kopplung nicht möglich. Bitte das Anmeldungsteam informieren."));
    } finally {
      setBusy(false);
    }
  }

  async function pollSession() {
    if (!deviceToken || step !== "waiting" || pollInFlightRef.current) {
      return;
    }
    pollInFlightRef.current = true;
    try {
      const current = await signingApiAdapter.getCurrentSession(deviceToken);
      if (current) {
        const saved = loadSavedDraft(current.id);
        setSession(current);
        setDisplayedAt(typeof saved?.displayedAt === "string" ? saved.displayedAt : new Date().toISOString());
        setWaiverAcceptedAt(typeof saved?.waiverAcceptedAt === "string" ? saved.waiverAcceptedAt : null);
        setPrivacyAcceptedAt(typeof saved?.privacyAcceptedAt === "string" ? saved.privacyAcceptedAt : null);
        setSignatureDataUrl(null);
        setParticipantDraft(saved?.participantDraft && typeof saved.participantDraft === "object"
          ? saved.participantDraft as ParticipantDraft
          : current.draftPayload && typeof current.draftPayload === "object" ? current.draftPayload as ParticipantDraft : emptyParticipantDraft());
        setAuthoritativeRead(saved?.authoritativeRead === true);
        setTranslationRead(saved?.translationRead === true);
        setGermanExpanded(saved?.germanExpanded === true);
        setGuardianEmail(typeof saved?.guardianEmail === "string" ? saved.guardianEmail : "");
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
        setMessage("");
        return;
      }
      // Verbindungszustände werden im Nennungstool angezeigt; das Terminal bleibt ruhig.
    } finally {
      pollInFlightRef.current = false;
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
    setGuardianEmail("");
    sessionStorage.removeItem(SESSION_DRAFT_KEY);
    setStep("waiting");
    setMessage("");
  }, [remainingSeconds, step]);

  useEffect(() => {
    if (!deviceToken || !session || step !== "signing") {
      return;
    }
    const pollActiveSession = async () => {
      if (pollInFlightRef.current || completionInFlightRef.current) return;
      pollInFlightRef.current = true;
      try {
        const current = await signingApiAdapter.getCurrentSession(deviceToken);
        if (!current || current.id !== session.id) {
          sessionStorage.removeItem(SESSION_DRAFT_KEY);
          setSession(null);
          setDisplayedAt(null);
          setWaiverAcceptedAt(null);
          setSignatureDataUrl(null);
          setGuardianEmail("");
          setStep("waiting");
          setMessage("");
          return;
        }
        if (current.workflowStage === "ready_to_sign" && session.workflowStage !== "ready_to_sign") {
          setDisplayedAt(new Date().toISOString());
          setPrivacyAcceptedAt(null);
          setWaiverAcceptedAt(null);
          setSignatureDataUrl(null);
          setAuthoritativeRead(false);
          setTranslationRead(false);
          setGermanExpanded(false);
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
          setMessage("");
          return;
        }
        // Verbindungszustände werden im Nennungstool angezeigt; Eingaben bleiben lokal erhalten.
      } finally {
        pollInFlightRef.current = false;
      }
    };
    const interval = window.setInterval(() => void pollActiveSession(), 2500);
    return () => window.clearInterval(interval);
  }, [deviceToken, session, step]);

  useEffect(() => {
    if (!session || step !== "signing") return;
    sessionStorage.setItem(SESSION_DRAFT_KEY, JSON.stringify({
      sessionId: session.id,
      displayedAt,
      waiverAcceptedAt,
      privacyAcceptedAt,
      participantDraft,
      authoritativeRead,
      translationRead,
      germanExpanded,
      guardianEmail
    }));
  }, [authoritativeRead, displayedAt, germanExpanded, guardianEmail, participantDraft, privacyAcceptedAt, session, step, translationRead, waiverAcceptedAt]);

  async function complete() {
    if (!session || !deviceToken || !displayedAt) {
      return;
    }
    if (!contractRead) {
      setMessage("Bitte den vollständigen Vertragstext bis zum Ende lesen.");
      return;
    }
    if (!waiverAcceptedAt || (isParticipantWorkflow && !privacyAcceptedAt)) {
      setMessage("Bitte die gemeinsame Bestätigung auswählen.");
      return;
    }
    if (!signatureDataUrl) {
      setMessage("Bitte zuerst im Unterschriftenfeld unterschreiben.");
      return;
    }
    if (!isParticipantWorkflow && signingCase?.isMinor && !/^\S+@\S+\.\S+$/.test(guardianEmail.trim())) {
      setMessage("Bitte die E-Mail-Adresse der sorgeberechtigten Person vollständig eingeben.");
      return;
    }
    completionInFlightRef.current = true;
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
        await signingApiAdapter.completeSession(session.id, deviceToken, {
          ...input,
          ...(signingCase?.isMinor ? { guardianEmail: guardianEmail.trim().toLowerCase() } : {})
        });
      }
      setSession(null);
      sessionStorage.removeItem(SESSION_DRAFT_KEY);
      setGuardianEmail("");
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
        setMessage("");
        return;
      }
      if (isClosedSessionError(error)) {
        sessionStorage.removeItem(SESSION_DRAFT_KEY);
        setSession(null);
        setDisplayedAt(null);
        setWaiverAcceptedAt(null);
        setSignatureDataUrl(null);
        setGuardianEmail("");
        setMessage("");
        setStep("waiting");
        return;
      }
      setMessage(terminalErrorMessage(error, "Speichern nicht möglich. Bitte das Anmeldungsteam informieren."));
    } finally {
      completionInFlightRef.current = false;
      setBusy(false);
    }
  }

  async function submitParticipantData() {
    if (!session || !deviceToken) return;
    const phoneDigits = [participantDraft.phone, participantDraft.emergencyContactPhone, participantDraft.guardianPhone]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.replace(/\D/g, ""));
    if (participantAge === null || participantAge < 6 || participantAge > 100) {
      setMessage("Bitte ein gültiges Geburtsdatum eingeben.");
      return;
    }
    if (phoneDigits.some((value) => value.length < 6 || value.length > 15)) {
      setMessage("Bitte gültige Telefonnummern mit 6 bis 15 Ziffern eingeben.");
      return;
    }
    if (participantIsMinor && (!participantDraft.guardianFullName?.trim() || !participantDraft.guardianEmail?.trim() || !participantDraft.guardianPhone?.trim() || !participantDraft.guardianRelationship?.trim())) {
      setMessage("Bei Minderjährigen bitte alle Angaben zur sorgeberechtigten Person ausfüllen.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const updated = await signingApiAdapter.submitParticipantDraft(session.id, deviceToken, participantDraft);
      setSession(updated);
    } catch (error) {
      if (isClosedSessionError(error)) {
        sessionStorage.removeItem(SESSION_DRAFT_KEY);
        setSession(null);
        setMessage("");
        setStep("waiting");
        return;
      }
      setMessage(terminalErrorMessage(error, "Eingaben konnten nicht gespeichert werden. Bitte das Anmeldungsteam informieren."));
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
    const names = signingCase.entries.map((entry) => (entry.codriver ? personDisplayName(entry.codriver) : null)).filter(Boolean);
    return Array.from(new Set(names)).join(" · ");
  }

  function updateParticipantField(key: keyof ParticipantDraft, value: string) {
    setParticipantDraft((current) => {
      const next = { ...current, [key]: value };
      if (key === "birthdate") {
        const nextAge = ageAtEvent(value, participantEvent?.startsAt);
        if (nextAge !== null && nextAge >= 18) {
          next.guardianFullName = null;
          next.guardianEmail = null;
          next.guardianPhone = null;
          next.guardianRelationship = null;
        }
      }
      return next;
    });
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

      {message ? <div className="screen warning-box" role="alert">{message}</div> : null}

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
              <label key={key}>{label}<input required type={type} value={String(participantDraft[key] ?? "")} onChange={(event) => updateParticipantField(key, event.target.value)} /></label>
            ))}
            <label className="full-field">{formT.history}<textarea value={participantDraft.motorsportHistory ?? ""} onChange={(event) => setParticipantDraft((current) => ({ ...current, motorsportHistory: event.target.value }))} /></label>
            {participantIsMinor ? <fieldset className="full-field guardian-fields">
              <legend>{formT.guardian}</legend>
              <label>{formT.guardianName}<input required value={participantDraft.guardianFullName ?? ""} onChange={(event) => setParticipantDraft((current) => ({ ...current, guardianFullName: event.target.value || null }))} /></label>
              <label>E-Mail<input required type="email" value={participantDraft.guardianEmail ?? ""} onChange={(event) => setParticipantDraft((current) => ({ ...current, guardianEmail: event.target.value || null }))} /></label>
              <label>Telefon<input required type="tel" value={participantDraft.guardianPhone ?? ""} onChange={(event) => setParticipantDraft((current) => ({ ...current, guardianPhone: event.target.value || null }))} /></label>
              <label>{formT.guardianRelation}<input required value={participantDraft.guardianRelationship ?? ""} onChange={(event) => setParticipantDraft((current) => ({ ...current, guardianRelationship: event.target.value || null }))} /></label>
            </fieldset> : null}
            <button className="primary full-field" type="submit" disabled={busy}>{busy ? <Loader2 size={20} className="spin" /> : <ClipboardCheck size={20} />}{formT.submit}</button>
          </form>
        </section>
      ) : null}

      {step === "signing" && isParticipantWorkflow && session?.workflowStage === "awaiting_operator_approval" ? (
        <section className="screen wait-screen"><ClipboardCheck size={58} /><h2>{formT.waiting}</h2></section>
      ) : null}

      {step === "signing" && signingCase && (!isParticipantWorkflow || session?.workflowStage === "ready_to_sign") ? (
        <section className="screen onepage-signing">
          <div className="screen-title onepage-title">
            <div>
              <div className="eyebrow">Bitte Angaben prüfen und unterschreiben</div>
              <h2>{signingCase.isMinor && signingGuardian?.guardianName
                ? signingGuardian.guardianName
                : isParticipantWorkflow ? participantDisplayName(participantProfile) : signingPerson ? personDisplayName(signingPerson) : personDisplayName(signingCase.driver)}</h2>
              {signingCase.isMinor && signingGuardian?.guardianName ? (
                <p>Sorgeberechtigte Person für {isParticipantWorkflow ? participantDisplayName(participantProfile) : signingPerson ? personDisplayName(signingPerson) : personDisplayName(signingCase.driver)}</p>
              ) : null}
              {(isParticipantWorkflow || signingCase.signer?.role === "codriver") ? <p>Beifahrer von {personDisplayName(signingCase.driver)}</p> : null}
              <p>{signingCase.event.name} · {vehicleSummary()}</p>
              {signingCase.signer?.role !== "codriver" && codriverSummary() ? <p>Beifahrer: {codriverSummary()}</p> : null}
            </div>
          </div>

          <article className="waiver-text onepage-waiver">
            {translation ? (
              <>
                <div className="translation-warning">Unverbindliche Übersetzung als Verständnishilfe. Rechtsverbindlich ist ausschließlich die deutsche Fassung.</div>
                <ContractScroll title={translation.title} text={translation.fullText} onRead={() => setTranslationRead(true)} />
                <details className="german-contract" open={germanExpanded} onToggle={(event) => setGermanExpanded(event.currentTarget.open)}>
                  <summary>Verbindliche deutsche Fassung anzeigen</summary>
                  <ContractScroll
                    title={signingCase.contract.authoritativeTitle ?? signingCase.contract.title}
                    text={signingCase.contract.authoritativeFullText ?? signingCase.contract.fullText}
                    onRead={() => setAuthoritativeRead(true)}
                  />
                </details>
              </>
            ) : (
              <ContractScroll
                title={signingCase.contract.authoritativeTitle ?? signingCase.contract.title}
                text={signingCase.contract.authoritativeFullText ?? signingCase.contract.fullText}
                onRead={() => setAuthoritativeRead(true)}
              />
            )}
          </article>

          {!isParticipantWorkflow && signingCase.isMinor ? (
            <label className="guardian-email-field">
              E-Mail der sorgeberechtigten Person
              <input
                required
                type="email"
                inputMode="email"
                autoComplete="email"
                value={guardianEmail}
                onChange={(event) => setGuardianEmail(event.target.value)}
              />
            </label>
          ) : null}

          <div className="read-confirmation-row">
            <button className={`read-confirmation ${waiverAcceptedAt ? "selected" : ""}`} type="button" disabled={!contractRead} onClick={() => {
              const acceptedAt = new Date().toISOString();
              setWaiverAcceptedAt((current) => current ?? acceptedAt);
              if (isParticipantWorkflow) setPrivacyAcceptedAt((current) => current ?? acceptedAt);
            }}>
              <span className="toggle-icon">{waiverAcceptedAt ? <CheckCircle2 size={20} /> : <ClipboardCheck size={20} />}</span>
              <span>
                <strong>{isParticipantWorkflow
                  ? "Ich habe die Datenschutzhinweise und die verbindliche deutsche Haftverzichtserklärung gelesen und akzeptiert."
                  : "Ich habe die verbindliche deutsche Haftverzichtserklärung gelesen und verstanden."}</strong>
                <small>{contractRead ? checkedLabel(waiverAcceptedAt) : "Bitte Vertragstext vollständig lesen"}</small>
              </span>
            </button>
          </div>

          <div className="onepage-signature-panel">
            <SignaturePad onChange={setSignatureDataUrl} />
            <button className="primary" type="button" disabled={busy || !contractRead || !waiverAcceptedAt || !signatureDataUrl || (isParticipantWorkflow && !privacyAcceptedAt)} onClick={() => void complete()}>
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
