# OpenPoo

A fork of OpenCode with significant UI/UX changes focused on the desktop app.

![OpenPoo Screenshot](assets/screenshot.png)
![OpenPoo Project Selector](assets/screenshot2.png)

## Key Differences

### Added
- **Multi-pane system** - Run multiple sessions side-by-side on a single screen
- **Modes** - Switch between Agents (claude-code, codex, opencode)
- **Voice/STT** - Speech-to-text using local ONNX Parakeet model
- **Enhanced UI** - smooth animations, gradient color schemes
- **Mouse** - Right-click specific actions for ease of use.

### Changed
- Modifications to Provider, Model selection UI
- Performance optimizations (message parts caching, git status caching)

### Removed
- **TUI** - Terminal UI completely removed
- **VSCode extension** - Removed in favor of desktop-first approach

## Quick Start

Use the automated setup script to get started. It checks for prerequisites, installs dependencies, and launches the app.

### Windows

**PowerShell:**
```powershell
.\setup.ps1
```

**Command Prompt (or double-click):**
```cmd
setup.bat
```

**Prerequisites:**
- [Bun](https://bun.sh/) - Install: `irm bun.sh/install.ps1 | iex`
- [Rust](https://rustup.rs/) - Install: Download from https://win.rustup.rs/x86_64
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) - Select "Desktop development with C++"

### macOS

```bash
chmod +x setup.sh
./setup.sh
```

**Prerequisites:**
- [Bun](https://bun.sh/) - Install: `curl -fsSL https://bun.sh/install | bash`
- [Rust](https://rustup.rs/) - Install: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- Xcode Command Line Tools - Install: `xcode-select --install`

### Linux

```bash
chmod +x setup.sh
./setup.sh
```

**Prerequisites:**
- [Bun](https://bun.sh/) - Install: `curl -fsSL https://bun.sh/install | bash`
- [Rust](https://rustup.rs/) - Install: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- System libraries (see below)

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libsoup-3.0-dev
```

**Fedora:**
```bash
sudo dnf install webkit2gtk4.1-devel gtk3-devel libappindicator-gtk3-devel librsvg2-devel libsoup3-devel
```

**Arch Linux:**
```bash
sudo pacman -S webkit2gtk-4.1 gtk3 libappindicator-gtk3 librsvg libsoup3
```

## Manual Setup

If you prefer to run commands manually:

```bash
# Install dependencies
bun install

# Run desktop app in dev mode
bun run --cwd packages/desktop tauri dev
```
