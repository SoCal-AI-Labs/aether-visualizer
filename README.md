# Aether Visualizer

Cinematic audio visualizer desktop app (Electron + React + Three.js).

## Windows installer

Build a Windows NSIS installer:

```bash
npm ci
npm run dist:installer
```

Output: `release/Aether-Setup-<version>.exe`

GitHub Actions builds the installer on pull requests, pushes to `master`, and version tags (`v*`). Download the **Aether-Windows-Installer** artifact from the workflow run, or from a GitHub Release when a `v*` tag is pushed.

## Development

```bash
npm ci
npm run dev
```
