# Test Deep Link e Social Login Tauri

## Status Test: ❌ NON ANCORA TESTATO

## Prerequisiti per il Test

### 1. Environment Variables
Verifica che siano impostate:
```bash
GITHUB_CLIENT_ID=Iv23liWHZD09eLwSzbVZ
GITHUB_CLIENT_SECRET=***REMOVED***
NEXTAUTH_URL=http://localhost:3001
```

### 2. GitHub OAuth App Configuration
- **Callback URLs da aggiungere**:
  - `http://localhost:3001/api/auth/callback/github` (dev)
  - `https://cadcamfun.xyz/api/auth/callback/github` (prod)

## Test Plan

### Test 1: Deep Link Registration
```bash
# Avvia Tauri in modalità development
yarn tauri:dev

# Verifica che il deep link scheme sia registrato
# Su macOS: dovrebbe apparire in System Preferences > Default Apps
# Su Windows: dovrebbe essere registrato nel registry
# Su Linux: dovrebbe essere in ~/.local/share/applications/
```

**Schema Deep Link**: `cadcamfun://`

### Test 2: OAuth Flow Desktop
1. **Avvia l'app desktop**
2. **Vai alla pagina di login** (`/auth/signin`)
3. **Clicca "Continue with GitHub"**
4. **Verifica che**:
   - Si apra il browser di sistema (non webview)
   - Redirect a GitHub OAuth
   - Dopo autorizzazione, callback a `cadcamfun://auth/callback?code=...`
   - App desktop riceve il deep link
   - Login completato nell'app

### Test 3: Session Persistence
1. **Effettua login con GitHub**
2. **Chiudi l'app desktop**
3. **Riapri l'app**
4. **Verifica che la sessione sia persistente**

### Test 4: Error Handling
1. **Testa con credenziali GitHub non valide**
2. **Testa rifiuto autorizzazione GitHub**
3. **Verifica gestione errori graceful**

## Problemi Noti da Verificare

### 1. Tauri Scheme Limitation
- **Issue**: "Tauri scheme for social login is not supported"
- **Soluzione implementata**: Sistema browser + deep links
- **Test**: Verificare che funzioni correttamente

### 2. CSP Configuration
- **Test**: Verificare che GitHub endpoints siano accessibili
- **Domains configurati**: `https://github.com`, `https://api.github.com`

### 3. Plugin Deep Link
- **Plugin**: `@tauri-apps/plugin-deep-link@2.4.0`
- **Configurazione**: `cadcamfun://` scheme
- **Test**: Verificare registrazione e handling

## Comandi di Test

```bash
# 1. Build e testa
yarn build
yarn tauri:dev

# 2. Verifica deep link manualmente
# Su macOS:
open "cadcamfun://test"

# Su Windows:
start "cadcamfun://test"

# Su Linux:
xdg-open "cadcamfun://test"

# 3. Test OAuth URL manually
curl -X POST http://localhost:3001/api/auth/sign-in/social \
  -H "Content-Type: application/json" \
  -d '{"provider":"github","callbackURL":"/"}'
```

## Expected Results

### ✅ Successo
- Deep link scheme registrato nel sistema
- Browser si apre per OAuth
- Callback ricevuto tramite deep link
- Login completato
- Sessione persistente

### ❌ Fallimento
- Deep link non registrato
- OAuth redirect non funziona
- Callback non ricevuto
- Errori di autenticazione
- Sessione non persistente

## Debug Steps

### 1. Logs Tauri
- Controlla console Tauri per errori
- Verifica log deep link handling
- Debug OAuth flow

### 2. Network Analysis
- Verifica chiamate HTTP a GitHub
- Controlla response OAuth
- Verifica callback URLs

### 3. Browser Dev Tools
- Controlla errori JavaScript
- Verifica session storage
- Debug fetch requests

## Test Results

**Da compilare dopo il test:**

- [ ] Deep link registrato: ❌/✅
- [ ] OAuth redirect: ❌/✅  
- [ ] Callback handling: ❌/✅
- [ ] Login success: ❌/✅
- [ ] Session persistence: ❌/✅
- [ ] Error handling: ❌/✅

## Next Steps Post-Test

### Se i test passano ✅:
1. Documentare flow funzionante
2. Preparare per produzione
3. Test su multiple piattaforme

### Se i test falliscono ❌:
1. Debug specifico del problema
2. Fix configurazione
3. Re-test

---

**NOTA**: Questo è un documento di test. I risultati effettivi devono essere documentati dopo l'esecuzione dei test.