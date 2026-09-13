#!/usr/bin/env bash
# Recriptografa as páginas e carimba a versão (derruba cache do navegador).
# Uso: build/all.sh 'SUA_SENHA'
set -euo pipefail
PW="${1:?informe a senha}"
cd "$(dirname "$0")/.."
VERSAO=$(date +%Y%m%d%H%M%S)
for p in index callback vantagens; do
  node build/encrypt.mjs "$PW" "content/$p.inner.html" "$p.enc.json"
done
python3 build/stamp.py "$VERSAO"
