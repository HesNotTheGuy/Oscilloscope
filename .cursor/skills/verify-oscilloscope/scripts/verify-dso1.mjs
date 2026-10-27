#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync, openSync, readFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(SCRIPT_DIR, '..');
const EVIDENCE_ROOT = path.join(SKILL_DIR, 'evidence');
const REPO_ROOT = findRepoRoot(path.resolve(SCRIPT_DIR, '..', '..', '..', '..'));
const DEFAULT_RUN_DIR = process.env.DSO1_VERIFY_DIR || path.join(os.tmpdir(), 'dso1-verify');
const SESSION_PATH = path.join(DEFAULT_RUN_DIR, 'session.json');

function findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 8; i += 1) {
    const pkgPath = path.join(dir, 'package.json');
    if (existsSync(pkgPath)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('could not find package.json above this script');
}

function parseArgs(argv) {
  const cmd = argv[0] || '';
  const flags = {};
  for (let i = 1; i < argv.length; i += 1) {
    const tok = argv[i];
    if (!tok.startsWith('--')) continue;
    const key = tok.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i += 1;
    } else {
      flags[key] = true;
    }
  }
  return { cmd, flags };
}

function die(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function signalProcess(pid, signal) {
  try {
    process.kill(-pid, signal);
    return;
  } catch (err) {
    if (err && err.code !== 'ESRCH' && err.code !== 'ENOSYS' && err.code !== 'EINVAL') {
      throw err;
    }
  }
  try {
    process.kill(pid, signal);
  } catch (err) {
    if (err && err.code === 'ESRCH') return;
    throw err;
  }
}

function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function cmdlineOf(pid) {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ');
  } catch {
    return '';
  }
}

async function readSession() {
  try {
    return JSON.parse(await readFile(SESSION_PATH, 'utf8'));
  } catch {
    return null;
  }
}

async function writeSession(session) {
  await mkdir(DEFAULT_RUN_DIR, { recursive: true });
  await writeFile(SESSION_PATH, JSON.stringify(session, null, 2));
}

function electronBin() {
  const name = process.platform === 'win32' ? 'electron.cmd' : 'electron';
  return path.join(REPO_ROOT, 'node_modules', '.bin', name);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = addr && typeof addr === 'object' ? addr.port : 0;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
    server.on('error', reject);
  });
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 2000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`GET ${url} -> ${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`GET ${url} timed out`));
    });
  });
}

async function listTargets(cdpPort) {
  const urls = [
    `http://127.0.0.1:${cdpPort}/json/list`,
    `http://127.0.0.1:${cdpPort}/json`,
  ];
  let lastErr;
  for (const url of urls) {
    try {
      const data = await httpGetJson(url);
      return Array.isArray(data) ? data : [];
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('CDP /json is not answering');
}

function pickAppTarget(targets) {
  const pages = targets.filter((t) => t && t.webSocketDebuggerUrl);
  const byIndex = pages.find((t) => typeof t.url === 'string' && /index\.html(?:[?#].*)?$/.test(t.url));
  if (byIndex) return byIndex;
  const byTitle = pages.find((t) => typeof t.title === 'string' && t.title.includes('DSO-1'));
  if (byTitle) return byTitle;
  return pages[0] || null;
}

function cdpCall(wsUrl, method, params = {}, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const id = 1;
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      ws.close();
      reject(new Error(`CDP ${method} timed out`));
    }, timeoutMs);

    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ws.close();
      if (err) reject(err);
      else resolve(value);
    };

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ id, method, params }));
    });
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      if (msg.id !== id) return;
      if (msg.error) {
        finish(new Error(`CDP ${method}: ${msg.error.message || JSON.stringify(msg.error)}`));
        return;
      }
      finish(null, msg.result);
    });
    ws.addEventListener('error', (ev) => {
      const text = (ev && ev.message) || (ev && ev.error && ev.error.message) || 'WebSocket error';
      finish(new Error(text));
    });
  });
}

