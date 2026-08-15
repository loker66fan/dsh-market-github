// Host half of the persistent plugin market — fork of @sanqi-normal/dsh-webui-market-plugin.
//
// Registers one HTTP route (/api/dsh-market) that the browser UI calls to list,
// inspect, install, uninstall, enable, disable and update community plugins.
// Runs as an ordinary Cordis plugin, so the full Node environment (process, fs,
// global fetch) is available.
//
// Install/uninstall/update run as background operations: the route returns an op
// id immediately, the browser polls it, and a hard timeout kills the child so a
// dead network cannot hang the request forever. The browser keeps a module-level
// op bus that is surfaced through a shell.overlay progress pill, so an install
// stays visible (and terminable) even after the user navigates away from the
// market panel to another project/section.
//
// enable / disable (new in this fork) toggle whether an installed plugin is in the
// profile's `dsh.profile.bundles` layer stack — the persistent source of "active".
// Disabling keeps the package installed as a dependency but removes its config
// layer; the live hot-mount / loader entry is also disposed so it stops serving
// immediately. Enabling re-adds the layer and tries to hot-mount for instant
// effect, else falls back to "restart to apply".
//
// Before installing into the web profile, a "trial boot" probe verifies the
// candidate actually boots: the same dsh CLI installs it into a throwaway
// DSH_HOME profile, boots that profile on a free OS-assigned port (--port 0),
// and waits for the `dsh web:` readiness line. Only the boot verdict decides
// installability; the real profile is never touched by a failed probe.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'

export const name = 'dsh-market-plugin-plus'

/** Hard dependency: the HTTP carrier must exist before the route registers. */
export const inject = ['webServer']

const DEFAULT_TIMEOUT = 120000

/** The single live background op (one at a time keeps the CLI's pnpm serial). */
let activeOp: any = null
let opCounter = 0

function decodeEntities(s: string): string {
  return String(s)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
}

function parseCmd(cmd: string | null): { profile: string; action: string; source: string } | null {
  if (!cmd) return null
  const m = /^dsh plugin --profile (\S+) (\w+)(?:\s+(\S+))?/.exec(String(cmd).trim())
  if (!m) return null
  return { profile: m[1], action: m[2], source: m[3] || '' }
}

function parseSite(html: string): { plugins: any[]; cats: any[] } {
  const plugins: any[] = []
  const cats: any[] = []
  const itemRe = /<li class="item"[^>]*data-cat="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g
  let m: RegExpExecArray | null
  while ((m = itemRe.exec(html)) !== null) {
    const cat = m[1]
    const body = m[2]
    const a = /<a href="([^"]+)"[^>]*>([^<]+)<\/a>/.exec(body)
    const by = /<span class="by"[^>]*>([^<]+)<\/span>/.exec(body)
    const p = /<p>([\s\S]*?)<\/p>/.exec(body)
    const cmd = /data-cmd="([^"]+)"/.exec(body)
    const stars = /<span class="stars"[^>]*>\s*★\s*([\d,.]+)/.exec(body)
    if (!a) continue
    const cc = cmd ? parseCmd(cmd[1]) : null
    let name = a[2].trim()
    let owner = by ? by[1].trim() : ''
    if (!owner) {
      const ghOwner = /^https?:\/\/github\.com\/([^/]+)\//.exec(a[1])
      const slash = name.indexOf('/')
      if (ghOwner && slash > 0) {
        owner = ghOwner[1]
        name = name.slice(slash + 1)
      }
    }
    plugins.push({
      cat,
      name,
      url: a[1],
      by: owner,
      desc: p ? decodeEntities(p[1]).replace(/<[^>]+>/g, '').trim() : '',
      cmd: cmd ? cmd[1] : null,
      profile: cc ? cc.profile : 'web',
      source: cc ? cc.source : null,
      stars: stars ? Number(stars[1].replace(/,/g, '')) : null,
      added: null,
    })
  }
  const catRe = /data-cat="([^"]+)">([^<]+)<small>(\d+)<\/small>/g
  while ((m = catRe.exec(html)) !== null) {
    cats.push({ id: m[1], label: m[2].trim(), count: Number(m[3]) })
  }
  return { plugins, cats }
}

function dshHome(): string {
  return process.env.DSH_HOME || (homedir() + '/.dsh')
}

/**
 * Resolve the dsh CLI entry. Prefers the exact entry that launched THIS host
 * process, falls back to the checkout's bin or $DSH_BIN.
 */
