# Elle kontrol listesi (Aşama 1)

Otomatik testlerin tam kapsayamadığı yerler. Test sunucusunu başlat: `vcore/tests/docker/up.sh`
(127.0.0.1:2222, kullanıcı `tester`, parola `test-pass-123`).

## macOS (yapıldı: 2026-10-16, otomatik kısım)

- [x] `cargo test --workspace` ve `npm test` yeşil
- [x] 100 MB çıktı çekirdekten eksiksiz geçti (~2 sn) — `hundred_megabytes_of_output_…`
- [x] Gerçek Keychain: `cargo test -p vcore -- --ignored` geçti, test kaydı silindi
- [x] `npm run tauri build -- --bundles app` → `ssh-istemci.app` (6,5 MB), açılışta hata yok

## Arayüzde elle (sen)

- [ ] Sunucu ekle (parola ile) → listede görünür; uygulamayı kapat/aç → hâlâ orada
- [ ] Tıkla → ilk bağlantıda parmak izi penceresi; "Reddet" odakta; "Güven ve bağlan" bağlar
- [ ] Aynı sunucuya tekrar → pencere gelmez
- [ ] `vim`, `htop`, `top` çalışıyor; renkler doğru; Türkçe karakterler (ş, ğ, ı) yazılıyor
- [ ] Pencereyi küçült/büyüt → `stty size` yeni boyutu gösteriyor
- [ ] `yes | head -c 500000000` → arayüz donmuyor, bellek makul kalıyor
- [ ] Sunucuyu durdur (`docker stop ssh-istemci-test-sshd`) → sekmede "Bağlantı kesildi", içerik duruyor
- [ ] Yanlış parola → "Kimlik doğrulama başarısız." görünüyor, parola hiçbir yerde yazmıyor
- [ ] Host key değiştir (`docker compose down -v` ile sunucu anahtarını sıfırla, tekrar `up.sh`) → "Sunucu anahtarı değişmiş" ve iki parmak izi; bağlanmıyor
- [ ] Anahtar dosyasıyla giriş: yol `vcore/tests/docker/.keys/test_key`
- [ ] Sekmeleri kapat/aç, birden fazla sunucu aynı anda
- [ ] macOS Keychain izin penceresi çıkarsa davranış (reddet → temiz hata mı?)

## Windows (sen)

- [ ] `npm install`, `npm run tauri build` (Rust ve Visual Studio Build Tools gerekir)
- [ ] Yukarıdaki arayüz maddelerinin hepsi
- [ ] Parola Windows Credential Manager'da görünüyor ("ssh-istemci" adıyla) ve oturum dosyasında yok
- [ ] `cargo test --workspace` (Docker testleri sunucu kapalıysa atlanır)
