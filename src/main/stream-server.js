'use strict';

import http from 'http';
import crypto from 'crypto';

// ─────────────────────────────────────────────────────────────
//  StreamServer — serves captured canvas frames as MJPEG
//  (multipart/x-mixed-replace) over loopback, so OBS / Resolume
//  can pull the visuals as a Browser or Media source with no
//  native capture plugin, no virtual camera, no extra dependency.
//
//  Parallel sink to the 'display-frame' path in main.js: the
//  renderer already hands the main process one data URL per
//  frame, this fans it out to HTTP clients instead of forwarding
//  it to the display window.
// ─────────────────────────────────────────────────────────────

const HOST = '127.0.0.1';               // loopback only — never 0.0.0.0
const DEFAULT_PORT = 8420;
const STREAM_PATH = '/stream.mjpeg';

// A renderer bug (or a 4K PNG) must not be able to balloon main-process
// memory one frame at a time.
const MAX_FRAME_BYTES = 32 * 1024 * 1024;

// ~1 MiB still unflushed already means this client is several frames behind.
// Past that we drop for it — see writeTo().
const MAX_QUEUED_BYTES = 1024 * 1024;

const CRLF = Buffer.from('\r\n', 'latin1');

// Minimal viewer: OBS can point a Browser source straight at '/', and a human
// can open the same URL to confirm the stream is alive.
const PAGE = Buffer.from(
  '<!doctype html>\n' +
  '<meta charset="utf-8">\n' +
  '<title>DSO-1 stream</title>\n' +
  '<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}' +
  'img{display:block;width:100%;height:100%;object-fit:contain}</style>\n' +
  '<img src="' + STREAM_PATH + '" alt="DSO-1 stream">\n', 'utf8');

// One server per app. null while stopped.
let state = null;

// The in-flight start, if any. A start is not atomic — it awaits listen() — and
// `state` is only assigned once that resolves, so `state` alone is not enough of
// a guard: two 'stream:start' calls in the same tick (a double-clicked button)
// would each build their own http.Server. The loser of the port race silently
// falls back to an ephemeral port, `state` keeps only whichever finished last,
// and the other is left listening with nothing holding a reference that could
// ever close it. Latecomers join the in-flight start instead of racing it.
let pending = null;

// ── data URL → bytes ─────────────────────────────────────────

// Accepts 'data:image/webp;base64,...' (what popout-controller.js produces)
// as well as the jpeg/png variants. Returns null for anything that is not a
// plausible image frame — the hot path must never throw.
function parseDataURL(dataURL) {
  if (typeof dataURL !== 'string' || !dataURL.startsWith('data:')) return null;
  const comma = dataURL.indexOf(',');
  if (comma < 0) return null;

  const meta = dataURL.slice(5, comma);
  const base64 = /;base64$/i.test(meta);
  const mime = (base64 ? meta.slice(0, -7) : meta).split(';')[0].trim().toLowerCase();
  // Reject anything but a clean image type: the mime goes straight into a
  // response header, so a stray CR/LF here would be header injection.
  if (!/^image\/[a-z0-9.+-]+$/.test(mime)) return null;

  const payload = dataURL.slice(comma + 1);
  let body;
  try {
    body = base64 ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload), 'latin1');
  } catch (_) {
    return null;
  }
  if (!body.length || body.length > MAX_FRAME_BYTES) return null;
  return { mime, body };
}

// One part = boundary line, part headers, blank line, bytes, trailing CRLF.
// That trailing CRLF belongs to the *next* boundary delimiter (RFC 2046),
// which is why it is emitted after the payload rather than before the next
// boundary. Built as a single buffer so one res.write() emits a whole part: a
// part split across a drop decision leaves the client resyncing on garbage,
// which is exactly what a torn or frozen image in OBS looks like.
function buildPart(boundary, mime, body) {
  const head = Buffer.from(
    '--' + boundary + '\r\n' +
    'Content-Type: ' + mime + '\r\n' +
    'Content-Length: ' + body.length + '\r\n' +
    '\r\n', 'latin1');
  return Buffer.concat([head, body, CRLF]);
}

// ── client fan-out ───────────────────────────────────────────

