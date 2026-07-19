#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker/compose.yaml"
CONFIG_TEMPLATE="$ROOT_DIR/docker/config-template.toml"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
RUN_ID_SLUG="$(printf '%s' "$RUN_ID" | tr '[:upper:]' '[:lower:]')"
PROJECT="mina-docker-test-${RUN_ID_SLUG}"
IMPORT_PROJECT="${PROJECT}-import"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mina-docker-test.XXXXXX")"
CONFIG_DIR="$WORK_DIR/config"
BACKUP_DIR="$WORK_DIR/backups"
IMPORT_CONFIG_DIR="$WORK_DIR/import-config"
IMPORT_BACKUP_DIR="$WORK_DIR/import-backups"
SEED_DIR="$WORK_DIR/seed"
DATA_VOLUME="${PROJECT}_mina-data"
CACHE_VOLUME="${PROJECT}_mina-cache"
IMPORT_DATA_VOLUME="${IMPORT_PROJECT}_mina-data"
IMPORT_CACHE_VOLUME="${IMPORT_PROJECT}_mina-cache"
DOCKER_CONFIG_DIR="${DOCKER_CONFIG:-$HOME/.docker}"
DEMO_OVERRIDE="$WORK_DIR/demo-override.yaml"
TRAEFIK_OVERRIDE="$WORK_DIR/traefik-overlay.yaml"
HOST_PORT="${MINA_TEST_PORT:-}"
HOST_UID="$(id -u)"
HOST_GID="$(id -g)"
ALT_UID="$((HOST_UID + 10000))"
ALT_GID="$((HOST_GID + 10000))"
CURRENT_IMAGE=""
INITIAL_IMAGE=""
UPDATED_IMAGE=""
INITIAL_IMAGE_ID=""
UPDATED_IMAGE_ID=""
INITIAL_CONTAINER_ID=""
UPDATED_CONTAINER_ID=""
EXPECT_DISTINCT_UPDATE=false
CLEANED=false
OWNED_IMAGES=""
DEMO_SNAPSHOT=""
PRE_UPDATE_BACKUP=""
POST_UPDATE_BACKUP=""

log() {
    printf '\n== %s ==\n' "$*"
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || {
        printf 'missing required command: %s\n' "$1" >&2
        exit 127
    }
}

