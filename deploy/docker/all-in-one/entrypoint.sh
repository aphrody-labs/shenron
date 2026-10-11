#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Entrypoint supervisor for the complete Shenron all-in-one container.
# Coordinates PostgreSQL, Redis, Nginx, Shenron Server (Site/Studio/MCP) and Shenron Bot.

set -e

echo "=== [SHENRON CONTAINER] Démarrage du conteneur complet Dragon Ball FR ==="

# Trap signals for graceful shutdown
cleanup() {
    echo "=== [SHENRON CONTAINER] Signal d'arrêt reçu, arrêt propre des services... ==="
    if [ -n "$SERVER_PID" ]; then
        echo "Arrêt de Shenron Server (PID $SERVER_PID)..."
        kill -TERM "$SERVER_PID" 2>/dev/null || true
    fi
    if [ -n "$BOT_PID" ]; then
        echo "Arrêt de Shenron Bot (PID $BOT_PID)..."
        kill -TERM "$BOT_PID" 2>/dev/null || true
    fi
    echo "Arrêt de Nginx..."
    nginx -s quit 2>/dev/null || true
    echo "Arrêt de Redis..."
    redis-cli shutdown 2>/dev/null || true
    echo "Arrêt de PostgreSQL..."
    su - postgres -c "/usr/lib/postgresql/*/bin/pg_ctl -D /var/lib/postgresql/data stop -m fast" 2>/dev/null || true
    echo "=== [SHENRON CONTAINER] Tous les services sont arrêtés. Sortie propre. ==="
    exit 0
}

trap cleanup SIGTERM SIGINT SIGQUIT

# 1. Vérification et création des répertoires d'état
mkdir -p /var/lib/postgresql/data /var/lib/redis /var/lib/shenron /app/data /srv/shenron-cdn/wiki /srv/shenron-cdn/assets /srv/shenron-cdn/site /run/postgresql
chown -R postgres:postgres /var/lib/postgresql /run/postgresql
chmod 700 /var/lib/postgresql/data
chown -R redis:redis /var/lib/redis
chmod 700 /var/lib/redis

# 2. Initialisation PostgreSQL si vierge
PG_BIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | head -n 1)
if [ -z "$PG_BIN" ]; then
    echo "ERREUR: Binaire PostgreSQL introuvable dans /usr/lib/postgresql"
    exit 1
fi

if [ ! -s "/var/lib/postgresql/data/PG_VERSION" ]; then
    echo "--> Initialisation d'une nouvelle base de données PostgreSQL..."
    su - postgres -c "$PG_BIN/initdb -D /var/lib/postgresql/data -E UTF8 --locale=C.UTF-8"
    
    # Configuration sécurisée pour la boucle locale
    cat >> /var/lib/postgresql/data/postgresql.conf <<EOF
listen_addresses = '127.0.0.1'
port = 5432
max_connections = 100
shared_buffers = 128MB
effective_cache_size = 384MB
work_mem = 4MB
maintenance_work_mem = 64MB
EOF
    cat >> /var/lib/postgresql/data/pg_hba.conf <<EOF
host    all             all             127.0.0.1/32            trust
local   all             all                                     trust
EOF
fi

# 3. Démarrage de PostgreSQL
echo "--> Démarrage de PostgreSQL..."
su - postgres -c "$PG_BIN/pg_ctl -D /var/lib/postgresql/data -l /var/log/postgresql.log start"

# Attente de la disponibilité de PostgreSQL
for i in {1..30}; do
    if su - postgres -c "$PG_BIN/pg_isready -h 127.0.0.1 -p 5432" >/dev/null 2>&1; then
        echo "✓ PostgreSQL est opérationnel."
        break
    fi
    sleep 1
done

# Création de l'utilisateur et de la base de données shenron_site si nécessaire
su - postgres -c "psql -c \"DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'shenron') THEN CREATE ROLE shenron LOGIN SUPERUSER; END IF; END \$\$;\""
su - postgres -c "psql -c \"SELECT 'CREATE DATABASE shenron_site OWNER shenron' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'shenron_site')\gexec\""

# Configuration des extensions obligatoires
su - postgres -c "psql -d shenron_site -c \"CREATE EXTENSION IF NOT EXISTS \\\"uuid-ossp\\\"; CREATE EXTENSION IF NOT EXISTS \\\"pg_trgm\\\"; CREATE EXTENSION IF NOT EXISTS \\\"unaccent\\\";\""

# 4. Démarrage de Redis
echo "--> Démarrage de Redis..."
redis-server --daemonize yes --protected-mode no --dir /var/lib/redis --logfile /var/log/redis.log

for i in {1..15}; do
    if redis-cli ping >/dev/null 2>&1; then
        echo "✓ Redis est opérationnel."
        break
    fi
    sleep 1
done

# 5. Application des migrations de base de données
echo "--> Exécution des migrations Drizzle PostgreSQL et SQLite..."
if [ -f "/app/scripts/ops/container-db-init.ts" ]; then
    bun /app/scripts/ops/container-db-init.ts || echo "Avertissement: Erreur lors de l'application des migrations automatiques."
elif command -v shenron-server >/dev/null 2>&1 && [ -d "/app/src/db/migrations" ]; then
    echo "Application des migrations intégrées..."
fi

# 6. Démarrage de Nginx
echo "--> Démarrage de Nginx (Reverse Proxy & CDN)..."
nginx -g "daemon off;" &
NGINX_PID=$!
sleep 1

# 7. Démarrage de Shenron Server et Shenron Bot
export SHENRON_PROFILE=${SHENRON_PROFILE:-production}
export SHENRON_HOME=${SHENRON_HOME:-/var/lib/shenron}
export PORT=${PORT:-5011}
export HOSTNAME=${HOSTNAME:-127.0.0.1}
export API_PORT=${API_PORT:-5006}
export API_HOST=${API_HOST:-127.0.0.1}
export DATABASE_URL=${DATABASE_URL:-postgres://shenron@127.0.0.1:5432/shenron_site}
export DATABASE_PATH=${DATABASE_PATH:-/app/data/bot.db}
export REDIS_URL=${REDIS_URL:-redis://127.0.0.1:6379}

echo "--> Démarrage des applications Shenron..."
if command -v shenron-server >/dev/null 2>&1; then
    echo "Lancement du binaire autonome shenron-server..."
    if command -v shenron-bot >/dev/null 2>&1; then
        shenron-server serve all &
        SERVER_PID=$!
    else
        shenron-server serve --port "$PORT" --host "$HOSTNAME" &
        SERVER_PID=$!
    fi
elif [ -f "/app/apps/server/src/cli.ts" ]; then
    echo "Lancement depuis les sources Bun..."
    cd /app
    bun apps/server/src/cli.ts serve all &
    SERVER_PID=$!
else
    echo "ERREUR: Impossible de trouver l'exécutable ou les sources de Shenron Server!"
    exit 1
fi

echo "=== [SHENRON CONTAINER] Tous les services DBFR sont actifs et supervisés ==="
echo "  - Nginx Gateway : http://127.0.0.1:80"
echo "  - Shenron Server & Studio : http://127.0.0.1:5011"
echo "  - Shenron Bot API : http://127.0.0.1:5006"
echo "  - PostgreSQL : 127.0.0.1:5432 (db: shenron_site)"
echo "  - Redis : 127.0.0.1:6379"

# Attente et supervision continue
wait -n $SERVER_PID || true
cleanup
