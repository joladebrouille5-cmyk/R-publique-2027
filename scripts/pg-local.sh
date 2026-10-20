#!/usr/bin/env bash
# PostgreSQL local de développement SANS Docker (Linux / macOS).
# Données dans .local/postgres (ignoré par Git), écoute uniquement sur localhost.
# Authentification « trust » : réservé au développement sur sa propre machine.
#
#   scripts/pg-local.sh start   # initialise si besoin, démarre, crée r2027 et r2027_test
#   scripts/pg-local.sh stop
#   scripts/pg-local.sh status
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="${PG_LOCAL_DIR:-$ROOT/.local/postgres}"
PORT="${PG_LOCAL_PORT:-5432}"
PGBIN="${PGBIN:-$( (pg_config --bindir 2>/dev/null) || true)}"
if [ ! -x "$PGBIN/initdb" ]; then
  for candidate in /usr/lib/postgresql/*/bin /opt/homebrew/opt/postgresql@*/bin /usr/local/opt/postgresql@*/bin; do
    if [ -x "$candidate/initdb" ]; then PGBIN="$candidate"; fi
  done
fi
[ -x "$PGBIN/initdb" ] || { echo "PostgreSQL introuvable : définir PGBIN (dossier contenant initdb)." >&2; exit 1; }

# PostgreSQL refuse de tourner sous root : on délègue alors à l'utilisateur « postgres ».
run() {
  if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi
}

case "${1:-start}" in
  start)
    if [ ! -f "$DATA/PG_VERSION" ]; then
      mkdir -p "$DATA"
      [ "$(id -u)" = 0 ] && chown -R postgres "$(dirname "$DATA")"
      run "$PGBIN/initdb" -D "$DATA" -U postgres --auth=trust --encoding=UTF8 --locale=C >/dev/null
      echo "Base initialisée dans $DATA"
    fi
    if ! run "$PGBIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1; then
      run "$PGBIN/pg_ctl" -D "$DATA" -w -l "$DATA/server.log" \
        -o "-p $PORT -c listen_addresses=localhost -k $DATA" start >/dev/null
    fi
    for db in r2027 r2027_test; do
      if ! run "$PGBIN/psql" -h localhost -p "$PORT" -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1; then
        run "$PGBIN/createdb" -h localhost -p "$PORT" -U postgres "$db"
        echo "Base $db créée"
      fi
    done
    echo "PostgreSQL prêt : postgresql://postgres@localhost:$PORT/r2027"
    ;;
  stop)
    run "$PGBIN/pg_ctl" -D "$DATA" -w stop
    ;;
  status)
    run "$PGBIN/pg_ctl" -D "$DATA" status
    ;;
  *)
    echo "Usage : $0 start|stop|status" >&2
    exit 1
    ;;
esac
