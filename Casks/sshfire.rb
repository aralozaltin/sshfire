cask "sshfire" do
  arch arm: "aarch64", intel: "x64"

  version "0.1.5"
  sha256 arm:   "db4927e8ee856036beb4c6242f2a392b5d42065fab1a7965cee32899ab6834cd",
         intel: "df77f0f18e8f4a614ca765720c23590178c854e90f7e44215668b1fc901a3505"

  url "https://github.com/aralozaltin/sshfire/releases/download/v#{version}/SSHFire_#{version}_#{arch}.dmg"
  name "SSHFire"
  desc "Fast, lightweight SSH client with SFTP panel and live server metrics"
  homepage "https://github.com/aralozaltin/sshfire"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
  depends_on :macos

  app "SSHFire.app"

  # The app is not signed by Apple; clear the quarantine flag so it opens without the "damaged" prompt.
  # Legacy postflight on purpose: it works on every Homebrew version, postflight_steps only on the newest.
  postflight do
    system_command "/usr/bin/xattr",
                   args:         ["-dr", "com.apple.quarantine", "#{appdir}/SSHFire.app"],
                   must_succeed: false
  end

  zap trash: [
    "~/Library/Application Support/com.local.sshistemci",
    "~/Library/Caches/com.local.sshistemci",
    "~/Library/WebKit/com.local.sshistemci",
  ]
end
