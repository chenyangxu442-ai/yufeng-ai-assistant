'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-file-faults-'));
process.env.AI_SETUP_WORK = path.join(work, 'state');
const files = require('../engine/files');
const store = require('../engine/store');
const target = path.join(work, 'original.txt');
try {
  fs.writeFileSync(target, 'ORIGINAL');
  let plan = files.preview(work, [{ path: 'original.txt', content: 'NEW' }]);
  const originalWrite = fs.writeFileSync;
  fs.writeFileSync = function (file, data, ...args) {
    if (path.resolve(file) === target) { originalWrite(file, 'PARTIAL'); throw new Error('injected partial write'); }
    return originalWrite(file, data, ...args);
  };
  try { assert.throws(() => files.apply(plan.token, { root: work })); }
  finally { fs.writeFileSync = originalWrite; }
  assert.strictEqual(fs.readFileSync(target, 'utf8'), 'ORIGINAL', 'partial write must restore affected file');

  plan = files.preview(work, [{ path: 'original.txt', content: 'NEW' }]);
  const originalStoreWrite = store.write;
  store.write = function (name, value) {
    if (name === 'file-ledger' && value.some(x => x.status === 'applied')) throw new Error('injected ledger commit failure');
    return originalStoreWrite(name, value);
  };
  try { assert.throws(() => files.apply(plan.token, { root: work })); }
  finally { store.write = originalStoreWrite; }
  assert.strictEqual(fs.readFileSync(target, 'utf8'), 'ORIGINAL', 'ledger commit failure must restore original');
  console.log('PASS partial-write and ledger-commit failure restore original files');
} finally { fs.rmSync(work, { recursive: true, force: true }); }
