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
import { createElement as h, Fragment, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
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
  restoreOp, resumeOp, setOnTerminal, setOpState, setSkipCheck, subscribeOp, type OpState,
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
    hint: '安装后需重启 Web 服务生效；GitHub 源会执行包内 prepare 脚本（pnpm allowBuilds 需放行）。安装进 web 前会做两层安全把关：① 只允许安装精选目录收录的源；② 试装验证——在临时环境实际启动一次，确认 web 能正常启动才写入真实 profile。验证失败会给出真实启动错误且不改动现有安装；简单插件装好后会自动热挂载（无需重启）。确实需要强制安装时可勾选"跳过安全检查"（风险自负）。',
    gh: 'GitHub ↗', envLine: '环境', parseFail: '解析失败', fetchFail: '抓取失败',
    submit: '提交任务…', probing: '试装验证中…（临时环境实际启动验证 web 可正常启动后才安装，约 1~6 分钟）', min: '最小化到后台', kill: '终止任务', back: '返回',
    stDone: '完成', stFailed: '失败', stKilled: '已终止', stTimeout: '超时终止',
    stBusy: '已有任务进行中', stRefused: '已拒绝', liveChip: '插件任务',
    elapsed: '已耗时 {s}s（超过 {t}s 自动终止）', newOp: '新任务',
    site: '插件目录来源',
    sortDefault: '默认', sortHot: '最热', sortNew: '最新',
    enable: '启用', disable: '停用', active: '已启用', inactive: '已停用',
    activeLive: '已启用（热挂载生效）', inactiveLive: '已停用（立即生效）',
    toggling: '切换中…',
    progRunning: '安装进行中', progDone: '安装完成', progErr: '安装失败',
    restartBanner: '插件状态已变更，重启 Web 服务后生效', restartHint: '重启后生效',
    progMetaCmd: '{kind} {label} · {s}s',
    noActive: '未安装',
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
    hint: 'Restart the web server after install. GitHub sources run the package prepare script (pnpm allowBuilds). Installing into web is gated twice: ① only sources from the curated catalog are accepted; ② a trial boot installs the plugin into a throwaway environment and starts it once — only a clean boot (the dsh web: readiness line) allows the install, and on failure the real boot error is shown with nothing modified. Simple plugins are hot-mounted after install (no restart). To force-install anyway, tick "skip safety checks" (at your own risk).',
    gh: 'GitHub ↗', envLine: 'Env', parseFail: 'Parse failed', fetchFail: 'Fetch failed',
    submit: 'Submitting…', probing: 'Trial-boot verifying… (installing into a throwaway env and starting it once to prove web still boots; ~1-6 min)', min: 'Minimize to background', kill: 'Kill task', back: 'Back',
    stDone: 'Done', stFailed: 'Failed', stKilled: 'Killed', stTimeout: 'Timed out',
    stBusy: 'A task is already running', stRefused: 'Refused', liveChip: 'Plugin task',
    elapsed: '{s}s elapsed (auto-kill after {t}s)', newOp: 'New task',
    site: 'Plugin directory source',
    sortDefault: 'Default', sortHot: 'Top', sortNew: 'New',
    enable: 'Enable', disable: 'Disable', active: 'Active', inactive: 'Inactive',
    activeLive: 'Enabled (hot-mounted)', inactiveLive: 'Disabled (live)',
    toggling: 'Switching…',
    progRunning: 'Install in progress', progDone: 'Install done', progErr: 'Install failed',
    restartBanner: 'Plugin state changed — restart the web server to activate', restartHint: 'Restart required',
    progMetaCmd: '{kind} {label} · {s}s',
    noActive: 'Not installed',
  },
}
const t = (k: string): string => { const m = STR[LOCALE]; return (m && m[k] !== undefined) ? m[k] : (STR['zh'][k] !== undefined ? STR['zh'][k] : k) }
const fmt = (k: string, map: Record<string, unknown>): string => String(t(k)).replace(/\{(\w+)\}/g, (_, n) => String(map[n] !== undefined ? map[n] : ''))

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
  return (state.bundles || []).some((b: string) => norm(b) === needle)
}

/** Active-state descriptor for installed cards. */
function actClass(plugin: any, installed: any, active: boolean): string {
  return active ? 'on' : 'inactive'
}

