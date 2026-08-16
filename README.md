# 🎧 Nothing Ear Controller for Pop!_OS & GNOME

Native top-bar extension and lightweight controller for **Nothing Ear** and **CMF by Nothing** earbuds on **Pop!_OS** and **GNOME Shell**.

Provides seamless integration with Pop Shell / GNOME (official symbolic icons, foldable sub-menus, persistent clicks, battery multi-element telemetry, and instant RFCOMM Bluetooth command execution).

---

## ✨ Features

* 🔋 **Exact Multi-Element Battery Telemetry**:
  * Real-time battery levels for **Left (`L:`)**, **Right (`R:`)**, and **Case (`C:`)**.
  * Charging indicators (`⚡`).
  * High-Res Audio Codec display (`LDAC`, `AAC`, `SBC`).
* 🛡️ **Active Noise Cancellation (ANC) Control**:
  * High (*Élevée*)
  * Medium (*Moyenne*)
  * Low (*Faible*)
  * Adaptive (*Auto*)
* 🔊 **Transparency Mode** & **Noise Control Off**
* 🎮 **Low Latency Gaming Mode**: Auto-restores on connection via BlueZ DBus event monitor.
* 📁 **Foldable Submenus & Persistent Clicks**:
  * Submenus fold/unfold naturally.
  * Clicking items applies settings immediately without closing the top-bar popup.
* ⚡ **Ultra Lightweight**: 0% background CPU usage, direct RFCOMM Bluetooth socket.
* ⌨️ **Full CLI & Keyboard Shortcut Support**: Control ANC or audio switching with a single keypress.

---

## 🚀 Installation

Clone or download this repository, then run the installer:

```bash
git clone https://github.com/<your-username>/nothing-ear-gnome.git
cd nothing-ear-gnome
./install.sh
```

### Reload GNOME Shell (Pop!_OS / X11)
1. Press **`Alt + F2`**
2. Type **`r`**
3. Press **`Enter`**

The headphone icon will immediately appear in your top bar!

---

## ⚡ Ultra-Fast Bluetooth Connection Optimization (~300ms)

By default on Linux, the Bluetooth daemon (`BlueZ`) uses a standard page scan interval (`FastConnectable = false`), which can add a 2 to 3-second delay when taking earbuds out of their case.

To enable instant **~300ms** detection when you open the lid:

```bash
sudo sed -i 's/#FastConnectable = false/FastConnectable = true/' /etc/bluetooth/main.conf
sudo systemctl restart bluetooth
```

---

## ⌨️ CLI Usage & Shortcuts

You can control your earbuds directly from the command line:

```bash
nothing-ear status        # Print full JSON status
nothing-ear battery       # Print battery summary
nothing-ear high          # Set ANC High
nothing-ear mid           # Set ANC Medium
nothing-ear low           # Set ANC Low
nothing-ear adaptive      # Set ANC Adaptive
nothing-ear transparency  # Set Transparency Mode
nothing-ear off           # Turn Noise Control Off
nothing-ear game-on       # Enable Low Latency Gaming Mode
nothing-ear game-off      # Disable Low Latency Gaming Mode
nothing-ear switch-audio  # Route audio default sink to earbuds
nothing-ear restore       # Restore saved profile & gaming mode
```

### Custom Keyboard Shortcuts
Go to **Settings ➔ Keyboard ➔ Custom Shortcuts**, and bind:
* `Ctrl + Shift + A` ➔ `nothing-ear high`
* `Ctrl + Shift + T` ➔ `nothing-ear transparency`
* `Ctrl + Shift + G` ➔ `nothing-ear game-on`

---

## 📡 Protocol & Architecture (RFCOMM Bluetooth)

Nothing earbuds communicate over standard Bluetooth RFCOMM (Channel `15`). Verified frame structures:

| Command | Payload (Hex) |
| :--- | :--- |
| **ANC High** | `5560010ff00300cf010100e66f` |
| **ANC Medium** | `5560010ff00300d5010200e69f` |
| **ANC Low** | `5560010ff00300d7010300e70f` |
| **ANC Adaptive** | `5560010ff00300dd010400e53f` |
| **Transparency** | `5560010ff00300cb010700c5af` |
| **Off** | `5560010ff00300cd010500c447` |
| **Low Latency ON** | `55600141f00100010151e3` |
| **Low Latency OFF** | `55600141f00100010211e2` |

---

## 🎧 Device Compatibility

* **Nothing**: Ear (1), Ear (2), Ear (3), Ear (a), Ear (stick), Ear (open)
* **CMF by Nothing**: CMF Buds, CMF Buds Pro, CMF Buds Pro 2, CMF Neckband Pro

---

## 📄 License
MIT License.