async function evaluate(wsUrl, expression) {
  const result = await cdpCall(wsUrl, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result && result.exceptionDetails) {
    const desc = result.exceptionDetails.text
      || result.exceptionDetails.exception?.description
      || 'evaluate threw';
    throw new Error(desc);
  }
  return result && result.result ? result.result.value : undefined;
}

async function appWsUrl(session) {
  const targets = await listTargets(session.cdpPort);
  const target = pickAppTarget(targets);
  if (!target || !target.webSocketDebuggerUrl) {
    throw new Error('no Electron page target for index.html yet');
  }
  return { wsUrl: target.webSocketDebuggerUrl, target };
}

const SNAPSHOT_JS = `(() => {
  const cls = (id) => !!document.getElementById(id)?.classList.contains('active');
  const text = (id) => document.getElementById(id)?.textContent ?? null;
  const val = (id) => document.getElementById(id)?.value ?? null;
  const el = (id) => document.getElementById(id);
  const scopeTab = document.querySelector('button.tab-bar-btn[data-tab="scope"]');
  return {
    title: document.title,
    brand: document.querySelector('.brand')?.textContent ?? null,
    firstRun: !!document.querySelector('.first-run-hint'),
    firstRunTitle: document.querySelector('.first-run-hint .frh-title')?.textContent ?? null,
    tabbed: document.querySelector('.app')?.classList.contains('tabbed-mode') ?? false,
    scopeTabActive: !!(scopeTab && scopeTab.classList.contains('active')),
    modes: {
      yt: cls('btn-yt'),
      xy: cls('btn-xy'),
      vs: cls('btn-vs'),
      fs: cls('btn-fs'),
      sg: cls('btn-sg'),
    },
    runStopText: text('btn-run-stop'),
    runStopRunning: !!el('btn-run-stop')?.classList.contains('running'),
    measureActive: cls('btn-measure'),
    idleSigActive: cls('btn-idle-sig'),
    stSrc: text('st-src'),
    stCh1: text('st-ch1'),
    themeSelect: val('theme-select'),
    bodyTheme: document.body.dataset.theme ?? null,
    rigSelect: val('rig-select'),
    patchOpen: document.body.classList.contains('patch-open'),
    patchBtnActive: cls('btn-patch'),
    synthPanelHidden: el('synth-panel') ? el('synth-panel').hidden : null,
    synthBtnActive: !!el('btn-synth')?.classList.contains('synth-active'),
    genStartDisabled: !!el('btn-gen-start')?.disabled,
    genStopDisabled: !!el('btn-gen-stop')?.disabled,
    dsoReady: typeof window._dso !== 'undefined' && window._dso.scope != null,
    scopeMode: window._dso?.scope?.mode ?? null,
  };
})()`;

function clickIdJs(id) {
  return `(() => {
    const el = document.getElementById(${JSON.stringify(id)});
    if (!el) return { ok: false, error: ${JSON.stringify('missing #' + id)} };
    el.click();
    return {
      ok: true,
      id: ${JSON.stringify(id)},
      className: el.className,
      text: (el.textContent || '').trim().slice(0, 80),
      disabled: !!el.disabled,
      hidden: !!el.hidden,
    };
  })()`;
}