function writeTo(s, client, part) {
  const res = client.res;
  if (res.writableEnded || res.destroyed) return;
  // Frames are perishable. Queuing them for a slow consumer buys nothing — by
  // the time the backlog drains those frames are stale anyway — and the
  // backlog grows without bound as long as we render faster than it reads.
  // Dropping keeps memory flat and keeps the client on the newest frame.
  // (res.write()'s return value alone is the wrong gate: any frame bigger than
  // the 16 KiB highWaterMark returns false, so a perfectly healthy client
  // would lose most of its frames. writableLength measures the real backlog
  // and settles back to ~0 between frames when the socket keeps up.)
  if (res.writableLength > MAX_QUEUED_BYTES) {
    client.dropped++;
    s.dropped++;
    return;
  }
  try {
    res.write(part);
    client.sent++;
    s.sent++;
  } catch (_) {
    // Socket died between the checks above and the write — the 'close'
    // handler unregisters it.
  }
}

function addClient(s, req, res) {
  const client = { res, sent: 0, dropped: 0 };
  s.clients.add(client);

  const drop = () => { s.clients.delete(client); };
  res.on('close', drop);
  res.on('error', drop);   // a client vanishing mid-write is normal, not fatal
  req.on('error', drop);

  return client;
}

// ── HTTP ─────────────────────────────────────────────────────

// We bind loopback, but a hostile page could still point a hostname it
// controls at 127.0.0.1 (DNS rebinding) and pull the stream. Only loopback
// Host headers are served.
function isLoopbackHost(hostHeader) {
  if (typeof hostHeader !== 'string' || !hostHeader) return false;
  const name = hostHeader.toLowerCase().replace(/:\d+$/, '');
  return name === '127.0.0.1' || name === 'localhost' || name === '[::1]';
}

function sendSimple(res, code, type, body) {
  res.writeHead(code, {
    'Content-Type': type,
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function handleStream(s, req, res) {
  // Raw, connection-delimited parts: chunked transfer-encoding is legal here
  // but every MJPEG consumer in the wild expects the classic un-chunked form.
  res.useChunkedEncodingByDefault = false;
  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=' + s.boundary,
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Connection': 'close',
  });
  // Commit the headers now — a consumer that waits for them before showing
  // anything would otherwise stall until the first frame arrives.
  res.flushHeaders();

  const sock = req.socket;
  if (sock) {
    sock.setNoDelay(true);   // frames are latency-critical, Nagle is not helping
    sock.setTimeout(0);      // a live stream is an idle socket between frames
  }

  const client = addClient(s, req, res);
  // Prime late joiners so the image appears immediately instead of at the next
  // captured frame (or never, if the renderer is paused).
  if (s.lastPart) writeTo(s, client, s.lastPart);
}

function onRequest(s, req, res) {
  if (!isLoopbackHost(req.headers.host)) {
    sendSimple(res, 403, 'text/plain; charset=utf-8', Buffer.from('forbidden'));
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Allow': 'GET, HEAD', 'Content-Length': 0 });
    res.end();
    return;
  }

  const path = (req.url || '/').split('?')[0];

  if (path === STREAM_PATH) {
    if (req.method === 'HEAD') {
      sendSimple(res, 200, 'multipart/x-mixed-replace; boundary=' + s.boundary, Buffer.alloc(0));
      return;
    }
    handleStream(s, req, res);
    return;
  }
  if (path === '/' || path === '/index.html') {
    sendSimple(res, 200, 'text/html; charset=utf-8', PAGE);
    return;
  }
  sendSimple(res, 404, 'text/plain; charset=utf-8', Buffer.from('not found'));
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => { server.removeListener('listening', onListening); reject(err); };
    const onListening = () => { server.removeListener('error', onError); resolve(); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, HOST);
  });
}

function normalizePort(port) {
  return Number.isInteger(port) && port >= 0 && port <= 65535 ? port : DEFAULT_PORT;
}

// ── public API ───────────────────────────────────────────────

/**
 * Start the stream server. Idempotent: if it is already running — or still
 * starting — the existing url/port comes back and opts are ignored
 * (stopServer() first to move it).
 * opts.port is a *preference* — a taken port falls back to an ephemeral one,
 * so always use the port that comes back.
 * Resolves { ok: true, url, port } or { ok: false, error }.
 */
export function startServer(opts = {}) {
  if (state) return Promise.resolve({ ok: true, url: state.url, port: state.port, already: true });
  if (pending) return pending.then(joinStart);
  pending = openServer(opts)
    // Nothing in openServer() is meant to throw, but a rejection escaping here
    // would surface as an unhandled rejection out of the 'stream:start' IPC
    // handler *and* poison `pending` for stopServer(). Always resolve an object.
    .catch((err) => ({ ok: false, error: (err && err.message) ? err.message : String(err) }))
    .finally(() => { pending = null; });
  return pending;
}

