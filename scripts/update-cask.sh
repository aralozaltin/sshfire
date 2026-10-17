#!/usr/bin/env bash
# Writes the Homebrew cask for a published release: scripts/update-cask.sh 0.1.2 path/to/Casks/sshfire.rb
set -euo pipefail
version="${1:?usage: update-cask.sh VERSION OUTPUT_FILE}"
out="${2:?usage: update-cask.sh VERSION OUTPUT_FILE}"
base="https://github.com/aralozaltin/sshfire/releases/download/v${version}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
sha() { curl -fsSL -o "$tmp/$1.dmg" "$base/SSHFire_${version}_$1.dmg" && shasum -a 256 "$tmp/$1.dmg" | cut -d' ' -f1; }
arm="$(sha aarch64)"
intel="$(sha x64)"
cat > "$out" <<RUBY
cask "sshfire" do
  arch arm: "aarch64", intel: "x64"

  version "${version}"
  sha256 arm:   "${arm}",
         intel: "${intel}"

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
RUBY
echo "wrote $out for v${version}"