port_in_use() {
    (exec 3<>"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1
}

select_port() {
    if [[ -n "$HOST_PORT" ]]; then
        if port_in_use "$HOST_PORT"; then
            printf 'requested MINA_TEST_PORT is already in use: %s\n' "$HOST_PORT" >&2
            exit 1
        fi
        return
    fi

    local port=$((49152 + ($$ % 12000)))
    while port_in_use "$port"; do
        port=$((port + 1))
        if (( port > 65535 )); then
            port=49152
        fi
    done
    HOST_PORT="$port"
}

compose_base() {
    MINA_IMAGE="$CURRENT_IMAGE" \
    MINA_UID="$HOST_UID" \
    MINA_GID="$HOST_GID" \
    MINA_BIND_ADDRESS="127.0.0.1" \
    MINA_HOST_PORT="$HOST_PORT" \
    MINA_CONFIG_DIR="$CONFIG_DIR" \
    MINA_BACKUP_DIR="$BACKUP_DIR" \
    MINA_BACKUP_FILE_SCHEDULE_UTC="" \
        docker compose -p "$PROJECT" -f "$COMPOSE_FILE" "$@"
}

compose_demo() {
    MINA_IMAGE="$CURRENT_IMAGE" \
    MINA_UID="$HOST_UID" \
    MINA_GID="$HOST_GID" \
    MINA_BIND_ADDRESS="127.0.0.1" \
    MINA_HOST_PORT="$HOST_PORT" \
    MINA_CONFIG_DIR="$CONFIG_DIR" \
    MINA_BACKUP_DIR="$BACKUP_DIR" \
    MINA_BACKUP_FILE_SCHEDULE_UTC="" \
        docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$DEMO_OVERRIDE" "$@"
}

compose_traefik_config() {
    MINA_IMAGE="$CURRENT_IMAGE" \
    MINA_UID="$HOST_UID" \
    MINA_GID="$HOST_GID" \
    MINA_BIND_ADDRESS="127.0.0.1" \
    MINA_HOST_PORT="$HOST_PORT" \
    MINA_CONFIG_DIR="$CONFIG_DIR" \
    MINA_BACKUP_DIR="$BACKUP_DIR" \
    MINA_BACKUP_FILE_SCHEDULE_UTC="" \
        docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$TRAEFIK_OVERRIDE" config --format json
}

compose_default_config() {
    MINA_IMAGE="" \
    MINA_UID="" \
    MINA_GID="" \
    MINA_CONFIG_DIR="" \
    MINA_BACKUP_DIR="" \
        docker compose -p "$PROJECT" -f "$COMPOSE_FILE" config --format json
}

compose_explicit_config_without_home() {
    env \
        -u HOME \
        -u XDG_CONFIG_HOME \
        -u XDG_DATA_HOME \
        -u XDG_CACHE_HOME \
        DOCKER_CONFIG="$DOCKER_CONFIG_DIR" \
        MINA_IMAGE="$CURRENT_IMAGE" \
        MINA_UID="$HOST_UID" \
        MINA_GID="$HOST_GID" \
        MINA_CONFIG_DIR="$CONFIG_DIR" \
        MINA_BACKUP_DIR="$BACKUP_DIR" \
        docker compose -p "$PROJECT" -f "$COMPOSE_FILE" config --format json
}

compose_import() {
    MINA_IMAGE="$CURRENT_IMAGE" \
    MINA_UID="$HOST_UID" \
    MINA_GID="$HOST_GID" \
    MINA_BIND_ADDRESS="127.0.0.1" \
    MINA_HOST_PORT="$HOST_PORT" \
    MINA_CONFIG_DIR="$IMPORT_CONFIG_DIR" \
    MINA_BACKUP_DIR="$IMPORT_BACKUP_DIR" \
    MINA_BACKUP_FILE_SCHEDULE_UTC="" \
        docker compose -p "$IMPORT_PROJECT" -f "$COMPOSE_FILE" "$@"
}

compose_volume_init_as() {
    local uid="$1"
    local gid="$2"
    shift 2
    MINA_IMAGE="$CURRENT_IMAGE" \
    MINA_UID="$uid" \
    MINA_GID="$gid" \
    MINA_CONFIG_DIR="$CONFIG_DIR" \
    MINA_BACKUP_DIR="$BACKUP_DIR" \
        docker compose -p "$PROJECT" -f "$COMPOSE_FILE" run --rm --no-deps volume-init "$@"
}

diagnostics() {
    local cid
    printf '\n--- Docker lifecycle diagnostics for %s ---\n' "$PROJECT" >&2
    compose_base ps -a >&2 || true
    cid="$(compose_base ps -q mina 2>/dev/null || true)"
    if [[ -n "$cid" ]]; then
        docker inspect "$cid" >&2 || true
        docker logs --tail 200 "$cid" >&2 || true
    fi
    compose_import ps -a >&2 || true
}

cleanup() {
    if [[ "$CLEANED" == true ]]; then
        return
    fi
    compose_import down --volumes --remove-orphans >/dev/null 2>&1 || true
    compose_base down --volumes --remove-orphans >/dev/null 2>&1 || true
    if [[ -n "$OWNED_IMAGES" ]]; then
        while IFS= read -r image; do
            [[ -n "$image" ]] || continue
            docker image rm "$image" >/dev/null 2>&1 || true
        done <<<"$OWNED_IMAGES"
    fi
    rm -rf "$WORK_DIR"
    CLEANED=true
}

on_exit() {
    local rc=$?
    if (( rc != 0 )); then
        diagnostics
    fi
    cleanup
    exit "$rc"
}

trap on_exit EXIT

image_id() {
    docker image inspect "$1" --format '{{.Id}}'
}

ensure_image_available() {
    if ! docker image inspect "$1" >/dev/null 2>&1; then
        docker pull "$1"
    fi
}

build_image() {
    local tag="$1"
    local revision="$2"
    docker build \
        -f "$ROOT_DIR/docker/Dockerfile" \
        -t "$tag" \
        --build-arg VERSION="$revision" \
        --build-arg REVISION="$revision" \
        --build-arg SOURCE="https://github.com/mishamsk/mina" \
        --build-arg CREATED="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        "$ROOT_DIR"
    OWNED_IMAGES="${OWNED_IMAGES}${tag}"$'\n'
}

prepare_images() {
    if [[ -z "${MINA_IMAGE:-}" ]]; then
        log "two image revisions: build initial and updated local images"
        INITIAL_IMAGE="mina:docker-service-test-${RUN_ID_SLUG}-initial"
        UPDATED_IMAGE="mina:docker-service-test-${RUN_ID_SLUG}-updated"
        build_image "$INITIAL_IMAGE" "docker-service-test-${RUN_ID}-initial"
        build_image "$UPDATED_IMAGE" "docker-service-test-${RUN_ID}-updated"
        INITIAL_IMAGE_ID="$(image_id "$INITIAL_IMAGE")"
        UPDATED_IMAGE_ID="$(image_id "$UPDATED_IMAGE")"
        if [[ "$INITIAL_IMAGE_ID" == "$UPDATED_IMAGE_ID" ]]; then
            printf 'local initial and updated image IDs match unexpectedly: %s\n' "$INITIAL_IMAGE_ID" >&2
            exit 1
        fi
        EXPECT_DISTINCT_UPDATE=true
        printf 'initial image id: %s\nupdated image id: %s\n' "$INITIAL_IMAGE_ID" "$UPDATED_IMAGE_ID"
        return
    fi

    log "supplied image entry path"
    INITIAL_IMAGE="$MINA_IMAGE"
    ensure_image_available "$INITIAL_IMAGE"
    INITIAL_IMAGE_ID="$(image_id "$INITIAL_IMAGE")"
    if [[ -n "${MINA_UPDATE_IMAGE:-}" ]]; then
        UPDATED_IMAGE="$MINA_UPDATE_IMAGE"
        ensure_image_available "$UPDATED_IMAGE"
        UPDATED_IMAGE_ID="$(image_id "$UPDATED_IMAGE")"
        if [[ "$INITIAL_IMAGE_ID" == "$UPDATED_IMAGE_ID" ]]; then
            printf 'MINA_UPDATE_IMAGE must identify a distinct replacement image; both IDs are %s\n' "$INITIAL_IMAGE_ID" >&2
            exit 1
        fi
        EXPECT_DISTINCT_UPDATE=true
    else
        UPDATED_IMAGE="$INITIAL_IMAGE"
        UPDATED_IMAGE_ID="$INITIAL_IMAGE_ID"
        EXPECT_DISTINCT_UPDATE=false
    fi
    printf 'initial image: %s (%s)\nupdated image: %s (%s)\n' "$INITIAL_IMAGE" "$INITIAL_IMAGE_ID" "$UPDATED_IMAGE" "$UPDATED_IMAGE_ID"
}

prepare_filesystem() {
    mkdir -p "$CONFIG_DIR" "$BACKUP_DIR" "$IMPORT_CONFIG_DIR" "$IMPORT_BACKUP_DIR" "$SEED_DIR"
    chmod 0700 "$CONFIG_DIR" "$BACKUP_DIR" "$IMPORT_CONFIG_DIR" "$IMPORT_BACKUP_DIR" "$SEED_DIR"
    cat > "$DEMO_OVERRIDE" <<'YAML'
services:
  mina:
    command: ["serve", "--demo"]
    environment:
      MINA_FX_AUTO_LOAD_ENABLED: "false"
YAML
    cat > "$TRAEFIK_OVERRIDE" <<'YAML'
services:
  mina:
    labels:
      traefik.enable: "true"
      traefik.http.routers.mina.rule: Host(`mina.local`)
      traefik.http.routers.mina.tls: "true"
      traefik.http.services.mina.loadbalancer.server.port: "8080"
    networks:
      - default
      - traefik

networks:
  traefik:
    external: true
    name: mina-test-traefik
YAML
}

wait_healthy() {
    local cid="$1"
    local health_state=""
    for _ in $(seq 1 120); do
        health_state="$(docker inspect -f '{{.State.Health.Status}}' "$cid")"
        case "$health_state" in
            healthy)
                printf 'healthy container: %s\n' "$cid"
                return
                ;;
            unhealthy)
                printf 'container became unhealthy: %s\n' "$cid" >&2
                exit 1
                ;;
        esac
        sleep 1
    done
    printf 'container did not become healthy; last health state: %s\n' "$health_state" >&2
    exit 1
}

