#!/usr/bin/env bash
set -e

echo "🎧 Installing Nothing Ear Controller for Pop!_OS & GNOME..."

# 1. Install CLI backend & daemon
mkdir -p ~/.local/bin
cp bin/nothing-ear ~/.local/bin/nothing-ear
cp bin/live_daemon.py ~/.local/bin/live_daemon.py
chmod +x ~/.local/bin/nothing-ear ~/.local/bin/live_daemon.py

# 2. Install desktop launcher
mkdir -p ~/.local/share/applications
cp desktop/nothing-ear-control.desktop ~/.local/share/applications/nothing-ear-control.desktop
chmod +x ~/.local/share/applications/nothing-ear-control.desktop
update-desktop-database ~/.local/share/applications/ 2>/dev/null || true

# 3. Install GNOME extension
EXT_DIR=~/.local/share/gnome-shell/extensions/nothing-ear-controller@gnome
mkdir -p "$EXT_DIR"
cp extension/metadata.json "$EXT_DIR/"
cp extension/extension.js "$EXT_DIR/"
chmod -R 755 "$EXT_DIR"

# 4. Install & enable systemd user daemon
mkdir -p ~/.config/systemd/user
cp systemd/nothing-ear-daemon.service ~/.config/systemd/user/nothing-ear-daemon.service
systemctl --user daemon-reload 2>/dev/null || true
systemctl --user enable --now nothing-ear-daemon.service 2>/dev/null || true

# 5. Enable GNOME extension
if which gnome-extensions >/dev/null 2>&1; then
    gnome-extensions enable nothing-ear-controller@gnome 2>/dev/null || true
fi

echo "✅ Installation completed successfully!"
echo "👉 Reload GNOME Shell with: Alt + F2, then type 'r' and press Enter."
