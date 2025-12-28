# 🚀 Déploiement Cloudflare - Connect Me If U Can

## 📋 Vue d'ensemble

- **Frontend Web**: Cloudflare Pages → **connectmeifucan.com**
- **Android TV**: Cloudflare Pages → **connectmeifucan.app**
- **Backend API**: Cloudflare Workers → **api.connectmeifucan.com**
- **Stockage**: Cloudflare KV

---

## 🔧 Prérequis

```powershell
# Installer Wrangler CLI
npm install -g wrangler

# Se connecter à Cloudflare
wrangler login
```

---

## 📦 Étape 1: Déployer le Backend (Cloudflare Workers)

### 1.1 Créer les KV Namespaces

```powershell
cd backend

# Créer KV pour les utilisateurs
wrangler kv:namespace create "USERS"

# Créer KV pour les codes d'accès
wrangler kv:namespace create "ACCESS_CODES"
```

**Notez les IDs retournés et mettez-les à jour dans `wrangler.toml`:**
```toml
[[kv_namespaces]]
binding = "USERS"
id = "votre-id-users"

[[kv_namespaces]]
binding = "ACCESS_CODES"
id = "votre-id-codes"
```

### 1.2 Initialiser les codes d'accès

```powershell
# Créer un fichier initial-codes.json
@"
{
  "DEMO2025": {
    "description": "Code de démonstration",
    "createdAt": "2025-12-27T00:00:00.000Z"
  },
  "PROD2025": {
    "description": "Code de production",
    "createdAt": "2025-12-27T00:00:00.000Z"
  }
}
"@ | Out-File -Encoding utf8 initial-codes.json

# Uploader dans KV
wrangler kv:key put --namespace-id=VOTRE_ACCESS_CODES_ID "codes" --path=initial-codes.json
```

### 1.3 Déployer le Worker

```powershell
# Test local
wrangler dev

# Déploiement production
wrangler deploy
```

### 1.4 Configurer le domaine custom

```powershell
# Ajouter une route custom
wrangler route add "api.connectmeifucan.com/*" cmuc-backend-prod
```

**Ou depuis le dashboard Cloudflare:**
1. Workers & Pages → cmuc-backend
2. Triggers → Custom Domains
3. Ajouter: `api.connectmeifucan.com`

---

## 🌐 Étape 2: Déployer le Frontend (Cloudflare Pages)

### 2.1 Préparer le projet

```powershell
cd ..
# Vous êtes maintenant dans connectmeifucan-PROD/
```

### 2.2 Mettre à jour l'URL de l'API

Modifiez `index.com.html` ligne 107:
```javascript
const API_BASE = localStorage.getItem('cmuc_api_base') || 'https://api.connectmeifucan.com';
```

### 2.3 Déployer sur Cloudflare Pages

**Option A: Via Wrangler**
```powershell
npx wrangler pages deploy . --project-name=connectmeifucan
```

**Option B: Via le Dashboard**
1. Allez sur https://dash.cloudflare.com
2. Pages → Create a project
3. Connect to Git ou Upload assets
4. Glissez-déposez tous les fichiers (sauf `backend/` et `node_modules/`)
5. Deploy

### 2.4 Configurer les domaines

**DNS Cloudflare pour connectmeifucan.com (Frontend Web):**
1. DNS → Ajouter un enregistrement:
```
Type: CNAME
Name: @
Target: connectmeifucan.pages.dev
Proxy: Activé (orange)
```

2. Ajouter www:
```
Type: CNAME
Name: www
Target: connectmeifucan.pages.dev
Proxy: Activé (orange)
```

**DNS Cloudflare pour connectmeifucan.app (Android TV):**
1. DNS → Ajouter un enregistrement:
```
Type: CNAME
Name: @
Target: connectmeifucan-tv.pages.dev (ou même Pages project)
Proxy: Activé (orange)
```

**Lier les domaines custom:**
1. Pages → connectmeifucan → Custom domains
2. Ajouter:
   - `connectmeifucan.com` et `www.connectmeifucan.com` (frontend web)
   - `connectmeifucan.app` (Android TV simulator)

---

## ✅ Étape 3: Configuration DNS complète

Dans vos zones DNS Cloudflare:

**Zone: connectmeifucan.com (Frontend Web)**
```
Type: CNAME, Name: @, Target: connectmeifucan.pages.dev, Proxy: ON
Type: CNAME, Name: www, Target: connectmeifucan.pages.dev, Proxy: ON
Type: CNAME, Name: api, Target: cmuc-backend.workers.dev, Proxy: ON
```

**Zone: connectmeifucan.app (Android TV)**
```
Type: CNAME, Name: @, Target: connectmeifucan-tv.pages.dev, Proxy: ON
```

**Note**: Si vous hébergez les deux sites sur le même Cloudflare Pages project, pointez les deux domaines vers le même target Pages.

---

## 🧪 Étape 4: Tester

### Test Backend

```powershell
# Health check
Invoke-RestMethod -Uri "https://api.connectmeifucan.com/health"

# Test auth/check
Invoke-RestMethod -Method Post -Uri "https://api.connectmeifucan.com/auth/check" -Body (@{username="test"} | ConvertTo-Json) -ContentType "application/json"
```

