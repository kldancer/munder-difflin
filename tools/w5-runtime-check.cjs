#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function checkRuntime(root = path.resolve(__dirname, '..')) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const failures = [];
  if (process.versions.node.split('.')[0] !== '22') failures.push(`maintenance Node must be 22, got ${process.version}`);
  if (pkg.engines?.node !== '>=22 <23') failures.push(`unexpected Node engine: ${pkg.engines?.node ?? 'missing'}`);
  if (lock.lockfileVersion !== 3) failures.push(`lockfileVersion must be 3, got ${lock.lockfileVersion}`);
  if (lock.packages?.['']?.version !== pkg.version) failures.push('package and lock root versions differ');

  let electronCheck = null;
  if (failures.length === 0) {
    const electron = require('electron');
    const program = [
      "const Database=require('better-sqlite3')",
      "const db=new Database(':memory:')",
      "const sqlite=db.prepare('select 1 as ok').get().ok",
      'db.close()',
      "const pty=typeof require('node-pty').spawn",
      "process.stdout.write(JSON.stringify({node:process.version,electron:process.versions.electron,abi:process.versions.modules,sqlite,pty}))"
    ].join(';');
    const child = spawnSync(electron, ['-e', program], {
      cwd: root,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      encoding: 'utf8',
      timeout: 30_000
    });
    if (child.status !== 0) failures.push(`Electron native check failed: ${(child.stderr || child.stdout).trim()}`);
    else {
      try { electronCheck = JSON.parse(child.stdout); }
      catch { failures.push('Electron native check returned invalid JSON'); }
    }
  }
  return {
    ok: failures.length === 0,
    node: process.version,
    engine: pkg.engines?.node,
    lockfileVersion: lock.lockfileVersion,
    packageVersion: pkg.version,
    electron: electronCheck,
    failures
  };
}

if (require.main === module) {
  const result = checkRuntime();
  process.stdout.write(JSON.stringify(result) + '\n');
  if (!result.ok) process.exitCode = 1;
}

module.exports = { checkRuntime };
