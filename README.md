# SecureFile V2

**Coffre-fort documentaire chiffré**

SecureFile V2 est une application web qui permet de stocker, partager, signer et vérifier des documents en toute sécurité. Chaque fichier est chiffré avant d'être enregistré, et chaque action est tracée.

> Projet académique **GLSI_3 — Sécurité de l'information et Web**. Démonstrateur pédagogique avec des données fictives, non destiné à des documents sensibles réels.

## Ce que fait l'application

| Fonction | Explication |
| --- | --- |
| **Compte sécurisé** | Votre mot de passe n'est jamais stocké en clair. Après 5 échecs de connexion, le compte est verrouillé temporairement. |
| **Dépôt de fichiers** | Chaque fichier est chiffré avec sa propre clé avant d'être écrit sur le disque. |
| **Partage** | Vous partagez un document en lecture seule avec un autre utilisateur. Vous pouvez retirer l'accès à tout moment. |
| **Signature** | Le propriétaire signe un document pour prouver qu'il en est l'auteur. |
| **Vérification** | L'application contrôle que le fichier n'a jamais été modifié ni falsifié. |
| **Certificats** | Chaque utilisateur reçoit un certificat numérique qui prouve son identité. |
| **Journal d'audit** | Toutes les actions importantes sont enregistrées et ne peuvent pas être modifiées en secret. |
| **Tests de sécurité** | L'application rejoue 19 attaques courantes pour montrer qu'elle y résiste. |

## Comment ça marche

### 1. Connexion
Vous vous connectez avec votre email et votre mot de passe. Votre session expire après 45 minutes d'inactivité ou 8 heures au total.

### 2. Dépôt d'un fichier
Formats acceptés : PDF, DOCX, XLSX, PNG, JPG, TXT, MD, CSV (10 Mo maximum). Le fichier est vérifié, puis chiffré avec une clé unique avant d'être enregistré.

### 3. Partage et révocation
Quand vous partagez un document, le destinataire reçoit sa propre copie protégée de la clé de déchiffrement. En **révoquant** l'accès, cette copie est supprimée : même avec le fichier chiffré, il ne peut plus l'ouvrir.

### 4. Signature
Avant de signer, le serveur recalcule lui-même l'empreinte du document, sans faire confiance au navigateur. La signature prouve ensuite que le document vient bien de son propriétaire et n'a pas changé depuis.

### 5. Vérification
Cinq contrôles sont effectués :

| Contrôle | Ce qu'il prouve |
| --- | --- |
| Chiffrement | Le fichier stocké n'a pas été altéré |
| Empreinte SHA-256 | Le contenu est identique à celui déposé |
| HMAC | Les informations en base de données n'ont pas été falsifiées |
| Signature | La signature provient bien du titulaire du certificat |
| Certificat | Le certificat est valide, reconnu et non révoqué |

Vous pouvez aussi comparer une copie locale d'un fichier avec l'original : si elle a été modifiée, l'application le détecte.

### 6. Certificats
Une autorité de certification locale délivre des certificats valables un an. L'application permet de simuler des cas problématiques (certificat expiré, autorité inconnue, certificat révoqué) pour montrer comment ils sont refusés.

### 7. Journal d'audit
Chaque entrée du journal est liée à la précédente par une empreinte. Modifier une ancienne entrée casse toute la chaîne, ce qui rend la falsification immédiatement visible.

### 8. Tests de sécurité
En un clic, l'application crée des comptes temporaires, rejoue 19 attaques (accès à un fichier d'autrui, fichier modifié, signature forgée, certificat invalide, etc.), affiche le résultat de chacune, puis supprime ses données de test.

## Mesures de protection

- Mots de passe protégés par bcrypt
- Sessions en cookie sécurisé `HttpOnly`, révocables côté serveur
- Protection contre les attaques CSRF
- Limitation du nombre de requêtes
- Validation et nettoyage de toutes les entrées
- En-têtes de sécurité HTTP (Helmet)

## Technologies

MongoDB · Express · React · Node.js

## Limites

Ce projet illustre des mécanismes de sécurité réels, mais n'est pas prêt pour la production. Un usage professionnel nécessiterait notamment HTTPS, une gestion dédiée des secrets et des clés, une authentification multifacteur, des sauvegardes et la conformité RGPD.

## Crédits

Projet **GLSI_3 — Sécurité de l'information et Web** · binôme · 2026.