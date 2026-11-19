# PIVOT Online — Plateforme multiplayer complète

Jeu de réflexion abstrait PIVOT (règles v2) en multijoueur en ligne.
Stack : **Node.js + Express + Socket.io + PostgreSQL + JWT + SPA vanilla JS**.

## Fonctionnalités

- Authentification (bcrypt + JWT cookie httpOnly)
- Matchmaking ranked par Elo (K=32) avec fenêtre ±50, élargi après 10s
- Parties privées (code 6 caractères à partager)
- Phase d'achat (10 Pbucks au début de chaque partie)
- Choix de camp après le 1er coup (règle d'équilibre : Bleu peut échanger)
- 7×7 grid, pivot partagé, Rouge=horizontal, Bleu=vertical
- Capacités v2 : 2 virages, 1 tp, 1 diagonale + capacités achetées (Hamer, DS, Clock)
- Bornes (3 par joueur, gratuites)
- Anti-triche : le serveur valide chaque coup via `engine/rules.js`
- Shop avec 5 types de coffres (drop rates par rareté)
- Pass de Combat (30 niveaux par saison mensuelle, reset TR à la fin du mois)
- 18 paliers de rang (Plastique → Legendary)
- Skins (SVG, modifiables)
- Amis (friend_id #ABC123, demandes, liste, défis privés)
- Cadeaux admin (drawer gauche + réclamation)
- Panneau admin (stats, recherche, cadeaux, signalements, logs, ban, promote)
- Sons générés par Web Audio API (pas de fichiers son requis)
- Musique ambient optionnelle (`/public/assets/sounds/ambient.mp3` — à ajouter si tu veux, sinon un drone synthétisé est joué)
- Paramètres stockés en localStorage (sons, thème, animations, langue)
- UI type Brawl Stars (bouton PLAY central, bottom nav)
- SPA : navigation par onglets + history.pushState

## Stack

| Côté | Tech |
|---|---|
| Backend | Node.js 18+, Express 4 |
| Realtime | Socket.io 4 |
| DB | PostgreSQL (via `pg`) |
| Auth | bcrypt + JWT cookie httpOnly |
| Frontend | HTML + CSS + JS vanilla (PAS de framework) |

## Installation en local

1. **Prérequis** : Node.js 18+, PostgreSQL 14+
2. Créer une DB PostgreSQL :
   ```bash
   createdb pivot
   ```
3. Cloner le repo et installer les deps :
   ```bash
   npm install
   ```
4. Copier `.env.example` en `.env` et adapter :
   ```
   PORT=4242
   DATABASE_URL=postgres://user:pass@localhost:5432/pivot
   JWT_SECRET=ton-secret-long-et-aleatoire
   DEFAULT_ADMIN_USERNAME=admin
   DEFAULT_ADMIN_PASSWORD=admin123
   ```
5. Démarrer :
   ```bash
   npm start
   ```
6. Ouvrir <http://localhost:4242/>

Au premier démarrage, `init-db.js` crée toutes les tables, seed les 7 skins, crée la saison courante, et crée le compte admin par défaut (username/password du `.env`). Le mot de passe admin est affiché dans la console.

## Déploiement sur alwaysdata.net

### Étape 1 : compte + app
1. Crée un compte sur <https://alwaysdata.net>
2. Dans le dashboard, ajoute une **application Node.js** :
   - Type : Node.js
   - Répertoire : `/pivot-online` (où tu push le code)
   - Fichier d'entrée : `server.js`
   - Port : `4242` (imposé par alwaysdata)
3. Crée une **base de données PostgreSQL** (gratuit).

### Étape 2 : variables d'env
Dans le dashboard alwaysdata, ajoute les variables d'environnement :
- `DATABASE_URL` = `postgres://user:pass@postgresql-X.alwaysdata.net:5432/ta_db` (URL fournie par alwaysdata)
- `JWT_SECRET` = une chaîne longue et aléatoire (ex : `openssl rand -hex 32`)
- `PORT` = `4242`
- `NODE_ENV` = `production`
- `DEFAULT_ADMIN_USERNAME` = ton choix
- `DEFAULT_ADMIN_PASSWORD` = un mot de passe fort (change-le après le 1er login)

### Étape 3 : déployer le code
```bash
# Option A : git
cd pivot-online
git init
git add .
git commit -m "Initial commit"
git remote add alwaysdata https://git@<ton-compte>.alwaysdata.net/<ton-compte>/<repo>.git
git push alwaysdata master

# Option B : SFTP/SSH
scp -r pivot-online/* <ton-compte>@ssh-<ton-compte>.alwaysdata.net:/home/<ton-compte>/pivot-online/
```

### Étape 4 : installer les deps et démarrer
Sur alwaysdata, dans la console SSH :
```bash
cd pivot-online
npm install --production
# L'app redémarre automatiquement, ou via le dashboard
```

Au 1er démarrage, les tables sont créées. Le site est accessible sur `https://<ton-compte>.alwaysdata.net/`.

### Étape 5 : sécuriser l'admin
Connecte-toi avec le compte admin par défaut, va dans le panneau admin, **change ton mot de passe** (en attendant le panneau admin, tu peux le faire via une requête SQL directement dans la DB).

## Structure du projet

```
pivot-online/
├── package.json
├── server.js               (point d'entrée Express + Socket.io + init DB)
├── init-db.js              (CREATE TABLE IF NOT EXISTS + seed)
├── db.js                   (pool PostgreSQL)
├── elo.js                  (formule Elo K=32)
├── pass.js                 (config 30 niveaux + XP)
├── seasons.js              (saison mensuelle + reset TR)
├── chests.js               (drop rates + ouverture coffres)
├── matchmaking.js          (file d'attente)
├── ranks.js                (18 paliers)
├── engine/
│   └── rules.js            (règles PIVOT v2 + capacités — ANTI-TRICHE)
├── routes/
│   ├── _middleware.js     (JWT + guards)
│   ├── auth.js
│   ├── shop.js
│   ├── chests.js
│   ├── skins.js
│   ├── pass.js
│   ├── friends.js
│   ├── gifts.js
│   ├── leaderboard.js
│   ├── admin.js
│   ├── reports.js
│   └── inventory.js
├── sockets/
│   └── game-socket.js      (matchmaking + coups live)
└── public/
    ├── index.html          (SPA : tout est sur cette page)
    ├── css/style.css       (style Brawl Stars)
    ├── js/                 (12 modules : app, api, auth, dashboard, game, shop, pass, friends, gifts, settings, sounds, admin)
    └── assets/
        ├── skins/          (SVG)
        └── sounds/         (ambient.mp3 optionnel)
```

## Règles du jeu (résumé)

- Grille 7×7 points, pivot départ D4
- Rouge = horizontal, Bleu = vertical
- 3 bornes/joueur (gratuites, posées sur case libre)
- Capacités v2 de base : 2 virages, 1 tp, 1 diagonale
- Capacités achetables : Hamer (H), Double Switch (DS), Clock (C), TP, Pivot (P), Diagonale (D)
- Perte si aucun mouvement possible (borne ne sauve pas)
- Échange des camps après le 1er coup (Bleu choisit)

## Anti-triche

Le serveur **valide chaque coup** via `engine/rules.js`. Le client envoie une action au format JSON via Socket.io, le serveur :
1. Vérifie que c'est bien le tour du joueur (par userId)
2. Valide la légalité du move (destination libre, trajet libre, capacité dispo, etc.)
3. Applique le move à l'état de jeu en mémoire (source de vérité)
4. Broadcast le nouvel état aux deux joueurs

Le client ne fait que **render** l'état reçu. Toute triche par manipulation client-side est sans effet.

## Commandes de test (post-déploiement)

```bash
# Vérifier que le serveur tourne
curl https://<ton-compte>.alwaysdata.net/api/health

# Créer un compte
curl -X POST https://<ton-compte>.alwaysdata.net/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"username":"test","password":"test123"}'
```

## FAQ

**Le serveur ne démarre pas, erreur "DATABASE_URL manquant"**
→ Vérifie que `.env` est créé et contient bien `DATABASE_URL`.

**Le socket ne se connecte pas**
→ Vérifie que tu es authentifié (le socket exige un JWT valide).

**Pas de son**
→ Les sons sont désactivés par défaut en mobile. Clique n'importe où sur la page (autopolice browser), puis vérifie les paramètres (⚙️).

**Pas de musique ambient**
→ Le fichier `ambient.mp3` n'est pas inclus (trop lourd). Ajoute le tien dans `/public/assets/sounds/ambient.mp3` ou laisse le drone synthétisé (activé dans ⚙️).

**Le bouton PLAY ne fait rien**
→ Vérifie la console du navigateur. Le socket doit être connecté. Le matchmaking peut prendre du temps s'il n'y a personne dans la file.

## Roadmap

- [ ] Replay des parties (table `match_moves` déjà en place)
- [ ] Tournois
- [ ] Animations CSS plus poussées (ouverture coffre, rank up)
- [ ] Localisation EN complète
- [ ] Notifications push (PWA)

## Licence

Projet de démonstration — utilisation libre.
