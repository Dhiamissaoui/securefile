# SecureFile V2 — coffre-fort documentaire chiffré

Application web locale de partage sécurisé de documents, réalisée dans le cadre du projet
**GLSI_3 — Sécurité de l'information et Web** (binôme, 8 semaines).

Ce dépôt contient la **version 2 sécurisée**. La version vulnérable (`securefile-v1`) est
conservée séparément comme référence pour l'audit « avant / après » demandé dans le sujet.

Pile : **MongoDB Atlas + Express + React (MERN), JavaScript uniquement**, styles **SCSS**
avancés, interface **française**, données fictives, exécution 100 % locale.

---

## 1. Fonctionnalités couvertes

| Module du sujet | Implémentation |
| --- | --- |
| Authentification, sessions, force brute | bcrypt coût 12, JWT HS256 en cookie HttpOnly `SameSite=Strict`, sessions serveur révocables (45 min glissantes, 8 h absolues), jeton CSRF par session, verrouillage après 5 échecs pendant 15 min, limitation de débit, messages d'erreur génériques |
| Gestion de fichiers chiffrés | AES-256-GCM avec clé aléatoire par fichier et nonce 96 bits unique, clé emballée par destinataire avec RSA-OAEP-SHA256, stockage hors racine web sous nom aléatoire, liste blanche d'extensions, contrôle des octets magiques, limite 10 Mo, commentaires assainis |
| Intégrité et authenticité | SHA-256 au dépôt, HMAC-SHA-256 serveur sur les métadonnées, signature **RSA-PSS 3072 / SHA-256** de l'empreinte recalculée, vérification en trois niveaux, journal d'audit chaîné par hachage |
| PKI locale | AC racine RSA 3072 (clé privée chiffrée par phrase secrète), CSR signés, certificats X.509, vérification chaîne / dates / usage / révocation CRL, scénarios de démonstration valide / expiré / AC inconnue / révoqué |
| Audit OWASP | Page « Tests de sécurité » : comparaison avant/après et campagne rejouable de **19 tests d'attaque** avec preuve du statut HTTP observé |

Interface : tableau de bord, fichiers, vérification, certificats, journal d'audit, tests de
sécurité ; thème clair minimaliste ; responsive mobile ; SCSS.

---

## 2. Arborescence

```
securefile-v2/
├── backend/
│   ├── app.js, server.js, config.js, db.js
│   ├── middleware/        auth, CSRF, rate limit, upload, sanitize, erreurs
│   ├── models/            User, File, Share, Certificate, Session, AuditLog, Counter
│   ├── routes/            auth, files, certificates, audit, security, dashboard
│   ├── services/          fileService, verification, audit, keyVault, sessions,
│   │                      securityOverview, securityTests
│   ├── utils/             crypto, pki, validators, files, serialize, AppError
│   ├── scripts/           seed.js, run-security-tests.js
│   ├── pki/               CA locale (ca.crt.pem, ca.key.enc)
│   └── storage/encrypted/ chiffrés AES-GCM, noms aléatoires
└── frontend/
    ├── src/pages/         Auth, Dashboard, Files, Verify, Certificates, Audit, Security
    ├── src/components/    layout, modales, chips, anneau de score, etc.
    ├── src/lib/           api, AuthContext, ToastContext, thème, formatage
    └── src/styles/        design system SCSS (tokens, base, composants, pages)
```

---

## 3. Démarrage rapide

### Prérequis

- Node.js **20 ou plus** (testé avec Node 24)
- Un cluster **MongoDB Atlas** accessible (base `securefile_v2`)

### 3.1 Variables d'environnement

Copier `backend/.env.example` vers `backend/.env`, puis renseigner :

```env
PORT=5000
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
MONGO_DB=securefile_v2
CLIENT_ORIGIN=http://localhost:5173

JWT_SECRET=<32 octets aléatoires en hexadécimal>
HMAC_KEY=<32 octets aléatoires en hexadécimal>
CA_PASSPHRASE=<phrase secrète de l'AC locale>

NODE_ENV=development
```

