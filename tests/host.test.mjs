// Local harness for lib/host.js: mounts the plugin against a fake webServer and
// exercises the API surface + op pipeline with a fake CLI bin (no real profile
// or network install is touched). Run: node --test tests/host.test.mjs
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { spawn } from 'node:child_process'
const mod = await import('../lib/host.js')

let handler = null
// Fake tool registry: collects register() calls so the market_* tool shapes
// (DSL-compiled parameters, output schema subset) can be asserted offline.
const registeredTools = new Map()
// Fake jobs registry: records start() specs WITHOUT invoking run(), so a
// background install asserts its job start fully offline.
const jobStarts = []
const fakeTools = {
  register(def) { registeredTools.set(def.name, def); return () => registeredTools.delete(def.name) },
}
// Live hooks per started job id: { spec, hooks } — most recent job wins.
const jobHooks = new Map()
const fakeJobs = {
  start(spec) {
    jobStarts.push(spec)
    // Invoke run() like the real registry (preflight passed → hooks registered;
    // a throw means nothing registered). The hooks are recorded so their
    // semantics (cancel scoping, done, readOutput cursor) can be asserted.
    const hooks = spec.run()
    const id = 'market-' + jobStarts.length
    jobHooks.set(id, { spec, hooks })
    return id
  },
}
let toolsAvailable = true
let jobsAvailable = true
const ctx = {
  get(name) {
    if (name === 'webServer') {
      return {
        register(route) { handler = route.handler },
      }
    }
    if (name === 'tools' && toolsAvailable) return fakeTools
    if (name === 'jobs' && jobsAvailable) return fakeJobs
    return undefined
  },
}
mod.apply(ctx)
if (!handler) { console.error('FAIL: route not registered'); process.exit(1) }

async function call(body, headers = {}) {
  const raw = JSON.stringify(body)
  const req = {
    headers: { origin: 'http://127.0.0.1:3080', host: '127.0.0.1:3080', ...headers },
    on(ev, cb) {
      if (ev === 'data') cb(Buffer.from(raw))
      if (ev === 'end') setTimeout(cb, 0)
    },
  }
  const res = {
    writeHead() {},
    end(payload) { res.body = JSON.parse(payload) },
  }
  await handler(req, res)
  return res.body
}

let failures = 0
let skipped = 0
function check(name, ok, detail) {
  if (ok) console.log('PASS ' + name)
  else { console.error('FAIL ' + name + ': ' + String(detail)); failures++ }
}
function skip(name) {
  console.log('SKIP ' + name + ' (network unavailable)')
  skipped++
}

// --- read-only API surface ---
// dshBin auto-detection keys off the web server's cwd (the harness checkout);
// under the test runner the cwd is this repo, so pin the DSH_BIN fallback.
process.env.DSH_BIN = process.execPath
const probe = await call({ method: 'probe' })
check('probe env', probe.ok && probe.dshHome && probe.node && probe.dshBin, probe)

const inst = await call({ method: 'installed' })
check('installed shape', inst.ok && Array.isArray(inst.bundles) && typeof inst.dependencies === 'object', inst)

const emptyOp = await call({ method: 'op' })
check('op empty -> null', emptyOp.ok && emptyOp.op === null, emptyOp)

// --- classify (read-only GitHub manifest fetches; skipped when offline) ---
const tianshu = await mod.classifyPlugin('github:huiliyi37/dsh-tianshu-tui')
if (tianshu.fetchFailed) skip('classify tianshu-tui webClient false')
else check('classify tianshu-tui webClient false', tianshu.known && tianshu.webClient === false, tianshu)

const whale = await mod.classifyPlugin('github:vlln/whale-girl')
if (whale.fetchFailed) skip('classify whale-girl webClient true')
else check('classify whale-girl webClient true', whale.known && whale.webClient === true, whale)

const registrySpec = await mod.classifyPlugin('@some/pkg')
check('classify registry spec unknown', registrySpec.known === false && registrySpec.webClient === false, registrySpec)

// --- probe (fake bin emulates install + boot) ---
// A fake bin in "boot mode" (invoked with --port, no plugin subcommand) prints
// the dsh web: readiness line; otherwise it behaves like the CLI install.
const probeBin = join(tmpdir(), 'mkts-probe-bin-' + process.pid + '.mjs')
writeFileSync(probeBin, `
const isBoot = !process.argv.includes('plugin') && process.argv.includes('--port')
if (isBoot) {
  process.stdout.write('dsh web: http://127.0.0.1:0\\n')
} else {
  process.stdout.write('fake-bin installing\\n')
}
process.exit(0)
`)
const probeOk = await mod.runProbe(probeBin, 'fake:ok')
check('probe passes on readiness line', probeOk.ok === true, probeOk)

// A fake bin whose install step succeeds but whose boot step fails without
// printing the readiness line → boot verdict fails with the boot error.
writeFileSync(probeBin, `
const isBoot = !process.argv.includes('plugin') && process.argv.includes('--port')
if (isBoot) {
  process.stdout.write('BOOT ERROR: duplicate service api-gateway\\n')
  process.exit(1)
}
process.stdout.write('fake-bin installing\\n')
process.exit(0)
`)
const probeFail = await mod.runProbe(probeBin, 'fake:bad')
check('probe fails on boot error', probeFail.ok === false && probeFail.stage === 'boot' && /BOOT ERROR/.test(probeFail.output || ''), probeFail)

// A fake bin that fails at the install step → install stage verdict.
writeFileSync(probeBin, `process.stdout.write('pnpm: network unreachable\\n')\nprocess.exit(1)\n`)
const probeInstallFail = await mod.runProbe(probeBin, 'fake:neterr')
check('probe fails on install error', probeInstallFail.ok === false && probeInstallFail.stage === 'install' && /pnpm/.test(probeInstallFail.output || ''), probeInstallFail)

