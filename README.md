# Alexandrya

Application mobile-first pour gerer une bibliotheque d'ebooks stockee dans un dossier OneDrive local synchronise.

## Stack

- Frontend: Angular 21
- Backend: Node.js, Express, TypeScript
- Authentification: email + mot de passe, sans inscription publique
- Stockage: MongoDB avec collections `users`, `books`, `authors`, `genres`
- Import: scan du dossier `EBOOK_ROOT` et upsert des livres en base
- Envoi Kindle: email SMTP vers l'adresse `@kindle.com` de l'utilisateur

## Demarrage

Lancer MongoDB localement avant l'API. Exemple avec Docker:

```bash
docker run --name alexandrya-mongo -p 27017:27017 -d mongo:7
```

```bash
npm install
npm run dev
```

URLs locales:

- Frontend: http://localhost:4200
- API: http://localhost:4000

## Configuration backend

Copier `backend/.env.example` vers `backend/.env`, puis ajuster:

```env
EBOOK_ROOT=C:\Users\you\OneDrive\Ebooks
EBOOK_FILENAME_PATTERN=title-author
JWT_SECRET=une-valeur-longue-et-aleatoire
MONGO_URI=mongodb://127.0.0.1:27017/alexandrya
MONGO_DB_NAME=alexandrya
```

## Utilisateurs

Il n'y a pas d'inscription publique. Les utilisateurs sont crees par script:

```bash
npm run seed:user --workspace backend -- admin@local.test "dev-password" "Admin" admin_123@kindle.com
```

Le mot de passe est stocke en hash bcrypt dans MongoDB.

## Collections MongoDB

- `users`: comptes autorises, email, hash de mot de passe, adresse Kindle optionnelle
- `authors`: auteurs deduplices par slug
- `genres`: genres deduplices par slug
- `books`: livres indexes par chemin relatif, avec references vers auteurs et genres

## Import des livres

```bash
npm run library:rescan --workspace backend
```

Le backend scanne les fichiers `.azw`, `.azw3`, `.epub`, `.mobi`, `.pdf` et `.txt` dans `EBOOK_ROOT`.
Sans metadonnees externes, le titre, l'auteur et l'annee sont inferes depuis le nom du fichier.
Par defaut, le format attendu est `Titre - Auteur (2020).epub`.
Si ta source est en `Auteur - Titre (2020).epub`, regler `EBOOK_FILENAME_PATTERN=author-title`.

Depuis l'interface, le bouton `Rescanner` appelle aussi l'import.

## Envoi vers Kindle

Configurer les variables SMTP dans `backend/.env`:

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=mailer@example.com
SMTP_PASS=...
MAIL_FROM=mailer@example.com
```

Important: l'adresse `MAIL_FROM` doit etre approuvee dans les preferences Amazon Kindle du destinataire.
Chaque utilisateur doit avoir un `kindleEmail` en base.

## Commandes utiles

```bash
npm run build
npm test --workspace frontend -- --watch=false
npm run seed:user --workspace backend -- email@example.com "mot-de-passe" "Nom" email@kindle.com
npm run library:rescan --workspace backend
```
