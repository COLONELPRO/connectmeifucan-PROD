# 🎨 Drawing Game Integration

## Vue d'ensemble

Jeu de dessin collaboratif intégré avec le système de room existant. Les joueurs dessinent sur mobile/PC et les résultats s'affichent sur l'écran partagé TV Android.

## Fonctionnalités

### Page 2 - Interface de jeu
- **Canvas de dessin** : HTML5 Canvas 800x600px avec support tactile et souris
- **Outils** : Sélecteur de couleur, taille de pinceau (1-20px), effacer, annuler
- **Timer** : Compte à rebours de 15 secondes par tour
- **Swipe** : Bouton pour soumettre le dessin et passer au suivant
- **3 rounds** : Chaque partie comprend 3 tours avec différents thèmes

### Connexion Room
- **Créer une partie** : Génère un code à 4 caractères
- **Rejoindre** : Entrer le code de la room
- **WebSocket** : Synchronisation temps réel avec le système de room existant

### Système de scoring
Le backend calcule automatiquement 4 scores (0-1 chacun) :
- **Fluidité** : Basé sur le nombre et la qualité des traits
- **Cohérence** : Basé sur la consistance des traits
- **Thème** : Adhérence au sujet (simplifié pour le moment)
- **Créativité** : Basé sur la variation et l'originalité

**Score total** : 0-4 par round, donc 0-12 au total après 3 rounds

### Titres automatiques
Le système attribue des titres selon les performances :
- 👑 **Chaînon d'Or** : Score total ≥ 3.5
- ⚡ **Maître du Swipe** : Fluidité ≥ 0.8
- 🎨 **Artiste Cohérent** : Cohérence ≥ 0.8
- 🎯 **Génie du Thème** : Thème ≥ 0.8
- ✨ **Créateur Original** : Créativité ≥ 0.8

## Architecture

### Frontend (`index.html` + `Site/drawing-game.js`)

**États du jeu** :
1. **Info** (`drawing-game-info`) : Écran d'accueil avec connexion
2. **Active** (`drawing-game-active`) : Canvas de dessin + outils
3. **Results** (`drawing-game-results`) : Classement et scores finaux

**Classe principale** : `DrawingGameClient`
- Gère le canvas et les événements de dessin
- Communication WebSocket avec le backend
- Timer et gestion des rounds
- Affichage des résultats

### Backend (`backend/room-durable-object.js`)

**Messages WebSocket ajoutés** :
- `START_DRAWING_GAME` : Initialise une nouvelle partie
- `DRAWING_STROKE` : Diffuse les traits en temps réel (pour TV)
- `SUBMIT_DRAWING` : Soumet le dessin d'un joueur
- `REQUEST_GAME_RESULTS` : Demande les résultats finaux
- `GAME_START` : Broadcast du début de partie
- `ROUND_END` : Broadcast de fin de round
- `GAME_RESULTS` : Envoi des résultats calculés

**État du jeu** (dans `roomData.drawingGame`) :
```javascript
{
  currentRound: 1,
  maxRounds: 3,
  theme: "Un chat dans l'espace",
  players: [],
  contributions: [
    {
      playerId: "session-id",
      playerName: "Player_abc123",
      round: 1,
      imageData: "data:image/png;base64,...",
      strokes: [...],
      theme: "Un chat dans l'espace",
      timestamp: 1234567890
    }
  ]
}
```

**Méthodes ajoutées** :
- `endDrawingRound()` : Gère la fin d'un round et le passage au suivant
- `calculateDrawingGameResults()` : Calcule les scores de tous les joueurs
- `assignTitles()` : Attribue les titres selon les performances
- `generateTheme()` : Génère un thème aléatoire

## Intégration avec le système de room

Le jeu de dessin **réutilise le système de WebSocket existant** :
- Même connexion WebSocket que le système de room (page 3)
- Les messages de dessin coexistent avec les messages de room
- Possibilité d'afficher le canvas sur l'écran partagé TV

## Utilisation

### 1. Lancer le backend

```bash
cd backend
npm install
npx wrangler dev --local
```

Le Worker Durable Objects sera accessible sur `ws://localhost:8787`

### 2. Ouvrir le site

Ouvrir `index.html` dans un navigateur, aller sur **Page 2** (🎨 Chaîne de Dessin)

### 3. Créer ou rejoindre une partie

**Créateur** :
1. Cliquer sur "+ Créer une partie"
2. Noter le code à 4 caractères
3. Partager le code avec les autres joueurs

**Joueurs** :
1. Entrer le code dans le champ
2. Cliquer sur "Rejoindre"

### 4. Dessiner

1. Le timer de 15 secondes démarre automatiquement
2. Dessiner sur le canvas avec la souris ou le doigt
3. Utiliser les outils (couleur, taille, effacer, annuler)
4. Cliquer sur "Swipe" pour soumettre (ou attendre la fin du timer)

### 5. Voir les résultats

Après 3 rounds, l'écran des résultats s'affiche automatiquement avec :
- Classement des joueurs par score total
- Détail des 4 scores (fluidité, cohérence, thème, créativité)
- Titres obtenus

## Extension future

### Scoring avancé
Actuellement, le scoring est simplifié. Pour un scoring plus précis, intégrer les analyseurs de `game-dessin-collaboratif-spec.js` :
- `AnalyseurTrait` : Analyse de la fluidité réelle des traits
- `AnalyseurVisuel` : Comparaison pixel par pixel (avant/après)
- `AnalyseurTheme` : Détection de similarité au thème (couleurs, formes)
- `AnalyseurCreativite` : Évaluation du twist et de l'originalité

### Affichage TV
Ajouter dans la modal "Shared TV" (page 3) :
- Canvas en temps réel montrant le dessin du joueur actif
- Liste des joueurs avec progression
- Timer et round en cours
- Résultats finaux après la partie

### Persistance
- Sauvegarder les dessins dans R2 (Cloudflare Object Storage)
- Historique des parties
- Galerie des meilleurs dessins

### Multijoueur avancé
- File d'attente de joueurs
- Tours où chaque joueur modifie le dessin du précédent (vrai "chaîne")
- Mode compétition avec lobbies

## Déploiement

### Backend (Cloudflare Workers)
```bash
cd backend
npx wrangler publish
```

### Frontend (Cloudflare Pages)
```bash
npx wrangler pages deploy . --project-name=connectmeifucan --branch=main
```

## Fichiers modifiés/ajoutés

- ✅ `index.html` : Page 2 avec interface de jeu complète
- ✅ `Site/drawing-game.js` : Logique client du jeu (550+ lignes)
- ✅ `backend/room-durable-object.js` : Extension pour messages de dessin (100+ lignes ajoutées)
- ✅ `DRAWING_GAME.md` : Cette documentation

## Notes techniques

- Le canvas utilise `touch-action:none` pour éviter le scroll sur mobile
- Les événements tactiles sont gérés avec `preventDefault()` pour bloquer le comportement par défaut
- Les strokes sont diffusés en temps réel mais throttlés pour éviter la surcharge
- L'historique de dessin permet l'annulation (undo)
- Le scoring est actuellement simplifié (basé sur le nombre de traits)

## Prochaines étapes

1. ✅ Interface de jeu fonctionnelle
2. ✅ WebSocket avec backend
3. ✅ System de rounds et timer
4. ✅ Scoring et résultats
5. ⏳ Intégration scoring avancé (AnalyseurTrait, etc.)
6. ⏳ Affichage sur écran partagé TV
7. ⏳ Sauvegarde des dessins en R2
8. ⏳ Mode chaîne (chaque joueur modifie le dessin précédent)
