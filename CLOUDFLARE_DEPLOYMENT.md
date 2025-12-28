# 🚀 Déploiement Cloudflare - Connect Me If U Can

## 📋 Vue d'ensemble

- **Frontend Web**: Cloudflare Pages → **connectmeifucan.pages.dev**
- **Android TV**: Cloudflare Pages → **connectmeifucan-tv.pages.dev**
- **Backend API**: Cloudflare Workers → **cmuc-backend-dev.connectmeifucan.workers.dev**
- **WebSocket URL**: **wss://cmuc-backend-dev.connectmeifucan.workers.dev/room/**
- **Stockage**: Cloudflare KV + Durable Objects
- **Workflow Git**: `main` (dev) → `branch-prod` (production)

---

## 📚 Table des matières

1. [Étape 0: Configuration initiale Cloudflare](#-étape-0-configuration-initiale-cloudflare)
2. [Étape 1: Déployer le Backend (Workers)](#-étape-1-déployer-le-backend-cloudflare-workers)
3. [Étape 2: Déployer le Frontend (Pages)](#-étape-2-déployer-le-frontend-cloudflare-pages)
4. [Étape 3: Configuration DNS complète](#-étape-3-configuration-dns-complète)
5. [Étape 4: Tester](#-étape-4-tester)
6. [Étape 5: Sécurité et Optimisation](#-étape-5-sécurité-et-optimisation)
7. [Workflow de déploiement](#-workflow-de-déploiement)

---

## 🌐 Étape 0: Configuration initiale Cloudflare

### 0.1 Créer un compte Cloudflare

1. Allez sur https://dash.cloudflare.com/sign-up
2. Créez un compte (gratuit)
3. Vérifiez votre email

### 0.2 Ajouter vos domaines à Cloudflare

**Pour connectmeifucan.com:**

1. Dashboard → **Add a Site**
2. Entrez: `connectmeifucan.com`
3. Choisissez le plan **Free** (0$/mois)
4. Cloudflare va scanner vos DNS existants
5. Cliquez sur **Continue**

**Cloudflare vous donnera 2 nameservers, exemple:**
```
ns1.cloudflare.com
ns2.cloudflare.com
```

6. **Chez votre registrar (ex: OVH, Namecheap, GoDaddy):**
   - Connectez-vous à votre compte
   - Trouvez la section DNS/Nameservers
   - Remplacez les nameservers actuels par ceux de Cloudflare
   - Exemple chez OVH: Domaines → Modifier les serveurs DNS → DNS personnalisés

7. Retournez sur Cloudflare et cliquez **Done, check nameservers**
8. ⏳ Attendez la propagation (quelques minutes à 48h max)
9. ✅ Cloudflare vous enverra un email quand c'est actif

**Répétez pour connectmeifucan.app:**
- Même processus
- Ajoutez `connectmeifucan.app` comme nouveau site
- Configurez ses nameservers chez le registrar

### 0.3 Configuration SSL/TLS

**Pour chaque domaine:**

1. Dashboard → Sélectionnez votre domaine
2. **SSL/TLS** (menu gauche)
3. Mode: **Full (strict)** ← Important !
4. Edge Certificates → **Always Use HTTPS**: ON
5. Edge Certificates → **Automatic HTTPS Rewrites**: ON

✅ SSL actif immédiatement !

### 0.4 Vérifier que vos domaines sont actifs

```powershell
# Test connectmeifucan.com
nslookup connectmeifucan.com

# Test connectmeifucan.app
nslookup connectmeifucan.app
```

Les IPs retournées doivent être celles de Cloudflare (commence par 104.x ou 172.x)

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

**Option A: Via GitHub (Recommandé pour production)**

1. **Dashboard Cloudflare** → **Workers & Pages** → **Create application**
2. Choisissez **Pages** → **Connect to Git**
3. **Autoriser Cloudflare** à accéder à votre GitHub
4. Sélectionnez le repo: **COLONELPRO/connectmeifucan-PROD**
5. Configuration du build:
   ```
   Project name: connectmeifucan
   Production branch: branch-prod  ← Important !
   Build command: (laisser vide)
   Build output directory: /
   Root directory: (laisser vide)
   ```
6. Cliquez **Save and Deploy**
7. ⏳ Premier déploiement en cours (1-2 min)
8. ✅ Votre site est sur: `https://connectmeifucan-prod.pages.dev`

**Option B: Via Wrangler (pour tests rapides)**
```powershell
# Déployer depuis le dossier local
npx wrangler pages deploy . --project-name=connectmeifucan --branch=main

# Ou en production
npx wrangler pages deploy . --project-name=connectmeifucan --branch=branch-prod
```

**Option C: Drag & Drop (occasionnel)**
1. Dashboard → Pages → Create a project
2. Upload assets
3. Glissez-déposez tous les fichiers **sauf** `backend/` et `node_modules/`
4. Deploy

### 2.4 Lier le projet Pages à votre repo GitHub

**Si vous avez utilisé Option B ou C, connectez GitHub:**

1. Pages → **connectmeifucan** (votre projet)
2. **Settings** → **Builds & deployments**
3. **Connect to Git** → Autoriser GitHub
4. Sélectionnez **COLONELPRO/connectmeifucan-PROD**
5. **Production branch**: `branch-prod`
6. **Preview branches**: `main` (optionnel, pour tester avant prod)
7. **Save**

🎯 **Maintenant chaque push sur `branch-prod` déploiera automatiquement !**

### 2.5 Configurer les domaines custom

**Étape 1: Ajouter les CNAME dans DNS (pour chaque domaine)**

**Pour connectmeifucan.com:**
1. Dashboard Cloudflare → Sélectionnez **connectmeifucan.com**
2. **DNS** (menu gauche) → **Records**
3. **Add record**:
   ```
   Type: CNAME
   Name: @
   Target: connectmeifucan-prod.pages.dev
   Proxy status: Proxied (☁️ orange)
   TTL: Auto
   ```
4. **Add record** (pour www):
   ```
   Type: CNAME
   Name: www
   Target: connectmeifucan-prod.pages.dev
   Proxy status: Proxied (☁️ orange)
   ```
5. **Save**

**Pour connectmeifucan.app:**
1. Dashboard → Sélectionnez **connectmeifucan.app**
2. **DNS** → **Records** → **Add record**:
   ```
   Type: CNAME
   Name: @
   Target: connectmeifucan-prod.pages.dev (même target que .com)
   Proxy status: Proxied (☁️ orange)
   ```
3. **Save**

**Étape 2: Lier les domaines au projet Pages**

1. **Workers & Pages** → **connectmeifucan** (votre projet)
2. **Custom domains** (onglet)
3. **Set up a custom domain**
4. Entrez: `connectmeifucan.com` → **Continue**
5. Cloudflare détecte le CNAME → **Activate domain**
6. Répétez pour `www.connectmeifucan.com`
7. Répétez pour `connectmeifucan.app`

✅ **Vos domaines sont maintenant actifs sur HTTPS !**

**Vérification:**
```powershell
# Test connectmeifucan.com
curl -I https://connectmeifucan.com

# Test connectmeifucan.app
curl -I https://connectmeifucan.app
```

Vous devriez voir `HTTP/2 200` et `cf-ray:` (preuve que Cloudflare fonctionne)

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
Type: CNAME, Name: @, Target: connectmeifucan-prod.pages.dev, Proxy: ON
Type: CNAME, Name: www, Target: connectmeifucan-prod.pages.dev, Proxy: ON
Type: CNAME, Name: api, Target: cmuc-backend.workers.dev, Proxy: ON
```

**Zone: connectmeifucan.app (Android TV)**
```
Type: CNAME, Name: @, Target: connectmeifucan-tv.pages.dev, Proxy: ON
```

**📝 Note importante sur la configuration :**

Vous avez **deux options** pour héberger vos sites :

**Option 1 : Deux projets Pages séparés (Recommandé pour ce projet)**
- `connectmeifucan-prod.pages.dev` → pour connectmeifucan.com (Frontend Web)
- `connectmeifucan-tv.pages.dev` → pour connectmeifucan.app (Android TV)
- ✅ Séparation claire des environnements
- ✅ Déploiements indépendants configurés dans GitHub Actions

**Option 2 : Un seul projet Pages pour les deux domaines**
- Les deux domaines pointent vers `connectmeifucan-prod.pages.dev`
- Les deux sites partagent le même build
- ⚠️ Nécessite de modifier les workflows GitHub Actions

**Pour ce projet, nous utilisons l'Option 1 (deux projets séparés).**

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

## � Workflow de déploiement

### Développement local → Production

```powershell
# 1. Développer sur la branche main
git checkout main

# 2. Faire vos modifications
# ... éditer les fichiers ...

# 3. Commiter et pusher sur main
git add .
git commit -m "feat: nouvelle fonctionnalité"
git push origin main

# 4. Tester sur l'environnement de preview
# Cloudflare déploiera automatiquement main sur une URL preview:
# https://preview-main.connectmeifucan-prod.pages.dev

# 5. Quand tout fonctionne, merger vers production
git checkout branch-prod
git merge main
git push origin branch-prod

# 6. Déploiement automatique en production !
# Cloudflare détecte le push et déploie sur:
# - https://connectmeifucan.com
# - https://connectmeifucan.app
```

### Rollback rapide

```powershell
# Si un bug en production
git checkout branch-prod
git reset --hard HEAD~1  # Revenir au commit précédent
git push origin branch-prod --force-with-lease

# Cloudflare redéploie l'ancienne version automatiquement
```

### Environnements disponibles

| Branche | Environnement | URLs |
|---------|---------------|------|
| `main` | Preview/Staging | `https://preview-main.connectmeifucan-prod.pages.dev` |
| `branch-prod` | Production | `connectmeifucan.com`, `connectmeifucan.app` |

---

## �💰 Coûts Cloudflare

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
