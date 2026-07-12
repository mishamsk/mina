#!/bin/sh
set -eu
umask 077

fail() {
    printf 'mina volume-init: %s\n' "$*" >&2
    exit 1
}

[ "$#" -eq 0 ] || fail "does not accept arguments"

if [ "$(id -u)" != "0" ] || [ "$(id -g)" != "0" ]; then
    fail "must run as UID:GID 0:0"
fi

uid="${MINA_UID:-}"
gid="${MINA_GID:-}"
case "$uid" in
    ''|*[!0-9]*) fail "MINA_UID must be a nonzero numeric ID" ;;
    0) fail "MINA_UID must not be 0" ;;
esac
case "$gid" in
    ''|*[!0-9]*) fail "MINA_GID must be a nonzero numeric ID" ;;
    0) fail "MINA_GID must not be 0" ;;
esac

prepare_volume() {
    directory="$1"
    required_child="${2:-}"
    desired="$uid:$gid"

    [ -d "$directory" ] || fail "$directory is not a mounted directory"
    if [ -n "$required_child" ]; then
        if [ -e "$directory/$required_child" ] && [ ! -d "$directory/$required_child" ]; then
            fail "$directory/$required_child exists but is not a directory"
        fi
        if [ ! -d "$directory/$required_child" ]; then
            mkdir "$directory/$required_child"
        fi
    fi

    if [ "$(stat -c '%u:%g' "$directory")" = "$desired" ]; then
        if [ -z "$required_child" ] || [ "$(stat -c '%u:%g' "$directory/$required_child")" = "$desired" ]; then
            return
        fi
    fi

    chown -R "$desired" "$directory"
    chmod 0700 "$directory"
    if [ -n "$required_child" ]; then
        chmod 0700 "$directory/$required_child"
    fi
}

prepare_volume /data
prepare_volume /cache mina
