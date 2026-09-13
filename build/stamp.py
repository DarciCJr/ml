#!/usr/bin/env python3
"""Carimba a versão nas cascas HTML, para o navegador não servir cache velho."""
import re, sys, pathlib

versao = sys.argv[1]
for nome in ('index.html', 'callback.html', 'vantagens.html', 'diagnostico.html'):
    p = pathlib.Path(nome)
    if not p.exists():
        continue
    s = p.read_text()
    # remove carimbos anteriores e reaplica um só, antes do primeiro <script src=>
    s = re.sub(r"<script>window\.ML_VERSAO='[0-9]*';</script>\n?", '', s)
    s = re.sub(r'(src="(?:ml-core|gate|diagnostico|app|callback)\.js)(\?v=[0-9]*)?"',
               rf'\1?v={versao}"', s)
    s = s.replace('<script src=', f"<script>window.ML_VERSAO='{versao}';</script>\n<script src=", 1)
    p.write_text(s)
print(f'versão {versao} carimbada em {len(sys.argv)}')