function dshInvoke(explicit?: string): { file: string; args: string[]; cwd?: string } | null {
  if (explicit && explicit.trim()) {
    return invokeEntry(explicit.trim())
  }
  const entry = process.argv[1]
  if (entry !== undefined && /[\\/](?:bin\.(?:js|ts)|dsh)$/.test(entry)) {
    return invokeEntry(entry)
  }
  const cand = process.cwd().replace(/[\\/]+$/, '') + '/apps/cli/lib/bin.js'
  try {
    if (existsSync(cand)) return { file: process.execPath, args: [cand], cwd: undefined }
  } catch {}
  if (process.env.DSH_BIN) return invokeEntry(process.env.DSH_BIN)
  return null
}

function invokeEntry(entry: string): { file: string; args: string[]; cwd?: string } {
  const isTs = /\.ts$/.test(entry)
  const loader = isTs && !process.execArgv.some((a) => String(a).includes('tsx'))
    ? ['--import', 'tsx']
    : []
  return {
    file: process.execPath,
    args: [...process.execArgv, ...loader, entry],
    cwd: isTs ? dirname(entry) : undefined,
  }
}

/** The resolved CLI entry path, for display/probing; null when undetectable. */
function dshBin(explicit?: string): string | null {
  const inv = dshInvoke(explicit)
  return inv === null ? null : inv.args[inv.args.length - 1]
}

function profileDir(profile: string): string {
  return dshHome().replace(/[\\/]+$/, '') + '/profiles/' + profile
}

function readBody(req: any): Promise<Record<string, any>> {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk: Buffer) => { raw += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')) } catch { resolve({}) }
    })
    req.on('error', () => resolve({}))
  })
}

/** Same-origin check: the browser's Origin host must equal the request Host. */
function sameOrigin(req: any): boolean {
  const origin = req.headers && req.headers.origin
  const host = req.headers && req.headers.host
  if (origin === undefined || host === undefined) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

function sendJson(res: any, status: number, obj: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(obj))
}

function validProfile(p: any): boolean {
  return typeof p === 'string' && /^[A-Za-z0-9_-]+$/.test(p)
}

function opSnapshot() {
  if (!activeOp) return null
  const { id, kind, profile, target, label, startedAt, status, output, exitCode, bin, hot } = activeOp
  return {
    id, kind, profile, target, label, startedAt,
    status, output: String(output || '').slice(-20000), exitCode,
    elapsedMs: Date.now() - startedAt,
    timeoutMs: DEFAULT_TIMEOUT,
    bin: bin || null,
    hot: hot === true,
  }
}

/** Kill a running child, killing its whole process tree on Windows. */
function killChild(child: any): void {
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      child.kill()
    }
  } catch {}
}

/** Terminal output cap: pnpm logs can be large; keep the tail only. */
const MAX_OUTPUT = 200000

function appendOutput(op: any, text: string): void {
  op.output = (op.output + String(text)).slice(-MAX_OUTPUT)
}

/** Settle an op to a terminal status and drop its pending timeout timer. */
function settleOp(op: any, status: string, exitCode?: number): void {
  clearTimeout(op.timer)
  op.status = status
  if (exitCode !== undefined) op.exitCode = exitCode
}

interface Op {
  id: string
  kind: string
  profile: string
  target: string
  label: any
  startedAt: number
  status: string
  output: string
  exitCode: number | null
  bin?: string | null
  hot: boolean
  beforeDeps: Record<string, any>
  child?: any
  timer?: any
}

