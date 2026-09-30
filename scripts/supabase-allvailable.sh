#!/bin/sh
# Isolated CLI credentials; existing global CLI/plugin accounts are not replaced.
set -eu
allvailable_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
export SUPABASE_HOME="$allvailable_root/.env.allvailable-cli"
mkdir -p "$SUPABASE_HOME"
chmod 700 "$SUPABASE_HOME"
cd "$allvailable_root"
exec supabase "$@"
