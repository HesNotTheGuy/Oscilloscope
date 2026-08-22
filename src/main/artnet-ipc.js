'use strict';

import dgram from 'node:dgram';

// ─────────────────────────────────────────────────────────────
//  Art-Net DMX transmitter (main process).
//
//  ArtDmx (OpCode 0x5000), Art-Net 4 / protocol version 14.
//  The renderer never touches a socket — it hands us a universe
//  and 512 bytes over IPC and we frame them.
//
//  The header packs three 16-bit fields that DISAGREE on byte
//  order, which is the classic source of dark fixtures:
//    OpCode  → little-endian  (spec: "transmitted low byte first")
//    ProtVer → big-endian     (ProtVerHi sits at the lower offset)
//    Length  → big-endian     (LengthHi first; 512 → 02 00)
//  Port-Address is split as SubUni-then-Net, i.e. the byte pair
//  reads little-endian — the opposite of Length two bytes later.
//  Hence: explicit per-byte writes, never a packed struct or a
//  blanket htons() over the header.
// ─────────────────────────────────────────────────────────────

export const ARTNET_PORT = 6454;          // 0x1936, the only port Art-Net uses
const HEADER_LEN = 18;
const MAX_CHANNELS = 512;
const PROTO_VER_LO = 14;                  // devices ignore peers advertising < 14
const OP_DMX = 0x5000;
const MAX_PORT_ADDRESS = 0x7fff;          // 15-bit Net<<8|SubUni

const ARTNET_ID = Buffer.from([0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00]); // "Art-Net\0"

const DEFAULTS = { host: '2.255.255.255', port: ARTNET_PORT, universe: 0 };

// One socket, one config, one sequence counter per universe, for the
// process lifetime. Module scope is fine: there is exactly one main process.
const state = {
  socket: null,
  ready: null,       // Promise<dgram.Socket> — resolves once bound
  failReady: null,   // reject() of the above while the bind is still pending
  broadcast: false,  // last value pushed to setBroadcast()
  config: { ...DEFAULTS },
  seq: new Map(),    // universe → 1..255. Per Port-Address, not global:
                     // a shared counter makes receivers see gaps and drop frames.
};

// A directed broadcast (x.x.x.255) or the limited broadcast. The spec forbids
// 255.255.255.255 for Art-Net, but we still flag it so a user who types it
// gets a socket that can actually send rather than EACCES.
export function isBroadcastHost(host) {
  if (typeof host !== 'string') return false;
  const parts = host.split('.');
  if (parts.length !== 4) return false;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p) || Number(p) > 255) return false;
  }
  return Number(parts[3]) === 255;
}

// Coerce whatever crossed the IPC boundary into a DMX payload:
// 0-255 bytes, at most 512 of them, and an even count (the spec requires
// an even Length in 2..512, so an odd channel count pads up by one).
export function sanitizeChannels(bytes) {
  if (!Array.isArray(bytes) && !ArrayBuffer.isView(bytes)) return null;
  const n = Math.min(bytes.length, MAX_CHANNELS);
  const even = Math.max(2, n + (n & 1));
  const out = new Uint8Array(even);
  for (let i = 0; i < n; i++) {
    const v = Math.round(Number(bytes[i]));
    out[i] = Number.isFinite(v) ? (v < 0 ? 0 : v > 255 ? 255 : v) : 0;
  }
  return out;
}

// Pure: builds the 18-byte header + data. Exported for tests — this is the
// part that is byte-exact and worth asserting on.
export function buildArtDmx(universe, data, sequence = 0, physical = 0) {
  const uni = (Number(universe) | 0) & MAX_PORT_ADDRESS;
  const len = data.length;
  const pkt = Buffer.alloc(HEADER_LEN + len);

  ARTNET_ID.copy(pkt, 0);
  pkt[8]  = OP_DMX & 0xff;                 // 0x00 ─ OpCode, LITTLE-endian
  pkt[9]  = (OP_DMX >> 8) & 0xff;          // 0x50 ┘
  pkt[10] = 0;                             // ProtVerHi ─ BIG-endian
  pkt[11] = PROTO_VER_LO;                  // ProtVerLo ┘ = 14
  pkt[12] = sequence & 0xff;               // 0 disables re-sequencing
  pkt[13] = physical & 0xff;               // constant, or the node may merge streams
  pkt[14] = uni & 0xff;                    // SubUni ─ Port-Address, low byte first
  pkt[15] = (uni >> 8) & 0x7f;             // Net    ┘ bit 7 must be 0
  pkt[16] = (len >> 8) & 0xff;             // LengthHi ─ BIG-endian
  pkt[17] = len & 0xff;                    // Length   ┘
  pkt.set(data, HEADER_LEN);
  return pkt;
}