// --- same-origin gate on write operations ---
const crossOrigin = await call({ method: 'install', source: 'fake:any', profile: 'web', binPath: process.execPath }, { origin: 'http://evil.example' })
check('install rejected cross-origin', crossOrigin.ok === false && /untrusted/.test(crossOrigin.error || ''), crossOrigin)

const crossKill = await call({ method: 'kill' }, { origin: 'http://evil.example' })
check('kill rejected cross-origin', crossKill.ok === false && /untrusted/.test(crossKill.error || ''), crossKill)

// --- install safety gate (GitHub sources verified via their dsh manifest) ---
// A github: source whose package.json cannot be read (nonexistent repo or
// offline) is refused before any profile write.
const unverifiable = await call({ method: 'install', source: 'github:somebody/not-in-catalog', profile: 'web', binPath: process.execPath })
check('install rejected when GitHub source cannot be verified', unverifiable.ok === false && unverifiable.refused === true && /无法验证/.test(unverifiable.output || ''), unverifiable)

// A github: source that would pass the gate starts the op path directly when
// skipCheck bypasses verification (fake bin exits 0; keep this offline-safe).
const wlBin = join(tmpdir(), 'mkts-wl-bin-' + process.pid + '.mjs')
writeFileSync(wlBin, `process.exit(0)\n`)
const listedOk = await call({ method: 'install', source: 'github:huiliyi37/dsh-tianshu-tui', profile: 'web', binPath: wlBin, skipCheck: true })
check('skipCheck bypasses verification and starts op', listedOk.ok === true && listedOk.opId, listedOk)
await call({ method: 'kill' }) // cancel the started op

// --- buildSearchQuery: topic + noise filters + user terms ---
const bq = mod.buildSearchQuery('')
check('buildSearchQuery always has topic + noise filters', /topic:dsh-plugin/.test(bq)
  && /is:public/.test(bq) && /fork:false/.test(bq) && /archived:false/.test(bq), bq)
const bqTerm = mod.buildSearchQuery('terminal')
check('buildSearchQuery appends user terms', /terminal/.test(bqTerm) && bqTerm.startsWith('topic:dsh-plugin '), bqTerm)

// --- npm-prefer install helpers (registry verification against the repo) ---
check('normalizeRepoUrl strips git+https and .git', mod.normalizeRepoUrl('git+https://github.com/acme/plugin.git') === 'acme/plugin', mod.normalizeRepoUrl('git+https://github.com/acme/plugin.git'))
check('normalizeRepoUrl handles ssh form', mod.normalizeRepoUrl('git@github.com:acme/plugin.git') === 'acme/plugin', mod.normalizeRepoUrl('git@github.com:acme/plugin.git'))
check('normalizeRepoUrl lowercases', mod.normalizeRepoUrl('https://github.com/Acme/Plugin') === 'acme/plugin', mod.normalizeRepoUrl('https://github.com/Acme/Plugin'))
const noNet = await mod.npmRegistrySpec('github:a/b', 'not a valid name!')
check('npmRegistrySpec rejects invalid name without network', noNet === null, noNet)
const bogus = await mod.npmRegistrySpec('github:a/b', 'mkts-bogus-pkg-9f8e7d6c5b4a')
check('npmRegistrySpec null for unpublished name', bogus === null, bogus)

// --- codeloadSpec: git-hosted installs go through the CDN tarball ---
check('codeloadSpec maps github: to tarball URL', mod.codeloadSpec('github:acme/plugin') === 'https://codeload.github.com/acme/plugin/tar.gz/HEAD', mod.codeloadSpec('github:acme/plugin'))
check('codeloadSpec strips .git suffix', mod.codeloadSpec('github:acme/plugin.git') === 'https://codeload.github.com/acme/plugin/tar.gz/HEAD', mod.codeloadSpec('github:acme/plugin.git'))
check('codeloadSpec null for non-github spec', mod.codeloadSpec('@scope/pkg') === null, mod.codeloadSpec('@scope/pkg'))