// A caller that arrived mid-start gets whatever that start produced.
function joinStart(result) {
  if (state) return { ok: true, url: state.url, port: state.port, already: true };
  return result;
}

async function openServer(opts) {
  const preferred = normalizePort(opts && opts.port);
  const server = http.createServer();
  const s = {
    server,
    // Random per run: a fixed boundary that happened to occur inside frame
    // bytes would desync any parser that scans for it instead of trusting
    // Content-Length.
    boundary: 'dso1' + crypto.randomBytes(12).toString('hex'),
    clients: new Set(),
    lastPart: null,
    port: 0,
    url: '',
    sent: 0,
    dropped: 0,
  };
  server.on('request', (req, res) => onRequest(s, req, res));

  const fail = (err) => {
    try { server.close(); } catch (_) {}
    return { ok: false, error: (err && err.message) ? err.message : String(err) };
  };

  try {
    await listen(server, preferred);
  } catch (err) {
    if (!err || err.code !== 'EADDRINUSE' || preferred === 0) return fail(err);
    try {
      await listen(server, 0);
    } catch (err2) {
      return fail(err2);
    }
  }

  // Late socket errors (an RST from a consumer that went away) must never
  // reach the app's uncaught handler.
  server.on('error', () => {});

  const addr = server.address();
  s.port = addr && typeof addr === 'object' ? addr.port : preferred;
  s.url = 'http://' + HOST + ':' + s.port + '/';
  state = s;
  return { ok: true, url: s.url, port: s.port };
}

/**
 * Close the server and end every live response.
 * Resolves { ok: true, stopped } — stopped is false if nothing was running.
 */
export async function stopServer() {
  // A stop that lands mid-start — will-quit racing a just-issued 'stream:start'
  // — must not report 'nothing was running' and walk away from the socket that
  // start is about to install. Wait for it, then close what it produced.
  if (pending) { try { await pending; } catch (_) {} }

  const s = state;
  if (!s) return { ok: true, stopped: false };
  state = null;

  for (const client of s.clients) {
    try { client.res.end(); } catch (_) {}
  }
  s.clients.clear();
  s.lastPart = null;

  return new Promise((resolve) => {
    // Idle keep-alive sockets from the '/' page would otherwise hold close()
    // open until they time out.
    if (typeof s.server.closeAllConnections === 'function') s.server.closeAllConnections();
    s.server.close(() => resolve({ ok: true, stopped: true, port: s.port }));
  });
}

/**
 * Push one captured frame to every connected client. Hot path — called at
 * frame rate, fire-and-forget, never throws. Also the test hook that stands in
 * for the 'stream:frame' IPC message.
 * Returns true if the frame was handed to at least one client.
 */
export function pushFrame(dataURL) {
  const s = state;
  if (!s || s.clients.size === 0) return false;   // nobody watching: skip the base64 decode entirely

  const frame = parseDataURL(dataURL);
  if (!frame) return false;

  const part = buildPart(s.boundary, frame.mime, frame.body);
  s.lastPart = part;
  for (const client of s.clients) writeTo(s, client, part);
  return true;
}

/** Snapshot for the UI: is it up, where, and is anyone falling behind. */
export function getStatus() {
  const s = state;
  if (!s) return { running: false, url: null, port: null, clients: 0, sent: 0, dropped: 0 };
  return { running: true, url: s.url, port: s.port, clients: s.clients.size, sent: s.sent, dropped: s.dropped };
}

/**
 * Register the IPC surface. Call once from main.js with electron's ipcMain.
 * Returns the direct API so the main process can stop the server on quit
 * without going through IPC.
 */
export function installStreamServer(ipcMain) {
  // Re-installing (dev reload) would throw on a duplicate handler.
  if (typeof ipcMain.removeHandler === 'function') {
    ipcMain.removeHandler('stream:start');
    ipcMain.removeHandler('stream:stop');
    ipcMain.removeHandler('stream:status');
  }
  if (typeof ipcMain.removeAllListeners === 'function') ipcMain.removeAllListeners('stream:frame');

  ipcMain.handle('stream:start', (_event, opts) => startServer(opts || {}));
  ipcMain.handle('stream:stop', () => stopServer());
  ipcMain.handle('stream:status', () => getStatus());
  ipcMain.on('stream:frame', (_event, dataURL) => { pushFrame(dataURL); });

  return { start: startServer, stop: stopServer, push: pushFrame, status: getStatus };
}
