# 📡 Nothing Ear RFCOMM Protocol Specification & Reverse-Engineering Notes

This document provides a comprehensive technical reference for the proprietary Bluetooth communication protocol used by **Nothing Ear** and **CMF by Nothing** earbuds, based on live capture and analysis.

---

## 1. Bluetooth Architecture Overview

Nothing earbuds communicate over standard Bluetooth RFCOMM (Channel `15`) and Bluetooth Low Energy (BLE) advertisements:

* **RFCOMM Service Port**: Channel `15`
* **SPP UUID**: `aeac4a03-dff5-498f-843a-34487cf133eb`
* **Google Fast Pair UUID**: `df21fe2c-2515-4fdb-8886-f12c4d67927c` (`0xFE2C`)
* **Transport Characteristics**: Single active connection per RFCOMM channel at a time. Commands require sequential delivery or short-lived connect-and-close sessions.

---

## 2. Packet Framing & CRC-16 Checksum

All commands sent to and received from Nothing Ear devices adhere to a strict binary frame:

### Packet Structure

| Byte Offset | Field | Description |
| :--- | :--- | :--- |
| `0..2` | **Magic Header** | Always `0x55 0x60 0x01` |
| `3` | **Command Low Byte** | `Opcode & 0xFF` |
| `4` | **Command High Byte** | `(Opcode >> 8) & 0xFF` (Typically `0xF0` for outgoing, `0x40`/`0x70`/`0xE0` for responses) |
| `5` | **Payload Length** | Number of payload bytes (`0..N`) |
| `6` | **Reserved** | Always `0x00` |
| `7` | **Operation ID** | Sequence counter (`0x01..0xFF` or `0x00`) |
| `8..8+N-1` | **Payload** | Command-specific parameter bytes |
| `8+N..9+N` | **CRC-16** | 16-bit CRC checksum (Little Endian: `CRC & 0xFF`, `CRC >> 8`) |

### CRC-16 Algorithm (Python Reference)

```python
def crc16(buffer: bytes) -> int:
    crc = 0xFFFF
    for b in buffer:
        crc ^= b
        for _ in range(8):
            if crc & 1:
                crc = (crc >> 1) ^ 0xA001
            else:
                crc = crc >> 1
    return crc
```

---

## 3. Verified Official Protocol Commands

### 🛡️ Active Noise Cancellation (ANC) — Opcode `0x0F` (`61455`)

Header: `55 60 01 0f f0 03 00 [seq]` + Payload `[0x01, mode, 0x00]` + `CRC16`

| Mode | Target Hex Frame | Payload |
| :--- | :--- | :---: |
| **High** | `5560010ff00300cf010100e66f` | `01 01 00` |
| **Medium** | `5560010ff00300d5010200e69f` | `01 02 00` |
| **Low** | `5560010ff00300d7010300e70f` | `01 03 00` |
| **Adaptive** | `5560010ff00300dd010400e53f` | `01 04 00` |
| **Transparency** | `5560010ff00300cb010700c5af` | `01 07 00` |
| **Off** | `5560010ff00300cd010500c447` | `01 05 00` |

---

### 🎚️ Equalizer DSP Presets — Opcode `0x1F` (`61471`)

Header: `55 60 01 1f f0 01 00 [seq]` + Payload `[preset_id]` + `CRC16`

| Preset | Target Hex Frame | Payload Value |
| :--- | :--- | :---: |
| **Balanced** | `5560011ff0010001009d5d` | `0x00` |
| **More Bass** | `5560011ff0010001015c9d` | `0x01` |
| **More Treble** | `5560011ff0010001021c9c` | `0x02` |
| **Voice** | `5560011ff001000103dd5c` | `0x03` |

---

### 🔊 Bass Enhance / Ultra Bass — Opcode `0x4E` (`61518`)

Header: `55 60 01 4e f0 02 00 [seq]` + Payload `[enabled, level * 2]` + `CRC16`

| Level | Target Hex Frame | Payload |
| :--- | :--- | :---: |
| **Off** | `5560014ef00200010000986c` | `00 00` |
| **Level 1** | `5560014ef00200010102183d` | `01 02` |
| **Level 2** | `5560014ef00200010104983f` | `01 04` |
| **Level 3** | `5560014ef0020001010619fe` | `01 06` |
| **Level 4** | `5560014ef00200010108983a` | `01 08` |
| **Level 5 (Max)** | `5560014ef0020001010a19fb` | `01 0A` |

