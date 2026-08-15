#!/usr/bin/env node
// Build script for the forked plugin. Produces lib/host.js (plain ESM via
// tsc) and lib/client.js (browser bundle via tsdown) plus a host.d.ts.
// Node-only; resolves tooling from the local node_modules/.bin.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { rmSync } from 'node:fs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const bin = (name) => join(root, 'node_modules', '.bin', name)

function run(cmd, args, opts) {
  const res = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', ...opts })
  if (res.error) { console.error('spawn failed:', res.error.message); process.exit(1) }
  if (res.status !== 0) process.exit(res.status ?? 1)
}

// 1. Typecheck both halves.
console.log('\n[build] typecheck host…')
run(process.execPath, [bin('tsc'), '-p', 'tsconfig.host.json', '--noEmit'])
console.log('\n[build] typecheck client…')
run(process.execPath, [bin('tsc'), '-p', 'tsconfig.client.json', '--noEmit'])

// 2. Clean the previous host emit (client.js is produced by tsdown into lib/).
rmSync(join(root, 'lib'), { recursive: true, force: true })

// 3. Compile host (also emits host.js.map + host.d.ts).
console.log('\n[build] compile host → lib/…')
run(process.execPath, [bin('tsc'), '-p', 'tsconfig.host.json'])
// We do not need a .d.ts for the host entry; drop it to keep the package lean.
rmSync(join(root, 'lib', 'host.d.ts'), { force: true })
rmSync(join(root, 'lib', 'host.d.ts.map'), { force: true })

// 4. Bundle client → lib/client.js.
console.log('\n[build] bundle client → lib/client.js…')
run(process.execPath, [bin('tsdown')])

console.log('\n[build] done: lib/host.js + lib/client.js')
