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
const ctx = {
  get(name) {
    if (name === 'webServer') {
      return {
        register(route) { handler = route.handler },
      }
    }
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

const tail = skipped > 0 ? ' (' + skipped + ' skipped)' : ''
console.log(failures === 0 ? 'ALL PASS' + tail : failures + ' FAILURES' + tail)
process.exit(failures === 0 ? 0 : 1)
