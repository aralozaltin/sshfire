# ssh-istemci (çalışma adı)

Kayıtlı sunuculara çift tıkla bağlanan, hızlı bir masaüstü SSH terminali. Tauri 2 + React + xterm.js, çekirdek Rust (`russh`).
Şifreler işletim sisteminin anahtar deposunda (macOS Keychain, Windows Credential Manager, Linux Secret Service).


## Özellikler

- Kayıtlı sunucu listesi (klasörler, arama), parolalar işletim sistemi anahtar deposunda
- Sekmeli terminal (xterm.js), host key doğrulama, parola ya da anahtar dosyasıyla giriş
- SFTP dosya paneli: gezme, kopyala/kes/yapıştır, yeniden adlandır, sil, bilgi, yükle/indir, sürükle-bırak
- Terminal altında canlı sunucu metrikleri (CPU, bellek, disk, yük, ağ)
- Açık / koyu tema, Türkçe / English

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