// --- device proxy auto-detection ---
const closedPort = await mod.probeProxyPort(1)
check('probeProxyPort false for closed port', closedPort === false, closedPort)
const detected = await mod.detectProxy()
check('detectProxy returns url or null', detected === null || (typeof detected === 'string' && /^https?:\/\//.test(detected)), detected)

// --- restart route: rejected unless same-origin AND direct loopback ---
const restCross = await call({ method: 'restart' }, { origin: 'http://evil.example' })
check('restart rejected cross-origin', restCross.ok === false && /untrusted/.test(restCross.error || ''), restCross)
const restNoLoop = await call({ method: 'restart' }) // fake req has no socket
check('restart rejected without direct loopback socket', restNoLoop.ok === false && /loopback/.test(restNoLoop.error || ''), restNoLoop)

// --- restart guard: syntax-valid inline JS, launches only once the port frees -
// (The guard is the detached `node -e` script scheduleRestart leaves behind; it
// polls the port with a bind probe, then spawns the recorded entry.)
if (mod.restartGuardScript) {
  const guard = mod.restartGuardScript(0, process.execPath, ['-e', ''], process.cwd())
  check('restart guard script is non-empty inline JS', typeof guard === 'string' && guard.includes('net.createServer'), typeof guard)
  // Run one live guard against a FREE port: its launch must spawn a child that
  // writes a marker file, then the guard exits 0.
  const marker = join(tmpdir(), 'mkts-guard-marker-' + process.pid + '.txt')
  try { rmSync(marker, { force: true }) } catch {}
  const server = await new Promise((resolve) => {
    const s = createServer()
    s.listen(0, '127.0.0.1', () => resolve(s))
  })
  const freePort = server.address().port
  server.close()
  const guardLive = mod.restartGuardScript(freePort, process.execPath,
    ['-e', 'require("node:fs").writeFileSync(' + JSON.stringify(marker) + ', "ok")'], process.cwd())
  const guardRun = spawn(process.execPath, ['-e', guardLive], { stdio: 'ignore' })
  const guardExit = new Promise((resolve) => guardRun.on('exit', (code) => resolve(code)))
  const markerOk = await new Promise((resolve) => {
    const deadline = Date.now() + 15000
    const poll = () => {
      if (existsSync(marker)) return resolve(true)
      if (Date.now() > deadline) return resolve(false)
      setTimeout(poll, 100)
    }
    poll()
  })
  check('restart guard launches entry once port is free', markerOk === true, marker)
  const guardCode = await Promise.race([guardExit, new Promise((r) => setTimeout(() => r('timeout'), 5000))])
  check('restart guard exits after launch', guardCode === 0, guardCode)
  try { rmSync(marker, { force: true }) } catch {}
}

// --- GitHub real-time search (mapGitHubItem unit + search route) ---
const ghMapped = mod.mapGitHubItem({
  full_name: 'acme/awesome-plugin', html_url: 'https://github.com/acme/awesome-plugin',
  owner: { login: 'acme' }, description: 'A test plugin', stargazers_count: 42,
  pushed_at: '2026-01-02T03:04:05Z', topics: ['dsh-plugin'],
})
check('mapGitHubItem maps to card shape', ghMapped.name === 'awesome-plugin' && ghMapped.by === 'acme'
  && ghMapped.source === 'github:acme/awesome-plugin' && ghMapped.stars === 42
  && ghMapped.url === 'https://github.com/acme/awesome-plugin', ghMapped)

const search = await call({ method: 'search', q: '', sort: 'stars', perPage: 5 })
if (!search.ok) skip('search (GitHub rate-limited or offline)')
else {
  check('search returns plugins', Array.isArray(search.plugins) && search.plugins.length > 0, search)
  check('search cards carry github source', search.plugins.every((p) => typeof p.source === 'string' && p.source.startsWith('github:')), search.plugins[0])
}

// --- searchCache expiry pruning: expired entries die first, then oldest ---
// Fill the cache directly (no network): 150 fresh + 60 expired entries, then
// prune — the 60 expired must go, keeping size ≤ 200 without touching fresh.
if (mod.searchCache && mod.pruneSearchCache) {
  const cache = mod.searchCache
  cache.clear()
  const now = Date.now()
  const ttl = 60 * 1000
  for (let i = 0; i < 150; i++) cache.set('fresh-' + i, { at: now, data: { plugins: [], total: 0 } })
  for (let i = 0; i < 60; i++) cache.set('old-' + i, { at: now - ttl - 1000, data: { plugins: [], total: 0 } })
  mod.pruneSearchCache()
  check('pruneSearchCache drops expired entries', !cache.has('old-0') && !cache.has('old-59'), cache.size)
  check('pruneSearchCache keeps fresh entries under cap', cache.size <= 200 && cache.has('fresh-0') && cache.has('fresh-149'), cache.size)
  // Over cap with all fresh: evict oldest by insertion order.
  cache.clear()
  for (let i = 0; i < 230; i++) cache.set('k-' + i, { at: now, data: { plugins: [], total: 0 } })
  mod.pruneSearchCache()
  check('pruneSearchCache evicts oldest when all fresh', cache.size <= 200 && !cache.has('k-0') && !cache.has('k-29') && cache.has('k-30') && cache.has('k-229'), cache.size)
  cache.clear()
}

// --- updatesCache: expired/null entries are deleted in place on read ---
{
  const uc = mod.updatesCacheView && mod.updatesCacheView()
  if (uc) {
    uc['__aged__'] = { at: Date.now() - 11 * 60 * 1000, data: { stale: true } }
    uc['__null__'] = null
    await mod.checkUpdates('__no_such_profile__')
    check('checkUpdates deletes expired/null cache entries', uc['__aged__'] === undefined && uc['__null__'] === undefined, uc)
  } else {
    check('updatesCacheView test hook exposed', false, 'no updatesCacheView export')
  }
}

// --- parseSimplePatch: hot-mountable patch shape detection ---
const simplePatch = mod.parseSimplePatch('- insert:\n    - id: tool-csv\n      name: \'@deepseek-ai/dsh-tool-csv\'\n')
check('parseSimplePatch accepts plain id/name rows', simplePatch !== null && simplePatch.length === 1 && simplePatch[0].id === 'tool-csv', simplePatch)
const complexPatch = mod.parseSimplePatch('- insert:\n    - id: x\n      name: y\n- id: system-prompt\n  config: {}\n')
check('parseSimplePatch rejects config rows', complexPatch === null, complexPatch)

// --- updates / update routes ---
const updates = await call({ method: 'updates', profile: 'web' })
check('updates route ok', updates.ok === true && typeof updates.updates === 'object', updates)

const updCross = await call({ method: 'update', name: 'fake:pkg', profile: 'web' }, { origin: 'http://evil.example' })
check('update rejected cross-origin', updCross.ok === false && /untrusted/.test(updCross.error || ''), updCross)

const updNotInstalled = await call({ method: 'update', name: 'not-installed-pkg', profile: 'web', binPath: process.execPath })
check('update rejects not-installed', updNotInstalled.ok === false && /未安装/.test(updNotInstalled.output || ''), updNotInstalled)

// checkUpdates degrades gracefully with no real profile / lockfile.
const cu = await mod.checkUpdates('__no_such_profile__')
check('checkUpdates degrades on missing profile', typeof cu === 'object' && Object.keys(cu).length === 0, cu)

// --- op pipeline with a fake CLI bin (never touches the real profile) ---
const fakeBin = join(tmpdir(), 'mkts-fake-bin-' + process.pid + '.mjs')
writeFileSync(fakeBin, `
const isBoot = !process.argv.includes('plugin') && process.argv.includes('--port')
if (isBoot) {
  process.stdout.write('dsh web: http://127.0.0.1:0\\n')
  process.exit(0)
}
process.stdout.write('fake-bin running\\n')
process.stderr.write('fake-bin stderr line\\n')
setTimeout(() => { process.exit(0) }, 400)
`)
// args: node <bin> plugin --profile <p> add <t>  -> fake bin receives all args.
const opCall = await call({ method: 'install', source: 'fake:test', profile: 'web', binPath: fakeBin, label: 'fake plugin' })
check('install starts op', opCall.ok && opCall.opId, opCall)

await new Promise((r) => setTimeout(r, 900))
const opState = await call({ method: 'op' })
check('op settles done with output', opState.ok && opState.op && opState.op.status === 'done' && /fake-bin running/.test(opState.op.output), opState.op && opState.op)

const opId = opState.op.id
const opById = await call({ method: 'op', opId })
check('op by id matches', opById.ok && opById.op && opById.op.id === opId, opById)

// kill path: start a long-running fake bin, then kill.
// skipCheck: true skips the trial-boot probe so the op starts immediately.
writeFileSync(fakeBin, `setTimeout(() => {}, 60000)\n`)
const op2 = await call({ method: 'install', source: 'fake:slow', profile: 'web', binPath: fakeBin, label: 'slow', skipCheck: true })
check('second install starts (first settled)', op2.ok && op2.opId, op2)
await new Promise((r) => setTimeout(r, 300))
const k = await call({ method: 'kill' })
check('kill requested', k.ok, k)
await new Promise((r) => setTimeout(r, 600))
const opAfterKill = await call({ method: 'op', opId: op2.opId })
check('op status killed', opAfterKill.ok && opAfterKill.op && opAfterKill.op.status === 'killed', opAfterKill)

// busy refusal while an op is still live
writeFileSync(fakeBin, `setTimeout(() => {}, 60000)\n`)
const op3 = await call({ method: 'install', source: 'fake:slow2', profile: 'web', binPath: fakeBin, label: 'slow2', skipCheck: true })
check('third op starts', op3.ok && op3.opId, op3)
await new Promise((r) => setTimeout(r, 200))
const busy = await call({ method: 'install', source: 'github:x/y', profile: 'web', binPath: fakeBin, label: 'dup' })
check('busy while op live', busy.ok === false && busy.busy === true, busy)
await call({ method: 'kill' })

// uninstall: hot-mount dispose is a no-op when no live mount exists, and the
// remove op still starts normally (fake bin exits 0).
writeFileSync(fakeBin, `setTimeout(() => { process.exit(0) }, 300)\n`)
const uninstCall = await call({ method: 'uninstall', pkg: 'whale-girl', profile: 'web', binPath: fakeBin, label: 'whale-girl' })
check('uninstall starts op (dispose no-op safe)', uninstCall.ok === true && uninstCall.opId, uninstCall)
await new Promise((r) => setTimeout(r, 500))
const uninstOp = await call({ method: 'op', opId: uninstCall.opId })
check('uninstall op settles done', uninstOp.ok && uninstOp.op && uninstOp.op.status === 'done', uninstOp)

// --- toggleActive (enable/disable) edits dsh.profile.bundles (new in fork) ---
// Point DSH_HOME at a throwaway profile so the write lands off to the side.
const tmpHome = join(tmpdir(), 'mkts-home-' + process.pid)
const origHome = process.env.DSH_HOME
process.env.DSH_HOME = tmpHome
const tprof = join(tmpHome, 'profiles', 'web')
mkdirSync(tprof, { recursive: true })
const manifest = {
  name: 'dsh-profile-web', private: true,
  dependencies: { 'whale-girl': '^1.0.0' },
  dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'whale-girl'] } },
}
writeFileSync(join(tprof, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')

// disable: remove from bundles, keep dependency.
const dis = await call({ method: 'toggleActive', profile: 'web', name: 'whale-girl', enabled: false })
check('toggleActive disable ok', dis.ok === true && dis.active === false, dis)
const afterDisable = JSON.parse(readFileSync(join(tprof, 'package.json'), 'utf8'))
check('disable removes from bundles', Array.isArray(afterDisable.dsh.profile.bundles) && !afterDisable.dsh.profile.bundles.includes('whale-girl'), afterDisable.dsh.profile.bundles)
check('disable keeps dependency', afterDisable.dependencies && afterDisable.dependencies['whale-girl'] === '^1.0.0', afterDisable.dependencies)

// idempotent disable
const dis2 = await call({ method: 'toggleActive', profile: 'web', name: 'whale-girl', enabled: false })
check('toggleActive disable idempotent', dis2.ok === true && dis2.active === false, dis2)

// enable: re-add to bundles; needsRestart true in a headless/test ctx (no hotCtx).
const en = await call({ method: 'toggleActive', profile: 'web', name: 'whale-girl', enabled: true })
check('toggleActive enable ok', en.ok === true && en.active === true, en)
const afterEnable = JSON.parse(readFileSync(join(tprof, 'package.json'), 'utf8'))
check('enable re-adds to bundles', Array.isArray(afterEnable.dsh.profile.bundles) && afterEnable.dsh.profile.bundles.includes('whale-girl'), afterEnable.dsh.profile.bundles)

// not-installed plugin rejected
const missing = await call({ method: 'toggleActive', profile: 'web', name: 'never-installed', enabled: true })
check('toggleActive rejects not-installed', missing.ok === false && /未安装/.test(missing.error || ''), missing)

// cross-origin gate on toggleActive
const crossT = await call({ method: 'toggleActive', profile: 'web', name: 'whale-girl', enabled: true }, { origin: 'http://evil.example' })
check('toggleActive rejected cross-origin', crossT.ok === false && /untrusted/.test(crossT.error || ''), crossT)

// --- ensureAllowBuilds: idempotent per-package build consent ---
writeFileSync(join(tprof, 'pnpm-workspace.yaml'), 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n')
mod.ensureAllowBuilds('web', '@acme/tool')
mod.ensureAllowBuilds('web', '@acme/tool') // idempotent
const wsText = readFileSync(join(tprof, 'pnpm-workspace.yaml'), 'utf8')
check('ensureAllowBuilds adds scoped key once (quoted)', (wsText.match(/'@acme\/tool': true/g) || []).length === 1, wsText)
check('ensureAllowBuilds does not leave unquoted scoped key', wsText.indexOf('@acme/tool: true') === -1, wsText)
mod.ensureAllowBuilds('web', 'second-tool')
const wsText2 = readFileSync(join(tprof, 'pnpm-workspace.yaml'), 'utf8')
check('ensureAllowBuilds appends under existing block', (wsText2.match(/'@acme\/tool': true/g) || []).length === 1
  && (wsText2.match(/'second-tool': true/g) || []).length === 1, wsText2)
mod.ensureAllowBuilds('web', 'not a valid key!')
const wsText3 = readFileSync(join(tprof, 'pnpm-workspace.yaml'), 'utf8')
check('ensureAllowBuilds rejects invalid key', wsText3 === wsText2, wsText3)

// --- ensureClientRow: synthetic loader row for client-only packages ---
writeFileSync(join(tprof, 'cordis.patch.yml'), '[]\n')
mod.ensureClientRow('web', '@acme/ui-theme')
mod.ensureClientRow('web', '@acme/ui-theme') // idempotent
const patchText = readFileSync(join(tprof, 'cordis.patch.yml'), 'utf8')
check('ensureClientRow writes synthetic insert row', (patchText.match(/- insert:/g) || []).length === 1
  && patchText.includes("name: '@acme/ui-theme'"), patchText)
mod.ensureClientRow('web', 'another-theme')
const patchText2 = readFileSync(join(tprof, 'cordis.patch.yml'), 'utf8')
check('ensureClientRow appends second row', (patchText2.match(/- insert:/g) || []).length === 2
  && patchText2.includes("name: 'another-theme'"), patchText2)

// --- loaderNamesFor: patch row names, falling back to the package name ---
// A package whose cordis.patch.yml rows resolve under names DIFFERENT from the
// npm package name (the hot-mount verification / disable-entry case).
mkdirSync(join(tprof, 'node_modules', 'row-pkg'), { recursive: true })
writeFileSync(join(tprof, 'node_modules', 'row-pkg', 'package.json'), JSON.stringify({ name: 'row-pkg', version: '1.0.0' }) + '\n')
writeFileSync(join(tprof, 'node_modules', 'row-pkg', 'cordis.patch.yml'),
  '- insert:\n    - id: tool-csv\n      name: \'@acme/row-pkg-tool\'\n    - id: tool-x\n      name: \'@acme/row-pkg-x\'\n')
const rowNames = mod.loaderNamesFor('web', 'row-pkg')
check('loaderNamesFor returns patch row names', Array.isArray(rowNames) && rowNames.length === 2
  && rowNames[0] === '@acme/row-pkg-tool' && rowNames[1] === '@acme/row-pkg-x', rowNames)
// Missing package (no patch to read) → fallback to the package name itself.
check('loaderNamesFor falls back to package name', mod.loaderNamesFor('web', 'no-such-pkg').length === 1
  && mod.loaderNamesFor('web', 'no-such-pkg')[0] === 'no-such-pkg', mod.loaderNamesFor('web', 'no-such-pkg'))

if (origHome === undefined) delete process.env.DSH_HOME
else process.env.DSH_HOME = origHome
try { rmSync(tmpHome, { recursive: true, force: true }) } catch {}

// --- listInstalled: built-in vs third-party projection ---
const instHome = join(tmpdir(), 'mkts-inst-home-' + process.pid)
const instOrigHome = process.env.DSH_HOME
process.env.DSH_HOME = instHome
const iprof = join(instHome, 'profiles', 'web')
mkdirSync(iprof, { recursive: true })
writeFileSync(join(iprof, 'package.json'), JSON.stringify({
  name: 'dsh-profile-web', private: true,
  // link:/file: specs short-circuit update checks (offline-safe test).
  dependencies: { 'whale-girl': 'link:../whale-girl' },
  dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'whale-girl'] } },
}, null, 2) + '\n')
const instRows = await mod.listInstalled('web')
check('listInstalled splits builtin/installed', instRows.some((r) => r.name === '@deepseek-ai/dsh-base' && r.kind === 'builtin' && r.enabled)
  && instRows.some((r) => r.name === '@deepseek-ai/dsh-web-app' && r.kind === 'builtin')
  && instRows.some((r) => r.name === 'whale-girl' && r.kind === 'installed' && r.enabled), instRows)

