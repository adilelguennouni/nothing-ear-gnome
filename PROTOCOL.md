# 📡 Nothing Ear RFCOMM Protocol Specification & Reverse-Engineering Notes

This document provides a technical reference for the proprietary Bluetooth communication protocol used by **Nothing Ear** and **CMF by Nothing** earbuds, documenting both **verified production commands** and **experimental telemetry hypotheses**.

---

## 1. Bluetooth Architecture Overview

Nothing earbuds communicate over standard Bluetooth RFCOMM (Channel `15`) and Bluetooth Low Energy (BLE) Fast Pair advertisements:

* **RFCOMM Service Port**: Channel `15`
* **SPP UUID**: `aeac4a03-dff5-498f-843a-34487cf133eb`
* **Google Fast Pair UUID**: `df21fe2c-2515-4fdb-8886-f12c4d67927c` (`0xFE2C`)
* **Concurrency Model**: Single client session per RFCOMM channel. On-demand short-lived sessions (0.3s) prevent device locks.

---

## 2. Packet Framing & CRC-16 Checksum

All commands adhere to a strict binary frame:

| Byte Offset | Field | Description |
| :--- | :--- | :--- |
| `0..2` | **Magic Header** | Always `0x55 0x60 0x01` |
| `3` | **Command Low Byte** | `Opcode & 0xFF` |
| `4` | **Command High Byte** | `(Opcode >> 8) & 0xFF` (`0xF0` for write, `0x40`/`0x70`/`0xE0` for responses) |
| `5` | **Payload Length** | Number of payload bytes |
| `6` | **Reserved** | Always `0x00` |
| `7` | **Operation ID** | Sequence counter |
| `8..8+N-1` | **Payload** | Command-specific parameter bytes |
| `8+N..9+N` | **CRC-16** | 16-bit CRC checksum (Little Endian: `CRC & 0xFF`, `CRC >> 8`) |

### CRC-16 Algorithm (CRC-16-IBM / ARC)

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

## 3. Section A: 100% Verified Production Commands

These commands have been physically validated on hardware with verified DSP response:

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

### 🎮 Gaming Mode (Low Latency) — Opcode `0x41` (`61505`)

Header: `55 60 01 41 f0 01 00 [seq]` + Payload `[state]` + `CRC16`

| Mode | Target Hex Frame | State |
| :--- | :--- | :---: |
| **Low Latency ON** | `55600141f00100010151e3` | `0x01` |
| **Low Latency OFF** | `55600141f00100010211e2` | `0x02` |

### 🔋 Multi-Element Battery Telemetry — Composite Type `0xE0`

Nothing Ear reports composite battery telemetry via Fast Pair BLE ServiceData and RFCOMM Opcode `0x01` / `0x02`:

* **Element ID `0x02`**: Left Earbud (`L:`)
* **Element ID `0x03`**: Right Earbud (`R:`)
* **Element ID `0x04`**: Charging Case (`C:`)
* **Charging Bit Flag**: Bit `0x80` indicates active charging (`⚡`).
* **Percentage Value**: `eval & 0x7F` represents the battery percentage (`0..100%`).
* **Value `0x7F` (127)**: Indicates element is disconnected / in case lid closed.

---

## 4. Section B: Experimental Telemetry & Feature Hypotheses

The following opcodes were observed during passive RFCOMM sniffing sessions with the official mobile app, documented here as working hypotheses for future reverse-engineering:

### 🎚️ Equalizer Presets — Hypothesized Opcode `0x1F` (`61471`)

* Observed frame: `55 60 01 1f 40 01 00 ff [preset]`
* `0x00`: Balanced (`5560011ff0010001009d5d`)
* `0x01`: More Bass (`5560011ff0010001015c9d`)
* `0x02`: More Treble (`5560011ff0010001021c9c`)
* `0x03`: Voice (`5560011ff001000103dd5c`)

### 🔊 Bass Enhance / Ultra Bass — Hypothesized Opcode `0x4E` (`61518`)

* Observed frame: `55 60 01 4e 40 02 00 ff [enabled] [level * 2]`
* Scaled values: Level 1 (`0x02`), Level 2 (`0x04`), Level 3 (`0x06`), Level 4 (`0x08`), Level 5 (`0x0A`).

### 🌐 Spatial Audio / HD Audio — Hypothesized Opcode `0x19` (`61465`)

* Observed frame: `55 60 01 19 e0 02 00 00 01 [0x01=ON / 0x00=OFF]`

### 📱 Dual Connect (Multi-Point) — Hypothesized Opcode `0x4F` (`61519`)

* Observed frame: `55 60 01 4f 40 02 00 00 [0x01=ON / 0x00=OFF] 00`

### 👁️ In-Ear Detection / Auto-Transparency — Hypothesized Opcode `0x5F` (`61535`)

* Observed frame: `55 60 01 5f 40 01 00 ff [0x01=ON / 0x00=OFF]`

---

## 5. Debunked Pitfalls & False Hypotheses

1. **Premature Socket Closure (`sock.shutdown()`)**:
   * *Trap*: Calling `shutdown(SHUT_RDWR)` right after `sendall()`.
   * *Solution*: On Linux BlueZ, `shutdown()` flushes the socket before the radio finishes transmitting. A short sleep or waiting for `recv()` ensures physical delivery.

2. **Opcode `0x05` vs `0x1F` for EQ**:
   * *Trap*: Older Nothing Ear (1) implementations used `0x05`. On modern Ear (2/3), `0x05` is ignored or deprecated in favor of `0x1F` / `0x10`.

3. **Persistent Daemons vs On-Demand Sockets**:
   * *Trap*: Keeping the RFCOMM socket permanently open causes `[Errno 16] Device or resource busy` for any external caller and can interfere with PipeWire A2DP audio profile switching.