function nextSequence(universe) {
  // Wrap is 0xff → 0x01: zero is reserved for "sequencing disabled".
  const prev = state.seq.get(universe) || 0;
  const next = (prev % 255) + 1;
  state.seq.set(universe, next);
  return next;
}

// Bound to an ephemeral port, not 6454: we transmit only (no ArtPoll), and
// squatting on 6454 would lock out any other Art-Net app on the machine.
function getSocket() {
  if (state.ready) return state.ready;
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  state.socket = sock;
  state.ready = new Promise((resolve, reject) => {
    // Held so that closing the socket mid-bind can settle this promise: bind()
    // never calls back on a socket that was closed while resolving its address,
    // and a send awaiting it would otherwise hang for the life of the process.
    state.failReady = reject;
    // Registered before the teardown listener so the real errno (EACCES,
    // EADDRINUSE) wins the race against the generic close reason below.
    sock.once('error', reject);
    // A late socket error (ICMP unreachable, interface torn down) must not
    // become an unhandled 'error' event, which would kill the main process.
    // Only the socket that is still current may tear down shared state — an
    // error arriving on an already-replaced socket must not close its successor.
    sock.on('error', () => { if (state.socket === sock) closeSocket(); });
    sock.bind(() => {
      state.failReady = null;
      state.broadcast = false;
      resolve(sock);
    });
  });
  // artnet:send attaches its own handler via await; this one only keeps a
  // close-during-bind rejection from ever surfacing as an unhandled rejection.
  state.ready.catch(() => {});
  return state.ready;
}

function closeSocket() {
  const sock = state.socket;
  const failReady = state.failReady;
  state.socket = null;
  state.ready = null;
  state.failReady = null;
  state.broadcast = false;
  if (sock) {
    try { sock.close(); } catch (_) {}
  }
  // No-op once the bind resolved; the escape hatch for the window before it.
  if (failReady) failReady(new Error('artnet socket closed'));
}

function applyBroadcast(sock, host) {
  const want = isBroadcastHost(host);
  if (want === state.broadcast) return;
  try {
    sock.setBroadcast(want);
    state.broadcast = want;
  } catch (_) {
    // Not fatal — unicast still works; only broadcast targets will fail.
  }
}

function sendPacket(sock, pkt, port, host) {
  return new Promise((resolve, reject) => {
    sock.send(pkt, port, host, (err) => (err ? reject(err) : resolve(pkt.length)));
  });
}

function errMessage(err) {
  return (err && err.message) ? String(err.message) : String(err);
}

/**
 * Registers artnet:configure / artnet:send / artnet:stop on the given ipcMain.
 * Every handler resolves — never rejects — because an unhandled rejection in
 * main is a hard failure and a lighting frame is not worth crashing the app.
 */
export function installArtnetIpc(ipcMain) {
  ipcMain.handle('artnet:configure', (_event, opts = {}) => {
    try {
      const next = { ...state.config };
      if (opts && typeof opts.host === 'string' && opts.host.trim()) next.host = opts.host.trim();
      if (opts && Number.isFinite(Number(opts.port))) {
        const p = Number(opts.port) | 0;
        if (p < 1 || p > 65535) return { ok: false, error: 'port out of range' };
        next.port = p;
      }
      if (opts && Number.isFinite(Number(opts.universe))) {
        const u = Number(opts.universe) | 0;
        if (u < 0 || u > MAX_PORT_ADDRESS) return { ok: false, error: 'universe out of range' };
        next.universe = u;
      }
      state.config = next;
      return { ok: true, config: { ...next } };
    } catch (err) {
      return { ok: false, error: errMessage(err) };
    }
  });

  ipcMain.handle('artnet:send', async (_event, universe, bytes) => {
    try {
      const data = sanitizeChannels(bytes);
      if (!data) return { ok: false, error: 'channel data must be an array or typed array' };

      const uni = Number.isFinite(Number(universe))
        ? (Number(universe) | 0) & MAX_PORT_ADDRESS
        : state.config.universe;

      const sock = await getSocket();
      applyBroadcast(sock, state.config.host);
      const pkt = buildArtDmx(uni, data, nextSequence(uni));
      const sent = await sendPacket(sock, pkt, state.config.port, state.config.host);
      return { ok: true, universe: uni, channels: data.length, bytes: sent };
    } catch (err) {
      return { ok: false, error: errMessage(err) };
    }
  });

  ipcMain.handle('artnet:stop', () => {
    try {
      closeSocket();
      state.seq.clear();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errMessage(err) };
    }
  });
}

// Test/teardown hook: drops the socket and resets config + sequence counters.
export function _resetArtnet() {
  closeSocket();
  state.seq.clear();
  state.config = { ...DEFAULTS };
}
