/*
 * Nothing Ear Controller - GNOME Shell Extension
 * Clean, lightweight, foldable submenus, non-closing item clicks,
 * with ANC modes, Battery/Codec telemetry, Gaming mode & Audio routing.
 */

const { GObject, St, Clutter, GLib, Gio } = imports.gi;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const MessageTray = imports.ui.messageTray;

const NothingEarMenu = GObject.registerClass(
class NothingEarMenu extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'Nothing Ear Controller', false);

        this._isConnected = false;
        this._activeMode = 'high';
        this._gameMode = false;
        this._autoAudio = true;
        this._restoreProfile = true;
        this._notifications = true;
        this._notifSource = null;

        // Top bar symbolic icon
        let icon = new St.Icon({
            icon_name: 'audio-headphones-symbolic',
            style_class: 'system-status-icon',
        });
        this.add_child(icon);

        this._buildMenu();

        this._openStateChangedId = this.menu.connect('open-state-changed', (menu, isOpen) => {
            if (isOpen) {
                this._updateStatus();
            }
        });
    }

    _makePersistent(item, callback) {
        if (item._menuActivateId) {
            try {
                item.disconnect(item._menuActivateId);
            } catch (e) {}
            item._menuActivateId = null;
        }
        item.activate = function(event) {
            if (callback) callback();
        };
        return item;
    }

    _buildMenu() {
        this.menu.removeAll();

        // 1. Header (Status)
        this._headerItem = new PopupMenu.PopupMenuItem('Nothing Ear', { reactive: false });
        this._headerItem.label.style = 'font-weight: 700; font-size: 13px;';
        let headIcon = new St.Icon({
            icon_name: 'audio-headphones-symbolic',
            style_class: 'popup-menu-icon',
        });
        this._headerItem.insert_child_at_index(headIcon, 0);
        this.menu.addMenuItem(this._headerItem);

        // 2. Battery & Codec Info Row
        this._batteryItem = new PopupMenu.PopupMenuItem('Loading…', { reactive: false });
        this._batteryItem.label.style = 'font-size: 11px; opacity: 0.85;';
        let battIcon = new St.Icon({
            icon_name: 'battery-symbolic',
            style_class: 'popup-menu-icon',
        });
        this._batteryItem.insert_child_at_index(battIcon, 0);
        this._batteryItem.visible = false;
        this.menu.addMenuItem(this._batteryItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // 3. Foldable Submenu for ANC Levels (Can fold/unfold naturally)
        this._ancSubMenu = new PopupMenu.PopupSubMenuMenuItem('Noise Control (ANC)');
        let ancIcon = new St.Icon({
            icon_name: 'security-high-symbolic',
            style_class: 'popup-menu-icon',
        });
        this._ancSubMenu.insert_child_at_index(ancIcon, 0);

        let ancModes = [
            { key: 'high', label: 'High', icon: 'security-high-symbolic' },
            { key: 'mid', label: 'Medium', icon: 'security-medium-symbolic' },
            { key: 'low', label: 'Low', icon: 'security-low-symbolic' },
            { key: 'adaptive', label: 'Adaptive', icon: 'preferences-system-symbolic' },
        ];

        this._ancItems = {};

        ancModes.forEach(m => {
            let item = new PopupMenu.PopupMenuItem(m.label);
            let itemIcon = new St.Icon({
                icon_name: m.icon,
                style_class: 'popup-menu-icon',
            });
            item.insert_child_at_index(itemIcon, 0);
            this._ancItems[m.key] = item;
            this._ancSubMenu.menu.addMenuItem(item);
            this._makePersistent(item, () => {
                this._selectMode(m.key, `Noise Control: ${m.label}`);
            });
        });

        this.menu.addMenuItem(this._ancSubMenu);

        // 4. Transparency Mode (Persistent)
        this._transItem = new PopupMenu.PopupMenuItem('Transparency');
        let transIcon = new St.Icon({
            icon_name: 'audio-speakers-symbolic',
            style_class: 'popup-menu-icon',
        });
        this._transItem.insert_child_at_index(transIcon, 0);
        this.menu.addMenuItem(this._transItem);
        this._makePersistent(this._transItem, () => {
            this._selectMode('transparency', 'Transparency Mode');
        });

        // 5. Off Mode (Persistent)
        this._offItem = new PopupMenu.PopupMenuItem('Noise Control Off');
        let offIcon = new St.Icon({
            icon_name: 'media-playback-stop-symbolic',
            style_class: 'popup-menu-icon',
        });
        this._offItem.insert_child_at_index(offIcon, 0);
        this.menu.addMenuItem(this._offItem);
        this._makePersistent(this._offItem, () => {
            this._selectMode('off', 'Noise Control Off');
        });

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // 6. Low Latency Gaming Mode Switch
        this._gameSwitch = new PopupMenu.PopupSwitchMenuItem('Low Latency Gaming Mode', this._gameMode);
        let gameIcon = new St.Icon({
            icon_name: 'input-gaming-symbolic',
            style_class: 'popup-menu-icon',
        });
        this._gameSwitch.insert_child_at_index(gameIcon, 0);
        this._gameSwitch.activate = function(event) {
            this.toggle();
        };
        this._gameSwitch.connect('toggled', (item, state) => {
            this._gameMode = state;
            this._sendCmd(state ? 'game-on' : 'game-off');
            this._showNotification('Nothing Ear', state ? 'Gaming Mode ON' : 'Gaming Mode OFF');
        });
        this.menu.addMenuItem(this._gameSwitch);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // 7. Actionable Audio Route Button
        this._audioRouteItem = new PopupMenu.PopupMenuItem('Switch Audio Output to Earbuds');
        let audioIcon = new St.Icon({
            icon_name: 'audio-volume-high-symbolic',
            style_class: 'popup-menu-icon',
        });
        this._audioRouteItem.insert_child_at_index(audioIcon, 0);
        this.menu.addMenuItem(this._audioRouteItem);
        this._makePersistent(this._audioRouteItem, () => {
            this._sendCmd('switch-audio');
            this._showNotification('Nothing Ear', 'Switched audio output to Earbuds');
            this._audioRouteItem.visible = false;
        });
        this._audioRouteItem.visible = false;

        // 8. Foldable Preferences Submenu
        this._prefSubMenu = new PopupMenu.PopupSubMenuMenuItem('Preferences');
        let prefIcon = new St.Icon({
            icon_name: 'preferences-system-symbolic',
            style_class: 'popup-menu-icon',
        });
        this._prefSubMenu.insert_child_at_index(prefIcon, 0);

        this._autoAudioSwitch = new PopupMenu.PopupSwitchMenuItem('Auto-Switch Audio on Connect', this._autoAudio);
        this._autoAudioSwitch.activate = function(event) {
            this.toggle();
        };
        this._autoAudioSwitch.connect('toggled', (item, state) => {
            this._autoAudio = state;
            this._sendCmd(state ? 'auto-audio-on' : 'auto-audio-off');
        });
        this._prefSubMenu.menu.addMenuItem(this._autoAudioSwitch);

        this._restoreProfileSwitch = new PopupMenu.PopupSwitchMenuItem('Restore Profile on Connect', this._restoreProfile);
        this._restoreProfileSwitch.activate = function(event) {
            this.toggle();
        };
        this._restoreProfileSwitch.connect('toggled', (item, state) => {
            this._restoreProfile = state;
            this._sendCmd(state ? 'restore-profile-on' : 'restore-profile-off');
        });
        this._prefSubMenu.menu.addMenuItem(this._restoreProfileSwitch);

        this._notifSwitch = new PopupMenu.PopupSwitchMenuItem('Show Notifications on Change', this._notifications);
        this._notifSwitch.activate = function(event) {
            this.toggle();
        };
        this._notifSwitch.connect('toggled', (item, state) => {
            this._notifications = state;
            this._sendCmd(state ? 'notif-on' : 'notif-off');
        });
        this._prefSubMenu.menu.addMenuItem(this._notifSwitch);

        this._prefSubMenu.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._sysSettingsItem = new PopupMenu.PopupMenuItem('System Sound Settings…');
        this._prefSubMenu.menu.addMenuItem(this._sysSettingsItem);
        this._makePersistent(this._sysSettingsItem, () => {
            GLib.spawn_command_line_async('gnome-control-center sound');
        });

        this.menu.addMenuItem(this._prefSubMenu);

        this._highlightActiveMode();
    }

    _selectMode(modeKey, label) {
        this._activeMode = modeKey;
        this._highlightActiveMode();
        this._sendCmd(modeKey);
        this._showNotification('Nothing Ear', label);
    }

    _showNotification(title, text) {
        if (!this._notifications) return;
        try {
            if (!this._notifSource) {
                this._notifSource = new MessageTray.Source('Nothing Ear', 'audio-headphones-symbolic');
                Main.messageTray.add(this._notifSource);
            }
            let notification = new MessageTray.Notification(this._notifSource, title, text);
            notification.setTransient(true);
            this._notifSource.showNotification(notification);
        } catch (e) {
            log(`[NothingEar] Error sending notification: ${e}`);
        }
    }

    _highlightActiveMode() {
        for (let [key, item] of Object.entries(this._ancItems)) {
            item.setOrnament(key === this._activeMode ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
        }
        if (this._transItem) {
            this._transItem.setOrnament(this._activeMode === 'transparency' ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
        }
        if (this._offItem) {
            this._offItem.setOrnament(this._activeMode === 'off' ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
        }
    }

    _getBinPath() {
        let home = GLib.get_home_dir();
        return `${home}/.local/bin/nothing-ear`;
    }

    _updateStatus() {
        try {
            let bin = this._getBinPath();
            let [ok, out] = GLib.spawn_command_line_sync(`${bin} status`);
            if (ok && out) {
                let text = new TextDecoder('utf-8').decode(out).trim();
                let info = JSON.parse(text);
                this._isConnected = Boolean(info.connected);

                if (this._isConnected) {
                    this._headerItem.label.text = 'Nothing Ear • Connected';

                    if (info.battery && info.battery.summary) {
                        if (info.battery.has_case || info.battery.summary.includes('C:')) {
                            this._batteryItem.label.text = `🔋 ${info.battery.summary}`;
                        } else if (info.codec) {
                            this._batteryItem.label.text = `🔋 ${info.battery.summary}   |   Codec: ${info.codec}`;
                        } else {
                            this._batteryItem.label.text = `🔋 ${info.battery.summary}`;
                        }
                        this._batteryItem.visible = true;
                    } else if (info.codec) {
                        this._batteryItem.label.text = `Codec: ${info.codec}`;
                        this._batteryItem.visible = true;
                    } else {
                        this._batteryItem.visible = false;
                    }

                    this._audioRouteItem.visible = !info.audio_active;
                } else {
                    this._headerItem.label.text = 'Nothing Ear • Disconnected';
                    this._batteryItem.visible = false;
                    this._audioRouteItem.visible = false;
                }

                if (info.active_anc) {
                    let map = { "ANC_HIGH": "high", "ANC_MID": "mid", "ANC_LOW": "low", "ANC_ADAPTIVE": "adaptive", "ANC_TRANSPARENCY": "transparency", "ANC_OFF": "off" };
                    if (map[info.active_anc]) this._activeMode = map[info.active_anc];
                }

                this._highlightActiveMode();

                if (info.game_mode !== undefined && this._gameSwitch) {
                    this._gameSwitch.setToggleState(info.game_mode);
                }
                if (info.auto_audio_switch !== undefined && this._autoAudioSwitch) {
                    this._autoAudioSwitch.setToggleState(info.auto_audio_switch);
                }
                if (info.restore_profile_on_connect !== undefined && this._restoreProfileSwitch) {
                    this._restoreProfileSwitch.setToggleState(info.restore_profile_on_connect);
                }
                if (info.notifications !== undefined && this._notifSwitch) {
                    this._notifSwitch.setToggleState(info.notifications);
                }
            }
        } catch (e) {
            log(`[NothingEar] Error checking status: ${e}`);
        }
    }

    _sendCmd(arg) {
        try {
            let bin = this._getBinPath();
            GLib.spawn_command_line_async(`${bin} ${arg}`);
        } catch (e) {
            log(`[NothingEar] Error sending command ${arg}: ${e}`);
        }
    }

    destroy() {
        if (this._notifSource) {
            this._notifSource.destroy();
            this._notifSource = null;
        }
        if (this._openStateChangedId) {
            this.menu.disconnect(this._openStateChangedId);
            this._openStateChangedId = null;
        }
        super.destroy();
    }
});

class Extension {
    constructor(uuid) {
        this._uuid = uuid;
    }

    enable() {
        if (Main.panel.statusArea[this._uuid]) {
            try {
                Main.panel.statusArea[this._uuid].destroy();
            } catch (e) {}
        }
        this._menu = new NothingEarMenu();
        Main.panel.addToStatusArea(this._uuid, this._menu);
    }

    disable() {
        if (this._menu) {
            this._menu.destroy();
            this._menu = null;
        }
    }
}

function init(meta) {
    return new Extension(meta.uuid);
}
