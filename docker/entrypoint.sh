#!/bin/sh
set -eu
umask 077

if [ "${1:-}" = "volume-init" ]; then
    shift
    exec mina-volume-init "$@"
fi

run_uid="$(id -u)"
run_gid="$(id -g)"
if [ "$run_uid" = "0" ] || [ "$run_gid" = "0" ]; then
    printf 'mina: refusing effective UID or primary GID 0 (got %s:%s); set MINA_UID:MINA_GID to the non-root owner and group of the persistent state directories\n' "$run_uid" "$run_gid" >&2
    exit 1
fi

if [ "${1:-}" = "container-init" ]; then
    shift
    exec mina-container-init "$@"
fi

if [ "${1:-}" = "serve" ]; then
    config_root="${XDG_CONFIG_HOME:-/config}"
    config_dir="$config_root/mina"
    config_file="$config_dir/config.toml"
    template=/usr/local/share/mina/config.toml
    identity="UID $run_uid, GID $run_gid"

    if ! mkdir -p "$config_dir"; then
        printf 'mina: cannot create config directory %s as %s; ensure the bind directory exists and is writable by the configured MINA_UID:MINA_GID\n' "$config_dir" "$identity" >&2
        exit 1
    fi
    if [ ! -w "$config_dir" ]; then
        printf 'mina: config directory %s is not writable by %s; set MINA_UID:MINA_GID to the directory owner\n' "$config_dir" "$identity" >&2
        exit 1
    fi
    if [ ! -e "$config_file" ]; then
        if ! cp "$template" "$config_file"; then
            printf 'mina: cannot initialize config file %s as %s; ensure the config bind is writable\n' "$config_file" "$identity" >&2
            exit 1
        fi
    elif [ ! -f "$config_file" ]; then
        printf 'mina: config path %s exists but is not a regular file\n' "$config_file" >&2
        exit 1
    elif [ ! -w "$config_file" ]; then
        printf 'mina: config file %s is not writable by %s; set MINA_UID:MINA_GID to the file owner\n' "$config_file" "$identity" >&2
        exit 1
    fi
fi

exec mina "$@"
