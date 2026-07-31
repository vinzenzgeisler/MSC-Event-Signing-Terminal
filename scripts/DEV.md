# Development Environment Setup

Schnelles Setup für lokale Entwicklung mit Terminal, Frontend und Backend-Deployment.

## Quick Start

### Ohne Backend-Deployment (nutzt bestehende API URL)
```powershell
./dev.ps1 start
```

### Mit automatischem Backend-Deployment
```powershell
./dev.ps1 start -DeployBackend
```

Das Skript wird dann:
1. GitHub Actions Workflow triggern (aktueller Branch)
2. CloudFormation Stacks deployen
3. Auf Completion warten (~20-30min)
4. Terminal + Frontend starten
5. API URL automatisch konfigurieren

## Commands

### Start Development Servers
```powershell
# Terminal + Frontend auf aktuellem Branch
./dev.ps1 start

# Mit Backend-Deployment
./dev.ps1 start -DeployBackend

# Frontend auf anderem Branch
./dev.ps1 start -FrontendBranch feature/my-feature

# Andere Pfade für Frontend/Backend-Repo (Standard: Sibling-Ordner von diesem Repo)
./dev.ps1 start -FrontendRepoPath D:\code\MSC-Event-Frontend -BackendRepoPath D:\code\MSC-Event-Backend

# Deployment mit idle-Profil (DB stoppt nach Deployment)
./dev.ps1 start -DeployBackend -DevProfile idle
```

### Stop Servers
```powershell
./dev.ps1 stop
```

### Clear Cache
```powershell
./dev.ps1 reset
```

Dies löscht die gecachte API URL und erzwingt beim nächsten Start eine neue CloudFormation-Abfrage.

## URL Caching

Die API URL wird nach erstem Abruf für **1 Stunde** gecacht. Das spart Zeit und AWS API-Calls.

- Cache-Datei: `.cache/api-url.json`
- TTL: 3600 Sekunden
- Manual invalidate: `./dev.ps1 reset`

## AWS Profile

Das Skript verwendet standardmäßig das AWS-Profil `vereins-cli`.

Zum Ändern:
```powershell
./dev.ps1 start -AwsProfile your-profile
```

## Hintergrund: deploy-backend.ps1

Dieses Skript triggert manuell die GitHub Actions Pipeline:

```powershell
./deploy-backend.ps1 -DevProfile test -Wait
```

- Triggert `ci-cd.yml` Workflow via `gh workflow run`
- Wartet auf Pipeline-Completion
- Deployed alle stacks (auth, data, storage, api)
- Seeded Dev Event in die Datenbank

**Hinweis:** Erfordert `gh` CLI (`npm install -g @github-cli/cli`)

## Troubleshooting

### "Stack with id dreiecksrennen-dev-api-stack does not exist"

**Problem:** Backend wurde noch nicht deployed.

**Lösung 1 (empfohlen):**
```powershell
./dev.ps1 start -DeployBackend
```

**Lösung 2 (manuell):**
```powershell
git -C ../MSC-Event-Backend push origin feature/your-feature
# Oder triggere im GitHub UI: Actions → ci-cd → Run workflow
```

### API URL hat sich geändert

```powershell
./dev.ps1 reset
./dev.ps1 start
```

### Prozesse nicht aufgeräumt

```powershell
./dev.ps1 stop
# Oder manual cleanup:
Get-Job | Where-Object {$_.Name -match "terminal|frontend"} | Remove-Job -Force
```

## Features

✓ API URL Caching (1h TTL)  
✓ Branch-aware Frontend checkout  
✓ Automated Backend-Deployment via GitHub Actions  
✓ Parallel server startup (Terminal + Frontend)  
✓ Clean shutdown mit Ctrl+C  
✓ AWS Profile support  

## Ports

- **Terminal:** http://localhost:5178
- **Frontend:** http://localhost:5173
- **Tablet (LAN):** http://\<your-ip\>:5178
