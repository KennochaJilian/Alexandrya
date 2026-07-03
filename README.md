# Alexandrya

Application mobile-first pour gerer une bibliotheque d'ebooks stockee dans un dossier OneDrive local synchronise.

## Stack

- Frontend: Angular 21
- Backend: Node.js, Express, TypeScript
- Authentification: email + mot de passe, sans inscription publique
- Stockage MVP: scan du dossier `EBOOK_ROOT` + enrichissement optionnel via `backend/data/books.json`
- Envoi Kindle: email SMTP vers l'adresse `@kindle.com` de l'utilisateur

## Demarrage

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
JWT_SECRET=une-valeur-longue-et-aleatoire
USERS_FILE=./data/users.json
METADATA_PATH=./data/books.json
```

Si `backend/data/users.json` n'existe pas, l'API cree un utilisateur de dev:

- Email: `admin@local.test`
- Mot de passe: `dev-password`

Pour une configuration reelle, copier `backend/data/users.example.json` vers `backend/data/users.json`.
Un utilisateur peut avoir un `password` en clair pour le developpement local, ou un `passwordHash` bcrypt.

Generer un hash:

```bash
npm run hash-password --workspace backend -- "votre-mot-de-passe"
```

## Metadonnees livres

Le backend scanne les fichiers `.azw`, `.azw3`, `.epub`, `.mobi`, `.pdf` et `.txt` dans `EBOOK_ROOT`.
Sans metadonnees, le titre est infere depuis le nom du fichier.

Pour enrichir la recherche et le detail, copier `backend/data/books.example.json` vers `backend/data/books.json`.
Le champ `relativePath` doit correspondre au chemin relatif depuis `EBOOK_ROOT`.

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
Chaque utilisateur doit avoir un `kindleEmail` dans `backend/data/users.json`.

## Commandes utiles

```bash
npm run build
npm test --workspace frontend -- --watch=false
```
