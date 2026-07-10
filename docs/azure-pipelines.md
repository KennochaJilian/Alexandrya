# Azure Pipelines self-hosted + Docker Hub

## Prerequis VPS

- Agent Azure Pipelines installe en service avec l'utilisateur `azagent`.
- `azagent` appartient au groupe `docker`.
- Le pool Azure s'appelle `vps-alexandrya`.
- Docker est installe sur le VPS.

Verifier cote VPS :

```bash
sudo -iu azagent docker ps
sudo systemctl status vsts.agent.* --no-pager
```

## Service connection Docker Hub

Dans Azure DevOps :

```text
Project settings
-> Service connections
-> New service connection
-> Docker Registry
-> Docker Hub
```

Nom conseille :

```text
dockerhub-alexandrya
```

Utiliser un access token Docker Hub plutot que ton mot de passe.

Le nom `dockerhub-alexandrya` doit correspondre a la variable du fichier `azure-pipelines.yml` :

```yaml
dockerRegistryServiceConnection: 'dockerhub-alexandrya'
```

## Repository Docker Hub

Creer un repository Docker Hub, par exemple :

```text
ton-compte-dockerhub/alexandrya-api
```

Puis remplacer dans `azure-pipelines.yml` :

```yaml
dockerRepository: 'YOUR_DOCKERHUB_USERNAME/alexandrya-api'
```

par :

```yaml
dockerRepository: 'ton-compte-dockerhub/alexandrya-api'
```

Le pipeline pousse deux tags :

- `latest`
- le SHA Git complet du commit

Dans Portainer, la stack peut utiliser :

```env
ALEXANDRYA_API_IMAGE=ton-compte-dockerhub/alexandrya-api:latest
```

## Creation du pipeline Azure

Dans Azure DevOps :

```text
Pipelines
-> New pipeline
-> Azure Repos Git ou GitHub
-> Existing Azure Pipelines YAML file
-> /azure-pipelines.yml
```

Le pipeline utilise :

```yaml
pool:
  name: vps-alexandrya
```

Il ne consomme donc pas d'agent Microsoft-hosted.

## Deploiement du front Apache

Par defaut, le pipeline publie le front en artifact Azure DevOps et ne copie pas automatiquement vers Apache :

```yaml
deployFrontendToApache: 'false'
```

Pour autoriser le deploiement automatique sur le VPS :

```bash
sudo mkdir -p /var/www/alexandrya
sudo chown -R azagent:www-data /var/www/alexandrya
sudo chmod -R 775 /var/www/alexandrya
```

Puis passer dans `azure-pipelines.yml` :

```yaml
deployFrontendToApache: 'true'
```

Le deploiement front automatique ne tourne que sur `main`.

## Portainer apres le push Docker Hub

Le push Docker Hub ne force pas Portainer a redemarrer automatiquement.

Premiere version simple :

1. Le pipeline pousse `ton-compte-dockerhub/alexandrya-api:latest`.
2. Dans Portainer, cliquer sur `Pull and redeploy` dans la stack Alexandrya.

Version suivante possible :

- webhook Portainer ;
- ou Watchtower limite au container API ;
- ou deploiement par script depuis l'agent self-hosted.

## Securite

L'agent `azagent` a acces a Docker, donc son pouvoir est proche de root sur le VPS.

Bonnes pratiques :

- reserver le pool `vps-alexandrya` au projet Alexandrya ;
- proteger la branche `main` ;
- ne pas stocker de secrets dans le YAML ;
- utiliser des service connections Azure DevOps ;
- utiliser un access token Docker Hub limite au repository.
