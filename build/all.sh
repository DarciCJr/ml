#!/usr/bin/env bash
# Recriptografa todas as páginas. Uso: build/all.sh 'SUA_SENHA'
set -euo pipefail
PW="${1:?informe a senha}"
cd "$(dirname "$0")/.."
for p in index callback vantagens; do
  node build/encrypt.mjs "$PW" "content/$p.inner.html" "$p.enc.json"
done
