# Lokaler Testlauf Signing Terminal

## Zielbild

- Backend-Code des Feature-Branches laeuft auf der gemeinsamen Dev-API.
- Nennungstool-Frontend laeuft lokal auf `http://localhost:5173`.
- Signing Terminal laeuft lokal auf `http://localhost:5178` und ist im WLAN ueber die LAN-IP des Rechners fuer ein Tablet erreichbar.
- Beide lokalen WebApps nutzen `VITE_API_BASE_URL=/api` und proxen API-Calls gegen die Dev-API.

## Backend deployen

Ein Push auf `feature/**`, `fix/**` oder `chore/**` im Backend-Repository startet automatisch die Backend-Pipeline. Der Branch-Code wird auf die gemeinsame Dev-Infrastruktur deployed und ueberschreibt dort den vorherigen Dev-API-Stand. Es werden keine Feature-Branch-Stacks erzeugt.

Die Dev-API-URL bleibt stabil, weil der Scheduler nur RDS stoppt und API Gateway/Lambda nicht zerstoert. Beim naechsten Backend-Deploy wird RDS wieder gestartet, migriert und mit 10 Dev-Testnennungen ergaenzt, falls sie fehlen.

## Lokale WebApps starten

```powershell
cd C:\Users\VinzenzGeisler\source\msc-event-signing-terminal
.\scripts\start-local-test.ps1 -ApiBaseUrl "https://<dev-api-base-url>" -CognitoDomain "https://<cognito-hosted-ui-domain>" -CognitoClientId "<dev-cognito-client-id>"
```

Das Skript legt fehlende `.env.local` aus `.env.local.example` an und startet:

- Nennungstool-Frontend: `http://localhost:5173`
- Signing Terminal: `http://localhost:5178`
- Signing Terminal am Tablet: `http://<LAN-IP>:5178`

## Testablauf

1. Im lokalen Nennungstool anmelden.
2. Eine zugelassene Nennung oeffnen.
3. Im Signing Terminal den Pairing-Code eingeben.
4. Im Nennungstool das gekoppelte Signaturgeraet auswaehlen.
5. Vorpruefung erfassen.
6. Haftverzicht am Signaturgeraet starten.
7. Am Signaturgeraet Haftverzicht pruefen, unterschreiben und abschliessen.
8. Im Nennungstool Status pruefen.

