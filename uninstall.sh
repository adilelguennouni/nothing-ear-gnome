#!/usr/bin/env bash
set -e

echo "🗑️  Uninstalling Nothing Ear Controller..."

rm -f ~/.local/bin/nothing-ear
rm -f ~/.local/share/applications/nothing-ear-control.desktop
rm -rf ~/.local/share/gnome-shell/extensions/nothing-ear-controller@gnome
rm -rf ~/.local/share/gnome-shell/extensions/nothing-ear*

update-desktop-database ~/.local/share/applications/ 2>/dev/null || true

echo "✅ Uninstallation complete!"
echo "👉 Reload GNOME Shell with: Alt + F2, then type 'r' and press Enter."
