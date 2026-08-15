// Browser half of the persistent plugin market — fork of @sanqi-normal/dsh-webui-market-plugin.
//
// Loaded through the web plugin loader (window.__ModuleLoader__); React comes
// from the platform module table. Talks to the Host half over the
// /api/dsh-market HTTP route.
//
// Two surfaces, both driven by a module-level op bus (op-bus.ts):
//  - Settings → Plugins → Plugin Market tab (settings.plugins.tab, MarketPanel)
//  - A frame-wide shell.overlay progress pill (GlobalProgress) that stays
//    mounted app-wide, so an install/update keeps showing progress — and a kill
//    button — even after the user navigates to another project/section. This is
//    the fix for "the modal disappears and stops showing the download".
// The op bus state itself is module-level and resumed at apply time, so a
// refresh or tab switch never loses an in-flight op.
import { createElement as h, Fragment, useEffect, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only contributions: pull the settings SlotMap merge (so
// `settings.plugins.tab` is a known key) and the layout SlotMap merge (so
// `shell.overlay` is a known key). Cross-plugin collaboration goes through the
// service, never a value import (client bundle purity gate erases these).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { MARKET_CSS } from './market-css.ts'
import {
  apiOp, closeOpState, executeOpState, getOp, killCurrentOp, minimizeOp, openOp,
  restoreOp, resumeOp, setOnTerminal, setOpLostMessage, setOpState, setSkipCheck, subscribeOp, type OpState,
} from './op-bus.ts'

// ── Locale ───────────────────────────────────────────────────────────────────
let LOCALE = 'en'
try {
  const nl = String((navigator as any).language || (navigator as any).userLanguage || '')
  if (nl.toLowerCase().startsWith('zh')) LOCALE = 'zh'
} catch {}

const STR: Record<string, Record<string, string>> = {
  zh: {
    search: '搜索插件…', all: '全部', instFilter: '已安装', detail: '详情', collapse: '收起',
    install: '安装', uninstall: '卸载', execute: '执行', cancel: '取消', close: '关闭',
    loading: '加载插件目录…', noMatch: '没有匹配的插件',
    binPlaceholder: 'dsh CLI 路径（自动探测失败时填写，已记住上次填写）', reprobe: '重新探测',
    installOk: '安装成功，下次重启 Web 服务后生效', uninstallOk: '卸载成功，下次重启 Web 服务后生效', opFailed: '操作失败',
    hotOk: '安装成功，已热挂载，即将自动刷新页面生效',
    updateOk: '更新成功，下次重启 Web 服务后生效', updateBtn: '更新', updating: '更新中…', upToDate: '已是最新',
    updateFail: '更新检测失败', updLocal: '本地链接',
    running: '执行中…（pnpm 安装可能需要一段时间）',
    cmdLabel: '安装命令（来自官网，含目标 profile）:', noCmd: '（无官方安装命令）',
    hint: '安装后需重启 Web 服务生效；GitHub 源会执行包内 prepare 脚本（验证通过后本市场会自动为该包在 profile 的 pnpm-workspace.yaml 放行构建）。装进 web 前会自动把关：① 读取该仓库的 dsh 清单（声明 dsh.client 的 web 插件直接安装，仅声明 bundle 的走临时环境试装启动验证）；② 验证失败会给出真实错误且不改动现有安装。纯 host 插件装好后会自动热挂载（无需重启）；含 Web 客户端的插件需重启后生效。确实需要强制安装时可勾选"跳过安全检查"（风险自负）。',
    gh: 'GitHub ↗', envLine: '环境', parseFail: '解析失败', fetchFail: '抓取失败',
    submit: '提交任务…', probing: '试装验证中…（临时环境实际启动验证 web 可正常启动后才安装，约 1~6 分钟）', min: '最小化到后台', kill: '终止任务', back: '返回',
    stDone: '完成', stFailed: '失败', stKilled: '已终止', stTimeout: '超时终止',
    stBusy: '已有任务进行中', stRefused: '已拒绝', liveChip: '插件任务',
    elapsed: '已耗时 {s}s（超过 {t}s 自动终止）', newOp: '新任务',
    site: '插件来源',
    sourceNote: '结果实时来自 GitHub topic:dsh-plugin，未经人工审核；请自行确认插件可信后再安装。',
    sortDefault: '默认', sortHot: '最热', sortNew: '最新',
    enable: '启用', disable: '停用', active: '已启用', inactive: '已停用',
    activeLive: '已启用（热挂载生效）', inactiveLive: '已停用（立即生效）',
    toggling: '切换中…',
    progRunning: '安装进行中', progDone: '安装完成', progErr: '安装失败',
    restartBanner: '插件状态已变更，重启 Web 服务后生效', restartHint: '重启后生效',
    restartNow: '立即重启', restarting: '重启中…',
    progMetaCmd: '{kind} {label} · {s}s',
    noActive: '未安装',
    marketTitle: '插件商城',
    marketSubtitle: '搜索并安装 GitHub 上的 dsh 社区插件',
    done: '完成 / 跳过',
    searching: '搜索 GitHub…',
    prev: '上一页',
    next: '下一页',
    totalResults: '共 {n} 个',
    updatedAt: '更新于 {d}',
    quotaHint: 'GitHub 搜索剩余配额（次/分钟）；配置 GITHUB_TOKEN 可提高',
    opLost: '任务状态丢失（服务可能已重启或任务被其他操作接管），请刷新页面后重试',
    waiting: '已等待 {s}s…',
    installedTab: '已安装',
    noInstalled: '还没有安装过第三方插件，去「插件市场」逛逛吧',
    selfUpdate: '插件市场可更新：v{cur} → v{latest}',
    builtin: '内置插件（随 harness 提供，只读）',
    updTo: '→ v{latest}',
    specNote: '安装源',
    liveActive: '运行中',
    livePending: '待加载',
    liveLoading: '加载中',
    liveFailed: '加载失败',
    liveUnloading: '卸载中',
    liveStale: '已启用（重启后生效）',
  },
  en: {
    search: 'Search plugins…', all: 'All', instFilter: 'Installed', detail: 'Details', collapse: 'Collapse',
    install: 'Install', uninstall: 'Uninstall', execute: 'Run', cancel: 'Cancel', close: 'Close',
    loading: 'Loading plugin directory…', noMatch: 'No matching plugins',
    binPlaceholder: 'dsh CLI path (fill when auto-detection fails; remembered)', reprobe: 'Re-probe',
    installOk: 'Installed — restart the web server to activate', uninstallOk: 'Uninstalled — restart the web server to activate', opFailed: 'Operation failed',
    hotOk: 'Installed and hot-mounted — refreshing the page now',
    updateOk: 'Updated — restart the web server to activate', updateBtn: 'Update', updating: 'Updating…', upToDate: 'Up to date',
    updateFail: 'Update check failed', updLocal: 'linked (dev)',
    running: 'Running… (pnpm install may take a while)',
    cmdLabel: 'Install command (from the site, incl. target profile):', noCmd: '(no official install command)',
    hint: 'Restart the web server after install. GitHub sources run the package prepare script (after verification, the market consents the build for exactly that package in the profile pnpm-workspace.yaml). Installing into web is gated: ① the repo\'s dsh manifest is read (a plugin declaring dsh.client installs directly; a bundle-only plugin goes through a trial boot in a throwaway environment); ② a failed verification shows the real error and leaves the current install untouched. Host-only plugins hot-mount after install (no restart); plugins with a web client half need a restart. To force-install anyway, tick "skip safety checks" (at your own risk).',
    gh: 'GitHub ↗', envLine: 'Env', parseFail: 'Parse failed', fetchFail: 'Fetch failed',
    submit: 'Submitting…', probing: 'Trial-boot verifying… (installing into a throwaway env and starting it once to prove web still boots; ~1-6 min)', min: 'Minimize to background', kill: 'Kill task', back: 'Back',
    stDone: 'Done', stFailed: 'Failed', stKilled: 'Killed', stTimeout: 'Timed out',
    stBusy: 'A task is already running', stRefused: 'Refused', liveChip: 'Plugin task',
    elapsed: '{s}s elapsed (auto-kill after {t}s)', newOp: 'New task',
    site: 'Plugin source',
    sourceNote: 'Results come live from GitHub topic:dsh-plugin (unreviewed) — verify a plugin yourself before installing.',
    sortDefault: 'Default', sortHot: 'Top', sortNew: 'New',
    enable: 'Enable', disable: 'Disable', active: 'Active', inactive: 'Inactive',
    activeLive: 'Enabled (hot-mounted)', inactiveLive: 'Disabled (live)',
    toggling: 'Switching…',
    progRunning: 'Install in progress', progDone: 'Install done', progErr: 'Install failed',
    restartBanner: 'Plugin state changed — restart the web server to activate', restartHint: 'Restart required',
    restartNow: 'Restart now', restarting: 'Restarting…',
    progMetaCmd: '{kind} {label} · {s}s',
    noActive: 'Not installed',
    marketTitle: 'Plugin Market',
    marketSubtitle: 'Search and install community dsh plugins from GitHub',
    done: 'Done / Skip',
    searching: 'Searching GitHub…',
    prev: 'Prev',
    next: 'Next',
    totalResults: '{n} total',
    updatedAt: 'Updated {d}',
    quotaHint: 'GitHub search quota remaining (per minute); set GITHUB_TOKEN to raise it',
    opLost: 'Task state lost (the server may have restarted or another task took over); refresh the page and retry',
    waiting: 'Waited {s}s…',
    installedTab: 'Installed',
    noInstalled: 'No third-party plugins installed yet — browse the Plugin Market',
    selfUpdate: 'Market update available: v{cur} → v{latest}',
    builtin: 'Built-in plugins (shipped with the harness, read-only)',
    updTo: '→ v{latest}',
    specNote: 'source',
    liveActive: 'running',
    livePending: 'pending',
    liveLoading: 'loading',
    liveFailed: 'load failed',
    liveUnloading: 'unloading',
    liveStale: 'enabled (restart to load)',
  },
}
const t = (k: string): string => { const m = STR[LOCALE]; return (m && m[k] !== undefined) ? m[k] : (STR['zh'][k] !== undefined ? STR['zh'][k] : k) }
const fmt = (k: string, map: Record<string, unknown>): string => String(t(k)).replace(/\{(\w+)\}/g, (_, n) => String(map[n] !== undefined ? map[n] : ''))

// Page size for the market list; overridable per deployment through the
// plugin's cordis config row (`config: { perPage: 40 }`), clamped to 1..100.
let MARKET_PER_PAGE = 50

// ── Catalog helpers ──────────────────────────────────────────────────────────
function repoNameOf(url: any): string {
  const s = String(url || '').replace(/\/+$/, '')
  const i = s.lastIndexOf('/')
  return i >= 0 ? s.slice(i + 1) : s
}

function repoOfValue(v: any): string {
  const s = String(v || '').replace(/\/+$/, '')
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf(':'))
  return s.slice(i + 1).replace(/\.git$/, '').replace(/#.*$/, '')
}

// Installed state is keyed per profile. installedPkgName matches one profile's
// dependency keys/values against the plugin's GitHub repo basename.
function installedPkgName(plugin: any, installed: any): string | null {
  if (!installed) return null
  const repo = repoNameOf(plugin.url).toLowerCase()
  const deps = installed.dependencies || {}
  for (const key of Object.keys(deps)) {
    const k = key.toLowerCase()
    if (k === repo || k.endsWith('/' + repo) || k === 'github:' + repo) return key
    if (repoOfValue(deps[key]).toLowerCase() === repo) return key
  }
  for (const b of installed.bundles || []) {
    const n = String(b || '').toLowerCase()
    if (n === repo || n.endsWith('/' + repo) || n === 'github:' + repo) return b
  }
  return null
}

function isInstalled(plugin: any, installedMap: any): boolean {
  const state = installedMap && installedMap[plugin.profile || 'web']
  return installedPkgName(plugin, state) !== null
}

// Whether the plugin's package is currently in the profile's active bundle
// layer (i.e. enabled). Bundles entries may include wildcard-suffixed or
// github-prefixed names; normalize before comparing.
function isActive(plugin: any, installedMap: any): boolean {
  const state = installedMap && installedMap[plugin.profile || 'web']
  const pkgName = installedPkgName(plugin, state)
  if (!pkgName || !state) return false
  const norm = (s: string) => String(s).toLowerCase().replace(/^github:/, '').replace(/\.git$/, '').replace(/#.*$/, '')
  const needle = norm(pkgName)
  // Bundle plugins activate through the bundles layer; client-only plugins
  // (dsh.client, no dsh.bundle) activate through their synthetic client row.
  return (state.bundles || []).some((b: string) => norm(b) === needle)
    || (Array.isArray(state.clientRows) && state.clientRows.some((b: string) => norm(b) === needle))
}

/** Active-state descriptor for installed cards. */
function actClass(plugin: any, installed: any, active: boolean): string {
  return active ? 'on' : 'inactive'
}

// ── GlobalProgress: frame-wide shell.overlay indicator ───────────────────────
// Stays mounted app-wide, so an op's progress (and its kill button) are never
// lost by navigating to another project/section. Also shows a restart banner
// with a one-click restart that polls until the replacement server answers.
let reloadAttempts = 0

/** Poll the origin until the restarted server answers, then reload the page. */
function pollReload(): void {
  reloadAttempts += 1
  if (reloadAttempts > 60) { reloadAttempts = 0; return } // give up after ~2 min
  fetch(window.location.origin + '/', { cache: 'no-store' }).then((r) => {
    if (r.ok) { try { location.reload() } catch {} }
    else setTimeout(pollReload, 2000)
  }).catch(() => { setTimeout(pollReload, 2000) })
}

function GlobalProgress(): ReactNode {
  const [, force] = useState(0)
  const [restarting, setRestarting] = useState(false)
  useEffect(() => subscribeOp(() => force((n) => n + 1)), [])
  // Local 1s ticker: the starting phase has no server-side elapsed updates,
  // and without this the pill's timer would sit frozen at 0s.
  const [, tick] = useState(0)
  useEffect(() => {
    const iv = setInterval(() => tick((n) => n + 1), 1000)
    return () => { clearInterval(iv) }
  }, [])
  const op = getOp()
  if (!op || op.phase === 'confirm') return null

  const running = op.phase === 'starting' || op.phase === 'running'
  const colored = op.phase === 'done' ? (op.ok ? 'done' : 'err') : ''
  const kindLabel = op.kind === 'install' ? t('install') : op.kind === 'update' ? t('updateBtn') : t('uninstall')
  const elapsedS = op.phase === 'starting'
    ? Math.max(0, Math.round((Date.now() - (op.startingAt || Date.now())) / 1000))
    : Math.round((op.elapsedMs || 0) / 1000)

  const title = running
    ? (kindLabel + ' · ' + op.label)
    : op.phase === 'done'
      ? (op.ok
        ? (op.hot ? t('hotOk') : (op.kind === 'install' ? t('installOk') : t('updateOk')))
        : t('progErr') + ' · ' + op.label)
      : ''

  const meta = running
    ? fmt('progMetaCmd', { kind: kindLabel, label: op.label, s: elapsedS })
    : (op.status === 'killed' ? t('stKilled') : op.status === 'timeout' ? t('stTimeout')
      : (op.kind === 'install' ? (op.hot ? t('progDone') : t('restartHint')) : ''))

  // Restart banner: successful install/update that was NOT hot-mounted.
  const needRestart = op.phase === 'done' && op.ok && op.hot !== true && op.kind !== 'uninstall'

  const requestRestart = (): void => {
    if (restarting) return
    setRestarting(true)
    apiOp('restart').then((r) => {
      if (r && r.ok) { pollReload(); return }
      setRestarting(false)
    }).catch(() => { setRestarting(false) })
  }

  return h('div', { className: 'mkts mkts-prog' },
    needRestart
      ? h('div', { className: 'mkts-restart' },
          h('span', { style: { flex: 1 } }, t('restartBanner')),
          h('button', { className: 'mkts-restart-btn', disabled: restarting, onClick: requestRestart },
            restarting ? t('restarting') : t('restartNow')),
        )
      : null,
    h('div', { className: 'mkts-prog-bar ' + colored, onClick: running ? minimizeOp : closeOpState, title },
      running ? h('span', { className: 'mkts-prog-spin' }) : null,
      h('div', { className: 'mkts-prog-body' },
        h('div', { className: 'mkts-prog-title' }, title),
        h('div', { className: 'mkts-prog-meta' }, meta),
      ),
      h('div', { className: 'mkts-prog-actions' },
        running
          ? h('button', {
              className: 'mkts-prog-kill',
              onClick: (e: MouseEvent) => { e.stopPropagation(); killCurrentOp() },
              title: t('kill'),
            }, t('kill'))
          : h('button', { className: 'mkts-prog-open', onClick: closeOpState }, t('close')),
      ),
    ),
  )
}

// ── MarketPanel: the Settings → Plugins → Plugin Market tab ─────────────────
// `embedded` hides the advanced host diagnostics (dsh CLI path / env probe) for
// surfaces like the startup onboarding step, which need only search + install.
function MarketPanel(props: { embedded?: boolean }): ReactElement {
  const embedded = !!props.embedded
  const [data, setData] = useState<any>({ phase: 'loading', plugins: [], cats: [], installed: null, updates: null, error: null })
  const [envInfo, setEnvInfo] = useState<any>(null)
  const [binPath, setBinPath] = useState<string>((() => { try { return localStorage.getItem('mktsBin') || '' } catch { return '' } })())
  const [query, setQuery] = useState('')
  const [showInstalled, setShowInstalled] = useState(false)
  const [sortBy, setSortBy] = useState('stars')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<string | null>(null)
  const [, force] = useState(0)
  // Local 1s ticker: keeps the starting-phase waiting timer moving between
  // (infrequent) op-bus updates.
  const [, tick] = useState(0)
  // Top of the panel: paging swaps the whole list, so jump the viewport back
  // here (the pager otherwise leaves the user stuck at the bottom).
  const topRef = useRef<HTMLDivElement | null>(null)
  const op = getOp()

  useEffect(() => {
    const iv = setInterval(() => tick((n) => n + 1), 1000)
    return () => { clearInterval(iv) }
  }, [])

  useEffect(() => {
    const off = subscribeOp(() => force((n) => n + 1))
    return off
  }, [])

  const changeBin = (v: string): void => { setBinPath(v); try { localStorage.setItem('mktsBin', v) } catch {} }

  const probe = (): void => {
    apiOp('probe', { binPath }).then((r) => setEnvInfo(r)).catch(() => setEnvInfo({ error: 'probe failed' }))
  }

  const loadInstalled = (plugins?: any[]): void => {
    const list = plugins || data.plugins || []
    const profiles = [...new Set(list.map((p: any) => p.profile || 'web').concat('web'))]
    Promise.all(profiles.map((profile) => apiOp('installed', { profile }).then((r) => [profile, r]).catch(() => [profile, null])))
      .then((entries) => {
        const webEntry = (entries as any[]).find(([profile]) => profile === 'web')
        const self = webEntry && webEntry[1] && webEntry[1].self ? webEntry[1].self : null
        setData((d: any) => ({ ...d, installed: Object.fromEntries(entries), self }))
      })
      .catch(() => setData((d: any) => ({ ...d, installed: null })))
    Promise.all(profiles.map((profile) => apiOp('updates', { profile }).then((r) => [profile, r && r.ok ? (r.updates || {}) : {}]).catch(() => [profile, {}])))
      .then((entries) => setData((d: any) => ({ ...d, updates: Object.fromEntries(entries) })))
      .catch(() => setData((d: any) => ({ ...d, updates: null })))
  }

  useEffect(() => { probe() }, [])

  const PER_PAGE = MARKET_PER_PAGE // items per page (deployment-configurable)
  const MAX_RESULTS = 1000 // GitHub search API caps pagination at 1000 total results
  // Monotonic request id: only the latest search may write results (a slow
  // earlier response must not overwrite the newer one).
  const searchSeq = useRef(0)

  // Number of available pages for a GitHub total (capped at 1000 results).
  const pageCount = (total: number): number => Math.max(1, Math.ceil(Math.min(total, MAX_RESULTS) / PER_PAGE))

  // Failure message that keeps an already-loaded list visible (rate limits and
  // network errors show as a notice instead of blanking the page).
  const failNotice = (message: string): void => {
    setData((d: any) => (d.phase === 'ready' ? { ...d, notice: message } : { ...d, phase: 'error', error: message }))
  }

  // One search request for a page (replaces the list).
  const runSearch = (q: string, sort: string, pageNum: number): void => {
    const sortParam = sort === 'updated' ? 'updated' : 'stars'
    const seq = ++searchSeq.current
    apiOp('search', { q, sort: sortParam, order: 'desc', perPage: PER_PAGE, page: pageNum }).then((r) => {
      if (seq !== searchSeq.current) return // stale response
      if (!r || !r.ok) {
        failNotice(String((r && r.error) || 'search failed'))
        return
      }
      const plugins = r.plugins || []
      setData((d: any) => ({ ...d, phase: 'ready', notice: null, plugins, cats: [], total: typeof r.total === 'number' ? r.total : null, rate: r.rate ?? null }))
      loadInstalled(plugins)
    }).catch((e) => {
      if (seq !== searchSeq.current) return // stale failure
      failNotice(t('fetchFail') + ': ' + String((e && e.message) || e))
    })
  }

  // Real-time GitHub search (server-side, debounced). Empty query returns the
  // topic's most-starred repositories; typing narrows the query after a short
  // debounce so each keystroke does not burn the unauthenticated rate limit.
  useEffect(() => {
    setPage(1)
    const timer = setTimeout(() => {
      setData((d: any) => ({ ...d, phase: 'loading', error: null }))
      runSearch(query, sortBy, 1)
    }, query.trim() === '' ? 0 : 350)
    return () => { clearTimeout(timer) }
  }, [query, sortBy])

  // Turn to a specific page (1-based), clamped to the available range.
  const goPage = (n: number): void => {
    const total = typeof data.total === 'number' ? data.total : (data.plugins || []).length
    if (n < 1 || n > pageCount(total) || n === page) return
    setPage(n)
    runSearch(query, sortBy, n)
    topRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  // Refresh installed/active state when an op settles (install/update/uninstall/
  // enable-disable change the profile).
  useEffect(() => subscribeOp((o) => {
    if (!o || o.phase !== 'done') return
    loadInstalled()
  }), [])

  const toggle = (p: any, active: boolean): void => {
    const pkgName = installedPkgName(p, data.installed && data.installed[p.profile || 'web'])
    if (!pkgName) { openOp('install', p.source, p.name, p.profile); return }
    setToggling(p.url)
    apiOp('toggleActive', { profile: p.profile, name: pkgName, enabled: !active }).then((r) => {
      setToggling(null)
      if (r && r.ok) {
        setData((d: any) => ({ ...d, toast: r.error ? r.error : (r.needsRestart ? t('restartBanner') : (r.active ? t('activeLive') : t('inactiveLive'))) }))
        loadInstalled()
      } else {
        setData((d: any) => ({ ...d, toast: String((r && r.error) || t('opFailed')) }))
      }
    }).catch(() => { setToggling(null) })
  }
  const [toggling, setToggling] = useState<string | null>(null)

  // The server already scopes results to the query + sort; the client only
  // applies the "installed" filter locally (and keeps the server order).
  const filtered = (data.plugins || []).filter((p: any) => {
    if (showInstalled && !isInstalled(p, data.installed)) return false
    return true
  })

  const installedCount = (data.plugins || []).filter((p: any) => isInstalled(p, data.installed)).length

  const sorted = sortBy === 'updated'
    ? [...filtered].sort((a: any, b: any) => String(b.added || '').localeCompare(String(a.added || '')))
    : filtered

  const groups: { id: string; label: string | null; items: any[] }[] = [{ id: 'all', label: null, items: sorted }]

  const totalCount = typeof data.total === 'number' ? data.total : (data.plugins || []).length
  const totalPages = pageCount(totalCount)

  const binOk = envInfo && (envInfo.dshBin || (envInfo.binProvided && envInfo.binValid))
  const envReady = envInfo && binOk && envInfo.node && envInfo.dshHome

  const statusText = (s: string): string => ({
    done: t('stDone'), failed: t('stFailed'), killed: t('stKilled'),
    timeout: t('stTimeout'), busy: t('stBusy'), refused: t('stRefused'),
  })[s] || t('opFailed')

  const opTitle = (o: OpState): string => (o.kind === 'install' ? t('install') : o.kind === 'update' ? t('updateBtn') : t('uninstall')) + ' ' + o.label

  const modal = op && !op.minimized ? h('div', { className: 'mkts-modal-bg', onClick: () => { if (op.phase === 'running' || op.phase === 'starting') minimizeOp(); else closeOpState() } },
    h('div', { className: 'mkts-modal', onClick: (e: MouseEvent) => e.stopPropagation() },
      h('h4', null, opTitle(op)),
      h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', fontFamily: 'ui-monospace,monospace' } },
        op.kind === 'uninstall'
          ? 'dsh plugin --profile ' + op.profile + ' remove ' + op.target
          : op.kind === 'update'
            ? 'dsh plugin --profile ' + op.profile + ' add <latest ' + op.target + '>'
            : 'dsh plugin --profile ' + op.profile + ' add ' + op.target),
      op.phase === 'confirm' ? h('div', null,
        h('div', { className: 'mkts-cmdrow' },
          h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, '✓ ' + t('cmdLabel').replace(':', '') + ''),
          h('button', { className: 'mkts-cmdbtn mkts-cmdbtn-primary', onClick: () => executeOpState(binPath) }, t('execute')),
          h('button', { className: 'mkts-cmdbtn', onClick: closeOpState }, t('cancel')),
        ),
        op.kind === 'install' ? h('label', { className: 'mkts-skipcheck' },
          h('input', { type: 'checkbox', checked: !!op.skipCheck, onChange: (e) => setSkipCheck(e.target.checked) }),
          h('span', null, LOCALE === 'zh' ? '跳过安全检查（跳过 dsh 清单校验与试装验证，风险自负：可能装坏 web 启动）' : 'Skip safety checks (skip dsh-manifest verification and trial boot; risky: may break web boot)'),
        ) : null,
      ) : null,
      op.phase === 'starting' ? h('div', { className: 'mkts-cmdrow' },
        h('span', { className: 'mkts-spin' }), h('span', { style: { fontSize: 12 } },
          ((op.kind === 'install' && op.profile === 'web' && !op.skipCheck) ? t('probing') : t('submit'))
            + ' · ' + fmt('waiting', { s: Math.max(0, Math.round((Date.now() - (op.startingAt || Date.now())) / 1000)) })),
      ) : null,
      op.phase === 'running' ? h('div', null,
        h('div', { className: 'mkts-cmdrow' },
          h('span', { className: 'mkts-spin' }),
          h('span', { style: { fontSize: 12 } },
            t('running') + ' · ' + fmt('elapsed', { s: Math.round((op.elapsedMs || 0) / 1000), t: op.timeoutMs ? Math.round(op.timeoutMs / 1000) : 120 })),
          h('button', { className: 'mkts-cmdbtn', onClick: minimizeOp }, t('min')),
          h('button', { className: 'mkts-cmdbtn mkts-cmdbtn-danger', onClick: killCurrentOp }, t('kill')),
        ),
        op.output ? h('div', { className: 'mkts-log' }, op.output) : null,
      ) : null,
      op.phase === 'done' ? h('div', null,
        h('div', { style: { fontSize: 12, fontWeight: 600, color: op.ok ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-label-error)' } },
          op.ok
            ? (op.kind === 'install'
              ? (op.hot ? t('hotOk') : t('installOk'))
              : op.kind === 'update'
                ? t('updateOk')
                : t('uninstallOk'))
            : statusText(op.status || '') + (op.exitCode !== null && op.exitCode !== undefined ? ' (exit ' + op.exitCode + ')' : '')),
        op.output ? h('div', { className: 'mkts-log' }, op.output) : null,
        h('div', { className: 'mkts-cmdrow' }, h('button', { className: 'mkts-cmdbtn', onClick: closeOpState }, t('close'))),
      ) : null,
    )) : null

  const liveChip = op && op.minimized ? h('button', {
    className: 'mkts-livechip' + (op.phase === 'done' ? (op.ok ? ' mkts-livechip-done' : ' mkts-livechip-err') : ''),
    onClick: restoreOp,
    title: op.label,
  },
    op.phase === 'done' ? (op.ok ? t('stDone') : statusText(op.status || '')) : t('liveChip'),
    ' · ' + op.label,
  ) : null

  const toast = data.toast

  return h('div', { className: 'mkts', ref: topRef },
    toast ? h('div', { className: 'mkts-err' }, toast) : null,
    data.self && data.self.updateAvailable ? h('div', { className: 'mkts-selfupdate' },
      h('span', { style: { flex: 1 } }, fmt('selfUpdate', { cur: data.self.version, latest: data.self.latestVersion })),
      h('button', { className: 'mkts-cmdbtn mkts-cmdbtn-primary', disabled: !!(op && op.phase !== 'done'), onClick: () => openOp('update', data.self.name, data.self.name, 'web') }, t('updateBtn')),
    ) : null,
    data.notice ? h('div', { className: 'mkts-notice' }, data.notice) : null,
    embedded ? null : envInfo ? h('div', { className: 'mkts-env' + (envReady ? '' : ' mkts-env-bad') },
      t('envLine') + ': DSH_HOME ' + (envInfo.dshHome ? '✓ ' + envInfo.dshHome : '✗') + ' · node ' + (envInfo.node ? '✓' : '✗') + ' · dsh ' + (binOk ? '✓' : '✗') +
      (envInfo.proxy ? ' · proxy ✓ ' + envInfo.proxy : ' · proxy ✗（直连）') +
      ((!envInfo.dshBin && !(envInfo.binProvided && envInfo.binValid)) ? ' — dsh CLI 未定位' : ''),
    ) : null,
    embedded ? null : h('div', { className: 'mkts-bin-row' },
      h('input', { className: 'mkts-bin-input', placeholder: t('binPlaceholder'), value: binPath, onChange: (e) => changeBin(e.target.value) }),
      h('button', { className: 'mkts-cmdbtn', onClick: probe }, t('reprobe')),
    ),
    h('div', { className: 'mkts-site' },
      h('span', null, t('site') + ': '),
      h('a', { href: 'https://github.com/topics/dsh-plugin', target: '_blank', rel: 'noopener noreferrer' },
        'github.com/topics/dsh-plugin'),
      h('span', null, ' ↗'),
    ),
    h('div', { className: 'mkts-source-note' }, t('sourceNote')),
    modal,
    h('div', { className: 'mkts-finder' },
      h('div', { className: 'mkts-row1' },
        h('input', { className: 'mkts-search', placeholder: t('search'), value: query, onChange: (e) => setQuery(e.target.value) }),
        liveChip,
        h('span', { className: 'mkts-count' }, showInstalled ? (filtered.length + ' ' + t('instFilter')) : fmt('totalResults', { n: totalCount })),
        data.rate && data.rate.remaining !== null && data.rate.remaining !== undefined ? h('span', { className: 'mkts-quota', title: t('quotaHint') },
          'GH ' + data.rate.remaining + '/' + (data.rate.limit ?? '?')) : null,
      ),
      h('div', { className: 'mkts-chips' },
        h('button', {
          className: 'mkts-chip' + (showInstalled ? ' mkts-chip-on' : ''),
          onClick: () => { setShowInstalled(!showInstalled) },
        }, t('instFilter'), ' ', h('small', null, installedCount)),
        h('div', { className: 'mkts-sort' },
          [['stars', t('sortHot')], ['updated', t('sortNew')]].map(([key, label]) =>
            h('button', { key, className: sortBy === key ? 'on' : '', onClick: () => setSortBy(key) }, label))),
      ),
    ),
    data.phase === 'loading' ? h('div', null, t('loading')) : null,
    data.phase === 'error' ? h('div', { className: 'mkts-err' }, data.error) : null,
    data.phase === 'ready' ? groups.map((g) => h('div', { key: g.id },
      g.label ? h('div', { className: 'mkts-sec' }, g.label, h('small', null, g.items.length)) : null,
      g.items.map((p: any, i: number) => {
        const inst = isInstalled(p, data.installed)
        const active = isActive(p, data.installed)
        const isOpen = open === p.url
        const opActive = !!(op && op.phase !== 'done')
        const isToggling = toggling === p.url
        return h('div', { key: p.url, className: 'mkts-item' },
          h('span', { className: 'mkts-no' }, '№ ' + String(i + 1).padStart(2, '0')),
          h('div', { className: 'mkts-main' },
            h('h3', null,
              h('a', { href: p.url, target: '_blank', rel: 'noopener noreferrer' }, p.name),
              typeof p.stars === 'number' ? h('span', { className: 'mkts-stars' }, '★ ' + p.stars) : null,
              p.by ? h('span', { className: 'mkts-by' }, '@' + p.by) : null,
              h('a', { className: 'mkts-gh', href: p.url, target: '_blank', rel: 'noopener noreferrer' }, t('gh')),
            ),
            p.desc ? h('p', { className: 'mkts-desc' }, p.desc) : null,
            Array.isArray(p.topics) && p.topics.length > 0 ? h('div', { className: 'mkts-topics' },
              p.topics.slice(0, 6).map((topic: string) => h('span', { key: topic, className: 'mkts-topic' }, topic)),
            ) : null,
            (p.lang || p.license || p.added) ? h('div', { className: 'mkts-meta' },
              p.lang ? h('span', null, p.lang) : null,
              p.license ? h('span', null, p.license) : null,
              p.added ? h('span', null, fmt('updatedAt', { d: String(p.added).slice(0, 10) })) : null,
            ) : null,
            isOpen ? h('div', { className: 'mkts-detail' },
              h('div', null, t('cmdLabel')),
              h('code', null, p.cmd || t('noCmd')),
              h('div', { className: 'mkts-hint' }, t('hint')),
            ) : null,
          ),
          h('div', { className: 'mkts-actions' },
            h('span', { className: 'mkts-state ' + (inst ? (active ? 'mkts-state-on' : 'mkts-state-inactive') : 'mkts-state-off') },
              inst ? (active ? t('active') : t('inactive')) : t('noActive')),
            h('button', { className: 'mkts-cmdbtn', onClick: () => setOpen(isOpen ? null : p.url) }, isOpen ? t('collapse') : t('detail')),
            inst
              ? h(Fragment, null,
                  h('button', {
                    className: 'mkts-cmdbtn' + (active ? ' mkts-cmdbtn-danger' : ' mkts-cmdbtn-primary'),
                    disabled: opActive || isToggling,
                    onClick: () => toggle(p, active),
                  }, isToggling ? t('toggling') : (active ? t('disable') : t('enable'))),
                  (() => {
                    const pkgName = installedPkgName(p, data.installed && data.installed[p.profile || 'web'])
                    const up = pkgName && data.updates && data.updates[p.profile || 'web'] && data.updates[p.profile || 'web'][pkgName]
                    if (!up) return h('button', { className: 'mkts-cmdbtn', disabled: true, title: t('updateFail') }, t('upToDate'))
                    if (up.kind === 'linked') return h('span', { className: 'mkts-state mkts-state-off' }, t('updLocal'))
                    if (up.updateAvailable) {
                      return h('button', {
                        className: 'mkts-cmdbtn',
                        disabled: opActive,
                        onClick: () => openOp('update', pkgName, p.name, p.profile),
                      }, t('updateBtn') + (up.latest ? ' (' + String(up.latest).slice(0, 8) + ')' : ''))
                    }
                    return h('span', { className: 'mkts-state mkts-state-on' }, t('upToDate'))
                  })(),
                  h('button', { className: 'mkts-cmdbtn mkts-cmdbtn-danger', disabled: opActive, onClick: () => openOp('uninstall', installedPkgName(p, data.installed && data.installed[p.profile || 'web']) || p.name, p.name, p.profile) }, t('uninstall')))
              : (p.source ? h('button', { className: 'mkts-cmdbtn mkts-cmdbtn-primary', disabled: opActive, onClick: () => openOp('install', p.source, p.name, p.profile) }, t('install')) : null),
          ),
        )
      }),
    )) : null,
    data.phase === 'ready' && totalPages > 1 ? h('div', { className: 'mkts-pager' },
      h('button', { className: 'mkts-cmdbtn', disabled: page <= 1, onClick: () => goPage(page - 1) }, t('prev')),
      h('span', { className: 'mkts-pager-info' }, page + ' / ' + totalPages),
      h('button', { className: 'mkts-cmdbtn', disabled: page >= totalPages, onClick: () => goPage(page + 1) }, t('next')),
    ) : null,
    data.phase === 'ready' && filtered.length === 0 ? h('div', { className: 'mkts-hint' }, t('noMatch')) : null,
  )
}

// ── MarketOnboarding: the startup onboarding entry ────────────────────────────
// The `settings.onboarding` slot mounts one ordered step at a time; a step owns
// its visible chrome and hands control back via the owner's `complete`. This
// step wraps the same MarketPanel in a full-screen modal so a fresh user meets
// the market during first run (before any session exists), with a Done/Skip
// action that never blocks onboarding.
//
// The coordinator only remembers completions for the current page load, so the
// step persists its own "seen" flag in localStorage: on later loads it renders
// null and completes itself immediately instead of popping up again. (Same
// pattern as the in-tree welcome/model onboarding steps, which persist their
// acknowledgement through settings.)
const ONBOARDING_DONE_KEY = 'mktsOnboardingDone'

function MarketOnboarding(props: { complete?: () => void }): ReactNode {
  const [done, setDone] = useState<boolean>(() => {
    try { return localStorage.getItem(ONBOARDING_DONE_KEY) === '1' } catch { return false }
  })

  // Already seen on a previous load: advance the coordinator without showing
  // anything, so the market never blocks the flow (and never pops up again).
  useEffect(() => {
    if (done && props.complete) props.complete()
  }, [])

  const finish = (): void => {
    try { localStorage.setItem(ONBOARDING_DONE_KEY, '1') } catch {}
    setDone(true)
    if (props.complete) props.complete()
  }

  if (done) return null
  return h('div', { className: 'mkts-ob' },
    h('div', { className: 'mkts-ob-scrim', onClick: finish }),
    h('div', { className: 'mkts-ob-card', onClick: (e: MouseEvent) => e.stopPropagation() },
      h('div', { className: 'mkts-ob-header' },
        h('div', { className: 'mkts-ob-title' },
          h('h2', null, t('marketTitle')),
          h('p', null, t('marketSubtitle')),
        ),
        h('button', { className: 'mkts-cmdbtn mkts-cmdbtn-primary', onClick: finish }, t('done')),
      ),
      h('div', { className: 'mkts-ob-body' }, h(MarketPanel, { embedded: true })),
    ),
  )
}

// ── InstalledPanel: the dedicated 已安装 tab ──────────────────────────────────
// Lists user-installed (third-party) plugins with enable/disable, update, and
// uninstall actions, plus a self-update banner for the market itself. Built-in
// template bundles are read-only and collapsed behind a toggle.

/**
 * State badge for an installed row, upgraded from the two-state
 * enabled/disabled pill to the runtime loader phase when the host reports one
 * (`live`): running (green) when the fiber is ACTIVE, load-failed (red) when
 * FAILED, neutral transitional labels for pending/loading/unloading, and a
 * neutral "enabled (restart to load)" when the file state says enabled but no
 * loader entry exists in this process. Disabled rows keep the old badge.
 */
function liveBadge(p: any): ReactElement {
  if (!p.enabled) return h('span', { className: 'mkts-state mkts-state-inactive' }, t('inactive'))
  if (p.live === 'active') return h('span', { className: 'mkts-state mkts-state-on' }, t('liveActive'))
  if (p.live === 'failed') return h('span', { className: 'mkts-state mkts-state-inactive' }, t('liveFailed'))
  if (p.live === null) return h('span', { className: 'mkts-state mkts-state-off' }, t('liveStale'))
  const label = p.live === 'loading' ? t('liveLoading') : p.live === 'unloading' ? t('liveUnloading') : t('livePending')
  return h('span', { className: 'mkts-state mkts-state-off' }, label)
}

function InstalledPanel(): ReactElement {
  const [data, setData] = useState<any>({ phase: 'loading', plugins: [], self: null, toast: null })
  const [toggling, setToggling] = useState<string | null>(null)
  const [showBuiltin, setShowBuiltin] = useState(false)

  const load = (): void => {
    apiOp('installed', { profile: 'web' }).then((r) => {
      setData((d: any) => ({
        ...d,
        phase: 'ready',
        plugins: (r && Array.isArray(r.plugins) && r.plugins) || (d && d.plugins) || [],
        self: (r && r.self) || null,
      }))
    }).catch(() => setData((d: any) => ({ ...d, phase: 'error' })))
  }

  useEffect(() => { load() }, [])
  useEffect(() => subscribeOp((o) => {
    if (!o || o.phase !== 'done') return
    load()
  }), [])

  const toggle = (row: any): void => {
    setToggling(row.name)
    apiOp('toggleActive', { profile: 'web', name: row.name, enabled: !row.enabled }).then((r) => {
      setToggling(null)
      if (r && r.ok) {
        setData((d: any) => ({ ...d, toast: r.needsRestart ? t('restartBanner') : (r.active ? t('activeLive') : t('inactiveLive')) }))
        load()
      } else {
        setData((d: any) => ({ ...d, toast: String((r && (r.error || r.output)) || t('opFailed')) }))
      }
    }).catch((e) => {
      setToggling(null)
      setData((d: any) => ({ ...d, toast: String((e && e.message) || t('opFailed')) }))
    })
  }

  const installed = (data.plugins || []).filter((p: any) => p.kind === 'installed')
  const builtin = (data.plugins || []).filter((p: any) => p.kind === 'builtin')
  const opActive = !!(getOp() && getOp()!.phase !== 'done')

  return h('div', { className: 'mkts' },
    data.toast ? h('div', { className: 'mkts-err' }, data.toast) : null,
    data.self && data.self.updateAvailable ? h('div', { className: 'mkts-selfupdate' },
      h('span', { style: { flex: 1 } }, fmt('selfUpdate', { cur: data.self.version, latest: data.self.latestVersion })),
      h('button', {
        className: 'mkts-cmdbtn mkts-cmdbtn-primary',
        disabled: opActive,
        onClick: () => openOp('update', data.self.name, data.self.name, 'web'),
      }, t('updateBtn')),
    ) : null,
    data.phase === 'loading' ? h('div', null, t('loading')) : null,
    data.phase === 'error' ? h('div', { className: 'mkts-err' }, t('fetchFail')) : null,
    installed.length === 0 && data.phase === 'ready' ? h('div', { className: 'mkts-hint' }, t('noInstalled')) : null,
    installed.map((p: any) => h('div', { key: p.name, className: 'mkts-item' },
      h('div', { className: 'mkts-main' },
        h('h3', null,
          p.name,
          p.version ? h('span', { className: 'mkts-by' }, 'v' + p.version) : null,
          p.updateAvailable ? h('span', { className: 'mkts-state mkts-state-inactive' }, t('updTo').replace('{latest}', String(p.latestVersion ?? '?'))) : null,
        ),
        p.spec ? h('div', { className: 'mkts-meta' }, h('span', null, t('specNote') + ': ' + String(p.spec))) : null,
      ),
      h('div', { className: 'mkts-actions' },
        liveBadge(p),
        h('button', {
          className: 'mkts-cmdbtn' + (p.enabled ? '' : ' mkts-cmdbtn-primary'),
          disabled: opActive || toggling === p.name,
          onClick: () => toggle(p),
        }, toggling === p.name ? t('toggling') : (p.enabled ? t('disable') : t('enable'))),
        p.updateAvailable ? h('button', {
          className: 'mkts-cmdbtn',
          disabled: opActive,
          onClick: () => openOp('update', p.name, p.name, 'web'),
        }, t('updateBtn')) : null,
        h('button', {
          className: 'mkts-cmdbtn mkts-cmdbtn-danger',
          disabled: opActive,
          onClick: () => openOp('uninstall', p.name, p.name, 'web'),
        }, t('uninstall')),
      ),
    )),
    builtin.length > 0 ? h('div', { className: 'mkts-builtin' },
      h('button', { className: 'mkts-cmdbtn', onClick: () => setShowBuiltin(!showBuiltin) },
        (showBuiltin ? t('collapse') : t('builtin')) + ' (' + builtin.length + ')'),
      showBuiltin ? builtin.map((p: any) => h('div', { key: p.name, className: 'mkts-builtin-row' },
        h('span', null, p.name),
        h('span', { className: 'mkts-by' }, p.version ? 'v' + p.version : ''),
        h('span', { className: 'mkts-by' + (p.live === 'failed' ? ' mkts-live-bad' : '') },
          p.live === 'active' ? t('liveActive')
          : p.live === 'failed' ? t('liveFailed')
          : p.live === 'loading' ? t('liveLoading')
          : p.live === 'pending' ? t('livePending')
          : p.live === 'unloading' ? t('liveUnloading') : ''),
      )) : null,
    ) : null,
  )
}

// ── Plugin body ──────────────────────────────────────────────────────────────
export const inject = ['slots']

export function apply(ctx: ClientContext, config: Record<string, unknown> = {}): void {
  const slots = ctx.slots
  if (slots === undefined) return
  const perPage = Number(config?.perPage)
  if (Number.isInteger(perPage) && perPage >= 1 && perPage <= 100) MARKET_PER_PAGE = perPage

  // Module-level op bus: resume a running op from a prior page load and wire
  // the terminal side effect (refresh installed state / hot reload page).
  resumeOp()
  setOnTerminal((o) => {
    if (o.kind === 'install' && o.ok && o.hot) {
      setTimeout(() => { try { location.reload() } catch {} }, 1600)
    }
  })
  setOpLostMessage(t('opLost'))

  ctx.effect(() => {
    const id = 'dsh-market-style'
    if (!document.getElementById(id)) {
      const s = document.createElement('style')
      s.id = id
      s.textContent = MARKET_CSS
      document.head.appendChild(s)
    }
    return () => { const el = document.getElementById(id); if (el) el.remove() }
  }, 'market-style')

  // The Plugins → Plugin Market tab.
  slots.inject('settings.plugins.tab', () => slots.register(
    { name: 'settings.plugins.tab', id: 'market', order: 5, label: () => (LOCALE === 'zh' ? '插件市场' : 'Plugin Market') },
    MarketPanel,
  ))

  // The dedicated Installed tab: third-party plugins with manage actions.
  slots.inject('settings.plugins.tab', () => slots.register(
    { name: 'settings.plugins.tab', id: 'installed', order: 6, label: () => t('installedTab') },
    InstalledPanel,
  ))

  // The startup onboarding step (first-run plugin market on the launch page).
  slots.inject('settings.onboarding', () => slots.register(
    { name: 'settings.onboarding', id: 'plugin-market', order: 10 },
    MarketOnboarding,
  ))

  // The frame-wide, never-lost install progress indicator.
  slots.inject('shell.overlay', () => slots.register(
    { name: 'shell.overlay', id: 'market-progress', order: -50 },
    GlobalProgress,
  ))
}

export { GlobalProgress, MarketPanel, MarketOnboarding, InstalledPanel }
