# PIVOT Online — Guide de déploiement complet

Deux options pour héberger l'app Node.js, **avec la DB toujours sur alwaysdata** dans les deux cas.

## TL;DR — Quelle option choisir ?

| Critère | alwaysdata (app) | Render (app) | Verdict |
|---|---|---|---|
| Always-on (no sleep) | ✅ Oui | ❌ Sleep après 15 min d'inactivité | **alwaysdata** |
| WebSocket/Socket.io stable | ✅ Connexions persistantes | ⚠️ Drop au sleep, ~1 min cold start | **alwaysdata** |
| RAM | 256 Mo (free) | 512 Mo (free) | Render |
| CPU | 0,25 vCPU shared | 0,1 vCPU shared | alwaysdata |
| Free hours/month | Illimité | 750h (~31 j à 24/7 — limite juste) | alwaysdata |
| HTTPS auto | ✅ | ✅ | Égal |
| Git push to deploy | Via GitHub/GitLab | ✅ Natif | Render |
| Custom domain (free) | ✅ | ✅ (2 free) | Égal |
| Cold start | < 5 s | ~60 s après sleep | alwaysdata |

### Recommandation

**Pour PIVOT Online (jeu temps réel + Socket.io) : toujours l'app sur alwaysdata.**

Le sleep de Render après 15 min d'inactivité est **fatal** pour un jeu multijoueur temps réel :
- Toutes les connexions Socket.io drop quand l'app sleep
- 1 minute de cold start avant qu'un joueur puisse jouer
- 750h/month = ~31 jours à 24/7 — pas assez de marge si tu utilises un keep-alive cron

Render n'est intéressant **que** si tu veux :
- Plus de RAM pour scaler (>256 Mo requis)
- CI/CD git-push natif
- Et tu acceptes de payer 7 $/mo pour le plan "Starter" (no sleep, always-on)

---

## Étape 1 commune : Créer la DB PostgreSQL sur alwaysdata