curl_body() {
    curl --fail --silent --show-error "$@"
}

api_url() {
    printf 'http://127.0.0.1:%s%s' "$HOST_PORT" "$1"
}

assert_reachability() {
    local health openapi root
    health="$(curl_body "$(api_url /api/health)")"
    jq -e '.status == "ok" and (.schema_version | type == "number")' <<<"$health" >/dev/null
    openapi="$(curl_body "$(api_url /api/openapi.json)")"
    jq -e '.openapi and .paths["/api/health"]' <<<"$openapi" >/dev/null
    root="$(curl_body -H 'Accept: text/html' "$(api_url /)")"
    grep -q '<div id="root"></div>' <<<"$root"
}

snapshot_demo_data() {
    local accounts transactions
    accounts="$(curl_body "$(api_url '/api/accounts?limit=500')")"
    transactions="$(curl_body "$(api_url '/api/transactions?limit=500')")"
    printf '%s\n%s\n' "$accounts" "$transactions" | jq -cs '{
        account_total: .[0].total_count,
        checking_id: (.[0].accounts[] | select(.fqn == "checking:Chase:Joint") | .account_id),
        emergency_id: (.[0].accounts[] | select(.fqn == "savings:Ally:Emergency") | .account_id),
        featured_account_fqns: [.[0].accounts[] | select(.is_featured == true) | .fqn] | sort,
        transaction_total: .[1].total_count
    }'
}

record_demo_snapshot() {
    DEMO_SNAPSHOT="$(snapshot_demo_data)"
    jq -e '.account_total >= 30 and .transaction_total > 0 and .checking_id > 0 and .emergency_id > 0' <<<"$DEMO_SNAPSHOT" >/dev/null
    printf 'demo snapshot: %s\n' "$DEMO_SNAPSHOT"
}

assert_demo_snapshot_retained() {
    local current
    current="$(snapshot_demo_data)"
    if [[ "$current" != "$DEMO_SNAPSHOT" ]]; then
        printf 'demo data snapshot changed\nbefore: %s\nafter:  %s\n' "$DEMO_SNAPSHOT" "$current" >&2
        exit 1
    fi
}

assert_loopback_publish() {
    local cid="$1"
    local published
    published="$(docker inspect "$cid" | jq -r '.[0].NetworkSettings.Ports["8080/tcp"][] | "\(.HostIp):\(.HostPort)"')"
    if [[ "$published" != "127.0.0.1:$HOST_PORT" ]]; then
        printf 'unexpected published ports: %s, want 127.0.0.1:%s\n' "$published" "$HOST_PORT" >&2
        exit 1
    fi
}

assert_container_image() {
    local cid="$1"
    local want="$2"
    local got
    got="$(docker inspect -f '{{.Image}}' "$cid")"
    if [[ "$got" != "$want" ]]; then
        printf 'container image id = %s, want %s\n' "$got" "$want" >&2
        exit 1
    fi
}

assert_non_root_process() {
    local cid="$1"
    local uid
    uid="$(docker exec "$cid" id -u)"
    if [[ "$uid" != "$HOST_UID" ]]; then
        printf 'container process UID = %s, want caller UID %s\n' "$uid" "$HOST_UID" >&2
        exit 1
    fi
}

host_file_owner() {
    if stat -f '%u:%g' "$1" >/dev/null 2>&1; then
        stat -f '%u:%g' "$1"
    else
        stat -c '%u:%g' "$1"
    fi
}

assert_host_owned_file() {
    local path="$1"
    local owner
    owner="$(host_file_owner "$path")"
    if [[ "$owner" != "$HOST_UID:$HOST_GID" ]]; then
        printf 'host file owner for %s = %s, want %s:%s\n' "$path" "$owner" "$HOST_UID" "$HOST_GID" >&2
        exit 1
    fi
}

host_file_mode() {
    if stat -f '%Lp' "$1" >/dev/null 2>&1; then
        stat -f '%Lp' "$1"
    else
        stat -c '%a' "$1"
    fi
}

assert_private_file() {
    local path="$1"
    local mode
    mode="$(host_file_mode "$path")"
    if [[ ! "$mode" =~ ^[0-7]+00$ ]]; then
        printf 'host file mode for %s = %s, want no group or other permissions\n' "$path" "$mode" >&2
        exit 1
    fi
}

