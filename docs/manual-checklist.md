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

## Aşama 2: dosyalar, metrikler, tema, dil (elle)

Test sunucusu: `vcore/tests/docker/up.sh`. Otomatik testler yeşil olsa da aşağıdakiler arayüzde gözle doğrulanmalı.

- [ ] Bağlanınca sol panelde **Dosyalar** sekmesi ev klasörünü listeliyor; klasöre çift tık girer, yol çubuğu ve "Üst klasör" çalışır
- [ ] Sekme değiştirip dönünce klasör hatırlanıyor; başka sunucu sekmesine geçince onun dosyaları görünüyor
- [ ] Tıkla / Ctrl(⌘)+tıkla / Shift+tıkla seçim; ok tuşları, Enter, F2, Delete, Ctrl(⌘)+C/X/V
- [ ] Kopyala → aynı klasöre yapıştır: `ad (kopya).uzantı`; Kes → başka klasöre yapıştır: taşınıyor
- [ ] Tuhaf adlı dosya (`a b'c"; echo x.txt`) kopyalama, yeniden adlandırma, silme güvenli
- [ ] Silme önce uygulama içi onay soruyor; klasör içeriğiyle birlikte siliniyor
- [ ] Bilgi penceresi: yol, boyut, `rwx (0644)`, sahip/grup, tarih
- [ ] Yükle düğmesi dosya seçici açıyor; Finder/Explorer'dan sürükle-bırak (dosya ve klasör) yüklüyor
- [ ] İndir → Downloads klasörüne iniyor, aynı ad varsa `ad (2)`; ilerleme çubuğu ve iptal çalışıyor
- [ ] İptal edilen yükleme/indirmede yarım dosya kalmıyor
- [ ] Terminalin altında canlı metrik çubuğu (CPU, bellek, disk, yük, açık kalma, ağ); değerler `htop` ile uyumlu; yüksek kullanımda renk değişiyor
- [ ] Linux olmayan sunucuda metrik çubuğu "—" gösteriyor, bağlantı bozulmuyor
- [ ] Tema: Sistem/Açık/Koyu; sistem ayarı değişince "Sistem" modu anında uyuyor; terminal renkleri de değişiyor
- [ ] Dil: Türkçe/English; İngilizcede çevrilmemiş metin kalmamış; hata mesajları seçilen dilde
- [ ] Windows: yukarıdakilerin hepsi, ayrıca sürükle-bırak ve yol ayracı (`C:\...`) doğru

## Aşama 2b: izleme, sürükle-bırak, boyutlandırma (elle)

- [ ] Terminalde `cd /var/log` yazınca ~1-2 sn içinde Dosyalar paneli o klasöre geçiyor; "Terminali izle" kapalıyken geçmiyor, açınca terminalin klasörüne atlıyor
- [ ] Başka sunucu sekmesine geçince panel o sekmenin terminal klasörünü gösteriyor
- [ ] Linux olmayan sunucuda izleme sessizce devre dışı (panel ev klasöründe kalıyor), hata yok
- [ ] Panel içinde sürükle-bırak: dosya/çoklu seçim klasör satırına ya da yol çubuğundaki bir klasöre bırakılınca taşınıyor; Ctrl (Windows) / Option (Mac) basılıyken kopyalanıyor
- [ ] Aynı adlı dosya olan klasöre bırakınca `ad (kopya)` oluyor; klasör kendi içine bırakılamıyor
- [ ] F2 / sağ tık → Yeniden adlandır satır içinde (uzantı seçili değil), Enter onaylar, Esc iptal eder
- [ ] Sol panel genişliği ayırıcıdan sürüklenerek (ya da ok tuşlarıyla) değişiyor, çift tık varsayılana döner, yeniden açınca hatırlanıyor
- [ ] Dosya tablosunda sütun kenarları sürüklenerek boyutlanıyor, çift tık varsayılana döner
- [ ] Metrik çubuğu terminalin altında görünüyor (daha önce xterm ile CSS sınıfı çakıştığı için örtülüyordu)
