#!/usr/bin/env python3
"""
Nothing Ear Live Telemetry Daemon & Command Bridge
Maintains a continuous RFCOMM listener and provides a Unix Domain Socket (/tmp/nothing_ear.sock)
for instant, non-blocking command execution (ANC, EQ, Gaming Mode, In-Ear).
"""

import socket
import subprocess
import time
import json
import os
import sys
import threading

MAC = "2C:BE:EE:4A:2D:2E"
RFCOMM_CHANNEL = 15
STATE_FILE = "/tmp/nothing_ear_live.json"
LOG_FILE = "/tmp/nothing_ear_events.log"
UNIX_SOCK_PATH = "/tmp/nothing_ear.sock"

COMMANDS = {
    "ANC_HIGH": bytes.fromhex("55600102100100000326e0"),
    "ANC_MID": bytes.fromhex("55600102100100000216c0"),
    "ANC_LOW": bytes.fromhex("55600102100100000106a0"),
    "ANC_ADAPTIVE": bytes.fromhex("556001021001000000f680"),
    "ANC_TRANSPARENCY": bytes.fromhex("5560010210010000043600"),
    "ANC_OFF": bytes.fromhex("5560010210010000052720"),
    "EQ_BALANCED": bytes.fromhex("556001041001000000f480"),
    "EQ_BASS": bytes.fromhex("55600104100100000104a0"),
    "EQ_TREBLE": bytes.fromhex("55600104100100000214c0"),
    "EQ_VOICE": bytes.fromhex("55600104100100000324e0"),
    "LOW_LATENCY_ON": bytes.fromhex("5560010e10010000010ee0"),
    "LOW_LATENCY_OFF": bytes.fromhex("5560010e1001000000fee0"),
    "IN_EAR_ON": bytes.fromhex("55600103100100000105a0"),
    "IN_EAR_OFF": bytes.fromhex("556001031001000000f580"),
}

rfcomm_sock = None
sock_lock = threading.Lock()

state = {
    "connected": False,
    "left_level": None,
    "left_charging": False,
    "left_in_ear": False,
    "right_level": None,
    "right_charging": False,
    "right_in_ear": False,
    "case_level": None,
    "case_open": False,
    "last_update": None,
    "summary": "Nothing Ear",
}

def log_event(msg):
    ts = time.strftime("%H:%M:%S")
    line = f"[{ts}] {msg}\n"
    print(line, end="", flush=True)
    try:
        with open(LOG_FILE, "a") as f:
            f.write(line)
    except Exception:
        pass

def save_state():
    state["last_update"] = time.strftime("%X")
    
    parts = []
    if state["left_level"] is not None:
        l_str = f"L: {state['left_level']}%"
        if state["left_charging"]: l_str += "⚡"
        parts.append(l_str)
    
    if state["right_level"] is not None:
        r_str = f"R: {state['right_level']}%"
        if state["right_charging"]: r_str += "⚡"
        parts.append(r_str)
        
    if state["case_level"] is not None and state["case_open"]:
        parts.append(f"C: {state['case_level']}%")
        
    state["summary"] = " • ".join(parts) if parts else "Nothing Ear"
    
    try:
        with open(STATE_FILE, "w") as f:
            json.dump(state, f, indent=2)
    except Exception:
        pass

def parse_packet(data):
    if not data or len(data) < 6:
        return
    
    idx = 0
    while idx < len(data) - 4:
        if data[idx] == 0x55 and data[idx+1] == 0x60 and data[idx+2] == 0x01:
            cmd = data[idx+3]
            pkt_type = data[idx+4]
            
            # --- Opcode 0x01: Battery Percentages ---
            if cmd == 0x01 and pkt_type == 0xe0 and idx + 8 < len(data):
                count = data[idx+8]
                p = idx + 9
                changes = []
                for _ in range(count):
                    if p + 1 < len(data):
                        eid = data[p]
                        val = data[p+1] & 0x7f
                        p += 2
                        if eid == 2 and val > 5:
                            state["left_level"] = val
                            changes.append(f"L: {val}%")
                        elif eid == 3 and val > 5:
                            state["right_level"] = val
                            changes.append(f"R: {val}%")
                        elif eid == 4 and val > 0:
                            state["case_level"] = val
                            state["case_open"] = True
                            changes.append(f"C: {val}%")
                if changes:
                    log_event("Battery Levels -> " + " • ".join(changes))
                    save_state()

            # --- Opcode 0x02: Charging State Machine ---
            elif cmd == 0x02 and pkt_type == 0xe0 and idx + 8 < len(data):
                count = data[idx+8]
                p = idx + 9
                changes = []
                for _ in range(count):
                    if p + 1 < len(data):
                        eid = data[p]
                        eval_ = data[p+1]
                        p += 2
                        
                        mode = eval_ & 0x0f
                        is_chg = (mode == 0x0c or mode == 0x0e or eval_ == 0x87)
                        
                        if eid == 2:
                            state["left_charging"] = is_chg
                            changes.append(f"Left Chg: {is_chg}")
                        elif eid == 3:
                            state["right_charging"] = is_chg
                            changes.append(f"Right Chg: {is_chg}")
                        elif eid == 4:
                            state["case_open"] = (eval_ != 0x00)
                if changes:
                    log_event("Charging States -> " + " • ".join(changes))
                    save_state()

            # --- Opcode 0x03 / 0x04: TWS Link & In-Ear ---
            elif cmd in [0x03, 0x04] and idx + 8 < len(data):
                val = data[idx+8]
                if val == 0x0F:
                    state["left_in_ear"] = True
                    state["right_in_ear"] = True
                elif val == 0xBA:
                    log_event("TWS Bridge: Dual link active (0xBA)")
            idx += 6
        else:
            idx += 1