function clickSelJs(selector) {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return { ok: false, error: ${JSON.stringify('missing ' + selector)} };
    el.click();
    return {
      ok: true,
      selector: ${JSON.stringify(selector)},
      id: el.id || null,
      className: el.className,
      text: (el.textContent || '').trim().slice(0, 80),
    };
  })()`;
}

async function requireSession() {
  const session = await readSession();
  if (!session) die(`no session at ${SESSION_PATH}. Run launch first.`);
  return session;
}

async function cmdLaunch() {
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    die('DISPLAY is unset. Wrap this command with xvfb-run -a, or export DISPLAY to a live X session. Kill only the xvfb pid you started.');
  }

  const existing = await readSession();
  if (existing && pidAlive(existing.pid)) {
    die(`a verification instance is already running pid=${existing.pid} cdp=${existing.cdpPort}. Run cleanup first.`);
  }

  const bin = electronBin();
  if (!existsSync(bin)) {
    die(`missing ${bin}. From the repo root run: npm install`);
  }

  await mkdir(DEFAULT_RUN_DIR, { recursive: true });
  const userDataDir = path.join(DEFAULT_RUN_DIR, 'user-data');
  const logPath = path.join(DEFAULT_RUN_DIR, 'electron.log');
  await rm(userDataDir, { recursive: true, force: true });
  await mkdir(userDataDir, { recursive: true });

  const cdpPort = await freePort();
  const logFd = openSync(logPath, 'w');
  const args = [
    '.',
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${cdpPort}`,
    '--remote-allow-origins=*',
    '--autoplay-policy=no-user-gesture-required',
  ];
  if (process.platform === 'linux') {
    args.push('--no-sandbox', '--disable-dev-shm-usage');
  }

  const child = spawn(bin, args, {
    cwd: REPO_ROOT,
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });
  child.unref();

  const session = {
    pid: child.pid,
    pgid: child.pid,
    cdpPort,
    userDataDir,
    logPath,
    repoRoot: REPO_ROOT,
    startedAt: new Date().toISOString(),
    electronBin: bin,
    args,
  };
  await writeSession(session);

  const deadline = Date.now() + 30000;
  let lastErr = 'waiting for CDP';
  while (Date.now() < deadline) {
    if (!pidAlive(child.pid)) {
      die(`Electron exited before ready. Log: ${logPath}`);
    }
    try {
      const { wsUrl, target } = await appWsUrl(session);
      const ready = await evaluate(wsUrl, 'typeof window._dso !== "undefined" && window._dso.scope != null');
      if (ready) {
        const title = await evaluate(wsUrl, 'document.title');
        printJson({ ok: true, ...session, title, url: target.url, ready: true });
        return;
      }
      lastErr = 'index.html loaded but window._dso.scope is still null';
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    await sleep(300);
  }
  die(`app did not become ready within 30s (${lastErr}). Log: ${logPath}`);
}

async function cmdDoctor() {
  const session = await requireSession();
  const reasons = [];
  const alive = pidAlive(session.pid);
  if (!alive) reasons.push(`pid ${session.pid} is not running`);

  const cmdline = cmdlineOf(session.pid);
  const ownsUserData = cmdline.includes(session.userDataDir);
  if (alive && process.platform === 'linux' && !ownsUserData) {
    reasons.push('pid cmdline does not contain this run\'s --user-data-dir');
  }

  let cdp = null;
  let snap = null;
  let target = null;
  try {
    const listed = await listTargets(session.cdpPort);
    target = pickAppTarget(listed);
    cdp = { targetCount: listed.length, url: target?.url || null, title: target?.title || null };
    if (!target) reasons.push('CDP has no index.html / DSO-1 page');
    else {
      const { wsUrl } = await appWsUrl(session);
      snap = await evaluate(wsUrl, SNAPSHOT_JS);
      if (!snap || snap.title !== 'DSO-1 Oscilloscope') {
        reasons.push(`document.title is ${JSON.stringify(snap && snap.title)}`);
      }
      if (!snap || !snap.dsoReady) reasons.push('window._dso.scope is missing');
      if (!snap || snap.brand == null || !String(snap.brand).includes('DSO')) {
        reasons.push('topbar .brand is missing');
      }
    }
  } catch (err) {
    reasons.push(err instanceof Error ? err.message : String(err));
  }

  const report = {
    ok: reasons.length === 0,
    pid: session.pid,
    pidAlive: alive,
    ownsUserData,
    userDataDir: session.userDataDir,
    cdpPort: session.cdpPort,
    cdp,
    snapshot: snap,
    firstRun: !!(snap && snap.firstRun),
    reasons,
    sessionPath: SESSION_PATH,
  };
  printJson(report);
  if (!report.ok) process.exit(1);
}

