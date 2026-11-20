import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, '../src/preload.cjs'), 'utf8');

// Regression: with `sandbox: true` (the default on packaged Windows/macOS builds) a preload may only
// require('electron') plus a few tiny modules. A `require('node:os')` made the whole preload throw,
// window.castdesk never appeared, and the UI behaved like a plain web page (no PIN, no QR, no layout).
test('preload only requires modules that are available in a sandboxed renderer', () => {
  const required = [...src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(required)], ['electron']);
});

test('preload exposes the bridge the UI depends on', () => {
  for (const name of ['getState', 'onState', 'rotatePin', 'refreshScan', 'installAdb', 'projectMode', 'installDisplayDriver', 'revoke', 'applyLayout', 'getPermissions']) {
    assert.match(src, new RegExp(`\\b${name}\\b`), `missing ${name}`);
  }
});

test('main window keeps sandbox on unless --no-sandbox is passed explicitly', () => {
  const main = fs.readFileSync(path.join(here, '../src/main.js'), 'utf8');
  assert.match(main, /sandbox:\s*!noSandbox\s*\?\s*true\s*:\s*false/);
});

test('preload runs under a sandbox-style require and exposes window.castdesk', async () => {
  const vm = await import('node:vm');
  let exposed = null;
  const allowed = {
    electron: {
      contextBridge: { exposeInMainWorld: (name, api) => { exposed = { name, api }; } },
      ipcRenderer: {
        sendSync: () => 'TEST-PC',
        invoke: async () => true,
        on() {},
        removeListener() {},
      },
    },
  };
  // Mirrors a sandboxed preload: only 'electron' (and a few tiny built-ins) can be required.
  const sandboxRequire = (id) => {
    if (id in allowed) return allowed[id];
    throw new Error(`module not found: ${id}`);
  };
  vm.runInNewContext(src, { require: sandboxRequire, process: { platform: 'win32' }, console });
  assert.equal(exposed?.name, 'castdesk');
  assert.equal(exposed.api.platform, 'win32');
  assert.equal(exposed.api.hostname, 'TEST-PC');
  for (const fn of ['getState', 'rotatePin', 'refreshScan', 'openExternal']) assert.equal(typeof exposed.api[fn], 'function');
});
