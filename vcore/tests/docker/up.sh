#!/bin/sh
# Entegrasyon testleri için yerel OpenSSH sunucusu başlatır (127.0.0.1:2222).
# Kullanıcı: tester / test-pass-123 — yalnızca bu test kapsayıcısına aittir.
set -e
cd "$(dirname "$0")"
mkdir -p .keys
[ -f .keys/test_key ] || ssh-keygen -q -t ed25519 -N "" -f .keys/test_key
docker compose up -d
# Tünel testleri için TCP yönlendirmeye izin verilir.
# Yanlış parola testleri aynı adresten çok başarısız deneme yapar; OpenSSH'ın
# kaynak başına ceza özelliği sonraki bağlantıları düşürmesin diye kapatılır.
sleep 4
docker exec ssh-istemci-test-sshd sh -c \
  'grep -q "^PerSourcePenalties no" /config/sshd/sshd_config || echo "PerSourcePenalties no" >> /config/sshd/sshd_config'
docker exec ssh-istemci-test-sshd sh -c \
  'sed -i "/^AllowTcpForwarding/d" /config/sshd/sshd_config; echo "AllowTcpForwarding yes" >> /config/sshd/sshd_config'
docker restart ssh-istemci-test-sshd >/dev/null
sleep 4