async function withApp(fn) {
  const session = await requireSession();
  if (!pidAlive(session.pid)) die(`pid ${session.pid} is dead. Run launch again.`);
  const { wsUrl, target } = await appWsUrl(session);
  return fn(wsUrl, session, target);
}

async function cmdEval(flags) {
  const expr = flags.expr || flags.js;
  if (!expr) die('eval requires --expr <javascript>');
  await withApp(async (wsUrl) => {
    const value = await evaluate(wsUrl, expr);
    printJson({ ok: true, value });
  });
}

async function cmdClick(flags) {
  if (!flags.id && !flags.selector) die('click requires --id or --selector');
  await withApp(async (wsUrl) => {
    const value = flags.id
      ? await evaluate(wsUrl, clickIdJs(flags.id))
      : await evaluate(wsUrl, clickSelJs(flags.selector));
    printJson(value);
    if (!value || !value.ok) process.exit(1);
  });
}

async function cmdSelect(flags) {
  if (!flags.id || flags.value == null) die('select requires --id and --value');
  await withApp(async (wsUrl) => {
    const value = await evaluate(wsUrl, `(() => {
      const el = document.getElementById(${JSON.stringify(flags.id)});
      if (!el) return { ok: false, error: ${JSON.stringify('missing #' + flags.id)} };
      el.value = ${JSON.stringify(flags.value)};
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, id: ${JSON.stringify(flags.id)}, value: el.value };
    })()`);
    printJson(value);
    if (!value || !value.ok) process.exit(1);
  });
}

async function cmdPress(flags) {
  const key = flags.key;
  if (!key) die('press requires --key');
  await withApp(async (wsUrl) => {
    const value = await evaluate(wsUrl, `(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: ${JSON.stringify(key)},
        bubbles: true,
        cancelable: true,
      }));
      return { ok: true, key: ${JSON.stringify(key)} };
    })()`);
    printJson(value);
  });
}

async function cmdSnapshot(flags) {
  await withApp(async (wsUrl) => {
    const value = await evaluate(wsUrl, SNAPSHOT_JS);
    if (flags.out) {
      const out = path.resolve(flags.out);
      await mkdir(path.dirname(out), { recursive: true });
      await writeFile(out, JSON.stringify(value, null, 2));
      printJson({ ok: true, path: out, snapshot: value });
      return;
    }
    printJson(value);
  });
}

async function cmdScreenshot(flags) {
  const out = flags.out;
  if (!out) die('screenshot requires --out <png path>');
  await withApp(async (wsUrl) => {
    await cdpCall(wsUrl, 'Page.enable', {});
    const result = await cdpCall(wsUrl, 'Page.captureScreenshot', { format: 'png' }, 20000);
    if (!result || !result.data) die('Page.captureScreenshot returned no data');
    const dest = path.resolve(out);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, Buffer.from(result.data, 'base64'));
    printJson({ ok: true, path: dest, bytes: Buffer.from(result.data, 'base64').length });
  });
}

async function cmdDismissFirstRun() {
  await withApp(async (wsUrl) => {
    const value = await evaluate(wsUrl, `(() => {
      const card = document.querySelector('.first-run-hint');
      if (!card) return { ok: true, already: true };
      const btn = [...card.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Got it');
      if (!btn) return { ok: false, error: 'Got it button missing' };
      btn.click();
      return { ok: true, dismissed: true };
    })()`);
    printJson(value);
    if (!value || !value.ok) process.exit(1);
    if (value.dismissed) await sleep(700);
  });
}

