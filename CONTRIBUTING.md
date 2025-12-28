# 🤝 Guide de Contribution - Connect Me If U Can PRO

## 📋 Table des matières

1. [Workflow Git](#-workflow-git)
2. [Structure des branches](#-structure-des-branches)
3. [Processus de développement](#-processus-de-développement)
4. [Déploiement](#-déploiement)
5. [Standards de code](#-standards-de-code)
6. [Configuration Cloudflare](#-configuration-cloudflare)

---

## 🌳 Workflow Git

### Structure des branches

```
main (développement)
  ↓
branch-prod (production)
```

### Branches principales

- **`main`** : Branche de développement
  - Tous les développements se font ici
  - Déploiement automatique sur l'environnement de preview Cloudflare
  - Tests et validation avant merge vers production
  
- **`branch-prod`** : Branche de production
  - Code stable et testé uniquement
  - Déploiement automatique sur Cloudflare Production
  - Protégée contre les push directs
  - Mise à jour uniquement via Pull Request depuis `main`

### Branches de fonctionnalités

Pour chaque nouvelle fonctionnalité ou correction :

```bash
# Créer une branche depuis main
git checkout main
git pull origin main
git checkout -b feat/nom-de-la-fonctionnalite

# Ou pour un bug fix
git checkout -b fix/nom-du-bug
```

**Convention de nommage :**
- `feat/` : Nouvelles fonctionnalités
- `fix/` : Corrections de bugs
- `refactor/` : Refactoring de code
- `docs/` : Documentation
- `test/` : Tests
- `chore/` : Maintenance

---

## 🔄 Processus de développement

### 1. Développement local

```bash
# 1. Créer une branche de fonctionnalité
git checkout -b feat/ma-nouvelle-fonctionnalite

# 2. Faire vos modifications

# 3. Tester localement
cd backend
npm install
npm run dev

# 4. Commit vos changements
git add .
git commit -m "feat: ajout de la fonctionnalité X"

# 5. Push vers GitHub
git push origin feat/ma-nouvelle-fonctionnalite
```

### 2. Pull Request vers `main`

1. Sur GitHub, créer une Pull Request de votre branche vers `main`
2. Décrire les changements effectués
3. Attendre la review (si travail en équipe)
4. Une fois approuvée, merger dans `main`
5. La branche sera automatiquement déployée en preview sur Cloudflare

### 3. Mise en production

Une fois que `main` est stable et testé :

```bash
# 1. Créer une Pull Request de main vers branch-prod
# Sur GitHub : main → branch-prod

# 2. Review finale

# 3. Merge vers branch-prod
# ⚠️ Cela déclenchera automatiquement le déploiement en production !
```

---

## 🚀 Déploiement

### Déploiement automatique

Le projet utilise GitHub Actions pour automatiser les déploiements :

#### Sur `main` (Preview/Development)
- **Trigger** : Push sur `main` ou PR vers `branch-prod`
- **Déploie** :
  - Backend → Cloudflare Workers (dev-api.connectmeifucan.com)
  - Frontend → Cloudflare Pages (preview branch)
  - Android TV → Cloudflare Pages (preview branch)

#### Sur `branch-prod` (Production)
- **Trigger** : Push sur `branch-prod` (via merge PR)
- **Déploie** :
  - Backend → Cloudflare Workers (api.connectmeifucan.com)
  - Frontend → Cloudflare Pages (connectmeifucan.com)
  - Android TV → Cloudflare Pages (connectmeifucan.app)

### Déploiement manuel

Si nécessaire, vous pouvez déployer manuellement :

```bash
# Backend (Development)
cd backend
npx wrangler deploy --env development

# Backend (Production)
cd backend
npx wrangler deploy --env production

# Frontend (via GitHub Actions)
# Aller sur GitHub → Actions → Run workflow
```

### Rollback en cas de problème

```bash
# 1. Identifier le dernier commit stable
git log

# 2. Revenir à ce commit sur branch-prod
git checkout branch-prod
git reset --hard <commit-hash-stable>
git push origin branch-prod --force

# ⚠️ Le rollback déclenchera un nouveau déploiement automatique
```

---

## 📝 Standards de code

### Messages de commit

Format : `type(scope): description`

**Types :**
- `feat`: Nouvelle fonctionnalité
- `fix`: Correction de bug
- `refactor`: Refactoring
- `docs`: Documentation
- `style`: Formatage, pas de changement de logique
- `test`: Ajout ou modification de tests
- `chore`: Maintenance

**Exemples :**
```
feat(backend): ajout de l'authentification JWT
fix(frontend): correction du bug de connexion
docs(readme): mise à jour des instructions d'installation
```

### Code Style

- **JavaScript/Node.js** :
  - Utiliser ESLint
  - Indentation : 2 espaces
  - Utiliser `const` et `let`, pas `var`
  - Async/await plutôt que callbacks

- **HTML/CSS** :
  - Indentation : 2 espaces
  - Noms de classes en kebab-case
  - CSS organisé par composants

---

## ☁️ Configuration Cloudflare

### Secrets GitHub à configurer

Dans GitHub → Settings → Secrets and variables → Actions :

1. **`CLOUDFLARE_API_TOKEN`**
   - Créer sur : https://dash.cloudflare.com/profile/api-tokens
   - Permissions : Workers Scripts:Edit, Pages:Edit

2. **`CLOUDFLARE_ACCOUNT_ID`**
   - Trouver sur : https://dash.cloudflare.com/ (barre latérale)

### KV Namespaces

Créer 6 KV Namespaces sur Cloudflare :

**Development :**
- `cmuc-dev-users`
- `cmuc-dev-codes`
- `cmuc-dev-rooms`

**Production :**
- `cmuc-prod-users`
- `cmuc-prod-codes`
- `cmuc-prod-rooms`

Puis mettre à jour les IDs dans [`backend/wrangler.toml`](backend/wrangler.toml).

### Variables d'environnement

1. Copier [`.env.example`](.env.example) vers `.env`
2. Remplir les valeurs nécessaires
3. **Ne jamais commiter `.env` !**

---

## 🧪 Tests avant production

### Checklist avant merge vers `branch-prod`

- [ ] Code testé localement
- [ ] Pas d'erreurs dans les logs
- [ ] Tests automatiques passent (si configurés)
- [ ] Testé sur l'environnement de preview
- [ ] Documentation mise à jour
- [ ] Changelog mis à jour (si applicable)
- [ ] Review par un autre développeur (si équipe)

---

## 🔒 Règles de protection des branches

### Protection `branch-prod`

Sur GitHub, configurer la protection de branche :

1. Settings → Branches → Add rule
2. Branch name pattern : `branch-prod`
3. Activer :
   - ✅ Require pull request reviews before merging
   - ✅ Require status checks to pass before merging
   - ✅ Require branches to be up to date before merging
   - ✅ Include administrators

---

## 📞 Support

Pour toute question :
- Créer une Issue sur GitHub
- Contacter l'équipe de développement
- Consulter la documentation complète : [CLOUDFLARE_DEPLOYMENT.md](CLOUDFLARE_DEPLOYMENT.md)

---

## 🎯 Résumé du workflow quotidien

```bash
# 1. Récupérer les dernières modifications
git checkout main
git pull origin main

# 2. Créer une branche de fonctionnalité
git checkout -b feat/ma-fonctionnalite

# 3. Développer et tester localement
# ... faire vos modifications ...

# 4. Commiter
git add .
git commit -m "feat: description de la fonctionnalité"

# 5. Push
git push origin feat/ma-fonctionnalite

# 6. Créer une PR sur GitHub vers main
# → Tests automatiques + Preview deployment

# 7. Une fois approuvée, merger dans main
# → Déploiement automatique en preview

# 8. Quand main est stable, créer PR main → branch-prod
# → Review finale

# 9. Merger vers branch-prod
# → Déploiement automatique en PRODUCTION ! 🚀
```

---

**Bon développement ! 🎮**
