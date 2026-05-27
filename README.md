# MSC Event Signing Terminal

Prototyp für eine digitale Vor-Ort-Unterschriftenlösung zum MSC-Nennungstool.

Die App ist bewusst eigenständig gehalten. Sie ist die Web-Oberfläche für das Signaturgerät, also zum Beispiel ein Tablet mit Stift- oder Touch-Eingabe. Der Operator startet den Prozess im bestehenden Nennungstool; fachliche Vorprüfung, Auswahl des Fahrers und Session-Start passieren dort.

## Fachlicher Ablauf

1. Operator erzeugt im Nennungstool einen Pairing-Code.
2. Die Web-App auf dem Signaturgerät wird mit diesem Code gekoppelt.
3. Das Signaturgerät wartet auf die nächste vom Nennungstool gestartete Signing-Session.
4. Operator öffnet eine Nennung in der Detailansicht und klickt `Haftverzicht unterschreiben`.
5. Das Admin-Modal zeigt Fahrer, Beifahrer, aktuelle Nennung, weitere relevante Nennungen desselben Fahrers, Haftverzichtstatus und das ausgewählte Signaturgerät.
6. Falls noch kein Gerät gekoppelt ist, erzeugt der Operator direkt im Modal einen Pairing-Code. Das zuletzt genutzte Gerät wird im Admin-Browser vorgeschlagen, bleibt aber änderbar.
7. Der Operator wählt den konkreten Unterzeichner aus: Fahrer oder einen Beifahrer. Beifahrer werden in einer eigenen Signing-Session unterschrieben, nicht gemeinsam mit dem Fahrer.
8. Nach dem Start zeigt das Admin-Modal `Warte auf Unterschrift am iPad` und kann den Vorgang abbrechen. Beim Schließen des Modals wird eine laufende Session ebenfalls abgebrochen.
9. Jede Signing-Session ist maximal fünf Minuten gültig. Nach Ablauf schließt das Backend die Session; das Terminal kehrt in den Wartescreen zurück.
10. Das Admin-Modal erfasst die organisatorischen Vorprüfungen mit Timestamp, inklusive Ausweis/Anwesenheit, Attest bei Ü70 und Guardian-Daten bei Minderjährigen.
11. Das Signaturgerät zeigt genau der ausgewählten Person Fahrer/Beifahrer, Veranstaltung, Nennungen, Fahrzeuge und den vollständigen Haftverzicht.
12. Die berechtigte Person bestätigt, dass sie die Haftverzichtserklärung gelesen und verstanden hat, und unterschreibt direkt auf dem Signaturgerät.
13. Backend erzeugt die persönliche Haftverzichtserklärung als PDF und einen Audit-Datensatz und speichert beides privat in S3.
14. Das Admin-Modal und die Nennungsdetailseite zeigen den erfolgreichen Abschluss; das PDF ist nur über einen privaten Admin-Download abrufbar.

## Technische Struktur

- `src/domain`: fachliche Typen und Mock-Daten in der Form späterer Backend-Antworten
- `src/adapters`: API-Adapter für Pairing, Polling und Abschluss
- `src/evidence`: Validierung, Nachweis-/Audit-Erzeugung und Hashing
- `src/ui`: tablet- und stiftfähige React-Oberfläche

Die technische Entscheidung für Vite, React und TypeScript ist pragmatisch: Das bestehende Frontend nutzt ebenfalls React/Vite/TypeScript, der Prototyp bleibt dadurch für das Team leicht nachvollziehbar, ohne Code aus dem Hauptsystem direkt zu kopieren.

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
POST /admin/signing/sessions/{sessionId}/cancel