Cette étape est **obligatoire pour les deux options** (l'app tourne sur alwaysdata ou Render).

### 1.1 Créer un compte alwaysdata
- Va sur <https://www.alwaysdata.com>
- Crée un compte **gratuit** (no credit card, no time limit, usage personnel)
- Choisis un nom de compte (ex: `pivot`) → ton domaine sera `pivot.alwaysdata.net`

### 1.2 Créer une DB PostgreSQL
1. Connecte-toi au dashboard : <https://pivot.alwaysdata.net/admin/>
2. Va dans **Databases > PostgreSQL**
3. Clique **Create a database**
   - Name : `pivot_db`
   - User : choisis un user (ex: `pivot_user`)
   - Password : choisis un mot de passe fort (génère-le avec `openssl rand -hex 16`)
   - Permissions : **All privileges** (lecture + écriture)
4. La DB est créée. Tu obtiens :
   - Server : `postgresql-pivot.alwaysdata.net`
   - Port : `5432` (ou `5433` pour pgBouncer, recommandé pour les apps avec pool)
   - Database : `pivot_db` (ou `pivot_pivot_db` selon ton compte)
   - User : `pivot_user`
   - Password : ce que tu as mis

### 1.3 Construire la DATABASE_URL
Format :
```
postgres://USER:PASS@postgresql-TONCOMPTE.alwaysdata.net:5432/DBNAME
```

Exemple :
```
postgres://pivot_user:a1b2c3d4e5f6@postgresql-pivot.alwaysdata.net:5432/pivot_db
```

> **Tip** : pour utiliser pgBouncer (recommandé quand on a un pool de connexions côté Node), remplace le port `5432` par `5433`. Le pool côté Node + pgBouncer côté serveur évite d'épuiser les 50 connexions max.

> **SSL** : alwaysdata accepte les connexions externes en SSL. Le `db.js` du projet active SSL automatiquement si l'URL contient `alwaysdata.net` — pas besoin de configurer `DB_SSL`.

### 1.4 Tester la connexion (optionnel)
```bash
# En local, avec psql installé
psql "postgres://pivot_user:PASS@postgresql-pivot.alwaysdata.net:5432/pivot_db" -c "SELECT version();"
```

Devrait afficher la version de PostgreSQL (16, 17 ou 18 selon alwaysdata).

---

## Option A : App sur alwaysdata (recommandée)

### A.1 Créer le site Node.js
1. Dashboard alwaysdata → **Web > Sites > Add a site**
2. Type : **Node.js**
3. Domaine : `pivot.alwaysdata.net` (offert) ou ton domaine perso
4. Path : `/pivot-online/` (le dossier contenant `server.js`)
5. Command : `node server.js`
6. Port : **4242** (imposé par alwaysdata par défaut, mais tu peux lire `process.env.PORT`)
7. Save

### A.2 Pousser le code
**Option 1 : SFTP/SSH**
```bash
# Sur ton PC
scp -r pivot-online/ pivot@ssh-pivot.alwaysdata.net:/home/pivot/

# Ou avec rsync (plus rapide pour les mises à jour)
rsync -avz --exclude node_modules --exclude .git \
  pivot-online/ pivot@ssh-pivot.alwaysdata.net:/home/pivot/pivot-online/
```

**Option 2 : Git** (recommandé pour les updates)
1. Crée un repo sur GitHub (privé ou public, peu importe)
2. Push le code :
```bash
cd pivot-online
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/TONUSER/pivot-online.git
git push -u origin main
```
3. Dans alwaysdata dashboard → **Remote access > Git** :
   - Ajoute le repo GitHub
   - Branche : `main`
   - Sync automatique : active

### A.3 Installer les dépendances
Via SSH :
```bash
ssh pivot@ssh-pivot.alwaysdata.net
cd ~/pivot-online
npm install --production
```

### A.4 Configurer les variables d'env
Dashboard alwaysdata → **Web > Sites > pivot-online > Environment variables** :

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | `postgres://pivot_user:PASS@postgresql-pivot.alwaysdata.net:5432/pivot_db` |
| `JWT_SECRET` | `openssl rand -hex 32` (génère-le en local et copie-le) |
| `PORT` | `4242` |
| `NODE_ENV` | `production` |
| `DEFAULT_ADMIN_USERNAME` | `admin` (ou autre) |
| `DEFAULT_ADMIN_PASSWORD` | un mot de passe fort (change-le après 1er login) |
| `CLIENT_ORIGIN` | `*` |

### A.5 Démarrer
Dashboard → **Web > Sites > pivot-online** → bouton **Restart**

Au 1er démarrage, `init-db.js` crée toutes les tables + seed (skins, saison, admin par défaut). Vérifie les logs dans **Logs > site-pivot-online**.

### A.6 Vérifier
- Ouvre <https://pivot.alwaysdata.net/api/health> → doit renvoyer `{"ok":true,...}`
- Ouvre <https://pivot.alwaysdata.net/> → page de login PIVOT
- Connecte-toi avec le compte admin → tu peux créer un user, jouer, etc.

---

## Option B : App sur Render (DB reste sur alwaysdata)

### B.1 Préparer le repo GitHub
Le code doit être sur GitHub/GitLab/Bitbucket (Render déploie depuis Git).

```bash
cd pivot-online
git init
git add .
git commit -m "Initial commit — PIVOT Online"
git remote add origin https://github.com/TONUSER/pivot-online.git
git branch -M main
git push -u origin main
```

### B.2 Créer le Web Service sur Render
1. Va sur <https://render.com> → sign up (no credit card required)
2. **New +** → **Web Service**
3. Connecte ton repo GitHub `TONUSER/pivot-online`
4. Configure :
   - **Name** : `pivot-online`
   - **Region** : Frankfurt (le plus proche d'alwaysdata, en Europe)
   - **Runtime** : Node (auto-détecté)
   - **Build command** : `npm install`
   - **Start command** : `node server.js`
   - **Instance type** : **Free** (750h/mois)
5. **Environment variables** :

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | `postgres://pivot_user:PASS@postgresql-pivot.alwaysdata.net:5432/pivot_db` (la même qu'en alwaysdata) |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `NODE_ENV` | `production` |
| `PORT` | (laisse vide — Render fournit son propre port via `process.env.PORT`) |
| `DEFAULT_ADMIN_USERNAME` | `admin` |
| `DEFAULT_ADMIN_PASSWORD` | un mot de passe fort |
| `CLIENT_ORIGIN` | `*` |
| `DB_POOL_MAX` | `5` (Render free a moins de RAM, garde le pool petit) |

6. **Create Web Service**
7. Render lance le build (~2-3 min) puis démarre l'app
8. URL finale : `https://pivot-online.onrender.com`

### B.3 Vérifier
- Ouvre <https://pivot-online.onrender.com/api/health> → doit renvoyer OK
- Au 1er déploiement, `init-db.js` crée les tables sur ta DB alwaysdata

### B.4 Le problème du sleep (important)

Render free **sleep après 15 min sans requête HTTP**. Conséquences pour PIVOT :
- ❌ Tous les sockets Socket.io drop (perte des parties en cours)
- ❌ 1 minute de cold start au prochain joueur qui se connecte
- ❌ 750h/month = ~31 jours à 24/7 — limite juste

**Solutions** :

#### Solution 1 : Keep-alive cron (gratuit mais bricolage)
Utilise un service gratuit qui ping ton app toutes les 10 min :
- <https://cron-job.org> (gratuit, illimité)
- <https://uptimerobot.com> (free, 50 monitors)
- <https://freshworks.io/cronit/> 

Configure un job qui ping `https://pivot-online.onrender.com/api/health` toutes les 10 min.

⚠️ Caveat : ça consomme tes 750h/month. 24/7 × 31 j = 744h — juste sous la limite. Si tu dépasses, l'app est suspendue jusqu'au mois suivant.

#### Solution 2 : Passer à Render Starter (7 $/mois)
- No sleep, always-on
- 512 MB RAM
- Custom domains
- Recommandé pour la prod sérieuse

#### Solution 3 : Utiliser Render + auto-reconnect côté client
Le `game.js` client pourrait être étendu pour reconnecter le socket automatiquement après un drop, et reprendre la partie via l'événement `game:resume` (déjà implémenté côté serveur).

---

## Comparaison des URLs selon l'option

| Option | URL du site |
|---|---|
| alwaysdata app | `https://TONCOMPTE.alwaysdata.net/` |
| Render app | `https://TONAPP.onrender.com/` |
| DB (toujours) | `postgresql-TONCOMPTE.alwaysdata.net:5432` |

---

## Migrer de l'un à l'autre

Très simple : seules les variables d'env changent.

### De alwaysdata vers Render
1. Pousse le code sur GitHub (si pas déjà fait)
2. Crée le Web Service sur Render avec la même `DATABASE_URL`
3. Render lit la même DB → pas de perte de données
4. Coupe l'app alwaysdata (ou redirige le domaine)

### De Render vers alwaysdata
1. Clone le repo GitHub en local
2. `scp` ou git-pull sur alwaysdata
3. `npm install` sur alwaysdata
4. Configure les mêmes variables d'env
5. Redémarre l'app alwaysdata
6. Coupe le Web Service Render

---

## Checklist post-déploiement

1. **Tester l'auth** : crée un user, login, logout
2. **Tester la DB** : vérifie que `init-db.js` a bien créé les tables (via phpPgAdmin alwaysdata : `https://TONCOMPTE.alwaysdata.net/phppgadmin/`)
3. **Changer le mot de passe admin** : connecte-toi en admin, va dans le panneau admin, et promeut un user normal en admin avec un nouveau mot de passe (via SQL direct dans phpPgAdmin : `UPDATE users SET password_hash = '$2b$10$...' WHERE username = 'admin'` — génère le hash avec `node -e "console.log(require('bcrypt').hashSync('newpass',10))"`)
4. **Tester une partie privée** : ouvre 2 onglets, crée un salon privé dans l'un, rejoins avec le code dans l'autre
5. **Tester le matchmaking ranked** : connecte-toi avec 2 comptes différents dans 2 navigateurs, lance PLAY sur les 2 — devraient se matcher
6. **Vérifier les sockets** : dans la console du navigateur, `io.connected` doit être `true`
7. **Vérifier le HTTPS** : les cookies JWT sont `secure: true` en prod → ne marchent qu'en HTTPS
8. **Vérifier les CORS** : `CLIENT_ORIGIN=*` marche partout, mais pour la prod tu devrais mettre ton URL exacte

---

## Variables d'env complètes (référence)

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | URL PostgreSQL alwaysdata |
| `JWT_SECRET` | ✅ | `dev-secret` | Secret JWT — DOIT être changé en prod |
| `PORT` | ⚠️ | `4242` | alwaysdata: laisse 4242. Render: laisse Render décider |
| `NODE_ENV` | ✅ | `production` | Active les cookies JWT secure |
| `DEFAULT_ADMIN_USERNAME` | ⚠️ | `admin` | Admin créé au 1er démarrage |
| `DEFAULT_ADMIN_PASSWORD` | ⚠️ | `admin123` | À CHANGER immédiatement |
| `CLIENT_ORIGIN` | ❌ | `*` | Pour CORS strict, mets ton URL |
| `DB_SSL` | ❌ | `false` | Auto-activé si URL contient alwaysdata.net |
| `DB_POOL_MAX` | ❌ | `10` | Taille pool — réduire sur Render free (5) |
| `SEASON_DAYS` | ❌ | `30` | Durée d'une saison Pass |
| `JWT_EXPIRES` | ❌ | `7d` | Durée de vie du JWT |

---

## Troubleshooting

### "Impossible de se connecter à la DB"
- Vérifie `DATABASE_URL` (pas d'espace, URL bien formée)
- Test en local : `psql "$DATABASE_URL" -c "SELECT 1"`
- Vérifie que ton user PostgreSQL a bien **all privileges** sur la DB (alwaysdata dashboard)
- Si tu utilises pgBouncer (port 5433), certaines features ne marchent pas (prepared statements) — `pg` Node utilise les prepared statements par défaut, donc **utilise le port 5432 normal** pour Render/Node.

### "Le socket ne se connecte pas"
- Vérifie dans la console navigateur : `io.connected` doit être true
- Si `connect_error: Invalid token` → ton JWT a expiré, re-login
- Si `connect_error: No token` → le cookie n'est pas envoyé (HTTPS-only si `secure: true`)

### "L'admin ne se crée pas"
- Vérifie les logs : `DEFAULT_ADMIN_USERNAME` et `DEFAULT_ADMIN_PASSWORD` doivent être set
- Si un admin existe déjà, le script ne le recrée pas (comportement normal). Vérifie dans phpPgAdmin : `SELECT id, username, is_admin FROM users WHERE is_admin = TRUE;`
- Pour réinitialiser : `DELETE FROM users WHERE is_admin = TRUE;` puis restart

### "Le matchmaking ne trouve jamais d'adversaire"
- Normal : il faut 2 joueurs dans la file. Ouvre 2 onglets avec 2 comptes différents et clique PLAY sur les 2.

### "Les sons ne marchent pas"
- Les sons sont générés via Web Audio API — cliqué une fois sur la page (auto-policy browser)
- Vérifie dans ⚙️ paramètres que les sons sont activés

### "Le sleep Render coupe mes parties"
- C'est un problème connu. Solutions :
  - Garde l'app awake avec un keep-alive cron (cron-job.org toutes les 10 min)
  - Migre l'app vers alwaysdata (no sleep)
  - Passe Render à 7 $/mois (Starter, no sleep)

### "Erreur SSL: self signed certificate"
- Si tu as `DB_SSL=true` mais que tu n'as pas besoin de SSL, mets `DB_SSL=false`
- Le `db.js` active SSL auto si l'URL contient `alwaysdata.net` — pour désactiver, override avec `DB_SSL=false` (mais c'est déconseillé)

---

## URLs utiles

- alwaysdata dashboard : <https://TONCOMPTE.alwaysdata.net/admin/>
- alwaysdata phpPgAdmin : <https://TONCOMPTE.alwaysdata.net/phppgadmin/>
- alwaysdata SSH : `ssh TONCOMPTE@ssh-TONCOMPTE.alwaysdata.net`
- alwaysdata docs Node.js : <https://help.alwaysdata.com/en/docs/web-hosting/languages/nodejs/>
- Render dashboard : <https://dashboard.render.com>
- Render docs free : <https://render.com/docs/free>
- cron-job.org (keep-alive) : <https://cron-job.org>

---

## Coût total de la solution

| Composant | alwaysdata free | Render free | Render Starter |
|---|---|---|---|
| DB PostgreSQL | 0 € (1 GB) | Expire en 30 jours | 7 $/mois |
| App Node.js | 0 € (256 MB RAM) | 0 € (sleep) | 7 $/mois (always-on) |
| **Total** | **0 €** | **0 €** (avec keep-alive) | **14 $/mois** |

**Recommandation finale** : DB + app sur alwaysdata = **0 € et pas de sleep**. C'est le setup idéal pour un projet solo.
