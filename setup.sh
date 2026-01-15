#!/usr/bin/env bash
#
# OpenPoo Desktop App Setup Script
# Works on macOS and Linux
#
# Usage: ./setup.sh
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_step() {
    echo -e "${BLUE}==>${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Detect OS
detect_os() {
    case "$(uname -s)" in
        Darwin*)    OS="macos" ;;
        Linux*)     OS="linux" ;;
        *)          OS="unknown" ;;
    esac
    echo "$OS"
}

OS=$(detect_os)

if [ "$OS" = "unknown" ]; then
    print_error "Unsupported operating system. This script supports macOS and Linux."
    exit 1
fi

print_step "Detected OS: $OS"

# Check for bun
check_bun() {
    if command -v bun &> /dev/null; then
        BUN_VERSION=$(bun --version)
        print_success "Bun is installed (version $BUN_VERSION)"
        return 0
    else
        return 1
    fi
}

# Check for Rust/Cargo
check_rust() {
    if command -v rustc &> /dev/null && command -v cargo &> /dev/null; then
        RUST_VERSION=$(rustc --version | cut -d ' ' -f 2)
        print_success "Rust is installed (version $RUST_VERSION)"
        return 0
    else
        return 1
    fi
}

# Check for Linux-specific Tauri dependencies
check_linux_deps() {
    if [ "$OS" != "linux" ]; then
        return 0
    fi

    print_step "Checking Linux-specific dependencies..."

    MISSING_DEPS=()

    # Check for required packages (common across distros)
    # These are the core dependencies for Tauri on Linux
    if ! pkg-config --exists webkit2gtk-4.1 2>/dev/null; then
        MISSING_DEPS+=("webkit2gtk-4.1")
    fi

    if ! pkg-config --exists gtk+-3.0 2>/dev/null; then
        MISSING_DEPS+=("gtk3")
    fi

    if ! pkg-config --exists libsoup-3.0 2>/dev/null; then
        MISSING_DEPS+=("libsoup3")
    fi

    if [ ${#MISSING_DEPS[@]} -eq 0 ]; then
        print_success "All Linux dependencies are installed"
        return 0
    else
        print_warning "Missing Linux dependencies: ${MISSING_DEPS[*]}"
        echo ""
        echo "Please install the required dependencies for your distribution:"
        echo ""
        echo "  Ubuntu/Debian:"
        echo "    sudo apt update"
        echo "    sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libsoup-3.0-dev"
        echo ""
        echo "  Fedora:"
        echo "    sudo dnf install webkit2gtk4.1-devel gtk3-devel libappindicator-gtk3-devel librsvg2-devel libsoup3-devel"
        echo ""
        echo "  Arch Linux:"
        echo "    sudo pacman -S webkit2gtk-4.1 gtk3 libappindicator-gtk3 librsvg libsoup3"
        echo ""
        return 1
    fi
}

# Install bun dependencies
install_deps() {
    print_step "Installing dependencies..."

    if [ -d "node_modules" ] && [ -f "bun.lockb" ]; then
        # Check if lockfile is newer than node_modules
        if [ "bun.lockb" -nt "node_modules" ]; then
            print_step "Lockfile changed, reinstalling dependencies..."
            bun install
        else
            print_success "Dependencies already installed (skipping)"
        fi
    else
        bun install
    fi
    print_success "Dependencies installed"
}

# Main setup flow
main() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║           OpenPoo Desktop App Setup                      ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo ""

    # Check prerequisites
    print_step "Checking prerequisites..."
    echo ""

    MISSING_PREREQS=0

    if ! check_bun; then
        print_error "Bun is not installed"
        echo ""
        echo "  Install bun:"
        echo "    curl -fsSL https://bun.sh/install | bash"
        echo ""
        MISSING_PREREQS=1
    fi

    if ! check_rust; then
        print_error "Rust is not installed"
        echo ""
        echo "  Install Rust:"
        echo "    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
        echo ""
        MISSING_PREREQS=1
    fi

    if [ "$OS" = "linux" ]; then
        if ! check_linux_deps; then
            MISSING_PREREQS=1
        fi
    fi

    if [ $MISSING_PREREQS -eq 1 ]; then
        echo ""
        print_error "Please install the missing prerequisites and run this script again."
        exit 1
    fi

    echo ""

    # Install dependencies
    install_deps

    echo ""
    print_step "Launching OpenPoo Desktop App..."
    echo ""

    # Run tauri dev from the desktop package
    cd packages/desktop
    bun run tauri dev
}

# Run main function
main
