#!/usr/bin/env node
// Guarda a resposta do OAuth em .ml-tokens.json
// Uso: node src/salvar-token.mjs '{"access_token":"APP_USR-...","refresh_token":"TG-...","expires_in":21600}'
import { salvar } from './auth.mjs';

const raw = process.argv[2];
if (!raw) {
  console.error("Uso: node src/salvar-token.mjs '<json devolvido pelo /oauth/token>'");
  process.exit(1);
}
try {
  salvar(JSON.parse(raw));
  console.log('Tokens gravados em .ml-tokens.json (permissão 600).');
} catch (err) {
  console.error(`Erro: ${err.message}`);
  process.exit(1);
}