assert_config_bootstrapped() {
    local cid="$1"
    local config_file="$CONFIG_DIR/config.toml"
    local token="config-write-probe-$RUN_ID"

    if [[ ! -f "$config_file" ]]; then
        printf 'bootstrapped config is missing on host: %s\n' "$config_file" >&2
        exit 1
    fi
    cmp "$CONFIG_TEMPLATE" "$config_file"
    assert_host_owned_file "$config_file"
    assert_private_file "$config_file"
    docker exec "$cid" sh -c 'printf "# %s\n" "$1" >> /config/mina/config.toml' sh "$token"
    if ! grep -q "^# $token$" "$config_file"; then
        printf 'container config write did not appear on the host\n' >&2
        exit 1
    fi
}

assert_hardened_runtime() {
    local cid="$1"
    local inspect
    local token="tmp-probe-$RUN_ID"

    inspect="$(docker inspect "$cid")"
    jq -e '
        .[0].HostConfig.ReadonlyRootfs == true
        and (.[0].HostConfig.CapDrop | map(ascii_upcase) | index("ALL") != null)
        and (.[0].HostConfig.SecurityOpt | index("no-new-privileges:true") != null)
        and .[0].HostConfig.Tmpfs["/tmp"] != null
        and (.[0].HostConfig.Tmpfs["/tmp"] | contains("size=64m"))
        and (.[0].HostConfig.Tmpfs["/tmp"] | contains("mode=1777"))
    ' <<<"$inspect" >/dev/null
    if docker exec "$cid" sh -c 'touch /var/tmp/mina-docker-rootfs-write-probe' >/dev/null 2>&1; then
        printf 'container root filesystem accepted a write\n' >&2
        exit 1
    fi
    docker exec "$cid" sh -c 'test "$(awk '\''/^Umask:/ { print $2 }'\'' /proc/1/status)" = "0077"'
    docker exec "$cid" sh -c 'printf "%s\n" "$1" > /tmp/mina-docker-tmp-probe && test "$(cat /tmp/mina-docker-tmp-probe)" = "$1"' sh "$token"
}

assert_config_permission_failure() {
    local output rc

    set +e
    output="$(docker run --rm \
        --user "$HOST_UID:$HOST_GID" \
        --read-only \
        --cap-drop ALL \
        --security-opt no-new-privileges \
        --tmpfs /tmp:size=64m,mode=1777 \
        -e XDG_CONFIG_HOME=/config \
        -v "$CONFIG_DIR:/config/mina:ro" \
        "$INITIAL_IMAGE" serve 2>&1)"
    rc=$?
    set -e
    if (( rc == 0 )); then
        printf 'serve unexpectedly accepted a read-only config bind\n' >&2
        exit 1
    fi
    if [[ "$output" != *"config"* || "$output" != *"writ"* ]]; then
        printf 'read-only config failure was not actionable: %s\n' "$output" >&2
        exit 1
    fi
}

assert_standalone_version() {
    local output
    output="$(docker run --rm \
        --read-only \
        --cap-drop ALL \
        --security-opt no-new-privileges \
        "$INITIAL_IMAGE" version)"
    if [[ "$output" != mina\ * ]]; then
        printf 'unexpected standalone version output: %s\n' "$output" >&2
        exit 1
    fi
}

assert_zero_identity_rejected() {
    local user="$1"
    local output rc

    set +e
    output="$(docker run --rm --user "$user" "$INITIAL_IMAGE" version 2>&1)"
    rc=$?
    set -e
    if (( rc == 0 )) || [[ "$output" != *"effective UID or primary GID 0"* ]]; then
        printf 'zero UID/GID execution for %s was not rejected clearly: rc=%s output=%s\n' "$user" "$rc" "$output" >&2
        exit 1
    fi
}

assert_zero_identities_rejected() {
    assert_zero_identity_rejected "0:12345"
    assert_zero_identity_rejected "12345:0"
}

assert_volume_init_identity_rejected() {
    local uid="$1"
    local gid="$2"
    local expected="$3"
    local output rc

    set +e
    output="$(compose_volume_init_as "$uid" "$gid" 2>&1)"
    rc=$?
    set -e
    if (( rc == 0 )) || [[ "$output" != *"$expected"* ]]; then
        printf 'volume initializer accepted invalid identity %s:%s: rc=%s output=%s\n' "$uid" "$gid" "$rc" "$output" >&2
        exit 1
    fi
}

assert_cache_mount() {
    local cid="$1"
    local token="cache-probe-$RUN_ID"
    docker exec "$cid" sh -c 'mkdir -p /cache/mina && printf "%s\n" "$1" > /cache/mina/docker-service-test-cache-probe' sh "$token"
    if [[ "$(docker exec "$cid" cat /cache/mina/docker-service-test-cache-probe)" != "$token" ]]; then
        printf 'cache probe content mismatch in named cache volume\n' >&2
        exit 1
    fi
}

volume_stat() {
    local volume="$1"
    local format="$2"
    local path="$3"
    docker run --rm \
        --user 0:0 \
        --entrypoint stat \
        -v "$volume:/volume:ro" \
        "$CURRENT_IMAGE" -c "$format" "/volume/$path"
}

assert_volume_entry_owner() {
    local volume="$1"
    local path="$2"
    local expected="$3"
    local actual
    actual="$(volume_stat "$volume" '%u:%g' "$path")"
    if [[ "$actual" != "$expected" ]]; then
        printf 'volume %s entry %s owner = %s, want %s\n' "$volume" "$path" "$actual" "$expected" >&2
        exit 1
    fi
}

assert_volume_entry_private() {
    local volume="$1"
    local path="$2"
    local mode
    mode="$(volume_stat "$volume" '%a' "$path")"
    if [[ ! "$mode" =~ ^[0-7]+00$ ]]; then
        printf 'volume %s entry %s mode = %s, want no group or other permissions\n' "$volume" "$path" "$mode" >&2
        exit 1
    fi
}

