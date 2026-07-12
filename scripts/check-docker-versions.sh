#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCKERFILE="$ROOT_DIR/docker/Dockerfile"
MISE_FILE="$ROOT_DIR/mise.toml"
PACKAGE_FILE="$ROOT_DIR/frontend/package.json"

docker_arg() {
    sed -n "s/^ARG $1=//p" "$DOCKERFILE"
}

require_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        printf 'required command not found: %s\n' "$1" >&2
        exit 1
    fi
}

require_command mise
require_command jq

if ! mise_json="$(cd "$ROOT_DIR" && mise ls --json)"; then
    printf 'failed to query project tools with mise ls --json in %s\n' "$ROOT_DIR" >&2
    exit 1
fi

mise_tool() {
    local tool="$1" selection count requested_version
    selection="$(
        jq -r --arg tool "$tool" --arg source "$MISE_FILE" '
            [
                .[$tool][]?
                | select(
                    .active == true
                    and .source.type == "mise.toml"
                    and .source.path == $source
                )
            ]
            | [length, (.[0].requested_version // "")]
            | @tsv
        ' <<<"$mise_json"
    )"
    IFS=$'\t' read -r count requested_version <<<"$selection"

    if [[ "$count" == "0" ]]; then
        printf 'mise has no active %s entry sourced from %s; run mise install in this workspace\n' "$tool" "$MISE_FILE" >&2
        exit 1
    fi
    if [[ "$count" != "1" ]]; then
        printf 'mise has %s active %s entries sourced from %s; expected exactly one\n' "$count" "$tool" "$MISE_FILE" >&2
        exit 1
    fi
    if [[ -z "$requested_version" ]]; then
        printf 'mise active %s entry sourced from %s has no requested_version\n' "$tool" "$MISE_FILE" >&2
        exit 1
    fi

    printf '%s\n' "$requested_version"
}

if ! package_manager="$(jq -er '.packageManager | select(type == "string" and length > 0)' "$PACKAGE_FILE")"; then
    printf '%s must contain a non-empty string packageManager field\n' "$PACKAGE_FILE" >&2
    exit 1
fi

package_pnpm="${package_manager#pnpm@}"
docker_go="$(docker_arg GO_VERSION)"
docker_node="$(docker_arg NODE_VERSION)"
mise_go="$(mise_tool go)"
mise_node="$(mise_tool node)"
mise_pnpm="$(mise_tool pnpm)"

fail=false
check_equal() {
    local label="$1" actual="$2" expected="$3"
    if [[ -z "$actual" || "$actual" != "$expected" ]]; then
        printf '%s mismatch: got %q, want %q\n' "$label" "$actual" "$expected" >&2
        fail=true
    fi
}

check_equal "Docker Go version" "$docker_go" "$mise_go"
check_equal "Docker Node version" "$docker_node" "$mise_node"
check_equal "frontend packageManager" "$package_manager" "pnpm@$mise_pnpm"
check_equal "frontend pnpm version" "$package_pnpm" "$mise_pnpm"

if [[ "$fail" == true ]]; then
    exit 1
fi

printf 'Docker tool versions match mise.toml and frontend/package.json\n'