def handle_ipc_client(conn):
    global rfcomm_sock
    try:
        raw_msg = conn.recv(1024).decode('utf-8').strip()
        if not raw_msg:
            return
        req = json.loads(raw_msg)
        action = req.get("action")
        
        if action == "send_command":
            cmd_key = req.get("cmd")
            payload = COMMANDS.get(cmd_key)
            if not payload:
                conn.sendall(json.dumps({"ok": False, "msg": f"Unknown command: {cmd_key}"}).encode('utf-8'))
                return
                
            with sock_lock:
                if rfcomm_sock and state["connected"]:
                    try:
                        rfcomm_sock.sendall(payload)
                        log_event(f"Command '{cmd_key}' sent via active RFCOMM tunnel")
                        conn.sendall(json.dumps({"ok": True, "msg": "Success"}).encode('utf-8'))
                    except Exception as e:
                        conn.sendall(json.dumps({"ok": False, "msg": str(e)}).encode('utf-8'))
                else:
                    conn.sendall(json.dumps({"ok": False, "msg": "Device not connected via RFCOMM"}).encode('utf-8'))
        elif action == "get_status":
            conn.sendall(json.dumps({"ok": True, "state": state}).encode('utf-8'))
    except Exception as e:
        try:
            conn.sendall(json.dumps({"ok": False, "msg": str(e)}).encode('utf-8'))
        except Exception:
            pass
    finally:
        conn.close()

def ipc_server_loop():
    if os.path.exists(UNIX_SOCK_PATH):
        try:
            os.unlink(UNIX_SOCK_PATH)
        except OSError:
            pass
            
    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(UNIX_SOCK_PATH)
    os.chmod(UNIX_SOCK_PATH, 0o777)
    server.listen(10)
    log_event(f"✓ Command IPC Server listening on {UNIX_SOCK_PATH}")
    
    while True:
        try:
            conn, _ = server.accept()
            t = threading.Thread(target=handle_ipc_client, args=(conn,))
            t.daemon = True
            t.start()
        except Exception:
            pass

def main():
    global rfcomm_sock
    log_event("=== NOTHING EAR LIVE DAEMON & IPC BRIDGE STARTED ===")
    save_state()
    
    # Start IPC server in separate thread
    ipc_thread = threading.Thread(target=ipc_server_loop)
    ipc_thread.daemon = True
    ipc_thread.start()
    
    while True:
        try:
            sock = socket.socket(socket.AF_BLUETOOTH, socket.SOCK_STREAM, socket.BTPROTO_RFCOMM)
            sock.settimeout(2.0)
            sock.connect((MAC, RFCOMM_CHANNEL))
            
            with sock_lock:
                rfcomm_sock = sock
                state["connected"] = True
                save_state()
            log_event(f"✓ Connected to {MAC} on RFCOMM 15")
            
            # Initial probe
            for op in [0x01, 0x02, 0x03, 0x0f]:
                try:
                    sock.sendall(bytes([0x55, 0x60, 0x01, op, 0xf0, 0x00, 0x00, 0x00]))
                    time.sleep(0.04)
                except Exception:
                    pass

            last_probe = time.time()
            while True:
                try:
                    sock.settimeout(1.2)
                    data = sock.recv(128)
                    if data:
                        parse_packet(data)
                except socket.timeout:
                    pass
                
                if time.time() - last_probe > 3.0:
                    last_probe = time.time()
                    try:
                        with sock_lock:
                            if rfcomm_sock:
                                rfcomm_sock.sendall(bytes([0x55, 0x60, 0x01, 0x01, 0xf0, 0x00, 0x00, 0x00]))
                                rfcomm_sock.sendall(bytes([0x55, 0x60, 0x01, 0x02, 0xf0, 0x00, 0x00, 0x00]))
                    except Exception:
                        break
                        
        except Exception:
            with sock_lock:
                rfcomm_sock = None
                if state["connected"]:
                    state["connected"] = False
                    save_state()
                    log_event("Bluetooth Disconnected (Standby)")
            time.sleep(1.2)
        finally:
            with sock_lock:
                if sock:
                    try:
                        sock.close()
                    except Exception:
                        pass
                rfcomm_sock = None

if __name__ == "__main__":
    main()