POST /signing/device/claim
GET  /signing/device/current-session
POST /signing/sessions/{sessionId}/complete
```

`POST /admin/signing/sessions` liefert die fachliche Wahrheit:

- `signerPersonId` für Fahrer- oder Beifahrer-Session
- `isMinor`
- `requiresMedicalCertificate`
- alle relevanten Entries/Vehicles für `eventId + driverPersonId`
- Haftverzichtssprache
- Haftverzichtsversion
- vollständiger Haftverzichtstext
- Text-Hash

Die Signing-App berechnet diese Werte nicht selbst. Sie zeigt sie an und dokumentiert die Bestätigungen.

`POST /signing/sessions/{sessionId}/complete` liefert die am iPad erfassten Nachweisdaten:

- `displayedAt`
- `waiverAcceptedAt`
- `signedAt`
- `signatureDataUrl`

`POST /admin/signing/sessions` liefert die im Nennungstool erfassten Vorprüfungen:

- `precheckTimestamps.identityCheckedAt`
- `precheckTimestamps.signerPresentAt`
- optional `precheckTimestamps.medicalCertificateCheckedAt`
- optional `precheckTimestamps.guardianPresentAt`
- optional `precheckTimestamps.guardianAuthorityCheckedAt`
- optional `signer.guardianName` und `signer.guardianRelationship`

Das Backend validiert diese Werte gegen den Backend-Kontext. Bei Minderjährigen sind Guardian-Daten und Guardian-Prüfungen Pflicht; bei Unterzeichnern ab 70 ist der Attest-Timestamp Pflicht. Fahrer und Beifahrer werden getrennt bewertet und getrennt unterschrieben.

## Nachweisinhalt

Das Backend erzeugt ein PDF-Nachweisdokument und einen Audit-JSON-Datensatz.

Der Nachweis enthält:

- Veranstaltung
- Fahrer
- alle relevanten Nennungen und Fahrzeuge
- Beifahrer
- Unterzeichnerrolle, inklusive Guardian-Name und Beziehung bei Minderjährigen
- vollständiger Haftverzichtstext
- Sprache, Version und Text-Hash
- Anzeige-/Bestätigungs-/Signaturzeitpunkte
- Vorprüfungen mit einzelnen Zeitstempeln
- Operator-Kennung
- Unterschrift
- Dokument- und Signatur-Hashes

## S3-Ansatz

Das Backend speichert mit der bestehenden Dokumentenablage unter:

```text
signing/{eventId}/{signerPersonId}/{evidenceId}/waiver.pdf
signing/{eventId}/{signerPersonId}/{evidenceId}/audit.json
```

Das Backend schreibt die Objekte in den privaten Dokumenten-Bucket:

- Block Public Access
- SSE-S3 oder KMS-Verschlüsselung
- HTTPS-only Bucket Policy
- keine öffentlichen URLs
- Downloads nur über kurzlebige presigned URLs im Admin-Kontext

## Commands

```bash
npm install
npm run dev:local
npm run build
npm test
```

Der Dev-Server verwendet Port `5178`.

`npm run dev:local` synchronisiert vorher `.env.local` mit dem aktuellen `ApiUrl`-Output des gemeinsamen Dev-Backend-Stacks. Dadurch bleibt das Terminal auch dann erreichbar, wenn AWS eine neue `execute-api`-URL ausgibt.

Für die echte Backend-Integration muss die App die API-Basis kennen:

```bash
VITE_API_BASE_URL=https://api.example.org npm run dev
```

Für den lokalen Test gegen die gemeinsame Dev-API ist stattdessen der Proxy-Modus vorgesehen:

```text
VITE_API_BASE_URL=/api
VITE_API_PROXY_TARGET=https://<dev-api-base-url>
```

Mit `scripts/start-local-test.ps1` können Nennungstool-Frontend und Signing Terminal gemeinsam gestartet werden. Die Signing-App ist dann auch über die LAN-IP des Rechners auf einem Tablet erreichbar:

```powershell
.\scripts\start-local-test.ps1 -ApiBaseUrl "https://<dev-api-base-url>" -CognitoDomain "https://<cognito-hosted-ui-domain>" -CognitoClientId "<dev-cognito-client-id>"
```

Das Backend wird für Feature-Branches per Pipeline deployed: Ein Push auf `feature/**`, `fix/**` oder `chore/**` im Backend-Repository deployt den Branch auf die gemeinsame Dev-Infrastruktur und überschreibt dort den vorherigen Dev-API-Stand.

## Bewusste Grenzen

- Keine öffentliche Signing-Seite
- Kein QR-Code-Prozess
- Kein Versand von Signing-Links
- Kein Fahrer-Self-Service
- Keine Lizenzprüfung
- Keine eigene Berechnung von Minderjährigkeit, Sprache oder Haftverzichtsversion
- Keine Fahrer-/Nennungs-Auswahlliste auf dem Signaturgerät
- Keine Vorprüfung am Signaturgerät; das iPad ist nur Fahrer-/Unterzeichneroberfläche für Lesen und Unterschrift
- Kein produktives PDF-Rendering im Client

