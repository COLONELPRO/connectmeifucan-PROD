# 📋 Configuration GitHub - Checklist

## ✅ Étapes à suivre pour finaliser la configuration

### 1. Secrets GitHub

Aller sur : `https://github.com/COLONELPRO/connectmeifucan-PROD/settings/secrets/actions`

Ajouter les secrets suivants :

- [ ] **CLOUDFLARE_API_TOKEN**
  - Créer sur : https://dash.cloudflare.com/profile/api-tokens
  - Permissions requises : `Workers Scripts:Edit`, `Pages:Edit`, `Account Settings:Read`
  
- [ ] **CLOUDFLARE_ACCOUNT_ID**
  - Trouver sur : https://dash.cloudflare.com/ (dans la barre latérale droite)

---

### 2. Protection de la branche `branch-prod`

Aller sur : `https://github.com/COLONELPRO/connectmeifucan-PROD/settings/branches`

Configurer la règle pour `branch-prod` :

- [ ] Cliquer sur **Add rule**
- [ ] Branch name pattern : `branch-prod`
- [ ] Cocher :
  - ✅ **Require a pull request before merging**
    - Require approvals: 1
  - ✅ **Require status checks to pass before merging**
  - ✅ **Require branches to be up to date before merging**
  - ✅ **Do not allow bypassing the above settings** (même pour les admins)

---

### 3. Cloudflare KV Namespaces

Créer les KV Namespaces sur Cloudflare :

1. Aller sur : https://dash.cloudflare.com/ → Workers & Pages → KV

2. Créer 6 namespaces :

   **Development:**
   - [ ] `cmuc-dev-users` → Copier l'ID
   - [ ] `cmuc-dev-codes` → Copier l'ID
   - [ ] `cmuc-dev-rooms` → Copier l'ID

   **Production:**
   - [ ] `cmuc-prod-users` → Copier l'ID
   - [ ] `cmuc-prod-codes` → Copier l'ID
   - [ ] `cmuc-prod-rooms` → Copier l'ID

3. Mettre à jour `backend/wrangler.toml` avec les IDs :

```toml
# Development
[[env.development.kv_namespaces]]
binding = "USERS"
id = "REMPLACER_PAR_ID_DEV_USERS"

[[env.development.kv_namespaces]]
binding = "ACCESS_CODES"
id = "REMPLACER_PAR_ID_DEV_CODES"

[[env.development.kv_namespaces]]
binding = "ROOMS"
id = "REMPLACER_PAR_ID_DEV_ROOMS"

# Production
[[env.production.kv_namespaces]]
binding = "USERS"
id = "REMPLACER_PAR_ID_PROD_USERS"

[[env.production.kv_namespaces]]
binding = "ACCESS_CODES"
id = "REMPLACER_PAR_ID_PROD_CODES"

[[env.production.kv_namespaces]]
binding = "ROOMS"
id = "REMPLACER_PAR_ID_PROD_ROOMS"
```

---

### 4. Cloudflare Pages Projects

Créer les projets Pages sur Cloudflare :

1. Aller sur : https://dash.cloudflare.com/ → Workers & Pages → Create

2. Créer 2 projets :

   - [ ] **connectmeifucan** (Frontend Web)
     - Connecter au repository GitHub
     - Branch : `branch-prod` pour production
     - Build command : (vide)
     - Build output directory : `/`
   
   - [ ] **connectmeifucan-tv** (Android TV)
     - Connecter au repository GitHub
     - Branch : `branch-prod` pour production
     - Build command : (vide)
     - Build output directory : `/android-tv`

---

### 5. Configuration DNS

Sur Cloudflare Dashboard → DNS :

- [ ] **api.connectmeifucan.com**
  - Type : `CNAME`
  - Target : `cmuc-backend-prod.workers.dev`
  - Proxy : ✅ Proxied

- [ ] **dev-api.connectmeifucan.com**
  - Type : `CNAME`
  - Target : `cmuc-backend-dev.workers.dev`
  - Proxy : ✅ Proxied

- [ ] **connectmeifucan.com**
  - Type : `CNAME`
  - Target : `connectmeifucan.pages.dev`
  - Proxy : ✅ Proxied

- [ ] **connectmeifucan.app**
  - Type : `CNAME`
  - Target : `connectmeifucan-tv.pages.dev`
  - Proxy : ✅ Proxied

---

### 6. Commiter et pusher les changements

```bash
# Vérifier les fichiers modifiés
git status

# Ajouter tous les nouveaux fichiers
git add .

# Commiter
git commit -m "feat: configuration CI/CD et structure professionnelle"

# Pousser vers main
git push origin main

# Mettre à jour branch-prod
git checkout branch-prod
git merge main
git push origin branch-prod
```

---

### 7. Tester les déploiements automatiques

- [ ] Push sur `main` → Vérifier que le workflow GitHub Actions se lance
- [ ] Merger vers `branch-prod` → Vérifier le déploiement production

Voir les workflows : https://github.com/COLONELPRO/connectmeifucan-PROD/actions

---

### 8. Vérification finale

- [ ] Backend dev accessible : https://dev-api.connectmeifucan.com
- [ ] Backend prod accessible : https://api.connectmeifucan.com
- [ ] Frontend accessible : https://connectmeifucan.com
- [ ] Android TV accessible : https://connectmeifucan.app

---

## 🎉 Configuration terminée !

Votre projet est maintenant configuré avec :

✅ Workflow Git professionnel (main → branch-prod)
✅ CI/CD automatique via GitHub Actions
✅ Déploiements Cloudflare automatisés
✅ Environnements dev et prod séparés
✅ Protection de la branche production
✅ Documentation complète

---

## 📚 Prochaines étapes

1. Lire [CONTRIBUTING.md](CONTRIBUTING.md) pour comprendre le workflow
2. Créer votre première branche de fonctionnalité
3. Faire une Pull Request vers `main`
4. Tester sur l'environnement de preview
5. Merger vers `branch-prod` pour déployer en production

**Bon développement ! 🚀**
