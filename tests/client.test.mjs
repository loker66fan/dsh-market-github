// Client smoke for dsh-webui-market-plugin-plus: load lib/client.js through a
// fake __ModuleLoader__ + react stub, verify the module shape (bundle id =
// package name), that apply() registers BOTH the settings.plugins.tab (market)
// and the shell.overlay (global progress) seats, and that the enable/disable
// active-state matching works. Run: node --test tests/client.test.mjs
import { readFileSync } from 'node:fs'

const require0 = (await import('node:module')).createRequire
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

const React = {
  createElement: (...a) => ({ tag: 'el', args: a }),
  Fragment: Symbol('Fragment'),
  useState: (init) => [init, () => {}],
  useEffect: () => {},
  useRef: (v) => ({ current: v }),
}
let loaded = null
globalThis.window = { __ModuleLoader__: { load: (handoff) => { loaded = handoff } } }
globalThis.document = {
  head: { appendChild: () => {} },
  getElementById: () => null,
  createElement: () => ({ remove: () => {} }),
}
Object.defineProperty(globalThis, 'navigator', { value: { language: 'zh-CN' }, configurable: true })
// resumeOp() calls fetch('/api/dsh-market'...) safely — stub a no-op so no real
// request leaves the test.
globalThis.fetch = (() => new Promise((res) => res({ json: () => Promise.resolve({ ok: true, op: null }) })))
// location used by apply-side terminal reload; stub minimally.
globalThis.location = { reload: () => {} }

const src = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const require = (spec) => {
  if (spec === 'react' || spec === 'react/jsx-runtime') return React
  throw new Error('unexpected require: ' + spec)
}
const factory = new Function('require', src + '\n;return typeof module !== "undefined" ? module.exports : undefined')
factory(require)

let failures = 0
function check(name, ok, detail) {
  if (ok) console.log('PASS ' + name)
  else { console.error('FAIL ' + name + ': ' + String(detail)); failures++ }
}

if (!loaded) { console.error('FAIL: __ModuleLoader__.load never called'); process.exit(1) }
check('bundle id equals package name', loaded.id === pkg.name, loaded.id + ' != ' + pkg.name)

const mod = loaded.factory(require)
check('module shape', mod && Array.isArray(mod.inject) && typeof mod.apply === 'function')
check('inject = slots', mod.inject && mod.inject.join(',') === 'slots')

// apply() registers the market tab and the global progress overlay.
let regs = []
const ctx = {
  get(name) {
    if (name === 'slots') {
      return {
        inject(key, cb) { regs.push({ key, reg: cb() }) },
        register(opts, Component) { return { opts, Component } },
      }
    }
    return undefined
  },
  effect(fn) { const r = fn(); if (typeof r === 'function') r(); return r },
}
mod.apply(ctx)
const tab = regs.find((r) => r.key === 'settings.plugins.tab')
const overlay = regs.find((r) => r.key === 'shell.overlay')
check('registers settings.plugins.tab', !!tab)
check('tab id=market order=5', tab && tab.reg && tab.reg.opts.id === 'market' && tab.reg.opts.order === 5)
check('tab label localized', tab && typeof tab.reg.opts.label === 'function' && typeof tab.reg.opts.label() === 'string')
check('tab component is function', tab && typeof tab.reg.Component === 'function')
check('registers shell.overlay (global progress)', !!overlay)
check('overlay component is function', overlay && typeof overlay.reg.Component === 'function')

// --- enable/disable active-state matching (new in fork) ---
// Extract the pure matchers from the bundle source (production code, not a
// reimplementation) and exercise the active/inactive logic.
function extractFunction(source, name) {
  // minified/renamed functions may appear as `function foo(` — match that.
  const re = new RegExp('function\\s+' + name + '\\s*\\(')
  const start = source.search(re)
  if (start < 0) { console.error('FAIL: function not found in client.js: ' + name); throw new Error('missing ' + name) }
  const open = source.indexOf('{', start)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  throw new Error('unbalanced braces while extracting ' + name)
}
const matchers = new Function(
  extractFunction(src, 'repoNameOf') + '\n' +
  extractFunction(src, 'repoOfValue') + '\n' +
  extractFunction(src, 'installedPkgName') + '\n' +
  extractFunction(src, 'isActive') + '\n' +
  extractFunction(src, 'isInstalled') + '\n' +
  '; return { installedPkgName, isActive, isInstalled }',
)()

// Installed-not-active: present in dependencies but missing from bundles.
const stateInactive = { dependencies: { 'dsh-better-sidebar': '^1.0.0' }, bundles: ['@deepseek-ai/dsh-base'] }
const plugin = { url: 'https://github.com/omdsh-dev/DSH-better-sidebar', profile: 'web' }
check('installed true when in deps', matchers.isInstalled(plugin, { web: stateInactive }) === true)
check('active false when not in bundles', matchers.isActive(plugin, { web: stateInactive }) === false)

// Active: present in both deps and bundles.
const stateActive = { dependencies: { 'dsh-better-sidebar': '^1.0.0' }, bundles: ['@deepseek-ai/dsh-base', 'dsh-better-sidebar'] }
check('active true when in bundles', matchers.isActive(plugin, { web: stateActive }) === true)

// Scoped + github-prefixed bundle entry, mixed case (issue #1 normalization).
const scoped = { dependencies: { '@anionex/DSH-VISION-TOOLKIT': '^1.0.0' }, bundles: ['@anionex/dsh-vision-toolkit'] }
check('isActive normalizes scoped bundle case', matchers.isActive({ url: 'https://github.com/Anionex/dsh-vision-toolkit', profile: 'web' }, { web: scoped }) === true)

// Missing profile state → not installed, not active.
const empty = {}
check('installed false with no state', matchers.isInstalled(plugin, { web: empty }) === false)
check('active false with no state', matchers.isActive(plugin, { web: empty }) === false)

if (failures > 0) process.exit(1)
console.log('ALL PASS')
