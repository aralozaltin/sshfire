# ssh-istemci (çalışma adı)

Kayıtlı sunuculara çift tıkla bağlanan, hızlı bir masaüstü SSH terminali. Tauri 2 + React + xterm.js, çekirdek Rust (`russh`).
Şifreler işletim sisteminin anahtar deposunda (macOS Keychain, Windows Credential Manager, Linux Secret Service).


## Özellikler

- Kayıtlı sunucu listesi (klasörler, arama), çift tıkla bağlanma; parolalar işletim sistemi anahtar deposunda, kayıtlı değilse bağlanırken sorulur
- `~/.ssh/config` içe aktarma (ProxyJump dahil), sunucu listesini dosyaya dışa/içe aktarma
- Sekmeli terminal (xterm.js), sağ tık kopyala/yapıştır, yakınlaştırma, arama; yan yana / alt alta / ızgara bölünmüş görünüm
- Jump host (bastion) üzerinden bağlanma, bağlanınca otomatik komut çalıştırma, yerel terminal
- SFTP dosya paneli: terminalin klasörünü izler; kopyala/kes/yapıştır, sürükle-bırak taşıma/kopyalama, satır içi yeniden adlandırma, yükle/indir, yerleşik metin düzenleyici
- Terminal altında canlı sunucu metrikleri (CPU, bellek, disk, yük, ağ)
- Port tünelleri (yerel -L ve SOCKS -D), MultiExec, makrolar (kayıtlı ve kaydedilebilir)
- Açık / koyu tema, Türkçe / English, boyutlandırılabilir kenar çubuğu ve sütunlar

## Çalıştırma

```bash
npm install            # .npmrc legacy-peer-deps kullanır
npm run tauri dev
```

Rust gerekir (`rustup`).

## Test

```bash
cargo test --workspace          # çekirdek; SSH testleri için aşağıdaki sunucu
npm test                        # arayüz (Vitest)
vcore/tests/docker/up.sh        # test sunucusu: 127.0.0.1:2222 (kapalıysa SSH testleri atlanır)
cargo test -p vcore -- --ignored   # gerçek anahtar deposu testi (elle)
```

Elle kontrol listesi: `docs/manual-checklist.md`

## Yapı

- `vcore/` — arayüzden bağımsız Rust kütüphanesi: `sessions`, `secrets`, `known_hosts`, `ssh`
- `src-tauri/` — Tauri komutları ve geri basınçlı terminal akışı
- `src/` — React arayüzü
