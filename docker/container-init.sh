#!/bin/sh
set -eu
umask 077

database_source=""
cache_source=""
database_stage=""
cache_stage=""
cache_installed=false
database_destination=/data/mina.duckdb
cache_destination=/cache/mina

usage() {
    printf 'usage: container-init [--database /absolute/path/mina.duckdb] [--cache /absolute/path/cache]\n' >&2
}

fail() {
    printf 'mina container-init: %s\n' "$*" >&2
    exit 1
}

cleanup() {
    rollback_cache
    if [ -n "$database_stage" ]; then
        rm -f "$database_stage"
    fi
    if [ -n "$cache_stage" ]; then
        rm -rf "$cache_stage"
    fi
}

rollback_cache() {
    if [ "$cache_installed" = true ]; then
        rm -rf "$cache_destination"
        mkdir "$cache_destination"
        chmod 0700 "$cache_destination"
        cache_installed=false
    fi
}

trap cleanup EXIT
trap 'exit 1' HUP INT TERM

while [ "$#" -gt 0 ]; do
    case "$1" in
        --database)
            [ -z "$database_source" ] || fail "--database may be provided only once"
            [ "$#" -ge 2 ] || fail "--database requires a path"
            database_source="$2"
            shift 2
            ;;
        --cache)
            [ -z "$cache_source" ] || fail "--cache may be provided only once"
            [ "$#" -ge 2 ] || fail "--cache requires a path"
            cache_source="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            usage
            fail "unsupported argument: $1"
            ;;
    esac
done

if [ -z "$database_source" ] && [ -z "$cache_source" ]; then
    usage
    fail "provide --database, --cache, or both"
fi

if [ -n "$database_source" ]; then
    case "$database_source" in
        /*) ;;
        *) fail "database source must be an absolute container path" ;;
    esac
    [ ! -L "$database_source" ] || fail "database source must not be a symlink: $database_source"
    [ -f "$database_source" ] || fail "database source is not a regular file: $database_source"
    [ -r "$database_source" ] || fail "database source is not readable: $database_source"
    if [ -e "$database_destination" ] || [ -L "$database_destination" ]; then
        fail "database destination already exists: $database_destination"
    fi
    [ -w /data ] || fail "database volume is not writable: /data"
fi

if [ -n "$cache_source" ]; then
    case "$cache_source" in
        /*) ;;
        *) fail "cache source must be an absolute container path" ;;
    esac
    [ ! -L "$cache_source" ] || fail "cache source must not be a symlink: $cache_source"
    [ -d "$cache_source" ] || fail "cache source is not a directory: $cache_source"
    [ -r "$cache_source" ] && [ -x "$cache_source" ] || fail "cache source is not readable: $cache_source"
    [ -d "$cache_destination" ] || fail "cache destination is not initialized: $cache_destination"
    [ -w "$cache_destination" ] || fail "cache destination is not writable: $cache_destination"
    if [ -n "$(find "$cache_destination" -mindepth 1 -print -quit)" ]; then
        fail "cache destination must be empty: $cache_destination"
    fi
    if ! unsafe_entry="$(find "$cache_source" -mindepth 1 ! \( -type d -o -type f \) -print -quit)"; then
        fail "cannot inspect every cache source entry"
    fi
    if [ -n "$unsafe_entry" ]; then
        fail "cache source contains a symlink or special entry: $unsafe_entry"
    fi

    cache_stage="/cache/.mina-cache-import.$$"
    [ ! -e "$cache_stage" ] || fail "cache staging path already exists: $cache_stage"
    mkdir "$cache_stage"
    chmod 0700 "$cache_stage"
    if ! cp -R --no-preserve=mode,ownership,timestamps "$cache_source/." "$cache_stage/"; then
        fail "failed to stage cache source"
    fi
    if ! unsafe_entry="$(find "$cache_stage" -mindepth 1 ! \( -type d -o -type f \) -print -quit)"; then
        fail "cannot inspect every staged cache entry"
    fi
    [ -z "$unsafe_entry" ] || fail "staged cache contains an unsafe entry: $unsafe_entry"
    find "$cache_stage" -type d -exec chmod 0700 {} +
    find "$cache_stage" -type f -exec chmod 0600 {} +
fi

if [ -n "$database_source" ]; then
    database_stage="/data/.mina-db-import.$$"
    [ ! -e "$database_stage" ] || fail "database staging path already exists: $database_stage"
    if ! cp --no-preserve=mode,ownership,timestamps "$database_source" "$database_stage"; then
        fail "failed to stage database source"
    fi
    chmod 0600 "$database_stage"
    if ! mina db validate --db "$database_stage"; then
        fail "database source validation failed"
    fi
fi

if [ -n "$cache_source" ]; then
    if [ -n "$(find "$cache_destination" -mindepth 1 -print -quit)" ]; then
        fail "cache destination became non-empty during import"
    fi
    rmdir "$cache_destination"
    if ! mv "$cache_stage" "$cache_destination"; then
        mkdir "$cache_destination"
        chmod 0700 "$cache_destination"
        fail "failed to install staged cache"
    fi
    cache_stage=""
    cache_installed=true
fi

if [ -n "$database_source" ]; then
    if [ -e "$database_destination" ] || [ -L "$database_destination" ]; then
        rollback_cache
        fail "database destination appeared during import: $database_destination"
    fi
    if ! mv "$database_stage" "$database_destination"; then
        rollback_cache
        fail "failed to install staged database"
    fi
    database_stage=""
fi

cache_installed=false
trap - EXIT HUP INT TERM
printf 'mina container-init: import complete\n'
