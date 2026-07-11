# Deploiement Alexandrya

## Cible de production

- Apache sert le front Angular statique.
- Apache proxyfie `/api` et `/covers` vers l'API Docker locale.
- Docker/Portainer orchestre uniquement l'API, Mongo et Typesense.
- Mongo et Typesense ne publient aucun port public.
- L'API publie seulement `127.0.0.1:4000`, accessible par Apache sur le VPS.
- Les livres sont stockes dans `/srv/alexandrya/library`, monte en lecture-ecriture dans l'API pour permettre l'upload admin.

## Image API

Construire l'image localement :

```bash
npm run docker:build:api
```

Construire avec un tag de registry :

```bash
docker build -f backend/Dockerfile -t registry.example.com/alexandrya-api:latest .
docker push registry.example.com/alexandrya-api:latest
```

Le `Dockerfile` est multi-stage :

- installation des dependances de build ;
- compilation TypeScript ;
- installation des seules dependances de production ;
- execution avec un utilisateur non-root.

## Stack Portainer

Utiliser `deploy/compose.portainer.yaml` comme stack Portainer.

Variables minimales a renseigner dans Portainer :

```env
ALEXANDRYA_API_IMAGE=registry.example.com/alexandrya-api:latest
CORS_ORIGIN=https://alexandrya.aquarius.irish
JWT_SECRET=long-secret
TYPESENSE_API_KEY=long-typesense-secret
ALEXANDRYA_LIBRARY_PATH=/srv/alexandrya/library
```

Creer le dossier des livres sur le VPS :

```bash
sudo mkdir -p /srv/alexandrya/library
sudo chown -R $USER:www-data /srv/alexandrya
sudo chmod -R 775 /srv/alexandrya
```

Si l'upload admin est active, verifier que l'utilisateur du container API peut aussi ecrire dans ce dossier. En cas d'erreur `EACCES` dans les logs API, ajouter une ACL host pour l'UID du container ou adapter le proprietaire du dossier.

Variables d'upload :

```env
EBOOK_UPLOAD_SUBDIRECTORY=Uploads
UPLOAD_MAX_FILES=10
UPLOAD_MAX_FILE_SIZE_MB=80
```

## Front Angular via Apache

Build de production :

```bash
npm run build --workspace frontend
```

Copier le contenu de `frontend/dist/frontend/browser` vers :

```text
/var/www/alexandrya
```

Exemple de vhost :

```text
deploy/apache/alexandrya.conf
```

Le build Angular de production utilise `/api` comme URL d'API. En local, `environment.ts` continue d'utiliser `http://localhost:4000/api`.

## Premier demarrage

Quand la stack est lancee :

```bash
curl http://127.0.0.1:4000/health
```

Puis creer le premier utilisateur admin depuis le container API :

```bash
docker exec -it alexandrya-api node dist/cli/seed-user.js "admin@example.com" "mot-de-passe-solide" "Admin" "" admin
```

Scanner la bibliotheque depuis le container API :

```bash
docker exec -it alexandrya-api node dist/cli/rescan-library.js
```

Synchroniser Typesense :

```bash
docker exec -it alexandrya-api node dist/cli/sync-search.js
```

## Logs et debug

Les logs API sont emis en JSON dans stdout Docker :

```bash
docker logs -f alexandrya-api
```

Variables utiles dans Portainer :

```env
LOG_LEVEL=info
LIBRARY_SCAN_CONCURRENCY=4
COVER_LOOKUP_TIMEOUT_MS=4500
```

Pour diagnostiquer un scan plus finement, passer temporairement :

```env
LOG_LEVEL=debug
```

Puis redeployer la stack. Les appels externes Google Books/OpenLibrary sont journalises avec leur fournisseur, duree, statut HTTP et erreur eventuelle. Les cles Google Books sont masquees dans les logs.

## Azure Pipelines plus tard

Le pipeline Azure self-hosted est documente ici :

```text
docs/azure-pipelines.md
```

Il peut :

1. recuperer le code ;
2. lancer `npm ci` ;
3. lancer `npm run build` et les tests ;
4. construire l'image avec `docker build -f backend/Dockerfile ...` ;
5. pousser l'image API sur Docker Hub ;
6. publier le front comme artifact ;
7. optionnellement copier le front vers Apache sur le VPS.

Un agent Azure self-hosted sur le VPS peut faire ce travail, mais son acces au groupe `docker` equivaut presque a des droits root. Il faut donc le limiter a un utilisateur dedie et a un projet de confiance.
