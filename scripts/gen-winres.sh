#!/usr/bin/env bash
# Patches versioninfo.json with the real release version, then generates
# the Windows resource file (resource.syso) that gets embedded in mailtub.exe.
#
# Usage (called by .goreleaser.yml before hook):
#   bash scripts/gen-winres.sh 1.2.3
#
# Falls back to 0.0.0 when no argument is given (local dev / snapshot).

set -euo pipefail

VERSION="${1:-0.0.0}"

# Strip any pre-release suffix: "1.2.3-next" → "1.2.3"
CLEAN="${VERSION%%-*}"

IFS='.' read -r MAJOR MINOR PATCH <<< "${CLEAN}"
MAJOR="${MAJOR:-0}"
MINOR="${MINOR:-0}"
PATCH="${PATCH:-0}"

echo "gen-winres: patching versioninfo.json → ${MAJOR}.${MINOR}.${PATCH}.0"

python3 -c "
import json, pathlib

p = pathlib.Path('cmd/mailtub/versioninfo.json')
d = json.loads(p.read_text())

ver = {'Major': ${MAJOR}, 'Minor': ${MINOR}, 'Patch': ${PATCH}, 'Build': 0}
d['FixedFileInfo']['FileVersion']    = ver
d['FixedFileInfo']['ProductVersion'] = ver

d['StringFileInfo']['FileVersion']      = '${CLEAN}.0'
d['StringFileInfo']['ProductVersion']   = '${CLEAN}.0'
d['StringFileInfo']['OriginalFilename'] = 'mailtub.exe'

p.write_text(json.dumps(d, indent=2) + '\n')
"

go install github.com/josephspurrier/goversioninfo/cmd/goversioninfo@latest
go generate ./cmd/mailtub

echo "gen-winres: resource.syso generated"