assert_volume_exists() {
    docker volume inspect "$1" >/dev/null
}

assert_volume_absent() {
    if docker volume inspect "$1" >/dev/null 2>&1; then
        printf 'volume unexpectedly exists: %s\n' "$1" >&2
        exit 1
    fi
}

assert_volume_entry_absent() {
    local volume="$1"
    local path="$2"
    docker run --rm \
        --user 0:0 \
        --entrypoint sh \
        -v "$volume:/volume:ro" \
        "$CURRENT_IMAGE" -c 'test ! -e "/volume/$1" && test ! -L "/volume/$1"' sh "$path"
}

assert_volume_entry_content() {
    local volume="$1"
    local path="$2"
    local expected="$3"
    local actual
    actual="$(docker run --rm --user 0:0 --entrypoint cat -v "$volume:/volume:ro" "$CURRENT_IMAGE" "/volume/$path")"
    if [[ "$actual" != "$expected" ]]; then
        printf 'volume %s entry %s content = %q, want %q\n' "$volume" "$path" "$actual" "$expected" >&2
        exit 1
    fi
}

assert_volume_directory_empty() {
    local volume="$1"
    local path="$2"
    docker run --rm \
        --user 0:0 \
        --entrypoint sh \
        -v "$volume:/volume:ro" \
        "$CURRENT_IMAGE" -c 'test -d "/volume/$1" && test -z "$(find "/volume/$1" -mindepth 1 -print -quit)"' sh "$path"
}

assert_no_import_staging_entries() {
    local volume="$1"
    docker run --rm \
        --user 0:0 \
        --entrypoint sh \
        -v "$volume:/volume:ro" \
        "$CURRENT_IMAGE" -c 'test -z "$(find /volume -maxdepth 1 -name "$1" -print -quit)"' sh '.mina-*-import.*'
}

assert_traefik_overlay_config() {
    local config
    config="$(compose_traefik_config)"
    jq -e \
        --arg host_port "$HOST_PORT" \
        --arg config_dir "$CONFIG_DIR" \
        --arg backup_dir "$BACKUP_DIR" \
        --arg user "$HOST_UID:$HOST_GID" \
        '
        .services.mina != null
        and .services.mina.user == $user
        and .services.mina.read_only == true
        and (.services.mina.cap_drop | map(ascii_upcase) | index("ALL") != null)
        and (.services.mina.security_opt | index("no-new-privileges:true") != null)
        and (.services.mina.tmpfs | any(contains("size=64m") and contains("mode=1777")))
        and (.services.mina.ports | any(.target == 8080 and .published == $host_port and .host_ip == "127.0.0.1"))
        and (.services.mina.volumes | any(.type == "bind" and .source == $config_dir and .target == "/config/mina" and .read_only != true and .bind.create_host_path != true))
        and (.services.mina.volumes | any(.type == "volume" and .target == "/data" and .volume.nocopy == true))
        and (.services.mina.volumes | any(.type == "volume" and .target == "/cache" and .volume.nocopy == true))
        and (.services.mina.volumes | any(.type == "bind" and .source == $backup_dir and .target == "/backups" and .bind.create_host_path != true))
        and .services.mina.depends_on["volume-init"].condition == "service_completed_successfully"
        and .services["volume-init"].user == "0:0"
        and .services["volume-init"].network_mode == "none"
        and .services["volume-init"].read_only == true
        and (.services["volume-init"].volumes | all(.type == "volume"))
        and (.services["volume-init"].volumes | any(.target == "/data" and .volume.nocopy == true))
        and (.services["volume-init"].volumes | any(.target == "/cache" and .volume.nocopy == true))
        and ((.services["volume-init"].cap_add | map(ascii_upcase) | sort) == (["CHOWN", "DAC_OVERRIDE", "FOWNER"] | sort))
        and (.services["volume-init"].cap_drop | map(ascii_upcase) | index("ALL") != null)
        and (.services.mina.healthcheck.test | length > 0)
        and .services.mina.labels["traefik.enable"] == "true"
        and .services.mina.labels["traefik.http.services.mina.loadbalancer.server.port"] == "8080"
        and (.services.mina.networks | has("traefik"))
        and .networks.traefik.external == true
    ' <<<"$config" >/dev/null
}

assert_rendered_compose_config() {
    local config="$1"
    local image="$2"
    local config_dir="$3"
    local backup_dir="$4"
    jq -e \
        --arg image "$image" \
        --arg config_dir "$config_dir" \
        --arg backup_dir "$backup_dir" \
        '
        .services.mina.image == $image
        and (.services.mina.volumes | any(.source == $config_dir and .target == "/config/mina" and .read_only != true and .bind.create_host_path != true))
        and (.services.mina.volumes | any(.type == "volume" and .target == "/data" and .volume.nocopy == true))
        and (.services.mina.volumes | any(.type == "volume" and .target == "/cache" and .volume.nocopy == true))
        and (.services.mina.volumes | any(.source == $backup_dir and .target == "/backups" and .bind.create_host_path != true))
        and .services["volume-init"].user == "0:0"
        and .services["volume-init"].network_mode == "none"
        and (.services["volume-init"].volumes | all(.type == "volume" and .volume.nocopy == true))
        and .services.mina.depends_on["volume-init"].condition == "service_completed_successfully"
        and .services.mina.environment.XDG_CONFIG_HOME == "/config"
        and .services.mina.environment.MINA_DB == "/data/mina.duckdb"
        and (.services.mina.environment | has("MINA_SCHEMA") | not)
        ' <<<"$config" >/dev/null
}

