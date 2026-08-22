import { describe, it, expect, afterEach } from 'vitest';
import http from 'http';
import {
  installStreamServer, startServer, stopServer, pushFrame, getStatus,
} from '../src/main/stream-server.js';

// ─────────────────────────────────────────────────────────────
//  MJPEG stream server tests — real sockets, no mocks. Subtly
//  wrong multipart framing shows up as a frozen or torn image in
//  OBS rather than an error, so the byte layout is asserted
//  literally: boundary line, part headers, payload, trailing CRLF.
// ─────────────────────────────────────────────────────────────

// Stand-in for electron's ipcMain — records handlers so the tests drive the
// same code path main.js will.
function makeIpcMain() {
  const handlers = new Map();
  const listeners = new Map();
  return {
    handle: (ch, fn) => handlers.set(ch, fn),
    removeHandler: (ch) => handlers.delete(ch),
    on: (ch, fn) => listeners.set(ch, fn),
    removeAllListeners: (ch) => listeners.delete(ch),
    invoke: (ch, ...args) => handlers.get(ch)({}, ...args),
    emit: (ch, ...args) => listeners.get(ch)({}, ...args),
    channels: () => [...handlers.keys(), ...listeners.keys()],
  };
}

// Payload deliberately contains CRLFs and a '--' run: a client that resynced
// by scanning for the boundary instead of honouring Content-Length would tear
// the frame here.
const FRAME_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),   // PNG magic (contains CRLF)
  Buffer.from('\r\n--not-a-boundary--\r\n', 'latin1'),
  Buffer.from([0x00, 0xff, 0x0d, 0x0a, 0x2d, 0x2d, 0x7f]),
]);
const FRAME_URL = 'data:image/png;base64,' + FRAME_BYTES.toString('base64');

function get(port, path, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path, agent: false, ...opts }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve({ res, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

// Long-lived stream client: keeps everything it has received so far.
function openStream(port) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/stream.mjpeg', agent: false }, (res) => {
      const client = {
        res,
        req,
        chunks: [],
        errors: [],
        buf() { return Buffer.concat(this.chunks); },
        close() { req.destroy(); },
      };
      res.on('data', (d) => client.chunks.push(d));
      res.on('error', (e) => client.errors.push(e));
      resolve(client);
    });
    req.on('error', reject);
  });
}

async function waitUntil(fn, timeout = 3000) {
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 5));
  }
}

function boundaryOf(res) {
  const m = /^multipart\/x-mixed-replace;\s*boundary=(.+)$/.exec(res.headers['content-type'] || '');
  return m ? m[1] : null;
}

// Parse the first complete part out of a raw stream buffer, or null if it has
// not fully arrived yet.
function parsePart(buf, boundary) {
  const delim = Buffer.from('--' + boundary + '\r\n', 'latin1');
  const start = buf.indexOf(delim);
  if (start < 0) return null;
  const hStart = start + delim.length;
  const hEnd = buf.indexOf('\r\n\r\n', hStart, 'latin1');
  if (hEnd < 0) return null;
  const headers = buf.toString('latin1', hStart, hEnd);
  const m = /content-length:\s*(\d+)/i.exec(headers);
  if (!m) return null;
  const len = Number(m[1]);
  const pStart = hEnd + 4;
  if (buf.length < pStart + len + 2) return null;
  return {
    prefix: buf.subarray(0, start),
    headers,
    payload: buf.subarray(pStart, pStart + len),
    trailer: buf.toString('latin1', pStart + len, pStart + len + 2),
    end: pStart + len + 2,
  };
}

const open = [];
async function stream(port) {
  const c = await openStream(port);
  open.push(c);
  return c;
}

afterEach(async () => {
  for (const c of open.splice(0)) c.close();
  await stopServer();
});

