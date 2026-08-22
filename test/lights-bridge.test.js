import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LightsBridge } from '../src/patch/lights-bridge.js';
import { buildArtDmx, sanitizeChannels, isBroadcastHost } from '../src/main/artnet-ipc.js';

// ─────────────────────────────────────────────────────────────
//  LightsBridge — the send loop's real contract: cadence,
//  back-pressure, failure tolerance. Plus byte-exact coverage of
//  the ArtDmx header, where the three 16-bit fields disagree on
//  endianness and a mistake silently blacks out a rig.
// ─────────────────────────────────────────────────────────────

const FRAME = 25;
const KEEPALIVE = 1000;

// A send whose promise we resolve by hand, to model a slow IPC round-trip.
function deferredSend() {
  let settle = null;
  const fn = vi.fn(() => new Promise((resolve, reject) => { settle = { resolve, reject }; }));
  fn.resolveLast = () => settle.resolve();
  fn.rejectLast = () => settle.reject(new Error('node unreachable'));
  return fn;
}

let bridge;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  if (bridge) bridge.stop();
  bridge = null;
  vi.useRealTimers();
});

describe('LightsBridge.setChannel', () => {
  beforeEach(() => { bridge = new LightsBridge(vi.fn(() => Promise.resolve())); });

  it('maps 0 / 0.5 / 1 to bytes 0 / 128 / 255', () => {
    bridge.setChannel(0, 0);
    bridge.setChannel(1, 0.5);
    bridge.setChannel(2, 1);
    expect(bridge.getChannel(0)).toBe(0);
    expect(bridge.getChannel(1)).toBe(128); // Math.round(127.5)
    expect(bridge.getChannel(2)).toBe(255);
  });

  it('rounds intermediate values', () => {
    bridge.setChannel(0, 0.25);
    bridge.setChannel(1, 1 / 3);
    expect(bridge.getChannel(0)).toBe(64);
    expect(bridge.getChannel(1)).toBe(85);
  });

  it('clamps values above 1 and below 0', () => {
    bridge.setChannel(0, 7);
    bridge.setChannel(1, -3);
    bridge.setChannel(2, -0.0001);
    expect(bridge.getChannel(0)).toBe(255);
    expect(bridge.getChannel(1)).toBe(0);
    expect(bridge.getChannel(2)).toBe(0);
  });

  it('treats NaN / undefined values as 0 without throwing', () => {
    bridge.setChannel(0, 1);
    expect(() => bridge.setChannel(0, NaN)).not.toThrow();
    expect(bridge.getChannel(0)).toBe(0);
    expect(() => bridge.setChannel(1, undefined)).not.toThrow();
    expect(bridge.getChannel(1)).toBe(0);
  });

  it('ignores out-of-range and non-numeric indices without throwing', () => {
    for (const bad of [-1, 512, 1e6, NaN, Infinity, 'abc', undefined, null]) {
      expect(() => bridge.setChannel(bad, 1)).not.toThrow();
      expect(bridge.getChannel(bad)).toBe(0);
    }
    // Nothing leaked into the real buffer.
    expect(bridge._data.every((b) => b === 0)).toBe(true);
  });

  it('truncates fractional indices', () => {
    bridge.setChannel(3.9, 1);
    expect(bridge.getChannel(3)).toBe(255);
    expect(bridge.getChannel(4)).toBe(0);
  });

  it('reuses one 512-byte buffer (no allocation on the hot path)', () => {
    const buf = bridge._data;
    expect(buf).toBeInstanceOf(Uint8Array);
    expect(buf.length).toBe(512);
    for (let i = 0; i < 512; i++) bridge.setChannel(i, i / 512);
    expect(bridge._data).toBe(buf);
  });

  it('blackout zeroes every channel', () => {
    bridge.setChannel(10, 1);
    bridge.blackout();
    expect(bridge.getChannel(10)).toBe(0);
  });
});

