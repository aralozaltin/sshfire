cask "sshfire" do
  arch arm: "aarch64", intel: "x64"

  version "0.1.9"
  sha256 arm:   "fa6fc795539f119e30cf82749a26f5d905db9014fcca706981ffbf7e6da06a51",
         intel: "23c493f7b7f525e9fd1f1b3f52a5361a740114f42d87afa7cf4be7e49280f1d9"

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
