#!/bin/sh
cd "$(dirname "$0")"
echo "http://localhost:8765/"
exec python3 serve.py 8765
