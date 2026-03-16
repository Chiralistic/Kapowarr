#!/usr/bin/env bash
set -e

PUID=${PUID:-0}
PGID=${PGID:-0}

DB_DIR="/app/db"

if [ "$PUID" = "0" ]
then
    # Stay as root user
    echo "Running as root"
    exec "$@"

else
    # Switch to non-root user
    echo "Preparing Kapowarr to run as $PUID:$PGID..."

    groupmod -o -g "$PGID" kapowarr
    usermod -o -u "$PUID" -g "$PGID" kapowarr

    echo "Ensuring ownership..."
    chown -R kapowarr:kapowarr "$DB_DIR" || {
        echo "Failed to update ownership of $DB_DIR to $PUID:$PGID"
        exit 1
    }

    echo "Running as $PUID:$PGID"
    exec gosu kapowarr "$@"
fi