// live field: hotCtx is a module-level let the test cannot inject (apply() got
// a fake ctx without a loader service), so every row must project live=null —
// exactly the "no matching loader entry in this process" path.
check('listInstalled rows carry live (null without a loader)', instRows.every((r) => r.live === null), instRows.map((r) => [r.name, r.live]))

// --- mapLivePhase: Cordis FiberState → live phase (host plugin-inventory mapping)
if (mod.mapLivePhase) {
  const cases = [
    [0, 'pending'], [1, 'loading'], [2, 'active'], [3, 'failed'], [4, null], [5, 'unloading'],
  ]
  let allOk = true
  for (const [state, want] of cases) {
    if (mod.mapLivePhase(state) !== want) { allOk = false; console.error('  phase mismatch: ' + state + ' → ' + String(mod.mapLivePhase(state)) + ', want ' + String(want)) }
  }
  check('mapLivePhase maps all six FiberStates', allOk, cases)
  check('mapLivePhase null for missing/unknown fiber state', mod.mapLivePhase(undefined) === null && mod.mapLivePhase(99) === null && mod.mapLivePhase(null) === null,
    [mod.mapLivePhase(undefined), mod.mapLivePhase(99), mod.mapLivePhase(null)])
} else {
  check('mapLivePhase test hook exposed', false, 'no mapLivePhase export')
}

