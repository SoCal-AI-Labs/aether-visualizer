# Aether Visualizer

Cinematic audio visualizer desktop app (Electron + React + Three.js).

## Installers

GitHub Actions builds installers on pull requests, pushes to `master`, and version tags (`v*`). Download workflow artifacts, or the GitHub Release files when a `v*` tag is pushed.

| Platform | What to download | Notes |
| --- | --- | --- |
| Windows | `Aether-Setup-<version>.exe` | Run the installer. You can pick the install folder; desktop and Start Menu shortcuts are created. |
| macOS | `Aether-<version>-mac-arm64.dmg` (Apple Silicon) or `Aether-<version>-mac-x64.dmg` (Intel) | Drag Aether into Applications. The build is unsigned, so Gatekeeper may block it until you right-click the app and choose **Open**. |
| Linux | `Aether-<version>-linux-x86_64.AppImage` or `Aether-<version>-linux-amd64.deb` | Make the AppImage executable (`chmod +x`), or install the `.deb` on Debian/Ubuntu. |

## Build locally

```bash
npm ci
npm run dist:win     # Windows NSIS installer (needs Wine if not on Windows)
npm run dist:mac     # macOS DMG + ZIP (must run on macOS)
npm run dist:linux   # Linux AppImage + deb
```

Output files land in `release/`. Installer binaries are not committed to git; they are published as GitHub Release assets.

## Development

```bash
npm ci
npm run dev
```