// ── GlobalProgress: frame-wide shell.overlay indicator ───────────────────────
// Stays mounted app-wide, so an op's progress (and its kill button) are never
// lost by navigating to another project/section. Also shows a restart banner.
function GlobalProgress(): ReactNode {
  const [, force] = useState(0)
  useEffect(() => subscribeOp(() => force((n) => n + 1)), [])
  const op = getOp()
  if (!op || op.phase === 'confirm') return null

  const running = op.phase === 'starting' || op.phase === 'running'
  const colored = op.phase === 'done' ? (op.ok ? 'done' : 'err') : ''
  const kindLabel = op.kind === 'install' ? t('install') : op.kind === 'update' ? t('updateBtn') : t('uninstall')

  const title = running
    ? (kindLabel + ' · ' + op.label)
    : op.phase === 'done'
      ? (op.ok
        ? (op.hot ? t('hotOk') : (op.kind === 'install' ? t('installOk') : t('updateOk')))
        : t('progErr') + ' · ' + op.label)
      : ''

  const meta = running
    ? fmt('progMetaCmd', { kind: kindLabel, label: op.label, s: Math.round((op.elapsedMs || 0) / 1000) })
    : (op.status === 'killed' ? t('stKilled') : op.status === 'timeout' ? t('stTimeout')
      : (op.kind === 'install' ? (op.hot ? t('progDone') : t('restartHint')) : ''))

  // Restart banner: successful install/update that was NOT hot-mounted.
  const needRestart = op.phase === 'done' && op.ok && op.hot !== true && op.kind !== 'uninstall'

  return h('div', { className: 'mkts mkts-prog' },
    needRestart
      ? h('div', { className: 'mkts-restart' },
          h('span', { style: { flex: 1 } }, t('restartBanner')),
          h('span', { style: { fontSize: 11, color: 'var(--dsw-static-deepseek-500)' } }, t('restartHint')),
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
function MarketPanel(): ReactNode {
  const [data, setData] = useState<any>({ phase: 'loading', plugins: [], cats: [], installed: null, updates: null, error: null })
  const [envInfo, setEnvInfo] = useState<any>(null)
  const [binPath, setBinPath] = useState<string>((() => { try { return localStorage.getItem('mktsBin') || '' } catch { return '' } })())
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState('all')
  const [showInstalled, setShowInstalled] = useState(false)
  const [sortBy, setSortBy] = useState('default')
  const [open, setOpen] = useState<string | null>(null)
  const [, force] = useState(0)
  const op = getOp()

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
      .then((entries) => setData((d: any) => ({ ...d, installed: Object.fromEntries(entries) })))
      .catch(() => setData((d: any) => ({ ...d, installed: null })))
    Promise.all(profiles.map((profile) => apiOp('updates', { profile }).then((r) => [profile, r && r.ok ? (r.updates || {}) : {}]).catch(() => [profile, {}])))
      .then((entries) => setData((d: any) => ({ ...d, updates: Object.fromEntries(entries) })))
      .catch(() => setData((d: any) => ({ ...d, updates: null })))
  }

  useEffect(() => { probe() }, [])

  useEffect(() => {
    let alive = true
    setData((d: any) => ({ ...d, phase: 'loading', error: null }))
    const finish = (r: any) => {
      if (!alive || !r || !r.ok) throw new Error((r && r.error) || 'empty')
      setData((d: any) => ({ ...d, phase: 'ready', plugins: r.plugins || [], cats: r.cats || [] }))
      loadInstalled(r.plugins || [])
    }
    apiOp('list', { lang: LOCALE }).then(finish).catch((e) => {
      if (!alive) return
      setData((d: any) => ({ ...d, phase: 'error', error: t('fetchFail') + ': ' + String((e && e.message) || e) }))
    })
    return () => { alive = false }
  }, [])

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

  const filtered = (data.plugins || []).filter((p: any) => {
    if (cat !== 'all' && p.cat !== cat) return false
    if (showInstalled && !isInstalled(p, data.installed)) return false
    const q = query.trim().toLowerCase()
    if (q && !((p.name || '').toLowerCase().includes(q) || (p.desc || '').toLowerCase().includes(q) || (p.by || '').toLowerCase().includes(q))) return false
    return true
  })

  const installedCount = (data.plugins || []).filter((p: any) => isInstalled(p, data.installed)).length

  const sorted = sortBy === 'hot'
    ? [...filtered].sort((a: any, b: any) => (b.stars ?? -1) - (a.stars ?? -1))
    : sortBy === 'new'
      ? [...filtered].sort((a: any, b: any) => String(b.added || '').localeCompare(String(a.added || '')))
      : filtered

  let groups: { id: string; label: string | null; items: any[] }[] = []
  if (cat === 'all' && !showInstalled) {
    for (const c of data.cats || []) {
      if (c.id === 'all') continue
      const items = sorted.filter((p: any) => p.cat === c.id)
      if (items.length > 0) groups.push({ id: c.id, label: c.label, items })
    }
  } else {
    groups.push({ id: 'sel', label: null, items: sorted })
  }

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
          h('span', null, LOCALE === 'zh' ? '跳过安全检查（来源白名单 + 试装验证，风险自负：可能装坏 web 启动）' : 'Skip safety checks (source whitelist + trial boot; risky: may break web boot)'),
        ) : null,
      ) : null,
      op.phase === 'starting' ? h('div', { className: 'mkts-cmdrow' },
        h('span', { className: 'mkts-spin' }), h('span', { style: { fontSize: 12 } },
          (op.kind === 'install' && op.profile === 'web' && !op.skipCheck) ? t('probing') : t('submit')),
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

  return h('div', { className: 'mkts' },
    toast ? h('div', { className: 'mkts-err' }, toast) : null,
    envInfo ? h('div', { className: 'mkts-env' + (envReady ? '' : ' mkts-env-bad') },
      t('envLine') + ': DSH_HOME ' + (envInfo.dshHome ? '✓ ' + envInfo.dshHome : '✗') + ' · node ' + (envInfo.node ? '✓' : '✗') + ' · dsh ' + (binOk ? '✓' : '✗') +
      ((!envInfo.dshBin && !(envInfo.binProvided && envInfo.binValid)) ? ' — dsh CLI 未定位' : ''),
    ) : null,
    h('div', { className: 'mkts-bin-row' },
      h('input', { className: 'mkts-bin-input', placeholder: t('binPlaceholder'), value: binPath, onChange: (e) => changeBin(e.target.value) }),
      h('button', { className: 'mkts-cmdbtn', onClick: probe }, t('reprobe')),
    ),
    h('div', { className: 'mkts-site' },
      h('span', null, t('site') + ': '),
      h('a', { href: LOCALE === 'zh' ? 'https://awesome-dsh-plugin.com/zh/' : 'https://awesome-dsh-plugin.com/', target: '_blank', rel: 'noopener noreferrer' },
        LOCALE === 'zh' ? 'https://awesome-dsh-plugin.com/zh/' : 'https://awesome-dsh-plugin.com/'),
      h('span', null, ' ↗'),
    ),
    modal,
    h('div', { className: 'mkts-finder' },
      h('div', { className: 'mkts-row1' },
        h('input', { className: 'mkts-search', placeholder: t('search'), value: query, onChange: (e) => setQuery(e.target.value) }),
        liveChip,
        h('span', { className: 'mkts-count' }, filtered.length + ' / ' + (data.plugins || []).length),
      ),
      h('div', { className: 'mkts-chips' },
        (data.cats || []).map((c: any) => h('button', {
          key: c.id,
          className: 'mkts-chip' + (cat === c.id && !showInstalled ? ' mkts-chip-on' : ''),
          onClick: () => { setCat(c.id); setShowInstalled(false) },
        }, (c.id === 'all' ? t('all') : c.label), ' ', h('small', null, c.count))),
        h('button', {
          className: 'mkts-chip' + (showInstalled ? ' mkts-chip-on' : ''),
          onClick: () => { setShowInstalled(!showInstalled); setCat('all') },
        }, t('instFilter'), ' ', h('small', null, installedCount)),
        h('div', { className: 'mkts-sort' },
          [['default', t('sortDefault')], ['hot', t('sortHot')], ['new', t('sortNew')]].map(([key, label]) =>
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
    data.phase === 'ready' && filtered.length === 0 ? h('div', { className: 'mkts-hint' }, t('noMatch')) : null,
  )
}

// ── Plugin body ──────────────────────────────────────────────────────────────
export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  const slots = ctx.slots
  if (slots === undefined) return

  // Module-level op bus: resume a running op from a prior page load and wire
  // the terminal side effect (refresh installed state / hot reload page).
  resumeOp()
  setOnTerminal((o) => {
    if (o.kind === 'install' && o.ok && o.hot) {
      setTimeout(() => { try { location.reload() } catch {} }, 1600)
    }
  })

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

  // The frame-wide, never-lost install progress indicator.
  slots.inject('shell.overlay', () => slots.register(
    { name: 'shell.overlay', id: 'market-progress', order: -50 },
    GlobalProgress,
  ))
}

export { GlobalProgress, MarketPanel }