// --- resolveInstallSpec: registry specs pass through untouched (no network) ---
const resolved = await mod.resolveInstallSpec('@some/pkg', process.execPath, 'web')
check('resolveInstallSpec passes registry spec through', resolved.ok === true && resolved.installSpec === '@some/pkg', resolved)

// --- checkSelfUpdate: shape check (network-dependent values are lenient) ---
const self = await mod.checkSelfUpdate('web')
check('checkSelfUpdate returns market update shape', self.name === 'dsh-market-github'
  && typeof self.updateAvailable === 'boolean'
  && (self.version === null || typeof self.version === 'string'), self)

if (instOrigHome === undefined) delete process.env.DSH_HOME
else process.env.DSH_HOME = instOrigHome
try { rmSync(instHome, { recursive: true, force: true }) } catch {}

// --- model tools: registered shapes, DSL-compiled parameters, background jobs ---
// registerMarketTools ran during apply() with both services present, so all
// four market_* tools must be in the fake registry.
check('all four market tools registered',
  ['market_search', 'market_install', 'market_installed', 'market_update']
    .every((n) => registeredTools.has(n)), [...registeredTools.keys()])

// Parameters are compiled from the ParameterSchemaSpec DSL shape into the raw
// JSON Schema subset the host registry / LLM wire expects: an object root with
// per-property nodes and a `required` array — never the DSL map itself (the
// registry passes `parameters` through verbatim to the provider).
const ms = registeredTools.get('market_search')
check('market_search parameters are JSON Schema object root',
  ms.parameters.type === 'object' && ms.parameters.properties && ms.parameters.properties.q
  && ms.parameters.properties.q.type === 'string' && !ms.parameters.required, ms.parameters)
