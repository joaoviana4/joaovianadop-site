#!/bin/sh
# PØRTAL Studio → studio/ → joaovianadop.com/studio (Supabase BlackCat, esquema "studio").
# Desde 16 out 2026 o Studio tem o seu próprio código (esta pasta). O byGrain (_src/bygrain) fica parado.
set -e
cd "$(dirname "$0")"
npx vite build --mode studio