### Test Frontend

**Frontend Web (connectmeifucan.com):**
1. Ouvrez: https://connectmeifucan.com/index.com.html
2. Entrez un pseudo
3. Entrez le code: **DEMO2025** ou **PROD2025**
4. Créez le compte
5. ✅ Vérifiez la redirection vers https://connectmeifucan.com/index.html

**Android TV (connectmeifucan.app):**
1. Ouvrez: https://connectmeifucan.app/android-tv/tv-simulator.html
2. Créez une room
3. ✅ Vérifiez la connexion WebSocket à api.connectmeifucan.com
4. ✅ Testez le toggle Host/Guest instantané

---

## 🔒 Étape 5: Sécurité et Optimisation

### 5.1 Activer le WAF

Dashboard → Security → WAF → Managed Rules → Activer

### 5.2 Configuration SSL/TLS

Dashboard → SSL/TLS → Overview → Mode: Full (strict)

### 5.3 Page Rules (Caching)

**Pour connectmeifucan.com:**
```
URL: *connectmeifucan.com/*.jpg
Cache Level: Cache Everything
Edge Cache TTL: 1 month

URL: *connectmeifucan.com/*.png
Cache Level: Cache Everything
Edge Cache TTL: 1 month
```

**Pour connectmeifucan.app:**
```
URL: *connectmeifucan.app/*.jpg
Cache Level: Cache Everything
Edge Cache TTL: 1 month

URL: *connectmeifucan.app/*.png
Cache Level: Cache Everything
Edge Cache TTL: 1 month
```

### 5.4 Headers de sécurité

Dans Pages → Settings → Environment variables:
```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: no-referrer
```

---

## 📊 Monitoring

### Worker Analytics
Dashboard → Workers & Pages → cmuc-backend → Metrics

### Pages Analytics
Dashboard → Pages → connectmeifucan → Analytics

### KV Usage
Dashboard → KV → USERS / ACCESS_CODES → Metrics

---

## 🔄 Mises à jour

### Backend
```powershell
cd backend
# Modifier worker.js
wrangler deploy
```

### Frontend
```powershell
# Modifier les fichiers HTML/JS
npx wrangler pages deploy . --project-name=connectmeifucan
```

### Codes d'accès
```powershell
# Mettre à jour les codes
wrangler kv:key put --namespace-id=VOTRE_ACCESS_CODES_ID "codes" --path=nouveaux-codes.json
```

---

## 💾 Gestion des données KV

### Lister les utilisateurs
```powershell
wrangler kv:key list --namespace-id=VOTRE_USERS_ID
```

### Voir un utilisateur
```powershell
wrangler kv:key get --namespace-id=VOTRE_USERS_ID "demo"
```

### Sauvegarder les données
```powershell
# Backup users
wrangler kv:key list --namespace-id=VOTRE_USERS_ID > users-backup.json

# Pour chaque clé, récupérer la valeur
wrangler kv:key get --namespace-id=VOTRE_USERS_ID "username" > backup-username.json
```

---

## 🚨 Dépannage

### Worker ne répond pas
```powershell
# Voir les logs en temps réel
wrangler tail

# Vérifier le statut
wrangler deployments list
```

### CORS Errors
- Vérifiez que les headers CORS sont dans `worker.js`
- Testez avec curl: `curl -H "Origin: https://connectmeifucan.com" https://api.connectmeifucan.com/health`

### KV ne sauvegarde pas
- Vérifiez les IDs dans `wrangler.toml`
- Vérifiez les permissions du Worker

---

## 💰 Coûts Cloudflare

**Free Plan inclut:**
- ✅ Cloudflare Pages (illimité)
- ✅ Workers: 100,000 requêtes/jour
- ✅ KV: 100,000 reads/jour, 1,000 writes/jour, 1GB stockage
- ✅ DNS, CDN, SSL/TLS illimités

**Si vous dépassez:**
- Workers: $5/mois pour 10M requêtes supplémentaires
- KV: $0.50/million reads, $5/million writes

---

## 📝 Checklist finale

- [ ] Backend Worker déployé sur `api.connectmeifucan.com`
- [ ] Frontend Web déployé sur `connectmeifucan.com`
- [ ] Android TV déployé sur `connectmeifucan.app`
- [ ] KV Namespaces créés et configurés
- [ ] Codes d'accès initialisés
- [ ] DNS configuré et propagé (les deux domaines)
- [ ] SSL/TLS actif (les deux domaines)
- [ ] Tests d'authentification réussis
- [ ] WebSocket host/guest toggle testé
- [ ] Monitoring actif
- [ ] WAF activé
- [ ] Backups configurés

---

## 🎉 C'est fait!

Votre application est maintenant déployée sur Cloudflare avec:
- 🌍 CDN global
- 🔒 SSL automatique
- ⚡ Performance optimale
- 💰 Gratuit (dans les limites du plan Free)

**URLs:**
- 🌐 Frontend Web: https://connectmeifucan.com
- 📱 Auth: https://connectmeifucan.com/index.com.html
- 📺 Android TV: https://connectmeifucan.app/android-tv/tv-simulator.html
- 🔌 API Backend: https://api.connectmeifucan.com
- ✅ Health: https://api.connectmeifucan.com/health
