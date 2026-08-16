/*
 * Nothing Ear Controller - GNOME Shell Extension
 * Fully native, non-closing menus with Pop!_OS notifications, 
 * Bass Enhance, Spatial Audio (Fixed/Off), ANC with base icons, and EQ controls.
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
        this._activeEq = 'eq-balanced';
        this._spatialAudio = false;
        this._activeBass = 'bass-off';
        this._dualConnect = true;
        this._gameMode = false;
        this._inEar = true;
        this._autoAudio = true;
        this._restoreProfile = true;
        this._notifications = true;
        this._notifSource = null;

        // Panel Icon
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
        // Disconnect GNOME's default auto-close signal listener on activate
        if (item._menuActivateId) {
            try {
                item.disconnect(item._menuActivateId);
            } catch (e) {}
            item._menuActivateId = null;
        }
        item.close = () => {};
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

        // 2. Battery & Codec Row
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

        // 3. Expandable Submenu for ANC Levels (With Original Base Icons)
        this._ancSubMenu = new PopupMenu.PopupSubMenuMenuItem('Noise Control (ANC)');
        this._ancSubMenu.menu.close = () => {};
        this._ancSubMenu.close = () => {};
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

        // 4. Expandable Submenu for Equalizer DSP (Items don't close menu)
        this._eqSubMenu = new PopupMenu.PopupSubMenuMenuItem('Equalizer (EQ)');
        this._eqSubMenu.menu.close = () => {};
        this._eqSubMenu.close = () => {};
        let eqIcon = new St.Icon({
            icon_name: 'audio-speakers-symbolic',
            style_class: 'popup-menu-icon',
        });
        this._eqSubMenu.insert_child_at_index(eqIcon, 0);

        let eqModes = [
            { key: 'eq-balanced', label: 'Balanced' },
            { key: 'eq-bass', label: 'More Bass' },
            { key: 'eq-treble', label: 'More Treble' },
            { key: 'eq-voice', label: 'Voice' },
        ];

        this._eqItems = {};

        eqModes.forEach(m => {
            let item = new PopupMenu.PopupMenuItem(m.label);
            this._eqItems[m.key] = item;
            this._eqSubMenu.menu.addMenuItem(item);
            this._makePersistent(item, () => {
                this._selectEq(m.key, `Equalizer: ${m.label}`);
            });
        });

        this.menu.addMenuItem(this._eqSubMenu);

        // 5. Expandable Submenu for Bass Enhance (Ultra Bass)
        this._bassSubMenu = new PopupMenu.PopupSubMenuMenuItem('Bass Enhance (Ultra Bass)');
        this._bassSubMenu.menu.close = () => {};
        this._bassSubMenu.close = () => {};
        let bassIcon = new St.Icon({
            icon_name: 'media-playlist-shuffle-symbolic',
            style_class: 'popup-menu-icon',
        });
        this._bassSubMenu.insert_child_at_index(bassIcon, 0);

        let bassModes = [
            { key: 'bass-off', label: 'Off' },
            { key: 'bass-1', label: 'Level 1' },
            { key: 'bass-2', label: 'Level 2' },
            { key: 'bass-3', label: 'Level 3' },
            { key: 'bass-4', label: 'Level 4' },
            { key: 'bass-5', label: 'Level 5 (Max)' },
        ];

        this._bassItems = {};

        bassModes.forEach(m => {
            let item = new PopupMenu.PopupMenuItem(m.label);
            this._bassItems[m.key] = item;
            this._bassSubMenu.menu.addMenuItem(item);
            this._makePersistent(item, () => {
                this._selectBass(m.key, `Bass Enhance: ${m.label}`);
            });
        });

        this.menu.addMenuItem(this._bassSubMenu);

        // 6. Transparency Mode (Persistent with Base Icon)
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

        // 7. Off Mode (Persistent with Base Icon)
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

        // 8. Spatial Audio (Simple On/Off Switch)
        this._spatialSwitch = new PopupMenu.PopupSwitchMenuItem('Spatial Audio (Son Spatial)', this._spatialAudio);
        let spatialIcon = new St.Icon({
            icon_name: 'emblem-shared-symbolic',
            style_class: 'popup-menu-icon',
        });
        this._spatialSwitch.insert_child_at_index(spatialIcon, 0);
        this._spatialSwitch.activate = function(event) {
            this.toggle();
        };
        this._spatialSwitch.connect('toggled', (item, state) => {
            this._spatialAudio = state;
            this._sendCmd(state ? 'spatial-on' : 'spatial-off');
            this._showNotification('Nothing Ear', state ? 'Spatial Audio ON' : 'Spatial Audio OFF');
        });
        this.menu.addMenuItem(this._spatialSwitch);

        // 9. Earbuds Quick Switches (Persistent)
        this._dualSwitch = new PopupMenu.PopupSwitchMenuItem('Dual Connection (Multi-Point)', this._dualConnect);
        let dualIcon = new St.Icon({
            icon_name: 'network-wireless-symbolic',
            style_class: 'popup-menu-icon',
        });
        this._dualSwitch.insert_child_at_index(dualIcon, 0);
        this._dualSwitch.activate = function(event) {
            this.toggle();
        };
        this._dualSwitch.connect('toggled', (item, state) => {
            this._dualConnect = state;
            this._sendCmd(state ? 'dual-on' : 'dual-off');
            this._showNotification('Nothing Ear', state ? 'Dual Connection ON' : 'Dual Connection OFF');
        });
        this.menu.addMenuItem(this._dualSwitch);

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

        this._inEarSwitch = new PopupMenu.PopupSwitchMenuItem('In-Ear Detection', this._inEar);
        let inEarIcon = new St.Icon({
            icon_name: 'view-conceal-symbolic',
            style_class: 'popup-menu-icon',
        });
        this._inEarSwitch.insert_child_at_index(inEarIcon, 0);
        this._inEarSwitch.activate = function(event) {
            this.toggle();
        };
        this._inEarSwitch.connect('toggled', (item, state) => {
            this._inEar = state;
            this._sendCmd(state ? 'in-ear-on' : 'in-ear-off');
            this._showNotification('Nothing Ear', state ? 'In-Ear Detection ON' : 'In-Ear Detection OFF');
        });
        this.menu.addMenuItem(this._inEarSwitch);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // 10. Actionable Audio Route Button
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

        // 11. Preferences Submenu
        this._prefSubMenu = new PopupMenu.PopupSubMenuMenuItem('Preferences');
        this._prefSubMenu.menu.close = () => {};
        this._prefSubMenu.close = () => {};
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

    _selectEq(eqKey, label) {
        this._activeEq = eqKey;
        this._highlightActiveMode();
        this._sendCmd(eqKey);
        this._showNotification('Nothing Ear', label);
    }

    _selectBass(bassKey, label) {
        this._activeBass = bassKey;
        this._highlightActiveMode();
        this._sendCmd(bassKey);
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
        for (let [key, item] of Object.entries(this._eqItems)) {
            item.setOrnament(key === this._activeEq ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
        }
        for (let [key, item] of Object.entries(this._bassItems)) {
            item.setOrnament(key === this._activeBass ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
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
                if (info.active_eq) {
                    let eqMap = { "EQ_BALANCED": "eq-balanced", "EQ_BASS": "eq-bass", "EQ_TREBLE": "eq-treble", "EQ_VOICE": "eq-voice" };
                    if (eqMap[info.active_eq]) this._activeEq = eqMap[info.active_eq];
                }
                if (info.spatial_audio !== undefined && this._spatialSwitch) {
                    this._spatialAudio = (info.spatial_audio === "SPATIAL_FIXED" || info.spatial_audio === "SPATIAL_ON" || info.spatial_audio === true);
                    this._spatialSwitch.setToggleState(this._spatialAudio);
                }
                if (info.bass_enhance) {
                    let map = { "BASS_OFF": "bass-off", "BASS_LVL1": "bass-1", "BASS_LVL2": "bass-2", "BASS_LVL3": "bass-3", "BASS_LVL4": "bass-4", "BASS_LVL5": "bass-5" };
                    if (map[info.bass_enhance]) this._activeBass = map[info.bass_enhance];
                }
                if (info.dual_connect !== undefined && this._dualSwitch) {
                    this._dualSwitch.setToggleState(info.dual_connect);
                }

                this._highlightActiveMode();

                if (info.game_mode !== undefined && this._gameSwitch) {
                    this._gameSwitch.setToggleState(info.game_mode);
                }
                if (info.in_ear !== undefined && this._inEarSwitch) {
                    this._inEarSwitch.setToggleState(info.in_ear);
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
