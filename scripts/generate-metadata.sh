#!/bin/bash
#
# Generate LSP metadata files from source JSON
#
# Usage: ./scripts/generate-metadata.sh <SOURCE_DIR>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SOURCE_DIR="${1:-}"
FILTER_DIR="$PROJECT_ROOT/jq-filters"
OUTPUT_DIR="$PROJECT_ROOT/server/src/metadata"

# Verify source directory exists
if [[ -z "$SOURCE_DIR" || ! -d "$SOURCE_DIR" ]]; then
    echo "Usage: $0 <SOURCE_DIR>" >&2
    exit 1
fi

# Verify jq is available
if ! command -v jq &> /dev/null; then
    echo "Error: jq is required but not installed" >&2
    exit 1
fi

echo "Source: $SOURCE_DIR"
echo "Output: $OUTPUT_DIR"
echo

# Extract types and subroutines for use in filters
TYPES=$(jq -c '[to_entries[] | select(.value.visibility == "public") | .key]' "$SOURCE_DIR/vcl_types.json")
SUBROUTINES=$(jq -c '[to_entries[] | select(.value.visibility == "public") | .key]' "$SOURCE_DIR/methods.json")

# Helper to run jq with the filters library and common variables
run_jq() {
    local filter="$1"
    local input="$2"
    local output="$3"

    echo "Generating $(basename "$output")..."
    jq -L "$FILTER_DIR" \
        --argjson types "$TYPES" \
        --argjson subroutines "$SUBROUTINES" \
        -f "$FILTER_DIR/$filter" "$input" > "$output"
}

# Generate functions.json from vcl_functions.json
run_jq "vcl_functions.jq" "$SOURCE_DIR/vcl_functions.json" "$OUTPUT_DIR/functions.json"

# Generate variables.json from vars.json
run_jq "vars.jq" "$SOURCE_DIR/vars.json" "$OUTPUT_DIR/variables.json"

echo
echo "Done."