assert_default_compose_config() {
    local config

    config="$(compose_default_config)"
    assert_rendered_compose_config \
        "$config" \
        "ghcr.io/mishamsk/mina:main" \
        "$ROOT_DIR/docker/config" \
        "$ROOT_DIR/docker/backups"

    config="$(compose_explicit_config_without_home)"
    assert_rendered_compose_config \
        "$config" \
        "$CURRENT_IMAGE" \
        "$CONFIG_DIR" \
        "$BACKUP_DIR"
}

assert_import_rejected() {
    local expected="$1"
    shift
    local output rc

    set +e
    output="$(compose_import run --rm -v "$SEED_DIR:/seed:ro" mina container-init "$@" 2>&1)"
    rc=$?
    set -e
    if (( rc == 0 )) || [[ "$output" != *"$expected"* ]]; then
        printf 'container import was not rejected as expected: rc=%s expected=%q output=%s\n' "$rc" "$expected" "$output" >&2
        exit 1
    fi
}

test_container_import() {
    local cache_token="seed-cache-$RUN_ID"

    cp "$PRE_UPDATE_BACKUP" "$SEED_DIR/mina.duckdb"
    printf 'not a Mina database\n' > "$SEED_DIR/invalid.duckdb"
    mkdir -p "$SEED_DIR/cache/nested" "$SEED_DIR/unsafe-cache"
    printf '%s\n' "$cache_token" > "$SEED_DIR/cache/nested/future-provider.cache"
    ln -s mina.duckdb "$SEED_DIR/linked.duckdb"
    ln -s ../cache/nested/future-provider.cache "$SEED_DIR/unsafe-cache/link"

    assert_import_rejected "provide --database, --cache, or both"
    assert_import_rejected "database source must not be a symlink" --database /seed/linked.duckdb
    assert_import_rejected "cache source contains a symlink or special entry" \
        --database /seed/mina.duckdb \
        --cache /seed/unsafe-cache
    assert_volume_entry_absent "$IMPORT_DATA_VOLUME" mina.duckdb
    assert_volume_directory_empty "$IMPORT_CACHE_VOLUME" mina
    assert_no_import_staging_entries "$IMPORT_DATA_VOLUME"
    assert_no_import_staging_entries "$IMPORT_CACHE_VOLUME"

    assert_import_rejected "database source validation failed" \
        --database /seed/invalid.duckdb \
        --cache /seed/cache
    assert_volume_entry_absent "$IMPORT_DATA_VOLUME" mina.duckdb
    assert_volume_directory_empty "$IMPORT_CACHE_VOLUME" mina
    assert_no_import_staging_entries "$IMPORT_DATA_VOLUME"
    assert_no_import_staging_entries "$IMPORT_CACHE_VOLUME"

    compose_import run --rm -v "$SEED_DIR:/seed:ro" mina container-init --cache /seed/cache
    assert_volume_entry_absent "$IMPORT_DATA_VOLUME" mina.duckdb
    assert_volume_entry_content "$IMPORT_CACHE_VOLUME" mina/nested/future-provider.cache "$cache_token"
    compose_import down --volumes --remove-orphans
    assert_volume_absent "$IMPORT_DATA_VOLUME"
    assert_volume_absent "$IMPORT_CACHE_VOLUME"

    compose_import run --rm -v "$SEED_DIR:/seed:ro" mina container-init --database /seed/mina.duckdb
    assert_volume_entry_owner "$IMPORT_DATA_VOLUME" mina.duckdb "$HOST_UID:$HOST_GID"
    assert_volume_entry_private "$IMPORT_DATA_VOLUME" mina.duckdb
    assert_volume_directory_empty "$IMPORT_CACHE_VOLUME" mina
    compose_import run --rm --no-deps mina db validate --db /data/mina.duckdb
    compose_import down --volumes --remove-orphans
    assert_volume_absent "$IMPORT_DATA_VOLUME"
    assert_volume_absent "$IMPORT_CACHE_VOLUME"

    compose_import run --rm -v "$SEED_DIR:/seed:ro" mina container-init \
        --database /seed/mina.duckdb \
        --cache /seed/cache
    assert_volume_entry_owner "$IMPORT_DATA_VOLUME" mina.duckdb "$HOST_UID:$HOST_GID"
    assert_volume_entry_private "$IMPORT_DATA_VOLUME" mina.duckdb
    assert_volume_entry_owner "$IMPORT_CACHE_VOLUME" mina/nested/future-provider.cache "$HOST_UID:$HOST_GID"
    assert_volume_entry_private "$IMPORT_CACHE_VOLUME" mina/nested/future-provider.cache
    assert_volume_entry_content "$IMPORT_CACHE_VOLUME" mina/nested/future-provider.cache "$cache_token"
    assert_no_import_staging_entries "$IMPORT_DATA_VOLUME"
    assert_no_import_staging_entries "$IMPORT_CACHE_VOLUME"

    assert_import_rejected "database destination already exists" --database /seed/mina.duckdb
    assert_import_rejected "cache destination must be empty" --cache /seed/cache
    compose_import run --rm --no-deps mina db validate --db /data/mina.duckdb

    compose_import up -d
    local import_container_id
    import_container_id="$(compose_import ps -q mina)"
    wait_healthy "$import_container_id"
    assert_reachability
    assert_demo_snapshot_retained
    compose_import down --remove-orphans
    assert_volume_exists "$IMPORT_DATA_VOLUME"
    assert_volume_exists "$IMPORT_CACHE_VOLUME"
}

backup_files_json() {
    find "$BACKUP_DIR" -maxdepth 1 -type f -name 'mina-backup-*.duckdb' -print | sort | jq -R -s 'split("\n")[:-1]'
}

