cask "sshfire" do
  arch arm: "aarch64", intel: "x64"

  version "0.1.2"
  sha256 arm:   "a22bff09d3690c8c52c9002947445f88452958a7c4efff4946d962058fe4e391",
         intel: "a5770e31279b4533612144e63a3f39fb1f750c13eb7610f6574ef0a60a526191"

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