check('market_search page/perPage are numbers',
  ms.parameters.properties.page.type === 'number' && ms.parameters.properties.perPage.type === 'number', ms.parameters)

const mi = registeredTools.get('market_install')
check('market_install parameters mark spec required',
  mi.parameters.type === 'object' && mi.parameters.properties.spec.type === 'string'
  && Array.isArray(mi.parameters.required) && mi.parameters.required.includes('spec'), mi.parameters)

const mu = registeredTools.get('market_update')
check('market_update parameters mark name required',
  mu.parameters.type === 'object' && mu.parameters.properties.name.type === 'string'
  && Array.isArray(mu.parameters.required) && mu.parameters.required.includes('name'), mu.parameters)

const minst = registeredTools.get('market_installed')
check('market_installed parameters are empty object schema',
  minst.parameters.type === 'object' && Object.keys(minst.parameters.properties).length === 0
  && !minst.parameters.required, minst.parameters)

// Output schemas stay inside the host's supported JSON Schema subset and the
// background-capable tools declare the background/completed oneOf union.
check('market_install output declares background oneOf branch',
  Array.isArray(mi.output.schema.oneOf)
  && mi.output.schema.oneOf.some((b) => b.properties.kind && b.properties.kind.const === 'background'
    && b.required.includes('kind') && b.required.includes('jobId'))
  && mi.output.schema.oneOf.some((b) => b.properties.ok && b.properties.needsRestart), mi.output.schema.oneOf)
check('market_update output declares background oneOf branch',
  Array.isArray(mu.output.schema.oneOf)
  && mu.output.schema.oneOf.some((b) => b.properties.kind && b.properties.kind.const === 'background'), mu.output.schema.oneOf)

// compileParameterSpec unit: DSL in, supported subset out (enum + required +
// description annotations; non-object defs skipped).
if (mod.compileParameterSpec) {
  const compiled = mod.compileParameterSpec({
    a: { type: 'string', required: true, description: 'needed' },
    b: { type: 'number' },
    c: { type: 'string', enum: ['x', 'y'] },
  })
  check('compileParameterSpec compiles DSL to subset schema',
    compiled.type === 'object'
    && compiled.properties.a.type === 'string' && compiled.properties.a.description === 'needed'
    && compiled.properties.b.type === 'number'
    && JSON.stringify(compiled.properties.c.enum) === JSON.stringify(['x', 'y'])
    && JSON.stringify(compiled.required) === JSON.stringify(['a']), compiled)
  const empty = mod.compileParameterSpec({})
  check('compileParameterSpec empty map stays open object', empty.type === 'object'
    && Object.keys(empty.properties).length === 0 && empty.required === undefined, empty)
} else {
  check('compileParameterSpec test hook exposed', false, 'no export')
}

