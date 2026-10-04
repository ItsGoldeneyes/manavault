#!/bin/sh
# Copies the read-only source mount (/src) into the container-local /workspace
# volume, then runs the given command there. Build output, dependencies,
# node_modules and the SQLite test database never touch the host checkout.
set -eu

# Only transfer files; ignore host-built/runtime artifacts. Excluded paths are
# also protected from --delete, so node_modules and test DBs survive re-syncs.
rsync -rt --delete \
  --exclude '/.git' \
  --exclude '/.claude' \
  --exclude '/_build' \
  --exclude '/deps' \
  --exclude '/node_modules' \
  --exclude '/android' \
  --exclude '/ios' \
  --exclude '/data' \
  --exclude '/priv/static/assets' \
  --exclude '*.db' --exclude '*.db-*' \
  /src/ /workspace/

cd /workspace

# Install JS deps lazily, only for commands that need them.
case "$*" in
  *aube*|*vitest*|*node*|*npm*)
    if [ ! -d node_modules ] || [ aube-lock.yaml -nt node_modules/.aube-stamp ]; then
      aube install --frozen-lockfile
      touch node_modules/.aube-stamp
    fi
    ;;
esac

exec "$@"
