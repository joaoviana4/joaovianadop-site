#!/bin/sh
# Constrói as duas apps a partir deste código:
#   bygrain/  → joaovianadop.com/bygrain  (byGrain Studio)
#   studio/   → joaovianadop.com/studio   (PØRTAL Studio, BlackCat, esquema "studio")
set -e
cd "$(dirname "$0")"
npx vite build
npx vite build --mode studio
