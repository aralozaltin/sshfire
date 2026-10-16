#!/bin/sh
# Entegrasyon testleri için yerel OpenSSH sunucusu başlatır (127.0.0.1:2222).
# Kullanıcı: tester / test-pass-123 — yalnızca bu test kapsayıcısına aittir.
set -e
cd "$(dirname "$0")"
mkdir -p .keys
[ -f .keys/test_key ] || ssh-keygen -q -t ed25519 -N "" -f .keys/test_key
docker compose up -d