assert_no_backup_temp_files() {
    if find "$BACKUP_DIR" -maxdepth 1 -type f -name '.*.tmp-*' -print | grep -q .; then
        printf 'backup temp files remain:\n' >&2
        find "$BACKUP_DIR" -maxdepth 1 -type f -name '.*.tmp-*' -print >&2
        exit 1
    fi
}

trigger_backup() {
    local before after run_id run status path
    before="$(backup_files_json)"
    run="$(curl_body -X POST "$(api_url /api/background-operations/database-backup/runs)")"
    run_id="$(jq -r '.operation_run_id' <<<"$run")"
    status="$run"
    for _ in $(seq 1 150); do
        status="$(curl_body "$(api_url "/api/background-operations/database-backup/runs/$run_id")")"
        case "$(jq -r '.status' <<<"$status")" in
            succeeded)
                after="$(backup_files_json)"
                path="$(jq -rnc --argjson before "$before" --argjson after "$after" '$after - $before | if length == 1 then .[0] else empty end')"
                if [[ -z "$path" ]]; then
                    printf 'expected exactly one new finalized backup; before=%s after=%s\n' "$before" "$after" >&2
                    exit 1
                fi
                assert_no_backup_temp_files
                printf '%s\n' "$path"
                return
                ;;
            failed|skipped|canceled)
                printf 'backup run ended unsuccessfully: %s\n' "$status" >&2
                exit 1
                ;;
        esac
        sleep 1
    done
    printf 'backup run did not reach terminal success; last run payload: %s\n' "$status" >&2
    printf 'backup directory entries:\n' >&2
    find "$BACKUP_DIR" -maxdepth 1 -type f -print | sort >&2
    exit 1
}

validate_database_file() {
    local db_path="$1"
    compose_base run --rm --no-deps mina db validate --db "$db_path"
}

smoke_non_native_platform() {
    local native target smoke_image output
    native="$(docker image inspect "$INITIAL_IMAGE" --format '{{.Architecture}}')"
    case "$native" in
        amd64) target=arm64 ;;
        arm64) target=amd64 ;;
        *)
            printf 'non-native platform smoke skipped: unsupported native architecture %s\n' "$native"
            return
            ;;
    esac

    log "non-native linux/$target image smoke"
    if ! output="$(docker run --rm --platform "linux/$target" debian:trixie-slim true 2>&1)"; then
        printf 'non-native linux/%s emulation unavailable: %s\n' "$target" "$output"
        return
    fi

    smoke_image="mina:docker-service-test-${RUN_ID_SLUG}-${target}"
    docker build \
        --platform "linux/$target" \
        -f "$ROOT_DIR/docker/Dockerfile" \
        -t "$smoke_image" \
        --build-arg VERSION="docker-service-test-${RUN_ID}-${target}" \
        --build-arg REVISION="docker-service-test-${RUN_ID}-${target}" \
        "$ROOT_DIR"
    OWNED_IMAGES="${OWNED_IMAGES}${smoke_image}"$'\n'
    docker run --rm --platform "linux/$target" \
        --read-only \
        --cap-drop ALL \
        --security-opt no-new-privileges \
        "$smoke_image" version
}

assert_no_owned_docker_objects() {
    local project
    for project in "$PROJECT" "$IMPORT_PROJECT"; do
        if docker ps -a --filter "label=com.docker.compose.project=$project" -q | grep -q .; then
            printf 'compose containers remain for %s\n' "$project" >&2
            exit 1
        fi
        if docker network ls --filter "label=com.docker.compose.project=$project" -q | grep -q .; then
            printf 'compose networks remain for %s\n' "$project" >&2
            exit 1
        fi
    done
}

assert_no_owned_images() {
    local image
    while IFS= read -r image; do
        [[ -n "$image" ]] || continue
        if docker image inspect "$image" >/dev/null 2>&1; then
            printf 'test image remains after cleanup: %s\n' "$image" >&2
            exit 1
        fi
    done <<<"$OWNED_IMAGES"
}

require_command docker
require_command curl
require_command jq
docker compose version >/dev/null
select_port
prepare_filesystem
prepare_images
CURRENT_IMAGE="$INITIAL_IMAGE"
assert_default_compose_config
assert_config_permission_failure
assert_standalone_version
assert_zero_identities_rejected
assert_volume_init_identity_rejected 0 12345 "MINA_UID must not be 0"
assert_volume_init_identity_rejected 12345 0 "MINA_GID must not be 0"
smoke_non_native_platform

log "first demo boot"
assert_traefik_overlay_config
compose_demo up -d
INITIAL_CONTAINER_ID="$(compose_base ps -q mina)"
wait_healthy "$INITIAL_CONTAINER_ID"
assert_loopback_publish "$INITIAL_CONTAINER_ID"
assert_reachability
record_demo_snapshot
assert_volume_exists "$DATA_VOLUME"
assert_volume_exists "$CACHE_VOLUME"
assert_volume_entry_owner "$DATA_VOLUME" . "$HOST_UID:$HOST_GID"
assert_volume_entry_owner "$DATA_VOLUME" mina.duckdb "$HOST_UID:$HOST_GID"
assert_volume_entry_private "$DATA_VOLUME" mina.duckdb
assert_volume_entry_owner "$CACHE_VOLUME" . "$HOST_UID:$HOST_GID"
assert_volume_entry_owner "$CACHE_VOLUME" mina "$HOST_UID:$HOST_GID"
assert_container_image "$INITIAL_CONTAINER_ID" "$INITIAL_IMAGE_ID"
assert_non_root_process "$INITIAL_CONTAINER_ID"
assert_hardened_runtime "$INITIAL_CONTAINER_ID"
assert_config_bootstrapped "$INITIAL_CONTAINER_ID"
assert_cache_mount "$INITIAL_CONTAINER_ID"
assert_volume_entry_owner "$CACHE_VOLUME" mina/docker-service-test-cache-probe "$HOST_UID:$HOST_GID"

