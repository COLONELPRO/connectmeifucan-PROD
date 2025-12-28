# Backend CMUC - Authentification MQTT

Backend Node.js/Express pour gérer l'authentification et les paramètres utilisateur avec MQTT.

## 🚀 Installation

```powershell
cd backend
npm install
```

## ⚙️ Configuration

Créez un fichier `.env` (optionnel) :

```env
PORT=3000
MQTT_BROKER=mqtt://localhost:1883
MQTT_USERNAME=
MQTT_PASSWORD=
```

## 📋 Initialisation des codes d'accès

Pour créer des codes d'accès valides :

```powershell
node scripts/init-codes.js
```

Ou créez manuellement `data/access_codes.json` :

```json
{
  "CODE123": {
    "description": "Code démo",
    "createdAt": "2025-12-27T00:00:00.000Z",
    "expiresAt": null
  }
}
```

## 🎯 Démarrage

```powershell
# Production
npm start

# Développement avec auto-reload
npm run dev
```

Le serveur démarre sur `http://localhost:3000`

## 📡 Endpoints API

### POST /auth/check
Vérifie si un pseudo existe et son statut d'accès.

**Request:**
```json
{
  "username": "demo"
}
```

**Response:**
```json
{
  "exists": true,
  "hasAccess": true,
  "requireCode": false,
  "requiresCodeForCreate": true
}
```

### POST /auth/verify
Vérifie un code d'accès pour un utilisateur existant.

**Request:**
```json
{
  "username": "demo",
  "code": "CODE123"
}
```

**Response:**
```json
{
  "ok": true,
  "token": "abc123..."
}
```

### POST /auth/create
Crée un nouveau compte utilisateur.

**Request:**
```json
{
  "username": "newuser",
  "code": "CODE123"
}
```

**Response:**
```json
{
  "ok": true,
  "token": "xyz789..."
}
```

### POST /auth/login
Connexion avec token existant.

**Request:**
```json
{
  "username": "demo",
  "token": "abc123..."
}
```

**Response:**
```json
{
  "ok": true,
  "user": {
    "username": "demo",
    "settings": {}
  }
}
```

### GET /settings/:username
Récupère les paramètres utilisateur.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "settings": {
    "theme": "dark",
    "language": "fr"
  }
}
```

### POST /settings/:username
Met à jour les paramètres utilisateur.

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "settings": {
    "theme": "dark",
    "language": "fr"
  }
}
```

**Response:**
```json
{
  "ok": true,
  "settings": {
    "theme": "dark",
    "language": "fr"
  }
}
```

## 📨 Messages MQTT

Le backend publie sur les topics suivants :

- `cmuc/auth/check` - Vérification de pseudo
- `cmuc/auth/verify_success` - Code vérifié avec succès
- `cmuc/auth/verify_failed` - Échec de vérification
- `cmuc/auth/create_success` - Compte créé
- `cmuc/auth/login` - Connexion utilisateur
- `cmuc/settings/update` - Mise à jour des paramètres

## 🗂️ Structure des données

### rooms.json
Persisté par les endpoints de salles (`/rooms/create`, `/rooms/join`, `/rooms/:roomId/status`).

Champs enregistrés :

```json
{
  "ABCD": {
    "id": "ABCD",
    "host": "demo1",
    "players": ["demo1", "demo2"],
    "createdAt": "2025-12-28T10:00:00.000Z",
    "status": "active",
    "maxPlayers": 8
  }
}
```

Mises à jour typiques :
- Création de salle → écrit `id`, `host`, initialise `players` avec l’hôte, `createdAt`, `status`, `maxPlayers`.
- Rejoindre une salle → ajoute le pseudo dans `players` si absent.
- Statut de salle → lecture des champs ci-dessus (aucune écriture).

### users.json
```json
{
  "demo": {
    "username": "demo",
    "createdAt": "2025-12-27T10:00:00.000Z",
    "hasAccess": true,
    "token": "abc123...",
    "settings": {
      "language": "fr",
      "theme": "dark"
    },
    "requireCode": false
  }
}
```

### access_codes.json
```json
{
  "CODE123": {
    "description": "Code démo",
    "createdAt": "2025-12-27T00:00:00.000Z",
    "expiresAt": null,
    "usedBy": []
  }
}
```

## 💾 Où sont stockées les données et comment elles évoluent

- Emplacement: `backend/data/rooms.json`, `backend/data/users.json`, `backend/data/access_codes.json`.
- Écriture: via les helpers `writeRooms()`, `writeUsers()`, `writeAccessCodes()` (voir `server.js`).
- Création automatique: si un fichier manque, il est initialisé à l’usage (`read...()` renvoie `{}` et l’écriture crée le JSON).
- Réinitialisation: supprimez les fichiers du dossier `data/` pour repartir à zéro.

### 🔍 Endpoints qui modifient la persistance
- `POST /rooms/create` → crée une entrée dans `rooms.json`.
- `POST /rooms/join` → met à jour `players` dans `rooms.json`.
- `DELETE /rooms/:roomId` → supprime l’entrée de `rooms.json`.
- `POST /auth/create` / `POST /auth/verify` → créent/actualisent des entrées dans `users.json`.
- `POST /settings/:username` → met à jour `users.json` (`settings`, `updatedAt`).

## 🖼️ Upload d'images par utilisateur (max 5)

Stockage sur disque dans `backend/data/images/<username>/` avec contrôle strict :
- Formats: JPEG/PNG/WEBP
- Limites: 5 images par utilisateur, taille max ~5MB
- Auth: requiert `Authorization: Bearer <token>` correspondant à l'utilisateur

Endpoints:
- `GET /users/:username/images` → liste des images
- `POST /users/:username/images` (multipart, champ `images`) → upload (cap à 5 total)
- `GET /users/:username/images/:name` → sert une image spécifique
- `DELETE /users/:username/images/:name` → supprime une image

Sécurité:
- Nettoyage des `username` et des noms de fichier, filtre MIME, pas d'accès hors du répertoire dédié.
- Accès aux images uniquement via endpoints authentifiés (pas de dossier statique public).

### 🔐 Remarques sécurité
- Entrées nettoyées et validées (format du `roomId`, format du `username`).
- Limites de débit par token/IP sur création et join.
- En production, privilégier une base de données (PostgreSQL/Redis) plutôt que fichiers JSON.

## 🔧 MQTT Broker

Vous pouvez utiliser :

- **Mosquitto local** : `mqtt://localhost:1883`
- **HiveMQ Cloud** : `mqtt://broker.hivemq.com:1883`
- **EMQX Cloud** : Voir [emqx.com](https://www.emqx.com/)

### Installer Mosquitto (Windows)

```powershell
# Via Chocolatey
choco install mosquitto

# Démarrer le broker
net start mosquitto
```

## 🧪 Test rapide

```powershell
# Avec curl
curl -X POST http://localhost:3000/auth/check -H "Content-Type: application/json" -d "{\"username\":\"demo\"}"

# Avec PowerShell
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/auth/check" -Body (@{username="demo"} | ConvertTo-Json) -ContentType "application/json"
```

## 🌐 Configuration frontend

Dans le navigateur, configurez l'API :

```javascript
localStorage.setItem('cmuc_api_base', 'http://localhost:3000');
```

Ou déployez le backend et utilisez votre URL de production.

## 📝 Notes

- Les données sont stockées en JSON dans le dossier `data/`
- Le token est généré à chaque création/vérification
- MQTT est utilisé pour la notification en temps réel
- CORS activé pour permettre les requêtes depuis le frontend
