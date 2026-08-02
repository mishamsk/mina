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
        bootstrap_config="$config_dir/.config.toml.bootstrap.$$"
        auth_file="$config_dir/auth.toml"
        initial_admin_email="${MINA_INITIAL_ADMIN_EMAIL:-}"
        initial_admin_password="${MINA_INITIAL_ADMIN_PASSWORD:-}"
        cleanup_bootstrap() {
            rm -f "$bootstrap_config"
        }
        trap cleanup_bootstrap EXIT HUP INT TERM
        if [ ! -e "$auth_file" ]; then
            if [ -z "$initial_admin_email" ] || [ "$initial_admin_email" = "replace-with-your-email" ]; then
                printf 'mina: MINA_INITIAL_ADMIN_EMAIL is required for fresh initialization and must not be the .env.example placeholder\n' >&2
                exit 1
            fi
            if [ -z "$initial_admin_password" ] || [ "$initial_admin_password" = "replace-with-a-long-random-password" ]; then
                printf 'mina: MINA_INITIAL_ADMIN_PASSWORD is required for fresh initialization and must not be the .env.example placeholder\n' >&2
                exit 1
            fi
        elif [ ! -f "$auth_file" ]; then
            printf 'mina: authentication path %s exists but is not a regular file; no existing state was overwritten\n' "$auth_file" >&2
            exit 1
        fi
        if ! cp "$template" "$bootstrap_config"; then
            printf 'mina: cannot initialize config file %s as %s; ensure the config bind is writable\n' "$config_file" "$identity" >&2
            exit 1
        fi
        if [ ! -e "$auth_file" ]; then
            if ! printf '%s\n%s\n' "$initial_admin_password" "$initial_admin_password" | mina --config-file "$bootstrap_config" auth init -- "$initial_admin_email"; then
                printf 'mina: cannot initialize authentication file %s as %s; no existing config or auth file was overwritten\n' "$auth_file" "$identity" >&2
                exit 1
            fi
        fi
        if ! mv "$bootstrap_config" "$config_file"; then
            printf 'mina: cannot install initialized config file %s as %s; existing authentication state was preserved for retry\n' "$config_file" "$identity" >&2
            exit 1
        fi
        trap - EXIT HUP INT TERM
    elif [ ! -f "$config_file" ]; then
        printf 'mina: config path %s exists but is not a regular file\n' "$config_file" >&2
        exit 1
    elif [ ! -w "$config_file" ]; then
        printf 'mina: config file %s is not writable by %s; set MINA_UID:MINA_GID to the file owner\n' "$config_file" "$identity" >&2
        exit 1
    fi
fi

unset MINA_INITIAL_ADMIN_EMAIL MINA_INITIAL_ADMIN_PASSWORD
unset initial_admin_email initial_admin_password

exec mina "$@"