Génération de secrets (exécuter la commande **trois fois** et reporter chaque valeur) :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> `JWT_SECRET` signe les jetons de session ; `HMAC_KEY` scelle les métadonnées ;
> `CA_PASSPHRASE` chiffre la clé privée de l'AC dans `backend/pki/ca.key.enc`.
>
> ⚠️ Ne jamais laisser `change-me` et ne jamais modifier ces trois valeurs après le premier
> `npm run seed`. La clé de l'AC est chiffrée avec `CA_PASSPHRASE` : si vous le changez, elle
> devient indéchiffrable ; si vous changez `HMAC_KEY`, les sceaux des fichiers existants ne
> correspondent plus. Les secrets doivent rester stables pendant toute la durée de vie de la base.

### 3.2 Installation

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 3.3 Données de démonstration

```bash
cd backend
npm run seed
```

Le seed est idempotent : il crée les comptes, leurs certificats, trois documents chiffrés
(dont un contrat signé et partagé) et les entrées d'audit associées.

### 3.4 Lancement

Deux terminaux :

```bash
# terminal 1 — API
cd backend
npm run dev        # http://localhost:5000

# terminal 2 — interface
cd frontend
npm run dev        # http://localhost:5173
```

Ouvrir **http://localhost:5173**.

### Comptes de démonstration

| Utilisateur | Email | Mot de passe | Particularités |
| --- | --- | --- | --- |
| Alice | `alice@securefile.local` | `Alice@SecureFile2026` | Propriétaire du contrat signé et de la politique de sécurité |
| Bob | `bob@securefile.local` | `Bob@SecureFile2026!` | Destinataire du contrat partagé, propriétaire de la facture |

---

## 4. Parcours de démonstration conseillé

1. **Connexion** avec Alice — la clé privée est déverrouillée en mémoire pour la session.
2. **Fichiers** : déposer un fichier (PDF, DOCX, XLSX, image, TXT, MD, CSV), le signer, le
   partager avec Bob, ouvrir le panneau de détail (nonce, tag GCM, empreintes, signature),
   puis télécharger : l'intégrité est vérifiée avant l'envoi du moindre octet.
3. **Vérification** : sélectionner le contrat signé et lancer le contrôle. Les cinq contrôles
   (AES-GCM, SHA-256, HMAC, signature, certificat) doivent être verts. Déposer ensuite une
   copie locale modifiée pour voir la comparaison SHA-256 signaler « Copie modifiée ».
4. **Certificats** : consulter le certificat X.509 et son rapport de confiance, télécharger le
   PEM, puis démontrer successivement « Certificat expiré », « AC inconnue », « Révoquer (CRL) ».
   Terminer impérativement par **« Réémettre valide »** pour restaurer un état sain.
5. **Journal d'audit** : filtrer par domaine et résultat, déplier une entrée, puis
   **« Vérifier la chaîne »** : les empreintes recalculées doivent être identiques.
6. **Tests de sécurité** : lancer la campagne d'attaques depuis l'interface et vérifier
   **19/19 tests réussis**.
7. Se déconnecter, se connecter avec **Bob** : le contrat apparaît dans « Partagés avec moi »
   avec les badges Partagé / Signé / Vérifié ; sa vérification utilise le certificat d'Alice.

Démonstration de la force brute (optionnelle, compte de test uniquement) : cinq mots de passe
erronés consécutifs renvoient HTTP 423 et verrouillent le compte 15 minutes. Le verrouillage
est réinitialisé par le seed d'un compte de test ou par la campagne automatisée.

---

## 5. Choix cryptographiques

### Chiffrement des fichiers

- Clé AES-256 **aléatoire par fichier**, IV/nonce de 96 bits généré à chaque chiffrement.
- Chiffré et tag d'authentification stockés séparément en base ; le nom de stockage est
  aléatoire (`[a-f0-9]{32}.bin`) et le dossier de stockage est hors racine web.
- La clé de fichier n'est jamais stockée en clair : elle est **emballée par RSA-OAEP-SHA256**
  avec la clé publique de chaque destinataire (`keyWraps`).
- Révoquer un partage supprime la copie de clé du destinataire : il ne peut plus déchiffrer
  le document, même s'il conservait le chiffré (**révocation cryptographique**).

### Intégrité et signature