async function cmdDriveScopeModes() {
  const outDir = path.join(EVIDENCE_ROOT, 'scope-modes');
  await mkdir(outDir, { recursive: true });

  await cmdDismissFirstRun();
  await withApp(async (wsUrl) => {
    const tab = await evaluate(wsUrl, clickSelJs('button.tab-bar-btn[data-tab="scope"]'));
    if (!tab || !tab.ok) die('could not click the Scope tab (button.tab-bar-btn[data-tab="scope"])');
    await sleep(400);

    const before = await evaluate(wsUrl, SNAPSHOT_JS);
    await writeFile(path.join(outDir, 'before.json'), JSON.stringify(before, null, 2));

    const clicked = await evaluate(wsUrl, clickIdJs('btn-xy'));
    if (!clicked || !clicked.ok) die('click #btn-xy failed');
    await sleep(400);

    const after = await evaluate(wsUrl, SNAPSHOT_JS);
    await writeFile(path.join(outDir, 'after.json'), JSON.stringify(after, null, 2));

    await cdpCall(wsUrl, 'Page.enable', {});
    const shot = await cdpCall(wsUrl, 'Page.captureScreenshot', { format: 'png' }, 20000);
    const pngPath = path.join(outDir, 'after-xy.png');
    if (shot && shot.data) {
      await writeFile(pngPath, Buffer.from(shot.data, 'base64'));
    }

    const passed = !!(after && after.modes && after.modes.xy && !after.modes.yt && after.scopeMode === 'XY');
    const report = {
      feature: 'scope-modes',
      action: 'click #btn-xy after opening the Scope tab',
      passed,
      before: { modes: before.modes, scopeMode: before.scopeMode, firstRun: before.firstRun },
      after: { modes: after.modes, scopeMode: after.scopeMode, firstRun: after.firstRun },
      click: clicked,
      evidence: {
        before: path.join(outDir, 'before.json'),
        after: path.join(outDir, 'after.json'),
        screenshot: pngPath,
      },
    };
    await writeFile(path.join(outDir, 'proof.json'), JSON.stringify(report, null, 2));
    printJson(report);
    if (!passed) process.exit(1);
  });
}

async function cmdCleanup() {
  const session = await readSession();
  if (!session) {
    printJson({ ok: true, stopped: false, reason: 'no session file' });
    return;
  }
  const pid = session.pgid || session.pid;
  if (pidAlive(session.pid)) {
    signalProcess(pid, 'SIGTERM');
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && pidAlive(session.pid)) await sleep(100);
    if (pidAlive(session.pid)) signalProcess(pid, 'SIGKILL');
  }
  await rm(DEFAULT_RUN_DIR, { recursive: true, force: true });
  printJson({
    ok: true,
    stopped: true,
    pid: session.pid,
    pidStillAlive: pidAlive(session.pid),
    evidenceRoot: EVIDENCE_ROOT,
    note: 'run dir removed; evidence/ was not touched',
  });
}

const USAGE = `verify-dso1.mjs. DSO-1 Oscilloscope verification driver (CDP)

Usage:
  node .cursor/skills/verify-oscilloscope/scripts/verify-dso1.mjs <command>

Commands:
  launch
  doctor
  dismiss-first-run
  click --id <id>
  click --selector <css>
  select --id <id> --value <value>
  press --key <key>
  eval --expr <javascript>
  snapshot [--out file.json]
  screenshot --out file.png
  drive-scope-modes
  cleanup

Session file: ${SESSION_PATH}
Evidence root: ${EVIDENCE_ROOT}
`;

const { cmd, flags } = parseArgs(process.argv.slice(2));

const commands = {
  launch: cmdLaunch,
  doctor: cmdDoctor,
  eval: () => cmdEval(flags),
  click: () => cmdClick(flags),
  select: () => cmdSelect(flags),
  press: () => cmdPress(flags),
  snapshot: () => cmdSnapshot(flags),
  screenshot: () => cmdScreenshot(flags),
  'dismiss-first-run': cmdDismissFirstRun,
  'drive-scope-modes': cmdDriveScopeModes,
  cleanup: cmdCleanup,
};

if (!cmd || cmd === 'help' || cmd === '-h' || cmd === '--help') {
  console.log(USAGE);
  process.exit(cmd ? 0 : 1);
}

const fn = commands[cmd];
if (!fn) die(`unknown command ${cmd}\n${USAGE}`);

fn().catch((err) => {
  die(err instanceof Error ? err.stack || err.message : String(err));
});
