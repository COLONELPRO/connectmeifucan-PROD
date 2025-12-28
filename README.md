# 📖 README - Connect Me If U Can PRO

![Connect Me If U Can](https://img.shields.io/badge/Version-Production-green)
![Cloudflare](https://img.shields.io/badge/Hosting-Cloudflare-orange)
![Status](https://img.shields.io/badge/Status-Active-success)

## 🎮 Projet

**Connect Me If U Can** est un jeu multijoueur innovant combinant web, mobile et Android TV avec un système de salle de jeu en temps réel.

---

## 🏗️ Architecture

### Stack Technique

- **Frontend Web** : HTML5, CSS3, JavaScript vanilla
- **Backend API** : Cloudflare Workers (Node.js)
- **Stockage** : Cloudflare KV
- **Android TV** : Application native Java + WebView
- **Temps réel** : WebSockets via Cloudflare Durable Objects
- **Déploiement** : Cloudflare Pages + Workers

### Environnements

| Environnement | Branche | URL Backend | URL Frontend |
|---------------|---------|-------------|--------------|
| **Development** | `main` | dev-api.connectmeifucan.com | preview.pages.dev |
| **Production** | `branch-prod` | api.connectmeifucan.com | connectmeifucan.com |

---

## 🚀 Quick Start

### Prérequis

- Node.js 18+ 
- npm ou yarn
- Compte Cloudflare (gratuit)
- Git

### Installation locale

```bash
# 1. Cloner le repository
git clone https://github.com/COLONELPRO/connectmeifucan-PROD.git
cd connectmeifucan-PROD

# 2. Installer les dépendances backend
cd backend
npm install

# 3. Configurer les variables d'environnement
cp ../.env.example .env
# Éditer .env avec vos valeurs Cloudflare

# 4. Lancer le serveur de développement
npm run dev
```

Le backend sera disponible sur `http://localhost:8787`

### Frontend

Le frontend peut être ouvert directement dans un navigateur :

```bash
# Ouvrir index.html dans votre navigateur
# Ou utiliser un serveur local comme Live Server (VSCode)
```

---

## 📁 Structure du projet

```
connectmeifucan-PROD/
├── .github/
│   └── workflows/           # GitHub Actions CI/CD
│       ├── deploy-production.yml    # Déploiement production
│       └── deploy-development.yml   # Déploiement preview
├── backend/                 # API Cloudflare Workers
│   ├── worker.js           # Worker principal
│   ├── server.js           # Serveur dev local
│   ├── wrangler.toml       # Config Cloudflare
│   ├── package.json
│   └── data/               # Données de test
├── android-tv/             # Application Android TV
│   ├── app/                # Code source Android
│   └── tv-simulator.html   # Simulateur TV web
├── Site/                   # Assets et styles
│   └── theme.css
├── index.html              # Page d'accueil
├── index.com.html          # Page principale jeu
├── thank_you.html          # Page de remerciement
├── .gitignore              # Fichiers ignorés par Git
├── .env.example            # Template variables d'environnement
├── CONTRIBUTING.md         # Guide de contribution
├── CLOUDFLARE_DEPLOYMENT.md # Guide déploiement Cloudflare
└── README.md               # Ce fichier
```

---

## 🔧 Configuration

### Variables d'environnement

Copier `.env.example` vers `.env` et remplir :

```env
CLOUDFLARE_API_TOKEN=votre_token
CLOUDFLARE_ACCOUNT_ID=votre_account_id
```

### Secrets GitHub

Pour les déploiements automatiques, configurer dans GitHub Settings :

1. `CLOUDFLARE_API_TOKEN`
2. `CLOUDFLARE_ACCOUNT_ID`

---

## 🌳 Workflow Git

### Branches

- **`main`** : Développement actif → Déploiement auto en preview
- **`branch-prod`** : Production stable → Déploiement auto en prod

### Processus

```bash
# Développement
main (dev) → feat/nouvelle-fonctionnalite → PR → main

# Mise en production
main (testé) → PR → branch-prod → Déploiement prod automatique
```

Voir [CONTRIBUTING.md](CONTRIBUTING.md) pour le workflow complet.

---

## 🚀 Déploiement

### Automatique (GitHub Actions)

- **Push sur `main`** → Déploiement preview automatique
- **Merge PR vers `branch-prod`** → Déploiement production automatique

### Manuel

```bash
# Development
cd backend
npx wrangler deploy --env development

# Production
npx wrangler deploy --env production
```

Voir [CLOUDFLARE_DEPLOYMENT.md](CLOUDFLARE_DEPLOYMENT.md) pour plus de détails.

---

## 🧪 Tests

### Backend

```bash
cd backend
npm test
```

### Test WebSocket

```bash
cd backend
node ws-test.js
```

---

## 📚 Documentation

- [CONTRIBUTING.md](CONTRIBUTING.md) - Guide de contribution et workflow
- [CLOUDFLARE_DEPLOYMENT.md](CLOUDFLARE_DEPLOYMENT.md) - Guide déploiement Cloudflare
- [SECURITY.md](SECURITY.md) - Politique de sécurité
- [backend/README.md](backend/README.md) - Documentation API backend

---

## 🛠️ Commandes utiles

```bash
# Backend - Développement local
cd backend
npm run dev                 # Lancer le serveur dev
npm run deploy:dev          # Déployer en dev
npm run deploy:prod         # Déployer en prod

# Wrangler - Gestion Cloudflare
npx wrangler login          # Se connecter à Cloudflare
npx wrangler whoami         # Voir le compte actuel
npx wrangler dev            # Mode dev avec hot-reload
npx wrangler tail           # Voir les logs en temps réel

# Git
git checkout main           # Aller sur branche dev
git checkout branch-prod    # Aller sur branche prod
git pull origin main        # Récupérer les derniers changements
```

---

## 🔒 Sécurité

- Ne jamais commiter `.env` ou fichiers contenant des secrets
- Utiliser GitHub Secrets pour les tokens Cloudflare
- Les codes d'accès sont stockés dans Cloudflare KV (chiffré)
- HTTPS obligatoire sur tous les endpoints

Voir [SECURITY.md](SECURITY.md) pour la politique complète.

---

## 📊 Monitoring

### Cloudflare Dashboard

- Workers : https://dash.cloudflare.com/ → Workers & Pages
- Analytics : https://dash.cloudflare.com/ → Analytics
- Logs : `npx wrangler tail` pour voir en temps réel

### GitHub Actions

- Voir les déploiements : https://github.com/COLONELPRO/connectmeifucan-PROD/actions

---

## 🤝 Contribution

Les contributions sont bienvenues ! Voir [CONTRIBUTING.md](CONTRIBUTING.md) pour :

1. Créer une branche de fonctionnalité
2. Faire vos modifications
3. Créer une Pull Request
4. Attendre la review

---

## 📝 Changelog

### Version actuelle : Production

- ✅ Backend API sur Cloudflare Workers
- ✅ Frontend sur Cloudflare Pages
- ✅ Android TV avec simulateur web
- ✅ Système de salles multijoueurs
- ✅ WebSocket temps réel
- ✅ CI/CD automatique

---

## 📞 Support

- **Issues** : [GitHub Issues](https://github.com/COLONELPRO/connectmeifucan-PROD/issues)
- **Discussions** : [GitHub Discussions](https://github.com/COLONELPRO/connectmeifucan-PROD/discussions)

---

## 📄 Licence

Tous droits réservés © Connect Me If U Can

---

## 🎯 Roadmap

- [ ] Tests unitaires complets
- [ ] Dashboard admin
- [ ] Analytics avancés
- [ ] Support multi-langues
- [ ] Mode spectateur
- [ ] Classement global

---

**Développé avec ❤️ pour la communauté gaming**