| Mécanisme | Rôle | Limite assumée |
| --- | --- | --- |
| SHA-256 au dépôt | Détecte toute modification du clair | Inutile si la référence en base est modifiée |
| HMAC-SHA-256 des métadonnées | Protège empreinte, nom, taille et propriétaire avec un secret serveur | Clé partagée, pas de non-répudiation |
| RSA-PSS 3072 sur `sha256:<hex>` | Preuve d'origine et de non-répudiation | Dépend de la protection de la clé privée et de la confiance dans l'AC |

À la signature, le serveur **recalcule** le SHA-256 à partir du fichier déchiffré et vérifie le
HMAC avant de signer : on ne signe jamais une valeur fournie par le client.

### Protection des clés privées utilisateur

- Paire RSA 3072 générée à l'inscription.
- Clé privée chiffrée au repos par une clé dérivée du mot de passe avec **scrypt**
  (`N=16384, r=8, p=1`), sel aléatoire, AES-256-GCM.
- Déchiffrée uniquement en mémoire au login, dans un coffre lié à l'identifiant de session ;
  un redémarrage du serveur vide ce coffre et impose une reconnexion.

### PKI locale

- AC racine RSA 3072 auto-signée, valide 5 ans, clé privée chiffrée par `CA_PASSPHRASE`.
- CSR généré côté serveur pour chaque compte, signé par l'AC locale, certificat valide 1 an.
- Contrôles : lisibilité PEM, signature par l'AC locale, période de validité, `digitalSignature`,
  non-révocation (CRL), correspondance email et clé publique.
- Modes de démonstration : `valid`, `expired`, `rogue` (AC inconnue), révocation CRL.
- La vérification d'un fichier utilise le certificat **enregistré au moment de la signature**
  (numéro de série), puis contrôle sa validité courante.

### Journal d'audit

Chaque entrée contient `prevHash` et `hash = SHA-256(prevHash | payload canonique)`. Les
écritures sont sérialisées ; la vérification recalcule toute la chaîne et signale la première
entrée incohérente. Les données sensibles (mots de passe, clés, contenus) ne sont jamais
journalisées.

---

## 6. Campagne OWASP (19 tests)

Exécution :

```bash
cd backend
npm run test:security
```

La campagne crée des comptes éphémères, rejoue les attaques puis supprime toutes ses données.
Elle journalise son résultat dans l'audit. Résultat attendu : **19/19 réussis**.

| Catégorie | Tests |
| --- | --- |
| Authentification | Politique de mot de passe, force brute (verrouillage 423), réutilisation de session après déconnexion |
| Injection | Injection NoSQL sur le login, XSS stocké dans un commentaire |
| Contrôle d'accès | IDOR sur le téléchargement, IDOR sur la suppression |
| Sessions | Requête mutante sans jeton CSRF |
| Téléversement | `.exe`, double extension, chemin `../`, dépassement de 10 Mo |
| Intégrité | Modification d'un octet du chiffré, empreinte modifiée en base, comparaison SHA-256 locale |
| Signature | Signature produite par un autre utilisateur |
| PKI | Certificat expiré, certificat émis par une AC inconnue |
| Configuration | En-têtes CSP, `nosniff`, anti-clickjacking |

Les tests « chemin relatif » et « nom de fichier » acceptent un résultat **neutralisé** : le nom
`../secret.pdf` devient `secret.pdf` et aucun chemin relatif n'est conservé.

En-têtes appliqués par Helmet : CSP restrictive, `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy: same-site`,
HSTS en production.

---

## 7. API principale