describe('LightsBridge send loop', () => {
  it('start() sends on the frame interval, stop() stops', async () => {
    const send = vi.fn(() => Promise.resolve());
    bridge = new LightsBridge(send, { universe: 3 });

    expect(bridge.running).toBe(false);
    bridge.start();
    expect(bridge.running).toBe(true);
    expect(send).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(FRAME);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe(3);
    expect(send.mock.calls[0][1]).toBeInstanceOf(Uint8Array);
    expect(send.mock.calls[0][1].length).toBe(512);

    bridge.stop();
    expect(bridge.running).toBe(false);
    await vi.advanceTimersByTimeAsync(FRAME * 100);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('stop() twice is safe and start() after stop() resumes', async () => {
    const send = vi.fn(() => Promise.resolve());
    bridge = new LightsBridge(send);
    bridge.start();
    await vi.advanceTimersByTimeAsync(FRAME);

    expect(() => { bridge.stop(); bridge.stop(); }).not.toThrow();
    expect(bridge.running).toBe(false);

    bridge.start();
    await vi.advanceTimersByTimeAsync(FRAME);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('start() twice does not double the frame rate', async () => {
    const send = vi.fn(() => Promise.resolve());
    bridge = new LightsBridge(send);
    bridge.start();
    bridge.start();
    await vi.advanceTimersByTimeAsync(FRAME);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('only sends on change inside the keepalive window', async () => {
    const send = vi.fn(() => Promise.resolve());
    bridge = new LightsBridge(send);
    bridge.start();

    await vi.advanceTimersByTimeAsync(FRAME);      // first frame always goes
    expect(send).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(FRAME * 8);  // idle, well inside keepalive
    expect(send).toHaveBeenCalledTimes(1);

    bridge.setChannel(0, 1);
    await vi.advanceTimersByTimeAsync(FRAME);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('writing the same value again does not mark the frame dirty', async () => {
    const send = vi.fn(() => Promise.resolve());
    bridge = new LightsBridge(send);
    bridge.setChannel(0, 1);
    bridge.start();
    await vi.advanceTimersByTimeAsync(FRAME);
    expect(send).toHaveBeenCalledTimes(1);

    bridge.setChannel(0, 1);
    await vi.advanceTimersByTimeAsync(FRAME * 4);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('refreshes an unchanged rig once the keepalive elapses', async () => {
    const send = vi.fn(() => Promise.resolve());
    bridge = new LightsBridge(send);
    bridge.start();

    await vi.advanceTimersByTimeAsync(FRAME);          // t=25, first frame
    expect(send).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(KEEPALIVE - FRAME); // t=1000, 975 ms since
    expect(send).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(FRAME);          // t=1025, 1000 ms since
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('honours a custom frame and keepalive interval', async () => {
    const send = vi.fn(() => Promise.resolve());
    bridge = new LightsBridge(send, { frameMs: 100, keepaliveMs: 200 });
    bridge.start();
    await vi.advanceTimersByTimeAsync(99);
    expect(send).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);            // keepalive, no changes
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('does not overlap sends while one is in flight', async () => {
    const send = deferredSend();
    bridge = new LightsBridge(send);
    bridge.start();

    await vi.advanceTimersByTimeAsync(FRAME);
    expect(send).toHaveBeenCalledTimes(1);

    // Ten more frames' worth of dirty state while the first send hangs.
    for (let i = 0; i < 10; i++) {
      bridge.setChannel(i, 1);
      await vi.advanceTimersByTimeAsync(FRAME);
    }
    expect(send).toHaveBeenCalledTimes(1);
    expect(bridge.drops).toBe(10);

    send.resolveLast();
    await vi.advanceTimersByTimeAsync(0);

    // The queue was dropped, not buffered — the next frame carries current state.
    await vi.advanceTimersByTimeAsync(FRAME);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][1][9]).toBe(255);
  });

  it('keeps running when a send rejects', async () => {
    const send = vi.fn(() => Promise.reject(new Error('EHOSTUNREACH')));
    bridge = new LightsBridge(send);
    bridge.start();

    await vi.advanceTimersByTimeAsync(FRAME);
    expect(send).toHaveBeenCalledTimes(1);
    expect(bridge.failures).toBe(1);
    expect(bridge.running).toBe(true);

    // Failure re-arms the frame, so the same state is retried immediately.
    await vi.advanceTimersByTimeAsync(FRAME * 3);
    expect(send.mock.calls.length).toBeGreaterThan(1);
    expect(bridge.running).toBe(true);
  });

  it('keeps running when a send throws synchronously', async () => {
    const send = vi.fn(() => { throw new Error('bridge gone'); });
    bridge = new LightsBridge(send);
    bridge.start();

    await vi.advanceTimersByTimeAsync(FRAME * 2);
    expect(bridge.failures).toBeGreaterThan(0);
    expect(bridge.running).toBe(true);
    expect(bridge._inFlight).toBe(false);
  });

  it('tolerates a missing send function', async () => {
    bridge = new LightsBridge(undefined);
    bridge.start();
    await vi.advanceTimersByTimeAsync(FRAME * 4);
    expect(bridge.running).toBe(true);
    expect(bridge.frames).toBe(0);
  });

  it('configure() stores routing and forces a fresh frame on universe change', async () => {
    const send = vi.fn(() => Promise.resolve());
    bridge = new LightsBridge(send);
    bridge.configure({ host: '10.0.0.7', port: 6454, universe: 5 });
    expect(bridge.host).toBe('10.0.0.7');
    expect(bridge.universe).toBe(5);

    bridge.start();
    await vi.advanceTimersByTimeAsync(FRAME);
    expect(send.mock.calls[0][0]).toBe(5);

    bridge.configure({ universe: 6 });
    await vi.advanceTimersByTimeAsync(FRAME);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toBe(6);
  });

  it('configure() ignores junk values', () => {
    bridge = new LightsBridge(vi.fn());
    bridge.configure({ host: '', port: 0, universe: -1 });
    expect(bridge.host).toBe('2.255.255.255');
    expect(bridge.port).toBe(6454);
    expect(bridge.universe).toBe(0);
    expect(() => bridge.configure()).not.toThrow();
  });

  // The constructor used to range-check nothing, so `universe: -1` was stored
  // verbatim and main masked it to Port-Address 32767 — a silently misaddressed
  // rig. The two entry points must agree.
  it('the constructor rejects the same junk configure() rejects', () => {
    bridge = new LightsBridge(vi.fn(), { host: '  ', port: -7, universe: -1 });
    expect(bridge.host).toBe('2.255.255.255');
    expect(bridge.port).toBe(6454);
    expect(bridge.universe).toBe(0);

    const big = new LightsBridge(vi.fn(), { port: 70000, universe: 0x8000 });
    expect(big.port).toBe(6454);
    expect(big.universe).toBe(0);
  });

  // `0.5 > 0` passes, but `0.5 | 0` stores 0 and setInterval(0) free-runs at the
  // timer floor — ~1 kHz, far over the 44 Hz gateway ceiling.
  it('a fractional frameMs falls back to the default instead of collapsing to 0', async () => {
    const send = vi.fn(() => Promise.resolve());
    bridge = new LightsBridge(send, { frameMs: 0.5 });
    expect(bridge.frameMs).toBe(FRAME);

    bridge.start();
    await vi.advanceTimersByTimeAsync(FRAME - 1);
    expect(send).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('stop() releases the in-flight guard so a restart is not gated on the old send', async () => {
    const send = deferredSend();   // stays pending until we settle it
    bridge = new LightsBridge(send);
    bridge.start();
    await vi.advanceTimersByTimeAsync(FRAME);
    expect(send).toHaveBeenCalledTimes(1);
    expect(bridge._inFlight).toBe(true);

    bridge.stop();
    expect(bridge._inFlight).toBe(false);

    // Before the fix this frame was dropped, and if the abandoned send never
    // settled the bridge stayed dead while still reporting running === true.
    bridge.start();
    await vi.advanceTimersByTimeAsync(FRAME);
    expect(send).toHaveBeenCalledTimes(2);
    expect(bridge.running).toBe(true);
  });

  it('a send abandoned by stop() cannot clear the next run\'s in-flight guard', async () => {
    const settles = [];
    const send = vi.fn(() => new Promise((resolve) => { settles.push(resolve); }));
    bridge = new LightsBridge(send);
    bridge.start();
    await vi.advanceTimersByTimeAsync(FRAME);
    expect(send).toHaveBeenCalledTimes(1);

    bridge.stop();
    bridge.start();
    await vi.advanceTimersByTimeAsync(FRAME);
    expect(send).toHaveBeenCalledTimes(2);   // run 2's send is now in flight
    expect(bridge._inFlight).toBe(true);

    settles[0]();                            // the abandoned run-1 send returns late
    await vi.advanceTimersByTimeAsync(FRAME * 3);

    // Run 2's send is still outstanding, so no overlapping send may be issued.
    expect(bridge._inFlight).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────
//  ArtDmx framing (main-process side of the bridge)
// ─────────────────────────────────────────────────────────────

describe('buildArtDmx', () => {
  const full = new Uint8Array(512);

  it('writes the Art-Net ID and an 18-byte header', () => {
    const pkt = buildArtDmx(0, full, 1);
    expect(pkt.length).toBe(18 + 512);
    expect([...pkt.subarray(0, 8)]).toEqual([0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00]);
  });

  it('serializes OpCode little-endian and Length big-endian in the same header', () => {
    const pkt = buildArtDmx(0, full, 1);
    // The pairing that catches both classic Art-Net bugs at once.
    expect([...pkt.subarray(8, 10)]).toEqual([0x00, 0x50]);  // OpCode 0x5000, low byte first
    expect([...pkt.subarray(16, 18)]).toEqual([0x02, 0x00]); // Length 512, high byte first
  });

  it('writes protocol version 14 big-endian', () => {
    const pkt = buildArtDmx(0, full, 1);
    expect([...pkt.subarray(10, 12)]).toEqual([0x00, 0x0e]);
  });

  it('carries sequence and physical', () => {
    const pkt = buildArtDmx(0, full, 200, 2);
    expect(pkt[12]).toBe(200);
    expect(pkt[13]).toBe(2);
  });

  it('splits the Port-Address as SubUni then Net', () => {
    const pkt = buildArtDmx(0x0102, full, 0);
    expect(pkt[14]).toBe(0x02); // SubUni — low byte first
    expect(pkt[15]).toBe(0x01); // Net    — high byte second
  });

  it('masks bit 7 of Net (15-bit Port-Address)', () => {
    const pkt = buildArtDmx(0xffff, full, 0);
    expect(pkt[15] & 0x80).toBe(0);
    expect(pkt[15]).toBe(0x7f);
  });

  it('encodes a short frame length big-endian and appends the data', () => {
    const pkt = buildArtDmx(0, Uint8Array.from([1, 2, 3, 4]), 0);
    expect([...pkt.subarray(16, 18)]).toEqual([0x00, 0x04]);
    expect([...pkt.subarray(18)]).toEqual([1, 2, 3, 4]);
  });

  it('places channel 1 at data offset 0 (no start code on the wire)', () => {
    const data = new Uint8Array(512);
    data[0] = 77;
    const pkt = buildArtDmx(0, data, 0);
    expect(pkt[18]).toBe(77);
  });
});

describe('sanitizeChannels', () => {
  it('rejects non-array input', () => {
    for (const bad of [null, undefined, 42, 'ffff', {}]) expect(sanitizeChannels(bad)).toBeNull();
  });

  it('accepts arrays and typed arrays', () => {
    expect(sanitizeChannels([1, 2])).toEqual(Uint8Array.from([1, 2]));
    expect(sanitizeChannels(Uint8Array.from([1, 2]))).toEqual(Uint8Array.from([1, 2]));
  });

  it('pads an odd channel count up to an even one', () => {
    const out = sanitizeChannels([9, 9, 9]);
    expect(out.length).toBe(4);
    expect(out[3]).toBe(0);
  });

  it('enforces the 2-channel minimum and the 512-channel cap', () => {
    expect(sanitizeChannels([]).length).toBe(2);
    expect(sanitizeChannels([1]).length).toBe(2);
    expect(sanitizeChannels(new Array(600).fill(255)).length).toBe(512);
  });

  it('clamps values and zeroes garbage', () => {
    const out = sanitizeChannels([-5, 300, 12.6, NaN, 'x', null]);
    expect([...out]).toEqual([0, 255, 13, 0, 0, 0]);
  });
});

describe('isBroadcastHost', () => {
  it('detects directed and limited broadcast addresses', () => {
    expect(isBroadcastHost('2.255.255.255')).toBe(true);
    expect(isBroadcastHost('10.255.255.255')).toBe(true);
    expect(isBroadcastHost('192.168.1.255')).toBe(true);
    expect(isBroadcastHost('255.255.255.255')).toBe(true);
  });

  it('rejects unicast addresses and junk', () => {
    expect(isBroadcastHost('192.168.1.42')).toBe(false);
    expect(isBroadcastHost('artnet.local')).toBe(false);
    expect(isBroadcastHost('999.1.1.255')).toBe(false);
    expect(isBroadcastHost(undefined)).toBe(false);
  });
});