describe('stream server lifecycle', () => {
  it('starts on loopback and reports the real port', async () => {
    const r = await startServer({ port: 0 });
    expect(r.ok).toBe(true);
    expect(r.port).toBeGreaterThan(0);
    expect(r.url).toBe(`http://127.0.0.1:${r.port}/`);
    expect(getStatus()).toMatchObject({ running: true, port: r.port, clients: 0 });
  });

  it('serves the viewer page on /', async () => {
    const { port } = await startServer({ port: 0 });
    const { res, body } = await get(port, '/');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/html/);
    expect(body.toString('utf8')).toContain('/stream.mjpeg');
  });

  it('404s an unknown path', async () => {
    const { port } = await startServer({ port: 0 });
    const { res } = await get(port, '/nope');
    expect(res.statusCode).toBe(404);
  });

  it('refuses a non-loopback Host header (DNS rebinding)', async () => {
    const { port } = await startServer({ port: 0 });
    const { res } = await get(port, '/', { headers: { Host: 'evil.example.com' } });
    expect(res.statusCode).toBe(403);
  });

  it('falls back to an ephemeral port when the preferred one is taken', async () => {
    const squatter = http.createServer();
    await new Promise((r) => squatter.listen(0, '127.0.0.1', r));
    const taken = squatter.address().port;
    try {
      const r = await startServer({ port: taken });
      expect(r.ok).toBe(true);
      expect(r.port).toBeGreaterThan(0);
      expect(r.port).not.toBe(taken);
    } finally {
      await new Promise((r) => squatter.close(r));
    }
  });

  it('stop closes the server so a later request cannot connect', async () => {
    const { port } = await startServer({ port: 0 });
    expect(await stopServer()).toMatchObject({ ok: true, stopped: true });
    expect(getStatus().running).toBe(false);
    await expect(get(port, '/')).rejects.toMatchObject({ code: 'ECONNREFUSED' });
  });

  // A start awaits listen(), so `state` is still null for the whole handshake.
  // Two 'stream:start' calls in the same tick used to build two http.Servers:
  // the second lost the port race, fell back to an ephemeral port, and the
  // first was left listening with nothing able to close it again.
  it('coalesces two starts issued in the same tick into one server', async () => {
    const [a, b] = await Promise.all([startServer({ port: 0 }), startServer({ port: 0 })]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(b.port).toBe(a.port);
    expect(getStatus().port).toBe(a.port);

    await stopServer();
    // Nothing may still be bound: an orphaned listener would answer here.
    await expect(get(a.port, '/')).rejects.toMatchObject({ code: 'ECONNREFUSED' });
    await expect(get(b.port, '/')).rejects.toMatchObject({ code: 'ECONNREFUSED' });
  });

  // will-quit can fire while a start is still in flight. Reporting
  // 'nothing running' there would leave the listening socket outliving the app.
  it('a stop issued mid-start still closes the server that start opens', async () => {
    const starting = startServer({ port: 0 });
    const stopped = await stopServer();
    const started = await starting;

    expect(started.ok).toBe(true);
    expect(stopped).toMatchObject({ ok: true, stopped: true });
    expect(getStatus().running).toBe(false);
    await expect(get(started.port, '/')).rejects.toMatchObject({ code: 'ECONNREFUSED' });
  });

  it('stop with nothing running is a no-op, and so is a frame with no server', async () => {
    expect(await stopServer()).toMatchObject({ ok: true, stopped: false });
    expect(pushFrame(FRAME_URL)).toBe(false);
  });
});