| Méthode | Route | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Santé de l'API |
| `GET` | `/api/auth/policy` | Politique de mot de passe |
| `POST` | `/api/auth/register` | Inscription + identité PKI |
| `POST` | `/api/auth/login` | Connexion, déverrouillage de la clé privée |
| `GET` | `/api/auth/me` | Session courante |
| `POST` | `/api/auth/logout` | Révocation serveur de la session |
| `GET` | `/api/files` | Fichiers possédés et partagés |
| `POST` | `/api/files` | Dépôt chiffré (multipart) |
| `GET` | `/api/files/:id/download` | Téléchargement vérifié (AES-GCM, SHA-256, HMAC) |
| `DELETE` | `/api/files/:id` | Suppression propriétaire |
| `POST` | `/api/files/:id/share` | Partage en lecture seule |
| `DELETE` | `/api/files/:id/share/:userId` | Révocation cryptographique du partage |
| `POST` | `/api/files/:id/sign` | Signature RSA-PSS |
| `GET` | `/api/files/:id/verify` | Vérification complète à trois niveaux |
| `POST` | `/api/files/:id/verify-local` | Comparaison d'une copie locale |
| `GET` | `/api/certificates/me` | Certificat actif et historique |
| `POST` | `/api/certificates/reissue` | Réémission (démo `valid`/`expired`/`rogue`) |
| `POST` | `/api/certificates/revoke` | Révocation et CRL |
| `GET` | `/api/audit` | Entrées filtrées et paginées |
| `GET` | `/api/audit/verify-chain` | Vérification de la chaîne |
| `GET` | `/api/security/overview` | Posture et contre-mesures |
| `POST` | `/api/security/campaign` | Campagne de 19 tests |
| `GET` | `/api/dashboard` | Vue d'ensemble |

Toutes les routes mutantes exigent `X-CSRF-Token`, en plus du cookie de session.

---

## 8. Scripts utiles

| Commande | Contexte | Effet |
| --- | --- | --- |
| `npm run dev` | backend | Démarre l'API avec `--watch` |
| `npm run start` | backend | Démarre l'API |
| `npm run seed` | backend | Crée / complète les données de démonstration |
| `npm run test:security` | backend | Rejoue la campagne OWASP en ligne de commande |
| `npm run dev` | frontend | Serveur Vite avec proxy `/api` |
| `npm run build` | frontend | Build de production dans `frontend/dist` |

Express sert automatiquement `frontend/dist` s'il existe (accès direct sur le port 5000). En
production, servir l'application derrière **HTTPS** : le cookie de session est alors marqué
`Secure` et HSTS est activé.

---

## 9. Dépannage

- **Tableau de bord « Erreur interne du serveur » juste après la connexion** : dans la majorité
  des cas, `CA_PASSPHRASE` dans `backend/.env` ne correspond plus à `backend/pki/ca.key.enc`
  (fichier `.env` recréé avec `change-me` ou une autre valeur). L'API répond désormais
  `503 CA_KEY_LOCKED` avec un message explicite. Rétablir le mot de passe d'origine et
  redémarrer. Si vous l'avez perdu : arrêter le serveur, supprimer `backend/pki/ca.crt.pem` et
  `backend/pki/ca.key.enc`, repartir d'une base vide (`users`, `files`, `shares`, `certificates`,
  `auditlogs`, `sessions`) puis relancer `npm run seed` : une nouvelle AC et de nouveaux
  certificats sont créés.
- **Vérification d'un ancien fichier : « HMAC invalide »** : `HMAC_KEY` a changé depuis le dépôt
  du fichier. Rétablir la valeur d'origine, ou réimporter les fichiers après rotation.
- **`EADDRINUSE :::5000`** : une instance de l'API tourne déjà. La réutiliser ou arrêter le
  processus avant de relancer.
- **« Votre clé privée n'est plus déverrouillée »** : le serveur a redémarré et le coffre
  mémoire est vide. Se déconnecter puis se reconnecter.
- **Erreur Atlas `tlsv1 alert internal error`** : incident réseau transitoire du cluster.
  Réessayer l'action ; aucune donnée n'est corrompue.
- **Le certificat a été réémis en mode démonstration** : terminer par « Réémettre valide ».
  Les fichiers déjà signés restent vérifiables avec le certificat enregistré à leur signature.

---

## 10. Limites et cadre pédagogique

- Projet **local et pédagogique** avec des **données fictives** ; pas destiné à la production.
- MongoDB Atlas est le seul service externe ; le stockage des chiffrés et la PKI restent locaux.
- Le coffre de clés privées est en mémoire : pas de partage multi-instances, reconnexion après
  redémarrage.
- Pas d'envoi d'email, pas de réinitialisation de mot de passe, pas de double facteur.
- La révocation d'un certificat est locale (CRL applicative), sans distribution publique.
- La version vulnérable `securefile-v1` sert uniquement de témoin pour l'audit avant / après.

---

Projet GLSI_3 — Sécurité de l'information et Web · binôme · usage local.
#   s e c u r e f i l e  
 