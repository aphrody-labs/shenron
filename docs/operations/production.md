# Production (`ssh prod`)

Etat verifie et consolide le 2026-11-08 sur l'infrastructure souveraine YOLO.

## 1. Topologie de la Triade (`vps` / `cdn` / `prod`)

| Hote SSH | IP WireGuard / IP Publique | Systeme | Role pour Shenron |
|---|---|---|---|
| **`prod`** | `10.200.77.5` / `72.60.186.43` | Arch Linux `7.2.11-arch1-1` (Btrfs 400 Go, 203 Go libres) | **Production Active** : Porte l'ensemble des conteneurs Shenron (`dragonballfr.com`), PostgreSQL, Redis et les modeles IA locaux sous `/srv/shenron`. |
| **`vps`** | `10.200.77.1` / `51.77.147.152` | Ubuntu `7.3.0-9-generic` (12 coeurs, 45 Go RAM) | **Build Hub & Mesh Coordinator** : Compilation des images Docker et binaires Rust/Bun, execution des pipelines OCR/RAG, hub WireGuard. |
| **`cdn`** *(alias `bunos`)* | `10.200.77.3` / `51.255.162.6` | Ubuntu `7.3.0-9-generic` (6 coeurs) | **Simulateur Cloudflare Edge & Miroir** : Execute Pingora (`yolo-cf-gateway`), Garage S3 (`yolo-cf-garage` R2), RQLite (`yolo-cf-rqlite` D1) et `workerd` (`yolo-cf-workerd`). |

## 2. Services Actifs sur `prod` (`/srv/shenron`)

Tous les conteneurs tournent avec le statut `healthy` :
- `shenron-gateway` : Reverse proxy Nginx routant le trafic public et interne.
- `shenron-site` : Portail web Next.js 16.5+ standalone sur Bun (`localhost/shenron:<sha>`).
- `shenron-bot` : Bot Discord communautaire et worker d'indexation Redis (`localhost/shenron:<sha>`).
- `shenron-chat` : Serveur d'inference locale `llama-server` (`127.0.0.1:8799`).
- `shenron-compute` : Serveur MCP HTTP (`aphrody-mcp`).
- `shenron-embed` : Serveur d'embeddings vectoriels `e5-small`.
- `shenron-postgres` : PostgreSQL 18 (`pgvector`), base `shenron_site`, schemas `public` et `bot`.
- `shenron-redis` : Cache haute vitesse et files d'indexation temps reel.
- `shenron-cloudflared` : Connecteur Cloudflare Tunnel Zero-Trust.
- `yolo-app-server` : Serveur applicatif YOLO (`127.0.0.1:1338`).

## 3. Stockage et Hygiene Disque sur `prod`

Le nettoyage profond du 2026-11-08 a libere **+116 Go** sur `/` (occupation reduite de 78% a 49%, soit **203 Go disponibles**) :
- Seule la release active (`/srv/shenron/current`) est conservee dans `/srv/shenron/releases`.
- Les modeles actifs sont sanctuarises dans `/srv/shenron/models` (`3.0 Go`) et `/var/lib/yolo-prod-cache/models`.
- Les sauvegardes automatiques chiffrees sont conservees dans `/srv/offsite/vps/auto-sauvegardes` avec une retention glissante de 7 jours.

## 4. Variables d'Environnement (Noms Uniquement)

- Deploiement : `SHENRON_IMAGE_TAG`, `SHENRON_REVISION`, `SHENRON_DEPLOY_TARGET`, `SHENRON_DEPLOY_COMMAND`, `SHENRON_COMPOSE_FILE`.
- Administration : `SHENRON_API_ADMIN_TOKEN`, `DBFR_TOKEN`.
- Controle databooks : `DATABOOKS_FREEZE_FILE`.

## 5. Reseau WireGuard

Le maillage prive `10.200.77.0/24` relie `vps` (`10.200.77.1`), `cdn` (`10.200.77.3`) et `prod` (`10.200.77.5`) sur le port UDP `51821` / `52244` avec `PersistentKeepalive = 25`.