describe('mjpeg framing', () => {
  it('answers /stream.mjpeg with a multipart content-type and a boundary', async () => {
    const { port } = await startServer({ port: 0 });
    const c = await stream(port);
    expect(c.res.statusCode).toBe(200);
    const boundary = boundaryOf(c.res);
    expect(boundary).toBeTruthy();
    expect(boundary.length).toBeLessThanOrEqual(70);
    // Headers must arrive before any frame does.
    expect(c.buf().length).toBe(0);
  });

  it('delivers a pushed frame as a well-formed part', async () => {
    const { port } = await startServer({ port: 0 });
    const c = await stream(port);
    const boundary = boundaryOf(c.res);

    pushFrame(FRAME_URL);
    const part = await waitUntil(() => parsePart(c.buf(), boundary));

    expect(part.prefix.length).toBe(0);                       // stream opens on the boundary line
    expect(part.headers).toContain('Content-Type: image/png'); // mime taken from the data URL
    expect(part.headers).toContain(`Content-Length: ${FRAME_BYTES.length}`);
    expect(part.trailer).toBe('\r\n');                        // CRLF closing the part
    expect(Buffer.compare(part.payload, FRAME_BYTES)).toBe(0);
  });

  it('takes the part content-type from the data URL (webp)', async () => {
    const { port } = await startServer({ port: 0 });
    const c = await stream(port);
    const boundary = boundaryOf(c.res);

    pushFrame('data:image/webp;base64,' + FRAME_BYTES.toString('base64'));
    const part = await waitUntil(() => parsePart(c.buf(), boundary));
    expect(part.headers).toContain('Content-Type: image/webp');
  });

  it('emits back-to-back parts without a gap', async () => {
    const { port } = await startServer({ port: 0 });
    const c = await stream(port);
    const boundary = boundaryOf(c.res);

    pushFrame(FRAME_URL);
    pushFrame(FRAME_URL);

    const two = await waitUntil(() => {
      const first = parsePart(c.buf(), boundary);
      if (!first) return null;
      const rest = c.buf().subarray(first.end);
      const second = parsePart(rest, boundary);
      // Nothing may sit between the previous part's CRLF and the next boundary.
      return second && second.prefix.length === 0 ? [first, second] : null;
    });
    expect(Buffer.compare(two[1].payload, FRAME_BYTES)).toBe(0);
  });

  it('ignores junk frames without disturbing the stream', async () => {
    const { port } = await startServer({ port: 0 });
    const c = await stream(port);
    const boundary = boundaryOf(c.res);

    expect(pushFrame('not a data url')).toBe(false);
    expect(pushFrame('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);   // non-image
    expect(pushFrame('data:image/png;base64,')).toBe(false);               // empty
    expect(pushFrame(null)).toBe(false);
    expect(pushFrame(FRAME_URL)).toBe(true);

    const part = await waitUntil(() => parsePart(c.buf(), boundary));
    expect(part.prefix.length).toBe(0);
    expect(Buffer.compare(part.payload, FRAME_BYTES)).toBe(0);
  });
});

describe('clients', () => {
  it('fans one frame out to two concurrent clients', async () => {
    const { port } = await startServer({ port: 0 });
    const a = await stream(port);
    const b = await stream(port);
    await waitUntil(() => getStatus().clients === 2);

    pushFrame(FRAME_URL);

    const pa = await waitUntil(() => parsePart(a.buf(), boundaryOf(a.res)));
    const pb = await waitUntil(() => parsePart(b.buf(), boundaryOf(b.res)));
    expect(Buffer.compare(pa.payload, FRAME_BYTES)).toBe(0);
    expect(Buffer.compare(pb.payload, FRAME_BYTES)).toBe(0);
    // Same server, so both see the same boundary.
    expect(boundaryOf(a.res)).toBe(boundaryOf(b.res));
  });

  it('primes a client that connects between frames with the last frame', async () => {
    const { port } = await startServer({ port: 0 });
    const a = await stream(port);
    await waitUntil(() => getStatus().clients === 1);
    pushFrame(FRAME_URL);
    await waitUntil(() => parsePart(a.buf(), boundaryOf(a.res)));

    const b = await stream(port);
    const part = await waitUntil(() => parsePart(b.buf(), boundaryOf(b.res)));
    expect(Buffer.compare(part.payload, FRAME_BYTES)).toBe(0);
  });

  it('survives a client disconnecting mid-stream', async () => {
    const { port } = await startServer({ port: 0 });
    const a = await stream(port);
    const b = await stream(port);
    await waitUntil(() => getStatus().clients === 2);

    pushFrame(FRAME_URL);
    await waitUntil(() => parsePart(b.buf(), boundaryOf(b.res)));

    a.close();
    await waitUntil(() => getStatus().clients === 1);

    // Pushing after the disconnect must neither throw nor starve the survivor.
    for (let i = 0; i < 20; i++) expect(() => pushFrame(FRAME_URL)).not.toThrow();

    const boundary = boundaryOf(b.res);
    await waitUntil(() => {
      let buf = b.buf(), n = 0, p;
      while ((p = parsePart(buf, boundary))) { n++; buf = buf.subarray(p.end); }
      return n >= 3;
    });
    expect(getStatus().clients).toBe(1);
    expect(b.errors).toEqual([]);
  });

  it('ends live responses when the server stops', async () => {
    const { port } = await startServer({ port: 0 });
    const c = await stream(port);
    let ended = false;
    c.res.on('end', () => { ended = true; });
    await waitUntil(() => getStatus().clients === 1);

    await stopServer();
    await waitUntil(() => ended);
    expect(c.errors).toEqual([]);
  });

  it('drops frames instead of buffering for a client that never reads', async () => {
    const { port } = await startServer({ port: 0 });
    const c = await stream(port);
    await waitUntil(() => getStatus().clients === 1);

    c.res.pause();                       // stop draining: the socket backs up
    const big = 'data:image/png;base64,' + Buffer.alloc(512 * 1024, 0x41).toString('base64');
    for (let i = 0; i < 200; i++) pushFrame(big);   // 100 MB if it were all buffered

    // Every frame is accounted for, and once the backlog passes the cap
    // essentially all of them are dropped rather than queued.
    const st = getStatus();
    expect(st.sent + st.dropped).toBe(200);
    expect(st.dropped).toBeGreaterThan(150);
    c.res.resume();
  });
});

describe('ipc surface', () => {
  it('registers the stream channels and drives start / frame / stop', async () => {
    const ipc = makeIpcMain();
    const api = installStreamServer(ipc);
    expect(ipc.channels()).toEqual(
      expect.arrayContaining(['stream:start', 'stream:stop', 'stream:status', 'stream:frame']));
    expect(typeof api.push).toBe('function');

    const started = await ipc.invoke('stream:start', { port: 0 });
    expect(started).toMatchObject({ ok: true });
    expect(started.url).toContain('127.0.0.1');

    const c = await stream(started.port);
    await waitUntil(() => getStatus().clients === 1);

    ipc.emit('stream:frame', FRAME_URL);
    const part = await waitUntil(() => parsePart(c.buf(), boundaryOf(c.res)));
    expect(Buffer.compare(part.payload, FRAME_BYTES)).toBe(0);

    expect(await ipc.invoke('stream:status')).toMatchObject({ running: true, clients: 1 });
    expect(await ipc.invoke('stream:stop')).toMatchObject({ ok: true, stopped: true });
    await expect(get(started.port, '/')).rejects.toMatchObject({ code: 'ECONNREFUSED' });
  });

  it('re-installing does not throw and a second start is idempotent', async () => {
    const ipc = makeIpcMain();
    installStreamServer(ipc);
    installStreamServer(ipc);

    const first = await ipc.invoke('stream:start', { port: 0 });
    const second = await ipc.invoke('stream:start', { port: 0 });
    expect(second.port).toBe(first.port);
    expect(second.already).toBe(true);
  });
});