// --- market_install execute: background handle when jobs exist (offline) ---
// A registry spec ('@some/pkg') passes resolveInstallSpec through with no
// network; the fake jobs.start records the spec without invoking run(), so no
// CLI child is spawned. DSH_BIN is pinned above (process.execPath), and the
// market bin comes from dshBin() — the auto-detect may fail under the test
// cwd, so point the tool at the pinned env the way the probe route does.
const toolExec = { signal: new AbortController().signal, agent: undefined }
jobStarts.length = 0
let bgResult = null
try {
  bgResult = await mi.execute({ spec: '@some/pkg' }, toolExec)
} catch (e) {
  check('market_install background execute resolves', false, String(e && e.message))
}
if (bgResult !== null) {
  // With the jobs service present the tool must return the background handle.
  if (bgResult.kind === 'background') {
    check('market_install returns background handle with jobId',
      typeof bgResult.jobId === 'string' && bgResult.jobId.length > 0, bgResult)
    check('market_install started one job of kind market-install',
      jobStarts.length === 1 && jobStarts[0].kind === 'market-install' && jobStarts[0].label === '@some/pkg', jobStarts)
    check('market_install job spec carries run hooks',
      typeof jobStarts[0].run === 'function', jobStarts[0])
  } else {
    // Jobs absent at execute time (flags flipped) or the sync fallback ran —
    // accept the sync result only when jobs were disabled.
    check('market_install fell back to sync result shape',
      jobsAvailable === false && bgResult.ok === true && bgResult.background === true, { jobsAvailable, bgResult })
  }
}

// --- single-flight: a running activeOp makes the tool throw before any job ---
// Start a real op through the route with a slow fake bin, then call the tool.
// Wait until the op is observably running first: the previous test's op may
// still be settling, and startOp's chokepoint would (correctly) refuse busy.
writeFileSync(fakeBin, `setTimeout(() => {}, 60000)\n`)
{
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const st = await call({ method: 'op' })
    if (st.ok && (!st.op || st.op.status !== 'running')) break
    await new Promise((r) => setTimeout(r, 100))
  }
}
const slowOp = await call({ method: 'install', source: 'fake:slow-tool', profile: 'web', binPath: fakeBin, label: 'slow-tool', skipCheck: true })
check('slow op starts for single-flight test', slowOp.ok === true && slowOp.opId, slowOp)
jobStarts.length = 0
let busyError = null
try {
  await mi.execute({ spec: '@other/pkg' }, toolExec)
} catch (e) {
  busyError = e
}
check('market_install refuses while an op is running', busyError !== null && /已有任务进行中/.test(String(busyError && busyError.message)), String(busyError && busyError.message))
check('no job started while busy', jobStarts.length === 0, jobStarts)

// --- single-flight AT THE CHOKEPOINT: startOp itself refuses while running ---
// The call-site checks above are fast-path only; startOp() is the one window
// that closes the race for all five entry points. Verify directly: while the
// slow op above is still live, a second startOp must return busy (and must NOT
// overwrite activeOp or spawn a child).
if (mod.startOp) {
  const direct = mod.startOp('install', 'web', 'fake:chokepoint', 'chokepoint', fakeBin, '')
  check('startOp refuses busy while an op is running (chokepoint)',
    direct.ok === false && direct.busy === true && /已有任务进行中/.test(String(direct.error || '')), direct)
  const still = await call({ method: 'op', opId: slowOp.opId })
  check('busy refusal leaves the running op untouched',
    still.ok && still.op && still.op.id === slowOp.opId && still.op.status === 'running', still.op && still.op)
}
await call({ method: 'kill' })
await new Promise((r) => setTimeout(r, 300))

// market_update: not-installed name refused before any job/CLI work.
jobStarts.length = 0
let updErr = null
try {
  await mu.execute({ name: 'definitely-not-installed' }, toolExec)
} catch (e) {
  updErr = e
}
check('market_update refuses unknown plugin', updErr !== null && /未安装/.test(String(updErr && updErr.message)), String(updErr && updErr.message))
check('no job started for unknown plugin', jobStarts.length === 0, jobStarts)

