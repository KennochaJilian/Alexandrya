# Alexandrya

Application mobile-first pour gerer une bibliotheque d'ebooks stockee dans un dossier OneDrive local synchronise.

## Stack

- Frontend: Angular 21
- Backend: Node.js, Express, TypeScript
- Authentification: email + mot de passe, sans inscription publique
- Stockage: MongoDB avec collections `users`, `books`, `authors`, `genres`
- Recherche: Typesense optionnel, avec fallback MongoDB
- Import: scan du dossier `EBOOK_ROOT` et upsert des livres en base
- Envoi Kindle: email SMTP vers l'adresse `@kindle.com` de l'utilisateur

## Demarrage

Lancer l'infra locale avant l'API:

```bash
npm run infra:up
```

Si tu avais deja lance MongoDB ou Typesense a la main avec `docker run`, supprimer d'abord les anciens conteneurs:

```bash
docker rm -f alexandrya-mongo alexandrya-typesense
```

Cette commande demarre:

- MongoDB sur `localhost:27017`
- Typesense sur `localhost:8108`

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
COVER_LOOKUP_ENABLED=true
GOOGLE_BOOKS_API_KEY=
TYPESENSE_ENABLED=true
TYPESENSE_API_KEY=xyz
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

## Recherche Typesense

Typesense est optionnel. Si `TYPESENSE_ENABLED=false`, ou si le serveur n'est pas joignable, l'API garde la recherche MongoDB existante.
Avec `npm run infra:up`, Typesense est lance avec la cle locale `xyz`; `backend/.env` doit donc garder `TYPESENSE_API_KEY=xyz`, ou utiliser la meme valeur que ton environnement Docker.

Pour l'activer:

```env
TYPESENSE_ENABLED=true
TYPESENSE_HOST=127.0.0.1
TYPESENSE_PORT=8108
TYPESENSE_PROTOCOL=http
TYPESENSE_API_KEY=xyz
TYPESENSE_COLLECTION=books
```

Le rescan indexe les livres dans Typesense apres l'import MongoDB:

```bash
npm run library:rescan --workspace backend
```

Pour reconstruire seulement l'index de recherche depuis MongoDB:

```bash
npm run search:sync --workspace backend
```

## Couvertures

Pendant le scan, le backend tente de trouver une couverture en ligne:

1. Couverture embarquee dans l'EPUB, stockee dans `backend/data/covers`
2. Google Books API, via `volumes?q=...`
3. Open Library Search + Covers API en fallback

`GOOGLE_BOOKS_API_KEY` est optionnelle pour les donnees publiques, mais recommandee pour les quotas et le suivi.
Si tu veux des scans totalement hors ligne, regler `COVER_LOOKUP_ENABLED=false`; les couvertures embarquees dans les EPUB seront quand meme recuperees.

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
npm run infra:up
npm run infra:down
npm run infra:logs
npm test --workspace frontend -- --watch=false
npm run seed:user --workspace backend -- email@example.com "mot-de-passe" "Nom" email@kindle.com
npm run library:rescan --workspace backend
npm run search:sync --workspace backend
```
