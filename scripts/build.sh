#!/usr/bin/env bash
set -euo pipefail

mkdir -p dist

deno run --allow-read --allow-write --allow-run scripts/build.ts --config build.config.json 2>/dev/null \
  || deno run --allow-read --allow-write --allow-run scripts/build.ts 2>/dev/null

cp -r public/* dist/
cp src/style.css dist/style.css

rm -rf dist/apps
mkdir -p dist/apps
cp -r apps/* dist/apps/ 2>/dev/null || true

deno run --allow-read --allow-write scripts/generate-manifest.ts
deno run --allow-read --allow-write scripts/render-index.ts
deno run --allow-read --allow-write scripts/scope-manifest.ts
deno run --allow-read --allow-write scripts/generate-sw.ts
