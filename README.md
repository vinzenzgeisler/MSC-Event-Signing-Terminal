# MSC Event Signing Terminal

Prototyp fuer eine digitale Vor-Ort-Unterschriftenloesung zum MSC-Nennungstool.

Die App ist bewusst eigenstaendig gehalten. Sie ist die Web-Oberflaeche fuer das Signaturgeraet, also zum Beispiel ein Tablet mit Stift- oder Touch-Eingabe. Der Operator startet den Prozess im bestehenden Nennungstool; fachliche Vorpruefung, Auswahl des Fahrers und Session-Start passieren dort.

## Fachlicher Ablauf

1. Operator erzeugt im Nennungstool einen Pairing-Code.
2. Die Web-App auf dem Signaturgeraet wird mit diesem Code gekoppelt.
3. Das Signaturgeraet wartet auf die naechste vom Nennungstool gestartete Signing-Session.
4. Operator oeffnet eine Nennung, fuehrt die Vorpruefung im Nennungstool durch und sendet die Session ans Signaturgeraet.
5. Das Signaturgeraet zeigt Fahrer, Nennungen, Fahrzeuge, Beifahrer und Haftverzicht.
6. Die berechtigte Person unterschreibt direkt auf dem Signaturgeraet, idealerweise per Stift wie Apple Pencil oder per Touch.
7. Backend erzeugt Nachweisdokument und Audit-Datensatz und speichert beides privat in S3.

## Technische Struktur

- `src/domain`: fachliche Typen und Mock-Daten in der Form spaeterer Backend-Antworten
- `src/adapters`: API-Adapter fuer Pairing, Polling und Abschluss
- `src/evidence`: Validierung, Nachweis-/Audit-Erzeugung und Hashing
- `src/ui`: tablet- und stiftfaehige React-Oberflaeche

Die technische Entscheidung fuer Vite, React und TypeScript ist pragmatisch: Das bestehende Frontend nutzt ebenfalls React/Vite/TypeScript, der Prototyp bleibt dadurch fuer das Team leicht nachvollziehbar, ohne Code aus dem Hauptsystem direkt zu kopieren.

## Abgeleitete Integrationspunkte

Aus der Analyse der bestehenden Repositories sind diese Modelle und Konventionen relevant:

- `event`: Veranstaltungskontext
- `entry`: Nennung, Status, Check-in-Felder, Orga-Code, Fahrer- und Fahrzeugbezug
- `person`: Fahrer und Beifahrer
- `vehicle`: Fahrzeugdaten
- `registration_group`: mehrere Nennungen eines Fahrers im selben Event
- `consent_evidence`: Consent-Version, Sprache, Text-Hash, Guardian-Daten
- `document`: private Dokumentablage mit SHA-256 und S3-Key
- `audit_log`: maschinenlesbare Nachvollziehbarkeit

Backend-Endpunkte:

```http
POST /admin/signing/devices/pairing-code
GET  /admin/signing/devices
POST /admin/signing/sessions
GET  /admin/signing/sessions/{sessionId}

POST /signing/device/claim
GET  /signing/device/current-session
POST /signing/sessions/{sessionId}/complete
```

`POST /admin/signing/sessions` liefert die fachliche Wahrheit:

- `isMinor`
- `requiresMedicalCertificate`
- alle relevanten Entries/Vehicles fuer `eventId + driverPersonId`
- Haftverzichtssprache
- Haftverzichtsversion
- vollstaendiger Haftverzichtstext
- Text-Hash

Die Signing-App berechnet diese Werte nicht selbst. Sie zeigt sie an und dokumentiert die Bestaetigung.

## Nachweisinhalt

Der Prototyp erzeugt ein HTML-Nachweisdokument und einen Audit-JSON-Datensatz. Fuer die produktive Variante kann derselbe Evidence-Payload serverseitig als PDF gerendert werden.

Der Nachweis enthaelt:

- Veranstaltung
- Fahrer
- alle relevanten Nennungen und Fahrzeuge
- Beifahrer
- Unterzeichnerrolle, inklusive Guardian-Name und Beziehung bei Minderjaehrigen
- vollstaendiger Haftverzichtstext
- Sprache, Version und Text-Hash
- Anzeige-/Bestaetigungs-/Signaturzeitpunkte
- Vorpruefungen
- Operator-Kennung
- Unterschrift
- Dokument- und Signatur-Hashes

## S3-Ansatz

Das Backend speichert mit der bestehenden Dokumentenablage unter:

```text
signing/{eventId}/{driverPersonId}/{evidenceId}/evidence.html
signing/{eventId}/{driverPersonId}/{evidenceId}/audit.json
```

Produktiv sollte ein Backend-Adapter die Objekte in einen privaten, versionierten S3-Bucket schreiben:

- Block Public Access
- SSE-S3 oder KMS-Verschluesselung
- HTTPS-only Bucket Policy
- keine oeffentlichen URLs
- Downloads nur ueber kurzlebige presigned URLs

## Commands

```bash
npm install
npm run dev
npm run build
npm test
```

Der Dev-Server verwendet Port `5178`.

Fuer die echte Backend-Integration muss die App die API-Basis kennen:

```bash
VITE_API_BASE_URL=https://api.example.org npm run dev
```

Fuer den lokalen Test gegen die gemeinsame Dev-API ist stattdessen der Proxy-Modus vorgesehen:

```text
VITE_API_BASE_URL=/api
VITE_API_PROXY_TARGET=https://<dev-api-base-url>
```

Mit `scripts/start-local-test.ps1` koennen Nennungstool-Frontend und Signing Terminal gemeinsam gestartet werden. Die Signing-App ist dann auch ueber die LAN-IP des Rechners auf einem Tablet erreichbar:

```powershell
.\scripts\start-local-test.ps1 -ApiBaseUrl "https://<dev-api-base-url>" -CognitoDomain "https://<cognito-hosted-ui-domain>" -CognitoClientId "<dev-cognito-client-id>"
```

Das Backend wird fuer Feature-Branches per Pipeline deployed: Ein Push auf `feature/**`, `fix/**` oder `chore/**` im Backend-Repository deployt den Branch auf die gemeinsame Dev-Infrastruktur und ueberschreibt dort den vorherigen Dev-API-Stand.

## Bewusste Grenzen

- Keine oeffentliche Signing-Seite
- Kein QR-Code-Prozess
- Kein Versand von Signing-Links
- Kein Fahrer-Self-Service
- Keine Lizenzpruefung
- Keine eigene Berechnung von Minderjaehrigkeit, Sprache oder Haftverzichtsversion
- Keine Fahrer-/Nennungs-Auswahlliste auf dem Signaturgeraet
- Keine Vorpruefung auf dem Signaturgeraet
- Kein produktives PDF-Rendering im Client

