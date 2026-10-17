# Releasing

Releases are built by GitHub Actions (`.github/workflows/release.yml`) when a version tag is pushed. The workflow builds installers for macOS (Apple Silicon and Intel), Windows and Linux, signs the update packages and publishes a GitHub release together with `latest.json`, which the in-app updater reads.

## One-time setup

1. Generate an updater key pair (keep the private key and its password safe, losing them means existing installs can no longer be updated):

   ```bash
   npx tauri signer generate -w ~/.sshfire-signing/updater.key
   ```

2. Put the **public** key into `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`.
3. In the GitHub repository open *Settings → Secrets and variables → Actions* and add:
   - `TAURI_SIGNING_PRIVATE_KEY`: the full content of the private key file
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: its password

## Cutting a release

1. Bump the version in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and `package.json` (they must match).
2. Commit, then tag and push:

   ```bash
   git tag v0.2.0
   git push origin main v0.2.0
   ```

3. Watch the *Release* workflow. When it finishes, installed copies find the new version on their next check.
4. Update the Homebrew cask (it lives in this repository under `Casks/`):

   ```bash
   scripts/update-cask.sh 0.2.0
   git add Casks/sshfire.rb && git commit -m "chore: update the Homebrew cask to 0.2.0" && git push
   ```

   Do this only after the release has all its files (the script downloads both macOS disk images to compute their checksums).

Local test build with signing:

```bash
export TAURI_SIGNING_PRIVATE_KEY="$HOME/.sshfire-signing/updater.key"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="…"
npm run tauri build
```

This produces `SSHFire.app.tar.gz` and its `.sig` next to the bundle.