/** Start one install/uninstall/update as a background op. */
function startOp(kind: string, profile: string, target: string, label: string, explicitBin: string, initialOutput?: string): { ok: boolean; opId?: string; error?: string } {
  const inv = dshInvoke(explicitBin)
  if (!inv) return { ok: false, error: 'dsh CLI 未定位（可在面板填写路径）' }
  const bin = inv.args[inv.args.length - 1]
  const op: Op = {
    id: 'op-' + (++opCounter),
    kind, profile, target, label,
    startedAt: Date.now(),
    status: 'running',
    output: initialOutput || '',
    exitCode: null,
    bin,
    hot: false,
    beforeDeps: readProfileDeps(profile),
  }
  const cwd = inv.cwd ?? profileDir(profile)
  const child = spawn(inv.file, [...inv.args, 'plugin', '--profile', profile, kind === 'uninstall' ? 'remove' : 'add', target], {
    cwd,
    env: { ...process.env, CI: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  op.child = child
  child.stdout.on('data', (d) => { appendOutput(op, d.toString()) })
  child.stderr.on('data', (d) => { appendOutput(op, d.toString()) })
  child.on('error', (err) => {
    if (op.status !== 'running') return
    appendOutput(op, '\n[error] ' + String((err && err.message) || err))
    settleOp(op, 'failed')
  })
  child.on('close', async (code: number) => {
    if (op.status !== 'running') return
    const ok = code === 0
    if (ok && op.kind === 'install' && hotCtx !== null) {
      const mounted = await tryHotMountAll(hotCtx, op.profile, op.beforeDeps)
      if (mounted) {
        op.hot = true
        appendOutput(op, '\n[hot] 已热挂载（无需重启，刷新页面即可使用）\n')
      } else {
        appendOutput(op, '\n[hot] 热挂载不可用（插件 patch 较复杂或环境不支持），重启 web 后生效\n')
      }
    }
    settleOp(op, ok ? 'done' : 'failed', code)
  })
  op.timer = setTimeout(() => {
    if (op.status !== 'running') return
    appendOutput(op, '\n\n[timeout] 操作超过 ' + Math.round(DEFAULT_TIMEOUT / 1000) + ' 秒未完成，已自动终止（可能是网络不通或 pnpm 卡住，可重试）')
    settleOp(op, 'timeout')
    killChild(child)
  }, DEFAULT_TIMEOUT)
  activeOp = op
  return { ok: true, opId: op.id }
}

/** Host ctx for hot-mounting, set by apply(); null in headless/test contexts. */
let hotCtx: any = null

/** Abort the live op (used by the panel and the global progress pill). */
function killOp(): { ok: boolean; error?: string } {
  const op = activeOp
  if (!op || op.status !== 'running') return { ok: false, error: '没有正在运行的任务' }
  appendOutput(op, '\n\n[killed] 已由用户终止')
  settleOp(op, 'killed')
  killChild(op.child)
  return { ok: true }
}

/** Raw manifest mirrors, tried in order; GitHub raw is unstable behind CN networks. */
const RAW_MIRRORS = [
  'https://raw.githubusercontent.com',
  'https://raw.gitmirror.com',
]

/**
 * Classify a github: source. A manifest declaring a web client half is
 * certainly a web-profile plugin and can install without a trial boot.
 */
async function classifyPlugin(source: string): Promise<{ known: boolean; webClient: boolean; fetchFailed?: boolean }> {
  const spec = String(source || '')
  const m = /^github:([^/]+)\/([^/]+?)(?:\.git)?$/.exec(spec)
  if (!m) return { known: false, webClient: false }
  const [, owner, repo] = m
  let pkg: Record<string, any> | null = null
  for (const base of RAW_MIRRORS) {
    try {
      const r = await fetch(`${base}/${owner}/${repo}/HEAD/package.json`, {
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      })
      if (!r.ok) continue
      pkg = await r.json()
      break
    } catch {}
  }
  if (pkg === null || typeof pkg !== 'object') return { known: false, webClient: false, fetchFailed: true }
  const dsh = pkg.dsh && typeof pkg.dsh === 'object' ? pkg.dsh : {}
  const client = dsh.client
  return { known: true, webClient: client !== undefined && client.platform === 'web' }
}

const PROBE_INSTALL_TIMEOUT = 240000
const PROBE_BOOT_TIMEOUT = 120000
const READY_LINE_RE = /dsh web:\s+http:\/\//

/** Trial boot probe: prove the candidate boots under the web profile first. */
async function runProbe(explicitBin: string, source: string): Promise<{ ok: true } | { ok: false; stage: 'install' | 'boot'; output: string }> {
  const inv = dshInvoke(explicitBin)
  if (!inv) return { ok: false, stage: 'install', output: 'dsh CLI 未定位（可在面板填写路径）' }
  const home = mkdtempSync(join(tmpdir(), 'dsh-mkts-probe-'))
  try {
    const profileDir_ = join(home, 'profiles', 'web')
    mkdirSync(profileDir_, { recursive: true })
    writeFileSync(join(profileDir_, 'package.json'), JSON.stringify({
      name: 'dsh-profile-web',
      private: true,
      dependencies: {},
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
    }, null, 2) + '\n')
    writeFileSync(join(profileDir_, 'cordis.patch.yml'), '[]\n')
    writeFileSync(join(profileDir_, 'pnpm-workspace.yaml'), 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n')
    const env = { ...process.env, DSH_HOME: home, CI: 'true' }
    const runCwd = inv.cwd ?? profileDir_

    const install = await spawnCapture(inv.file,
      [...inv.args, 'plugin', '--profile', 'web', 'add', source],
      { cwd: runCwd, env, timeoutMs: PROBE_INSTALL_TIMEOUT })
    if (!install.ok) {
      return { ok: false, stage: 'install', output: install.output }
    }
    const boot = await spawnCapture(inv.file,
      [...inv.args, '--profile', 'web', '--host', '127.0.0.1', '--port', '0'],
      { cwd: runCwd, env, timeoutMs: PROBE_BOOT_TIMEOUT, readyRe: READY_LINE_RE })
    if (boot.ready) return { ok: true }
    return { ok: false, stage: 'boot', output: boot.output }
  } finally {
    try { rmSync(home, { recursive: true, force: true, maxRetries: 3 }) } catch {}
  }
}

function spawnCapture(exe: string, args: string[], { cwd, env, timeoutMs, readyRe }: any): Promise<any> {
  return new Promise((resolve) => {
    const child = spawn(exe, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    let settled = false
    let timer: any
    const finish = (v: any) => { if (settled) return; settled = true; clearTimeout(timer); resolve(v) }
    const onData = (d: any) => {
      output = (output + String(d)).slice(-MAX_OUTPUT)
      if (readyRe && readyRe.test(output)) {
        finish({ ok: true, ready: true, output })
        killChild(child)
      }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('error', (err) => finish({ ok: false, ready: false, output: output + '\n[error] ' + String((err && err.message) || err) }))
    child.on('close', (code: number) => finish({ ok: code === 0, ready: false, code, output }))
    timer = setTimeout(() => {
      finish({ ok: false, ready: false, timedOut: true, output: output + '\n[probe timeout ' + Math.round(timeoutMs / 1000) + 's]' })
      killChild(child)
    }, timeoutMs)
  })
}

/**
 * Snapshot a profile's manifest before a real write, so a later failure can be
 * rolled back by restoring the file.
 */
function snapshotProfile(profile: string): string | null {
  try {
    const p = profileDir(profile) + '/package.json'
    if (!existsSync(p)) return null
    const snap = p + '.mkts-snapshot-' + Date.now() + '.json'
    writeFileSync(snap, readFileSync(p, 'utf8'))
    return snap
  } catch { return null }
}

/** Source whitelist: only sources listed in the curated catalog are installable. */
async function whitelistSource(target: string, plugins: any[]): Promise<{ allowed: boolean; reason?: string }> {
  const spec = String(target || '').trim()
  if (!spec || !/^github:/.test(spec)) return { allowed: true }
  if (!Array.isArray(plugins) || plugins.length === 0) return { allowed: true }
  const normalized = (s: string) => String(s).replace(/^github:/i, '').replace(/\.git$/, '').toLowerCase()
  const needle = normalized(spec)
  const hit = plugins.some((p) => p.source && normalized(p.source) === needle)
  return hit ? { allowed: true } : {
    allowed: false,
    reason: '该插件不在精选目录（awesome-dsh-plugin.com curated registry）中。为安全起见仅允许安装目录收录的源；'
      + '如确需安装，请勾选"跳过安全检查"（风险自负）。',
  }
}

const REGISTRY_URL = 'https://awesome-dsh-plugin.com/plugins.json'
const CATALOG_PAGE_URL = 'https://awesome-dsh-plugin.com/zh/'

function pickLang(lang: string): string {
  return lang === 'en' ? 'en' : 'zh'
}

function fromRegistryPlugin(p: any, lang: string): any {
  const cc = parseCmd(p.install)
  const desc = (p.description && typeof p.description === 'object') ? p.description : {}
  return {
    cat: p.category,
    name: p.name,
    url: p.url,
    by: p.owner,
    desc: desc[lang] || desc.zh || desc.en || '',
    cmd: p.install,
    profile: cc ? cc.profile : 'web',
    source: cc ? cc.source : null,
    stars: typeof p.stars === 'number' ? p.stars : null,
    added: p.added || null,
  }
}

function registryCats(data: any, lang: string): any[] {
  const cats: any[] = []
  const labels = (data.categories && typeof data.categories === 'object') ? data.categories : {}
  cats.push({ id: 'all', label: lang === 'en' ? 'All' : '全部', count: Array.isArray(data.plugins) ? data.plugins.length : 0 })
  for (const id of Object.keys(labels)) {
    const l = labels[id]
    const label = (l && (l[lang] || l.zh || l.en)) || id
    const count = Array.isArray(data.plugins) ? data.plugins.filter((p: any) => p.category === id).length : 0
    cats.push({ id, label, count })
  }
  return cats
}

function registryToCatalog(data: any, lang: string): any {
  const locale = pickLang(lang)
  return {
    plugins: Array.isArray(data.plugins) ? data.plugins.map((p: any) => fromRegistryPlugin(p, locale)) : [],
    cats: registryCats(data, locale),
  }
}

let catalogCache: any = null
const CATALOG_TTL_MS = 5 * 60 * 1000

async function loadCatalog(lang?: string): Promise<{ plugins: any[]; cats: any[]; source: string }> {
  const now = Date.now()
  const locale = pickLang(lang ?? 'zh')
  if (catalogCache && catalogCache.lang === locale && now - catalogCache.at < CATALOG_TTL_MS) {
    return { ...catalogCache.data, source: 'cache' }
  }
  try {
    const r = await fetch(REGISTRY_URL, { redirect: 'follow', signal: AbortSignal.timeout(10000) })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    const data = await r.json()
    const parsed = registryToCatalog(data, locale)
    if (parsed.plugins.length === 0) throw new Error('empty registry')
    catalogCache = { at: now, lang: locale, data: parsed }
    return { ...parsed, source: 'live' }
  } catch {
    try {
      const r = await fetch(CATALOG_PAGE_URL, { redirect: 'follow', signal: AbortSignal.timeout(10000) })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      const parsed = parseSite(await r.text())
      if (parsed.plugins.length === 0) throw new Error('empty catalog')
      catalogCache = { at: now, lang: locale, data: parsed }
      return { ...parsed, source: 'live' }
    } catch {
      try {
        const snap = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'catalog-snapshot.json'), 'utf8'))
        if (Array.isArray(snap.plugins) && snap.plugins.length > 0) return { ...snap, source: 'snapshot' }
      } catch {}
      return { plugins: [], cats: [], source: 'none' }
    }
  }
}

// ── hot mount (restart-free activation) ─────────────────────────────────────

function parseSimplePatch(patchText: string): { id: string; name: string }[] | null {
  const rows: { id: string; name: string }[] = []
  let pending: string | null = null
  for (const raw of String(patchText || '').split('\n')) {
    const line = raw.replace(/#.*$/, '').trimEnd()
    if (line.trim() === '') continue
    if (/^-\s+insert:\s*$/.test(line)) continue
    const id = /^\s+-\s+id:\s*(\S+)\s*$/.exec(line)
    if (id !== null) {
      if (pending !== null) return null
      pending = id[1]
      continue
    }
    const name = /^\s+name:\s*['"]?([^'"\s]+)['"]?\s*$/.exec(line)
    if (name !== null && pending !== null) {
      rows.push({ id: pending, name: name[1] })
      pending = null
      continue
    }
    return null
  }
  if (pending !== null || rows.length === 0) return null
  return rows
}

let hotTreeClass: any = undefined

async function loadHotTreeClass(): Promise<any> {
  if (hotTreeClass !== undefined) return hotTreeClass
  try {
    const mod = await import('@deepseek-ai/cordis-plugin-include')
    const Include = mod.Include
    if (Include === undefined) throw new Error('no Include export')
    class MarketHotTree extends Include {
      write() {}
    }
    hotTreeClass = MarketHotTree
  } catch {
    hotTreeClass = null
  }
  return hotTreeClass
}

function cleanHotDir(profile: string): void {
  try { rmSync(profileDir(profile) + '/.dsh-market', { force: true, recursive: true, maxRetries: 3 }) } catch {}
}

let hotSequence = 0
const hotHandles = new Map<string, any>()

async function hotMount(ctx: any, profile: string, packageName: string): Promise<boolean> {
  try {
    const HotTree = await loadHotTreeClass()
    if (HotTree === null) return false
    const patchText = readFileSync(join(profileDir(profile), 'node_modules', packageName, 'cordis.patch.yml'), 'utf8')
    const rows = parseSimplePatch(patchText)
    if (rows === null) return false
    const dir = join(profileDir(profile), '.dsh-market')
    mkdirSync(dir, { recursive: true })
    hotSequence += 1
    const file = join(dir, 'hot-' + String(hotSequence) + '.yml')
    const yml = rows.map((row) => `- id: mkt-${row.id}\n  name: '${row.name}'\n`).join('')
    writeFileSync(file, yml)
    const handle = ctx.plugin(HotTree, { path: pathToFileURL(file).href })
    await handle.await()
    hotHandles.set(packageName, handle)
    return true
  } catch (e: any) {
    console.warn('[dsh-market] hot mount of ' + packageName + ' failed, restart required: ' + String((e && e.message) || e))
    return false
  }
}

async function disposeHotMount(packageName: string): Promise<void> {
  const handle = hotHandles.get(packageName)
  if (!handle) return
  hotHandles.delete(packageName)
  try {
    await handle.dispose()
  } catch (e: any) {
    console.warn('[dsh-market] dispose of hot mount ' + packageName + ' failed: ' + String((e && e.message) || e))
  }
}

async function disableLoaderEntry(packageName: string): Promise<void> {
  const loader = hotCtx && hotCtx.get('loader')
  if (!loader) return
  let disabled = false
  for (const entry of loader.entries()) {
    if (entry.options && entry.options.name === packageName && !entry.disabled) {
      try {
        await entry.update({ disabled: true })
        disabled = true
      } catch (e: any) {
        console.warn('[dsh-market] disable loader entry ' + packageName + ' failed: ' + String((e && e.message) || e))
      }
    }
  }
  if (disabled) {
    console.log('[dsh-market] disabled loader entry ' + packageName + ' (disable)')
  }
}

async function tryHotMountAll(ctx: any, profile: string, beforeDeps: Record<string, any>): Promise<boolean> {
  try {
    const after = readProfileDeps(profile)
    const added = Object.keys(after).filter((n) => beforeDeps[n] === undefined)
    if (added.length === 0) return false
    const results = await Promise.all(added.map((n) => hotMount(ctx, profile, n)))
    return results.every(Boolean)
  } catch { return false }
}

function readProfileDeps(profile: string): Record<string, any> {
  try {
    const json = JSON.parse(readFileSync(profileDir(profile) + '/package.json', 'utf8'))
    return (json && json.dependencies) || {}
  } catch { return {} }
}

// ── update detection (mirrors dsh-market's checkUpdates) ─────────────────────

function readLockCommits(profile: string): Map<string, string> {
  const commits = new Map<string, string>()
  try {
    const lock = readFileSync(join(profileDir(profile), 'pnpm-lock.yaml'), 'utf8')
    for (const m of lock.matchAll(/codeload\.github\.com\/([^/\s]+\/[^/\s]+)\/tar\.gz\/([0-9a-f]{40})/g)) {
      commits.set(m[1].toLowerCase(), m[2])
    }
  } catch {}
  return commits
}

function readInstalledVersion(profile: string, name: string): string | null {
  try {
    const manifest = JSON.parse(readFileSync(join(profileDir(profile), 'node_modules', name, 'package.json'), 'utf8'))
    return manifest.version ?? null
  } catch { return null }
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'dsh-market' },
    signal: AbortSignal.timeout(6000),
  })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return res.json()
}

function normalizeBundleName(name: string): string {
  return String(name || '').toLowerCase().replace(/^github:/, '')
}

/**
 * Read the ordered, active bundle layer for a profile.
 */
function readProfileBundles(profile: string): string[] {
  try {
    const json = JSON.parse(readFileSync(profileDir(profile) + '/package.json', 'utf8'))
    const b = json && json.dsh && json.dsh.profile && json.dsh.profile.bundles
    return Array.isArray(b) ? b : []
  } catch { return [] }
}

/** Write the ordered, active bundle layer back (reads/writes minimal keys). */
function writeProfileBundles(profile: string, bundles: string[]): boolean {
  const p = profileDir(profile) + '/package.json'
  if (!existsSync(p)) return false
  try {
    const json = JSON.parse(readFileSync(p, 'utf8'))
    json.dsh = json.dsh || {}
    json.dsh.profile = json.dsh.profile || {}
    json.dsh.profile.bundles = bundles
    writeFileSync(p, JSON.stringify(json, null, 2) + '\n')
    return true
  } catch { return false }
}

/**
 * Enable / disable an installed plugin by editing the profile's
 * `dsh.profile.bundles` layer (persistent source of "active"). Disabling keeps
 * the package as a dependency but removes its config layer and disposes the
 * live hot-mount / loader entry so it stops serving immediately. Enabling
 * re-adds the layer and tries to hot-mount for instant effect (else restart).
 * @returns { lastSnapshot?, active, needsRestart } where needsRestart is true
 * when the running composition could not pick the change up live.
 */
async function toggleActive(profile: string, name: string, enabled: boolean): Promise<{ ok: boolean; error?: string; active?: boolean; needsRestart?: boolean; message?: string; lastSnapshot?: string }> {
  const deps = readProfileDeps(profile)
  if (deps[name] === undefined) {
    return { ok: false, error: '插件未安装：' + name }
  }
  const bundles = readProfileBundles(profile)
  const idx = bundles.findIndex((b) => normalizeBundleName(b) === normalizeBundleName(name))
  const present = idx >= 0
  if (enabled && present) return { ok: true, active: true, message: 'already active' }
  if (!enabled && !present) return { ok: true, active: false, message: 'already inactive' }

  const snap = snapshotProfile(profile)
  const next = enabled ? [...bundles.filter((b) => normalizeBundleName(b) !== normalizeBundleName(name)), name] : bundles.filter((b) => normalizeBundleName(b) !== normalizeBundleName(name))
  if (!writeProfileBundles(profile, next)) {
    return { ok: false, error: '写入 profile 失败：' + profileDir(profile) }
  }

  if (!enabled) {
    // Stop serving immediately: dispose hot mount + disable loader entry.
    await disposeHotMount(name)
    await disableLoaderEntry(name)
  }

  // For enable, try live hot-mount (only makes sense if the package declares a
  // simple patch and it isn't already loaded). If it can't mount live, say
  // restart is needed.
  let needsRestart = !enabled
  if (enabled) {
    let mounted = false
    if (hotCtx !== null) {
      try {
        const patchText = existsSync(join(profileDir(profile), 'node_modules', name, 'cordis.patch.yml'))
          ? readFileSync(join(profileDir(profile), 'node_modules', name, 'cordis.patch.yml'), 'utf8')
          : ''
        mounted = parseSimplePatch(patchText) !== null ? await hotMount(hotCtx, profile, name) : false
      } catch { mounted = false }
    }
    needsRestart = !mounted
  }

  return {
    ok: true,
    active: enabled,
    needsRestart,
    lastSnapshot: snap ?? undefined,
    message: enabled
      ? (needsRestart ? 'enabled:restart' : 'enabled:live')
      : 'disabled:live',
  }
}

async function checkUpdates(profile: string): Promise<Record<string, any>> {
  const cached = updatesCache && updatesCache[profile]
  if (cached && Date.now() - cached.at < UPDATES_TTL_MS) return cached.data
  const installed = readProfileDeps(profile)
  const lockCommits = readLockCommits(profile)
  const result: Record<string, any> = {}
  await Promise.all(Object.entries(installed).map(async ([name, spec]) => {
    const version = readInstalledVersion(profile, name)
    if (spec.startsWith('link:') || spec.startsWith('file:')) {
      result[name] = { kind: 'linked', version, current: null, latest: null, updateAvailable: false }
      return
    }
    const gh = /^(?:github:)?([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:#.*)?$/.exec(spec)
    try {
      if (spec.startsWith('github:') && gh !== null) {
        const current = lockCommits.get(gh[1].toLowerCase()) ?? null
        const head = await fetchJson(`https://api.github.com/repos/${gh[1]}/commits/HEAD`)
        const latest = typeof head.sha === 'string' ? head.sha : null
        result[name] = {
          kind: 'github', version, current, latest,
          updateAvailable: current !== null && latest !== null && current !== latest,
        }
      } else {
        const meta = await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`)
        const latest = typeof meta.version === 'string' ? meta.version : null
        result[name] = {
          kind: 'npm', version, current: version, latest,
          updateAvailable: version !== null && latest !== null && version !== latest,
        }
      }
    } catch {
      result[name] = {
        kind: spec.startsWith('github:') ? 'github' : 'npm', version, current: null, latest: null,
        updateAvailable: false,
      }
    }
  }))
  updatesCache = { ...updatesCache, [profile]: { at: Date.now(), data: result } }
  return result
}

const UPDATES_TTL_MS = 10 * 60 * 1000
let updatesCache: Record<string, any> = {}

export { classifyPlugin, runProbe, whitelistSource, loadCatalog, parseSimplePatch, checkUpdates, parseSite, registryToCatalog, toggleActive } // test hooks

export function apply(ctx: any): void {
  const webServer = ctx.get('webServer')
  if (webServer === undefined) {
    console.error('[dsh-market] webServer service unavailable at apply; route not registered')
    return
  }
  hotCtx = ctx
  cleanHotDir('web')
  webServer.register({
    kind: 'exact',
    path: '/api/dsh-market',
    handler: async (req: any, res: any) => {
      try {
        const body = await readBody(req)
        const method = String(body.method || '')
        if (method === 'list') {
          const catalog = await loadCatalog(String(body.lang || ''))
          if (catalog.source === 'none') {
            return sendJson(res, 502, { ok: false, error: 'catalog unavailable (site fetch failed and no snapshot)' })
          }
          return sendJson(res, 200, { ok: true, plugins: catalog.plugins, cats: catalog.cats, source: catalog.source })
        }
        if (method === 'probe') {
          const explicit = String(body.binPath || '').trim()
          let binValid: boolean | null = null
          if (explicit) {
            try { binValid = existsSync(explicit) } catch { binValid = false }
          }
          return sendJson(res, 200, {
            ok: true,
            dshHome: dshHome(),
            node: process.execPath || null,
            cwd: process.cwd(),
            dshBin: dshBin(),
            binProvided: explicit || null,
            binValid,
          })
        }
        if (method === 'installed') {
          const profile = validProfile(body.profile) ? body.profile : 'web'
          const p = profileDir(profile) + '/package.json'
          if (!existsSync(p)) return sendJson(res, 200, { ok: true, profile, bundles: [], dependencies: {} })
          const json = JSON.parse(readFileSync(p, 'utf8'))
          return sendJson(res, 200, {
            ok: true,
            profile,
            bundles: Array.isArray(json.dsh && json.dsh.profile && json.dsh.profile.bundles) ? json.dsh.profile.bundles : [],
            dependencies: json.dependencies || {},
          })
        }
        if (method === 'updates') {
          const profile = validProfile(body.profile) ? body.profile : 'web'
          const updates = await checkUpdates(profile)
          return sendJson(res, 200, { ok: true, profile, updates })
        }
        if (method === 'update') {
          if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'untrusted origin' })
          const profile = validProfile(body.profile) ? body.profile : 'web'
          const name = String(body.name || '').trim()
          if (!name) return sendJson(res, 400, { ok: false, output: '缺少插件名' })
          const deps = readProfileDeps(profile)
          const spec = deps[name]
          if (spec === undefined) return sendJson(res, 200, { ok: false, output: '插件未安装：' + name })
          if (spec.startsWith('link:') || spec.startsWith('file:')) {
            return sendJson(res, 200, { ok: false, output: '本地链接插件从 checkout 更新，无需通过市场更新' })
          }
          if (activeOp && activeOp.status === 'running') {
            return sendJson(res, 200, { ok: false, busy: true, output: '已有任务进行中：' + activeOp.label })
          }
          const target = spec.startsWith('github:') ? spec.replace(/#.*$/, '') : `${name}@latest`
          const label = String(body.label || name)
          updatesCache = { ...updatesCache, [profile]: null }
          const started = startOp('update', profile, target, label, String(body.binPath || '').trim(),
            '更新 ' + name + ' → ' + target + '\n')
          if (!started.ok) return sendJson(res, 200, started)
          return sendJson(res, 200, { ok: true, opId: started.opId, timeoutMs: DEFAULT_TIMEOUT })
        }
        if (method === 'op') {
          const wanted = String(body.opId || '')
          const op = opSnapshot()
          if (op === null) return sendJson(res, 200, { ok: true, op: null })
          if (wanted && op.id !== wanted) return sendJson(res, 200, { ok: true, op: null })
          return sendJson(res, 200, { ok: true, op })
        }
        if (method === 'kill') {
          if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'untrusted origin' })
          return sendJson(res, 200, killOp())
        }
        if (method === 'toggleActive') {
          // Enable/disable an installed plugin (new in fork).
          if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'untrusted origin' })
          const profile = validProfile(body.profile) ? body.profile : 'web'
          const name = String(body.name || '').trim()
          if (!name) return sendJson(res, 400, { ok: false, output: '缺少插件名' })
          const enabled = body.enabled === true
          const result = await toggleActive(profile, name, enabled)
          return sendJson(res, result.ok ? 200 : 200, result)
        }
        if (method === 'install' || method === 'uninstall') {
          if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'untrusted origin' })
          const profile = validProfile(body.profile) ? body.profile : 'web'
          const target = String(method === 'install' ? (body.source || '') : (body.pkg || '')).trim()
          if (!target) return sendJson(res, 400, { ok: false, output: '缺少参数' })
          if (activeOp && activeOp.status === 'running') {
            return sendJson(res, 200, { ok: false, busy: true, output: '已有任务进行中：' + activeOp.label })
          }
          if (method === 'install' && profile === 'web' && !body.skipCheck) {
            const catalog = await loadCatalog()
            const gate = await whitelistSource(target, catalog.plugins)
            if (!gate.allowed) {
              return sendJson(res, 200, { ok: false, refused: true, output: String(gate.reason || '') })
            }
            const bin = String(body.binPath || '').trim() || dshBin()
            if (!bin) return sendJson(res, 200, { ok: false, error: 'dsh CLI 未定位（可在面板填写路径）' })
            const cls = await classifyPlugin(target)
            if (!cls.webClient) {
              const verdict = await runProbe(bin, target)
              if (!verdict.ok) {
                const stage = verdict.stage === 'install'
                  ? '候选插件安装进试装环境失败'
                  : '试装启动验证失败：该插件装进 web profile 无法正常启动'
                return sendJson(res, 200, {
                  ok: false,
                  refused: true,
                  output: stage + '（真实 profile 未受影响，试装目录已清理）：\n\n' + String(verdict.output || '').slice(-8000)
                    + '\n\n如需强制安装（风险自负），请勾选"跳过安全检查"。',
                })
              }
            }
            const snap = snapshotProfile(profile)
            const label = String(body.label || target)
            const started = startOp(method, profile, target, label, bin,
              snap ? '已备份安装前状态：' + snap + '\n' : '')
            if (!started.ok) return sendJson(res, 200, started)
            return sendJson(res, 200, { ok: true, opId: started.opId, timeoutMs: DEFAULT_TIMEOUT })
          }
          const label = String(body.label || target)
          if (method === 'uninstall') {
            await disposeHotMount(target)
            await disableLoaderEntry(target)
          }
          const started = startOp(method, profile, target, label, String(body.binPath || '').trim())
          if (!started.ok) return sendJson(res, 200, started)
          return sendJson(res, 200, { ok: true, opId: started.opId, timeoutMs: DEFAULT_TIMEOUT })
        }
        return sendJson(res, 404, { ok: false, error: 'unknown method ' + method })
      } catch (e: any) {
        return sendJson(res, 500, { ok: false, error: String((e && e.message) || e) })
      }
    },
  })
}
