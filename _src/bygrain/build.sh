#!/bin/sh
# byGrain Studio → bygrain/ → joaovianadop.com/bygrain. Parado desde 16 out 2026 (a equipa da Grain já o usa).
# O PØRTAL Studio tem agora o seu próprio código em _src/portal.
set -e
cd "$(dirname "$0")"
npx vite build
