#!/bin/sh
# Downloads the pinned pdf.js build the player loads from vendor/pdfjs/.
set -e
cd "$(dirname "$0")"
mkdir -p pdfjs && cd pdfjs
curl -sL "https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-4.10.38.tgz" | tar xz
mv package/build/pdf.min.mjs package/build/pdf.worker.min.mjs .
rm -rf package
echo "pdf.js 4.10.38 in $(pwd)"