// --- background job full chain: market_update through fake jobs' run() ---
// fakeJobs invokes spec.run() like the real registry, so a tool-initiated
// update with the jobs service present spawns the real op (slow fake bin) and
// wires its hooks. Verify: background handle → readOutput increments → cancel
// → done resolves {status:'killed'}.
{
  // Point the profile at a throwaway DSH_HOME so the update writes nothing,
  // and pin DSH_BIN at the fake bin: the tool path auto-detects the CLI, and
  // the default pin (process.execPath) would fail the child instantly.
  const updHome = join(tmpdir(), 'mkts-job-home-' + process.pid)
  const updOrig = process.env.DSH_HOME
  const updOrigBin = process.env.DSH_BIN
  process.env.DSH_HOME = updHome
  process.env.DSH_BIN = fakeBin
  const uprof = join(updHome, 'profiles', 'web')
  mkdirSync(uprof, { recursive: true })
  writeFileSync(join(uprof, 'package.json'), JSON.stringify({
    name: 'dsh-profile-web', private: true,
    dependencies: { 'mkts-dummy': '^1.0.0' },
  }, null, 2) + '\n')
  // The slow fake bin prints a line, waits, prints again — exercising both a
  // readOutput increment and the kill path.
  writeFileSync(fakeBin, `
  process.stdout.write('step-1\\n')
  setTimeout(() => { process.stdout.write('step-2\\n') }, 1500)
  setTimeout(() => {}, 60000)
  `)
  jobStarts.length = 0
  jobHooks.clear()
  let bg = null
  let updBusy = null
  try {
    bg = await mu.execute({ name: 'mkts-dummy' }, toolExec)
  } catch (e) { updBusy = e }
  check('market_update starts a background job', bg !== null && bg.kind === 'background' && typeof bg.jobId === 'string', bg || String(updBusy && updBusy.message))
  if (bg !== null && bg.kind === 'background') {
    const rec = jobHooks.get(bg.jobId)
    check('fake jobs registry holds the job hooks', !!rec && typeof rec.hooks.cancel === 'function'
      && typeof rec.hooks.readOutput === 'function' && rec.hooks.done instanceof Promise, rec && Object.keys(rec.hooks || {}))
    if (rec) {
      // Wait until step-1 has actually been collected (child spawn + stdout
      // is timing-sensitive on Windows), but never step-2.
      const first = await new Promise((resolve) => {
        const deadline = Date.now() + 8000
        const poll = () => {
          const text = rec.hooks.readOutput()
          if (/step-1/.test(text) || Date.now() > deadline) return resolve(text)
          setTimeout(poll, 100)
        }
        poll()
      })
      check('job readOutput returns the first increment', /step-1/.test(first) && !/step-2/.test(first), first)
      rec.hooks.cancel()
      const outcome = await rec.hooks.done
      check('job done resolves killed after cancel', outcome && outcome.status === 'killed', outcome)
      // readOutput after settle still yields the unread delta (cursor coherent).
      const tail = rec.hooks.readOutput()
      check('job readOutput cursor stays coherent after kill', typeof tail === 'string', typeof tail)
    }
  }
  // Cleanup the op in case something failed above.
  await call({ method: 'kill' })
  await new Promise((r) => setTimeout(r, 300))
  if (updOrig === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = updOrig
  if (updOrigBin === undefined) process.env.DSH_BIN = process.execPath
  else process.env.DSH_BIN = updOrigBin
  try { rmSync(updHome, { recursive: true, force: true }) } catch {}
}

// --- marketJobHooks semantics (pure hooks factory, no jobs service) ---
if (mod.marketJobHooks) {
  // Build a minimal op stand-in and drive the hooks directly: the readOutput
  // cursor must survive the 200KB tail truncation, and cancel() must scope to
  // the op it wrapped (a stale job's cancel must not kill a successor op).
  const mkOp = () => ({
    id: 'op-test', kind: 'install', profile: 'web', target: 'x', label: 'l',
    startedAt: Date.now(), status: 'running', output: '', totalLen: 0,
    exitCode: null, hot: false, beforeDeps: {}, child: null, timer: null,
    settled: new Promise((resolve) => { mkOpResolve = resolve }),
  })
  let mkOpResolve = null
  const op1 = mkOp()
  const hooks = mod.marketJobHooks(op1)
  // Head + first chunk.
  const BIG = 210000 // > MAX_OUTPUT (200000): forces one truncation mid-stream
  op1.output = ('h'.repeat(50000))
  op1.totalLen = 50000
  const r1 = hooks.readOutput()
  check('marketJobHooks readOutput first read emits from zero', r1.length === 50000, r1.length)
  // Simulate appendOutput truncation: append 210k, buffer keeps the last 200k.
  const chunk = 'x'.repeat(BIG)
  op1.output = (op1.output + chunk).slice(-200000)
  op1.totalLen += BIG
  const r2 = hooks.readOutput()
  // The cumulative delta since cursor 50000 is 210k x's, but the buffer only
  // retains cumulative 60000..259999 — the first 10k x's are truncated away,
  // so the read yields the retained 200k x's (never a stale index into the
  // pre-truncation buffer, which would have re-emitted or skipped text).
  check('marketJobHooks readOutput survives 200KB truncation', r2.length === 200000 && /^x+$/.test(r2), r2.length)
  const r3 = hooks.readOutput()
  check('marketJobHooks readOutput empty when nothing new', r3 === '', JSON.stringify(r3).slice(0, 40))
  // cancel scoping: op1 is not activeOp here (never started via startOp), so
  // cancel must NOT settle or kill anything — it is a scoped no-op.
  hooks.cancel()
  check('marketJobHooks cancel scoped: non-active op not settled', op1.status === 'running', op1.status)
  // done maps statuses through op.settled.
  mkOpResolve({ status: 'killed', exitCode: null })
  const outcome = await hooks.done
  check('marketJobHooks done maps killed outcome', outcome.status === 'killed', outcome)
} else {
  check('marketJobHooks test hook exposed', false, 'no marketJobHooks export')
}

// --- liveLoaderStates: FAILED wins over non-FAILED twins (injectable) ---
if (mod.liveLoaderStates) {
  const mkLoader = (rows) => ({ entries: () => rows.map(([name, state]) => ({ options: { name }, fiber: state === undefined ? null : { state }, disabled: false })) })
  // prev FAILED, new non-FAILED → the FAILED entry is kept.
  const a = mod.liveLoaderStates(mkLoader([
    ['twin-pkg', 3], // FAILED first
    ['twin-pkg', 2], // ACTIVE duplicate
  ]))
  check('liveLoaderStates keeps FAILED over later non-FAILED twin', a !== null && a.get('twin-pkg') && a.get('twin-pkg').state === 3, a && a.get('twin-pkg'))
  // prev non-FAILED, new FAILED → the FAILED entry overwrites.
  const b = mod.liveLoaderStates(mkLoader([
    ['twin-pkg', 2], // ACTIVE first
    ['twin-pkg', 3], // FAILED duplicate
  ]))
  check('liveLoaderStates lets new FAILED overwrite non-FAILED twin', b !== null && b.get('twin-pkg') && b.get('twin-pkg').state === 3, b && b.get('twin-pkg'))
  // No loader argument and no hotCtx loader → null (headless projection).
  check('liveLoaderStates null without a loader', mod.liveLoaderStates() === null, mod.liveLoaderStates())
} else {
  check('liveLoaderStates test hook exposed', false, 'no liveLoaderStates export')
}

const tail = skipped > 0 ? ' (' + skipped + ' skipped)' : ''
console.log(failures === 0 ? 'ALL PASS' + tail : failures + ' FAILURES' + tail)
process.exit(failures === 0 ? 0 : 1)
