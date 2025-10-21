#!/usr/bin/env bash
set -euo pipefail
file="public/index.html"
if [ ! -f "$file" ]; then echo "file not found: $file" >&2; exit 1; fi
# Extract current version string
old=$(grep -o "Stock Analyzer v\.[0-9]\+" "$file" | head -n1 || true)
if [ -z "$old" ]; then echo "version string not found" >&2; exit 1; fi
num=$(echo "$old" | sed -E 's/.*v\.([0-9]+)/\1/')
# Force base-10 to avoid octal interpretation if the version had leading zeros
new=$((10#$num + 1))
newstr="Stock Analyzer v.$new"

# Use awk to replace the first occurrence only
tmp=$(mktemp)
awk -v newnum="$new" 'BEGIN{re="Stock Analyzer v\\.[0-9]+"; done=0}
{
	if(!done && match($0,re)){
		gsub(re, "Stock Analyzer v." newnum, $0);
		done=1
	}
	print
}' "$file" > "$tmp" && mv "$tmp" "$file"

# commit & push
git add "$file"
git commit -m "chore(version): bump to v.$new"
git push

echo "bumped $file -> $newstr and pushed"