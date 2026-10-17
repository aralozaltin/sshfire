cask "sshfire" do
  arch arm: "aarch64", intel: "x64"

  version "0.1.3"
  sha256 arm:   "f0fed61c2901aab5c669b068d23e4b113bc958988ef203f2c5b5375c8ae8b541",
         intel: "081007a6437d90707004d8e4fa45dd1929d08c2055c8669ebb7d2ea450d49811"

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