---

### 🌐 Spatial Audio & Audio Quality — Opcode `0x19` (`61465`)

Header: `55 60 01 19 f0 02 00 [seq]` + Payload `[0x01, state]` + `CRC16`

| Mode | Target Hex Frame | State |
| :--- | :--- | :---: |
| **Spatial / LDAC ON** | `55600119f002000101017ef9` | `01 01` |
| **Spatial / LDAC OFF** | `55600119f00200010100bf39` | `01 00` |

---

### 🎮 Gaming Mode (Low Latency) — Opcode `0x41` (`61505`)

Header: `55 60 01 41 f0 01 00 [seq]` + Payload `[state]` + `CRC16`

| Mode | Target Hex Frame | State |
| :--- | :--- | :---: |
| **Low Latency ON** | `55600141f00100010151e3` | `0x01` |
| **Low Latency OFF** | `55600141f00100010211e2` | `0x02` |

---

### 👁️ In-Ear Detection & Auto-Transparency — Opcode `0x5F` (`61535`)

Header: `55 60 01 5f f0 01 00 [seq]` + Payload `[state]` + `CRC16`

| Mode | Target Hex Frame | State |
| :--- | :--- | :---: |
| **In-Ear ON** | `5560015ff001000101525d` | `0x01` |
| **In-Ear OFF** | `5560015ff001000100939d` | `0x00` |

---

### 🔋 Multi-Element Battery Telemetry — Composite Type `0xE0`

Nothing Ear reports composite battery telemetry via Fast Pair BLE ServiceData and RFCOMM Opcode `0x01` / `0x02`:

* **Element ID `0x02`**: Left Earbud (`L:`)
* **Element ID `0x03`**: Right Earbud (`R:`)
* **Element ID `0x04`**: Charging Case (`C:`)
* **Charging Bit Flag**: Bit `0x80` indicates active charging.
* **Percentage Value**: `eval & 0x7F` represents the battery percentage (`0..100%`).
* **Value `0x7F` (127)**: Indicates element is disconnected / absent.

---

## 4. Debunked Pitfalls & False Hypotheses

During reverse engineering, several subtle traps and legacy assumptions were identified and resolved:

### ⚠️ Pitfall 1: Premature Socket Closure (`sock.shutdown()`)
* **Initial Hypothesis**: Calling `sock.shutdown(socket.SHUT_RDWR)` right after `sendall()` ensures clean teardown.
* **Reality**: On Linux BlueZ, calling `shutdown()` immediately causes the kernel to flush or abort pending unacknowledged frames before the Bluetooth hardware radio finishes transmitting them over the air.
* **Solution**: A small pause or reading the hardware acknowledgment frame (`sock.recv()`) before `sock.close()` guarantees 100% physical delivery to the DSP.

### ⚠️ Pitfall 2: Confusing Opcode `0x05` with `0x1F` for EQ
* **Initial Hypothesis**: Early Nothing Ear (1) community tools documented `0x05` for EQ presets.
* **Reality**: On Nothing Ear (2) and Ear (3), `0x05` is deprecated. The true active opcode for EQ is **`0x1F`** (and `0x10` for custom bands), which was verified during real-time live sniffing with the Nothing X app.

### ⚠️ Pitfall 3: RFCOMM Channel Lock (`Device or resource busy`)
* **Initial Hypothesis**: Running a continuous background daemon with a permanently open RFCOMM socket is ideal for real-time polling.
* **Reality**: BlueZ restricts RFCOMM channels to a single client. A permanently locked socket blocks CLI invocations and conflicts with PipeWire/system audio profiling.
* **Solution**: Ultra-fast on-demand sessions (0.3s) and zero-latency FastPair `ServiceData` polling.

### ⚠️ Pitfall 4: Resetting Gaming Mode on Disconnect
* **Initial Hypothesis**: The earbuds retain Gaming Mode across power cycles just like ANC.
* **Reality**: Nothing Ear firmware resets Gaming Mode to OFF upon disconnection. It must be explicitly re-sent upon reconnection via BlueZ DBus event hooks.