log "normal recreation without demo override"
compose_base up -d --force-recreate
NORMAL_CONTAINER_ID="$(compose_base ps -q mina)"
wait_healthy "$NORMAL_CONTAINER_ID"
assert_reachability
assert_demo_snapshot_retained

log "same-image restart"
compose_base restart mina
wait_healthy "$NORMAL_CONTAINER_ID"
assert_reachability
assert_demo_snapshot_retained

log "ordinary down preserves named volumes and changed IDs are repaired"
data_mountpoint="$(docker volume inspect -f '{{.Mountpoint}}' "$DATA_VOLUME")"
cache_mountpoint="$(docker volume inspect -f '{{.Mountpoint}}' "$CACHE_VOLUME")"
compose_base down --remove-orphans
assert_volume_exists "$DATA_VOLUME"
assert_volume_exists "$CACHE_VOLUME"
if [[ "$(docker volume inspect -f '{{.Mountpoint}}' "$DATA_VOLUME")" != "$data_mountpoint" ]]; then
    printf 'data volume changed across ordinary compose down\n' >&2
    exit 1
fi
if [[ "$(docker volume inspect -f '{{.Mountpoint}}' "$CACHE_VOLUME")" != "$cache_mountpoint" ]]; then
    printf 'cache volume changed across ordinary compose down\n' >&2
    exit 1
fi
assert_volume_entry_content "$CACHE_VOLUME" mina/docker-service-test-cache-probe "cache-probe-$RUN_ID"
compose_volume_init_as "$ALT_UID" "$ALT_GID"
assert_volume_entry_owner "$DATA_VOLUME" . "$ALT_UID:$ALT_GID"
assert_volume_entry_owner "$DATA_VOLUME" mina.duckdb "$ALT_UID:$ALT_GID"
assert_volume_entry_owner "$CACHE_VOLUME" mina/docker-service-test-cache-probe "$ALT_UID:$ALT_GID"
assert_host_owned_file "$CONFIG_DIR/config.toml"
compose_base up -d
NORMAL_CONTAINER_ID="$(compose_base ps -q mina)"
wait_healthy "$NORMAL_CONTAINER_ID"
assert_volume_entry_owner "$DATA_VOLUME" mina.duckdb "$HOST_UID:$HOST_GID"
assert_volume_entry_owner "$CACHE_VOLUME" mina/docker-service-test-cache-probe "$HOST_UID:$HOST_GID"
assert_reachability
assert_demo_snapshot_retained

log "pre-update backup"
PRE_UPDATE_BACKUP="$(trigger_backup)"
printf 'pre-update backup: %s\n' "$PRE_UPDATE_BACKUP"
assert_host_owned_file "$PRE_UPDATE_BACKUP"
assert_private_file "$PRE_UPDATE_BACKUP"

log "updated-image recreation"
CURRENT_IMAGE="$UPDATED_IMAGE"
compose_base up -d --force-recreate
UPDATED_CONTAINER_ID="$(compose_base ps -q mina)"
wait_healthy "$UPDATED_CONTAINER_ID"
if [[ "$UPDATED_CONTAINER_ID" == "$NORMAL_CONTAINER_ID" ]]; then
    printf 'container ID did not change during image replacement\n' >&2
    exit 1
fi
if [[ "$EXPECT_DISTINCT_UPDATE" == true ]]; then
    assert_container_image "$UPDATED_CONTAINER_ID" "$UPDATED_IMAGE_ID"
else
    assert_container_image "$UPDATED_CONTAINER_ID" "$INITIAL_IMAGE_ID"
fi
assert_reachability

log "retained demo data after update"
assert_demo_snapshot_retained

log "post-update backup"
POST_UPDATE_BACKUP="$(trigger_backup)"
printf 'post-update backup: %s\n' "$POST_UPDATE_BACKUP"
assert_host_owned_file "$POST_UPDATE_BACKUP"
assert_private_file "$POST_UPDATE_BACKUP"

log "database validation"
start_seconds="$(date +%s)"
compose_base stop mina
end_seconds="$(date +%s)"
elapsed_seconds=$(( end_seconds - start_seconds ))
if (( elapsed_seconds > 35 )); then
    printf 'compose stop took %ss, exceeding grace allowance\n' "$elapsed_seconds" >&2
    exit 1
fi
restart_count="$(docker inspect -f '{{.RestartCount}}' "$UPDATED_CONTAINER_ID")"
exit_code="$(docker inspect -f '{{.State.ExitCode}}' "$UPDATED_CONTAINER_ID")"
if [[ "$restart_count" != "0" || "$exit_code" != "0" ]]; then
    printf 'unexpected stopped container state: restart_count=%s exit_code=%s\n' "$restart_count" "$exit_code" >&2
    exit 1
fi
validate_database_file /data/mina.duckdb

log "backup validation"
validate_database_file "/backups/$(basename "$PRE_UPDATE_BACKUP")"
validate_database_file "/backups/$(basename "$POST_UPDATE_BACKUP")"

log "explicit database and cache import"
test_container_import

log "cleanup"
cleanup
assert_no_owned_docker_objects
assert_no_owned_images
for volume in "$DATA_VOLUME" "$CACHE_VOLUME" "$IMPORT_DATA_VOLUME" "$IMPORT_CACHE_VOLUME"; do
    if docker volume inspect "$volume" >/dev/null 2>&1; then
        printf 'test volume remains after cleanup: %s\n' "$volume" >&2
        exit 1
    fi
done
if [[ -e "$WORK_DIR" ]]; then
    printf 'temporary work directory remains: %s\n' "$WORK_DIR" >&2
    exit 1
fi
printf 'cleanup complete for project %s\n' "$PROJECT"
