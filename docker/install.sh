#!/bin/sh

set -eu
set +x
umask 077

deployment_dir=.
admin_email=admin@local
host_port=8080
mina_image=ghcr.io/mishamsk/mina:main
source_ref=${MINA_INSTALL_SOURCE_REF:-main}
artifact_base_url=${MINA_INSTALL_ARTIFACT_BASE_URL:-}
source_sha=${MINA_INSTALL_SOURCE_SHA:-}
skip_pull=${MINA_INSTALL_SKIP_PULL:-false}
target_created=false
install_started=false
success=false
stage_dir=
project_name=
database_encryption_key=
initial_admin_password=

usage() {
    cat <<'EOF'
Usage: install.sh [--dir DIRECTORY] [--email ADDRESS] [--port PORT] [--image IMAGE]

Provision a new authenticated and encrypted Mina Docker Compose deployment.

Options:
  --dir DIRECTORY  Empty deployment directory to use (default: current directory)
  --email ADDRESS  Initial administrator email (default: admin@local)
  --port PORT      Localhost port to publish (default: 8080)
  --image IMAGE    Mina image to deploy (default: ghcr.io/mishamsk/mina:main)
  -h, --help       Show this help
EOF
}

die() {
    printf 'mina installer: %s\n' "$*" >&2
    exit 1
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

directory_is_empty() {
    for entry in "$1"/* "$1"/.[!.]* "$1"/..?*; do
        if [ -e "$entry" ] || [ -L "$entry" ]; then
            return 1
        fi
    done
    return 0
}

compose() {
    (
        cd "$deployment_dir"
        env \
            COMPOSE_PROJECT_NAME="$project_name" \
            MINA_IMAGE="$mina_image" \
            MINA_UID="$host_uid" \
            MINA_GID="$host_gid" \
            MINA_BIND_ADDRESS=127.0.0.1 \
            MINA_HOST_PORT="$host_port" \
            MINA_CONFIG_DIR=./config \
            MINA_BACKUP_DIR=./backups \
            MINA_DATABASE_ENCRYPTION_KEY="$database_encryption_key" \
            MINA_INITIAL_ADMIN_EMAIL="$admin_email" \
            MINA_INITIAL_ADMIN_PASSWORD="$initial_admin_password" \
            docker compose "$@"
    )
}

cleanup() {
    status=$?
    trap - 0 1 2 15

    if [ "$success" != true ] && [ "$install_started" = true ]; then
        compose down --volumes --remove-orphans >/dev/null 2>&1 || true
        rm -rf "$deployment_dir/config" "$deployment_dir/backups"
        rm -f \
            "$deployment_dir/.env" \
            "$deployment_dir/.mina-installing" \
            "$deployment_dir/compose.yaml"
        printf '%s\n' \
            'mina installer: installation failed; installer-created files and Docker state were removed.' \
            'Fix the reported problem and rerun the same command.' >&2
    fi

    if [ -n "$stage_dir" ] && [ -d "$stage_dir" ]; then
        rm -rf "$stage_dir"
    fi

    if [ "$success" != true ] && [ "$target_created" = true ]; then
        rmdir "$deployment_dir" >/dev/null 2>&1 || true
    fi

    exit "$status"
}

trap cleanup 0
trap 'exit 1' 1 2 15

while [ "$#" -gt 0 ]; do
    case "$1" in
        --dir)
            [ "$#" -ge 2 ] || die '--dir requires a directory'
            deployment_dir=$2
            shift 2
            ;;
        --email)
            [ "$#" -ge 2 ] || die '--email requires an address'
            admin_email=$2
            shift 2
            ;;
        --port)
            [ "$#" -ge 2 ] || die '--port requires a number'
            host_port=$2
            shift 2
            ;;
        --image)
            [ "$#" -ge 2 ] || die '--image requires a reference'
            mina_image=$2
            shift 2
            ;;
        -h|--help)
            usage
            success=true
            exit 0
            ;;
        *)
            usage >&2
            die "unknown argument: $1"
            ;;
    esac
done

case "$host_port" in
    ''|*[!0-9]*) die '--port must be an integer from 1 through 65535' ;;
esac
[ "$host_port" -ge 1 ] && [ "$host_port" -le 65535 ] || \
    die '--port must be an integer from 1 through 65535'

case "$mina_image" in
    ''|*[!A-Za-z0-9._/:@-]*) die '--image contains unsupported characters' ;;
esac
case "$source_ref" in
    ''|*[!A-Za-z0-9._/-]*) die 'source ref contains unsupported characters' ;;
esac

require_command docker
require_command curl
require_command openssl
require_command mktemp
require_command id
require_command cksum
require_command awk
require_command sed

docker compose version >/dev/null 2>&1 || \
    die 'Docker Compose v2 is required; install Docker Engine with the compose plugin'
docker info >/dev/null 2>&1 || \
    die 'cannot reach the Docker daemon; start Docker and verify your user has access'

host_uid=$(id -u)
host_gid=$(id -g)
[ "$host_uid" -ne 0 ] || die 'do not run this installer as root; use your ordinary host user'
[ "$host_gid" -ne 0 ] || die 'the invoking user must have a nonzero primary GID'

if [ -L "$deployment_dir" ]; then
    die "deployment directory must not be a symlink: $deployment_dir"
fi
if [ -e "$deployment_dir" ]; then
    [ -d "$deployment_dir" ] || die "deployment path is not a directory: $deployment_dir"
    directory_is_empty "$deployment_dir" || \
        die "deployment directory is not empty; existing Mina state is never changed: $deployment_dir"
else
    mkdir -p "$deployment_dir" || die "cannot create deployment directory: $deployment_dir"
    target_created=true
fi
deployment_dir=$(cd "$deployment_dir" && pwd -P)

project_checksum=$(printf '%s\n' "$deployment_dir" | cksum | awk '{print $1}')
project_name="mina-$project_checksum"

if [ -n "$(docker ps -a --filter "label=com.docker.compose.project=$project_name" -q)" ] || \
    [ -n "$(docker network ls --filter "label=com.docker.compose.project=$project_name" -q)" ] || \
    docker volume inspect "${project_name}_mina-data" >/dev/null 2>&1 || \
    docker volume inspect "${project_name}_mina-cache" >/dev/null 2>&1; then
    die "Docker already contains Mina deployment state for $deployment_dir; nothing was changed"
fi

stage_dir=$(mktemp -d "${TMPDIR:-/tmp}/mina-compose-install.XXXXXX") || \
    die 'cannot create a private staging directory'

if [ -n "$artifact_base_url" ]; then
    [ -n "$source_sha" ] || die 'MINA_INSTALL_SOURCE_SHA is required with MINA_INSTALL_ARTIFACT_BASE_URL'
else
    commit_response="$stage_dir/commit.json"
    commit_url="https://api.github.com/repos/mishamsk/mina/commits/$source_ref"
    curl -fsSL --retry 3 -H 'Accept: application/vnd.github+json' \
        -o "$commit_response" "$commit_url" || \
        die "cannot resolve Mina source ref $source_ref from GitHub"
    source_sha=$(sed -n 's/^[[:space:]]*"sha":[[:space:]]*"\([0-9a-f][0-9a-f]*\)".*/\1/p' "$commit_response" | awk 'NR == 1 { print; exit }')
    artifact_base_url="https://raw.githubusercontent.com/mishamsk/mina/$source_sha"
fi

case "$source_sha" in
    *[!0-9a-f]*) die "resolved source is not a Git commit SHA: $source_sha" ;;
esac
[ "${#source_sha}" -eq 40 ] || die "resolved source is not a full Git commit SHA: $source_sha"

curl -fsSL --retry 3 -o "$stage_dir/compose.yaml" \
    "$artifact_base_url/docker/compose.yaml" || die 'cannot download the supported compose.yaml'
curl -fsSL --retry 3 -o "$stage_dir/.env.example" \
    "$artifact_base_url/docker/.env.example" || die 'cannot download the supported .env.example'
[ -s "$stage_dir/compose.yaml" ] || die 'downloaded compose.yaml is empty'
[ -s "$stage_dir/.env.example" ] || die 'downloaded .env.example is empty'

database_encryption_key=$(openssl rand -hex 32) || die 'cannot generate the database encryption key with OpenSSL'
initial_admin_password=$(openssl rand -hex 32) || die 'cannot generate the initial administrator password with OpenSSL'
[ "${#database_encryption_key}" -eq 64 ] || die 'OpenSSL returned an invalid database encryption key'
[ "${#initial_admin_password}" -eq 64 ] || die 'OpenSSL returned an invalid administrator password'

cat > "$stage_dir/.env" <<EOF
# Generated by Mina's Compose installer from source $source_sha.
# Keep this file mode 0600 and store its secrets separately from Mina data and backups.
COMPOSE_PROJECT_NAME=$project_name
MINA_IMAGE=$mina_image
MINA_UID=$host_uid
MINA_GID=$host_gid
MINA_BIND_ADDRESS=127.0.0.1
MINA_HOST_PORT=$host_port
MINA_CONFIG_DIR=./config
MINA_BACKUP_DIR=./backups
MINA_INITIAL_ADMIN_EMAIL=$admin_email
MINA_INITIAL_ADMIN_PASSWORD=$initial_admin_password
MINA_DATABASE_ENCRYPTION_KEY=$database_encryption_key
EOF
chmod 0600 "$stage_dir/.env"

install_started=true
mkdir "$deployment_dir/config" "$deployment_dir/backups"
chmod 0700 "$deployment_dir/config" "$deployment_dir/backups"
mv "$stage_dir/compose.yaml" "$deployment_dir/compose.yaml"
mv "$stage_dir/.env" "$deployment_dir/.env"
: > "$deployment_dir/.mina-installing"

if [ "$skip_pull" != true ]; then
    compose pull || die 'could not pull the Mina image; verify network and registry access'
fi
compose up -d || die 'Docker Compose could not start Mina'

wait_for_health() {
    attempts=0
    while [ "$attempts" -lt 120 ]; do
        if curl -fsS "http://127.0.0.1:$host_port/api/health" >/dev/null 2>&1; then
            return 0
        fi
        attempts=$((attempts + 1))
        sleep 1
    done
    compose ps -a >&2 || true
    compose logs --tail 100 mina >&2 || true
    return 1
}

wait_for_health || die 'Mina did not become healthy within two minutes'

api_key_output="$stage_dir/api-key-output"
compose run --rm --no-deps -T mina auth api-key create automation > "$api_key_output" || \
    die 'Mina could not create the automation API key through its auth CLI'
api_key=$(sed -n 's/^API key (shown once): //p' "$api_key_output")
[ -n "$api_key" ] || die 'Mina did not return the newly created automation API key'
case "$api_key" in
    ''|*[!A-Za-z0-9_-]*) die 'Mina returned an API key that cannot be stored safely in .env' ;;
esac
printf 'MINA_API_KEY=%s\n' "$api_key" >> "$deployment_dir/.env"
chmod 0600 "$deployment_dir/.env"

compose restart mina >/dev/null || die 'Mina could not restart after API-key creation'
wait_for_health || die 'Mina did not become healthy after API-key creation'
curl -fsS -H "Authorization: Bearer $api_key" \
    "http://127.0.0.1:$host_port/api/accounts?limit=1" >/dev/null || \
    die 'the generated API key could not access the authenticated Mina API'

rm "$deployment_dir/.mina-installing"
success=true

printf '\nMina is ready at http://127.0.0.1:%s\n' "$host_port"
printf 'Deployment directory: %s\n' "$deployment_dir"
printf 'Administrator email: %s\n' "$admin_email"
printf 'Initial password (shown once): %s\n' "$initial_admin_password"
printf 'Automation API key (shown once): %s\n' "$api_key"
printf '\nBoth generated secrets are stored in %s/.env (mode 0600).\n' "$deployment_dir"
printf '%s\n' \
    'Copy them to a password manager now and keep the database encryption key separately' \
    'from the database and backups. Open the URL above and sign in with the administrator credentials.'
