# Isolated test workspace

A Docker-based workspace for running the test suites on a clean Linux toolchain
(Elixir 1.20.4 / OTP 29.1.1, Node 22, aube, resvg, DejaVu fonts), matching the
production `Dockerfile`. The host checkout is mounted read-only and rsynced into
a container-local volume, so `_build`, `deps`, `node_modules`, and the SQLite
test database never touch your working tree.

Lives under `.claude/` so the repo's own toolchain files stay untouched. Run from the repository root:

```sh
# Full Elixir suite
docker compose -f .claude/docker-test/compose.yaml run --rm test

# One file / one test
docker compose -f .claude/docker-test/compose.yaml run --rm test mix test test/manavault/foo_test.exs:42

# React tests (installs node_modules into the volume on first use)
docker compose -f .claude/docker-test/compose.yaml run --rm test aube run test:react

# Any other command, e.g. a shell
docker compose -f .claude/docker-test/compose.yaml run --rm test sh
```

Uncommitted edits are picked up on every run (the source is re-synced at start).
Rebuild the image after dependency changes (`mix.lock`) with
`docker compose -f .claude/docker-test/compose.yaml build`. Reset all cached state with
`docker compose -f .claude/docker-test/compose.yaml down -v`.

The Android/iOS projects are excluded from the sync; native builds are not
supported in this workspace.
