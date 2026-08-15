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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { request as httpRequest } from 'node:http';
export const name = 'dsh-market-github';
/** Hard dependency: the HTTP carrier and the tool registry must exist before
 * apply (the model tools register on `ctx.tools`; every shipped profile
 * mounts dsh-tools). */
export const inject = ['webServer', 'tools'];
const DEFAULT_TIMEOUT = 120000;
/** The single live background op (one at a time keeps the CLI's pnpm serial). */
let activeOp = null;
let opCounter = 0;
function dshHome() {
    return process.env.DSH_HOME || (homedir() + '/.dsh');
}
// ── Device proxy auto-detection ──────────────────────────────────────────────
// Install children (pnpm/git) inherit the process environment, so the market
// detects the machine's proxy ONCE and applies it to process.env — no
// hardcoded port. Detection order: explicit env vars, platform system proxy
// (macOS scutil / Windows registry / GNOME gsettings), then a probe of the
// common local proxy ports (Clash, mihomo, v2rayN, …).
/** Common local proxy ports, tried in likeliest-first order. */
const PROXY_PORT_CANDIDATES = [7890, 7897, 7891, 7899, 10808, 10809, 1080, 8888, 8118];
/** Memoized detection promise (null = not started). */
let proxyPromise = null;
let detectedProxyUrl = null;
function execOutput(file, args) {
    return new Promise((resolve, reject) => {
        execFile(file, args, { timeout: 2500, windowsHide: true }, (error, stdout) => {
            if (error)
                reject(error);
            else
                resolve(String(stdout || ''));
        });
    });
}
/** Read the OS system-proxy settings; empty string when none/unsupported. */
async function systemProxyUrl() {
    try {
        if (process.platform === 'darwin') {
            // scutil --proxy: HTTPEnable/HTTPPort/HTTPSEnable/HTTPSPort/HTTPProxy
            const out = await execOutput('scutil', ['--proxy']);
            const m = /HTTPEnable\s*:\s*1[\s\S]*?HTTPProxy\s*:\s*(\S+)[\s\S]*?HTTPPort\s*:\s*(\d+)/.exec(out);
            if (m)
                return `http://${m[1]}:${m[2]}`;
        }
        else if (process.platform === 'win32') {
            const enable = await execOutput('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'ProxyEnable']);
            if (/0x1/.test(enable)) {
                const server = await execOutput('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'ProxyServer']);
                const m = /ProxyServer\s+REG_SZ\s+(.+)/.exec(server);
                if (m) {
                    const v = m[1].trim();
                    return /^https?:\/\//.test(v) ? v : `http://${v}`;
                }
            }
        }
        else {
            const mode = await execOutput('gsettings', ['get', 'org.gnome.system.proxy', 'mode']);
            if (/manual/.test(mode)) {
                const host = (await execOutput('gsettings', ['get', 'org.gnome.system.proxy.http', 'host'])).trim().replace(/^'|'$/g, '');
                const port = (await execOutput('gsettings', ['get', 'org.gnome.system.proxy.http', 'port'])).trim();
                if (host && /^\d+$/.test(port))
                    return `http://${host}:${port}`;
            }
        }
    }
    catch { }
    return '';
}
/** Whether the local port answers as an HTTP proxy (GET-through-probe). */
function probeProxyPort(port) {
    return new Promise((resolve) => {
        const req = httpRequest({
            host: '127.0.0.1', port, method: 'GET',
            path: 'https://www.gstatic.com/generate_204',
            headers: { Host: 'www.gstatic.com', Connection: 'close' },
            timeout: 1500,
        }, (res) => {
            res.resume();
            // 204 = proxy works; 5xx = proxy answered but upstream unreachable —
            // both prove the port is a proxy. Plain servers 400/404 a full-URL path.
            resolve(res.statusCode === 204 || (res.statusCode !== undefined && res.statusCode >= 500));
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
        req.end();
    });
}
/** Detect the device proxy URL: env vars, system settings, then port probes. */
async function detectProxy() {
    const env = process.env.HTTP_PROXY || process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.ALL_PROXY || process.env.all_proxy;
    if (env)
        return env;
    const system = await systemProxyUrl();
    if (system)
        return system;
    for (const port of PROXY_PORT_CANDIDATES) {
        if (await probeProxyPort(port))
            return `http://127.0.0.1:${port}`;
    }
    return null;
}
/** Run detection once; on success, apply it to process.env for all children. */
function ensureProxyDetected() {
    if (proxyPromise === null) {
        proxyPromise = detectProxy().then((url) => {
            detectedProxyUrl = url;
            if (url !== null) {
                if (process.env.HTTP_PROXY === undefined && process.env.http_proxy === undefined)
                    process.env.HTTP_PROXY = url;
                if (process.env.HTTPS_PROXY === undefined && process.env.https_proxy === undefined)
                    process.env.HTTPS_PROXY = url;
                if (process.env.NO_PROXY === undefined && process.env.no_proxy === undefined)
                    process.env.NO_PROXY = 'localhost,127.0.0.1';
            }
            return url;
        }).catch(() => null);
    }
    return proxyPromise;
}
/** Wait up to `maxMs` for proxy detection before an install child spawns. */
async function waitProxyReady(maxMs) {
    await Promise.race([ensureProxyDetected(), new Promise((resolve) => setTimeout(resolve, maxMs))]);
}
/**
 * Resolve the dsh CLI entry. Prefers the exact entry that launched THIS host
 * process, falls back to the checkout's bin or $DSH_BIN.
 */
function dshInvoke(explicit) {
    if (explicit && explicit.trim()) {
        return invokeEntry(explicit.trim());
    }
    const entry = process.argv[1];
    if (entry !== undefined && /[\\/](?:bin\.(?:js|ts)|dsh)$/.test(entry)) {
        return invokeEntry(entry);
    }
    const cand = process.cwd().replace(/[\\/]+$/, '') + '/apps/cli/lib/bin.js';
    try {
        if (existsSync(cand))
            return { file: process.execPath, args: [cand], cwd: undefined };
    }
    catch { }
    if (process.env.DSH_BIN)
        return invokeEntry(process.env.DSH_BIN);
    return null;
}
function invokeEntry(entry) {
    const isTs = /\.ts$/.test(entry);
    const loader = isTs && !process.execArgv.some((a) => String(a).includes('tsx'))
        ? ['--import', 'tsx']
        : [];
    return {
        file: process.execPath,
        args: [...process.execArgv, ...loader, entry],
        cwd: isTs ? dirname(entry) : undefined,
    };
}
/** The resolved CLI entry path, for display/probing; null when undetectable. */
function dshBin(explicit) {
    const inv = dshInvoke(explicit);
    return inv === null ? null : inv.args[inv.args.length - 1];
}
function profileDir(profile) {
    return dshHome().replace(/[\\/]+$/, '') + '/profiles/' + profile;
}
function readBody(req) {
    return new Promise((resolve) => {
        let raw = '';
        req.on('data', (chunk) => { raw += chunk; });
        req.on('end', () => {
            try {
                resolve(JSON.parse(raw || '{}'));
            }
            catch {
                resolve({});
            }
        });
        req.on('error', () => resolve({}));
    });
}
/** Same-origin check: the browser's Origin host must equal the request Host. */
function sameOrigin(req) {
    const origin = req.headers && req.headers.origin;
    const host = req.headers && req.headers.host;
    if (origin === undefined || host === undefined)
        return false;
    try {
        return new URL(origin).host === host;
    }
    catch {
        return false;
    }
}
function sendJson(res, status, obj) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(obj));
}
/** Whether the request socket is a direct loopback client (not a forwarder). */
function isLoopback(req) {
    const addr = req.socket && req.socket.remoteAddress;
    return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}
/** Non-null while a restart is already scheduled (a second one stacks never). */
let restartTimer = null;
/**
 * Relaunch the exact dsh entry — same argv, execArgv, environment, and working
 * directory — as a detached replacement, then exit this process so the new one
 * can take the port. The route that calls this is restricted to same-origin
 * direct loopback requests; the exit delay is generous enough for the HTTP
 * response to flush first.
 */
function scheduleRestart() {
    if (restartTimer !== null)
        return { ok: true };
    const args = [...process.execArgv, ...process.argv.slice(1)];
    try {
        const child = spawn(process.execPath, args, { cwd: process.cwd(), env: process.env, detached: true, stdio: 'ignore' });
        child.unref();
    }
    catch (e) {
        return { ok: false, error: '重启失败：' + String((e && e.message) || e) };
    }
    restartTimer = setTimeout(() => { process.exit(0); }, 400);
    return { ok: true };
}
function validProfile(p) {
    return typeof p === 'string' && /^[A-Za-z0-9_-]+$/.test(p);
}
function opSnapshot() {
    if (!activeOp)
        return null;
    const { id, kind, profile, target, label, startedAt, status, output, exitCode, bin, hot } = activeOp;
    return {
        id, kind, profile, target, label, startedAt,
        status, output: String(output || '').slice(-20000), exitCode,
        elapsedMs: Date.now() - startedAt,
        timeoutMs: DEFAULT_TIMEOUT,
        bin: bin || null,
        hot: hot === true,
    };
}
/** Kill a running child, killing its whole process tree on Windows. */
function killChild(child) {
    try {
        if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        }
        else {
            child.kill();
        }
    }
    catch { }
}
/** Terminal output cap: pnpm logs can be large; keep the tail only. */
const MAX_OUTPUT = 200000;
function appendOutput(op, text) {
    op.output = (op.output + String(text)).slice(-MAX_OUTPUT);
}
/** Settle an op to a terminal status and drop its pending timeout timer. */
function settleOp(op, status, exitCode) {
    clearTimeout(op.timer);
    op.status = status;
    if (exitCode !== undefined)
        op.exitCode = exitCode;
}
/** Start one install/uninstall/update as a background op. */
function startOp(kind, profile, target, label, explicitBin, initialOutput) {
    const inv = dshInvoke(explicitBin);
    if (!inv)
        return { ok: false, error: 'dsh CLI 未定位（可在面板填写路径）' };
    const bin = inv.args[inv.args.length - 1];
    const op = {
        id: 'op-' + (++opCounter),
        kind, profile, target, label,
        startedAt: Date.now(),
        status: 'running',
        output: initialOutput || '',
        exitCode: null,
        bin,
        hot: false,
        beforeDeps: readProfileDeps(profile),
    };
    const cwd = inv.cwd ?? profileDir(profile);
    const child = spawn(inv.file, [...inv.args, 'plugin', '--profile', profile, kind === 'uninstall' ? 'remove' : 'add', target], {
        cwd,
        env: { ...process.env, CI: 'true' },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    op.child = child;
    child.stdout.on('data', (d) => { appendOutput(op, d.toString()); });
    child.stderr.on('data', (d) => { appendOutput(op, d.toString()); });
    child.on('error', (err) => {
        if (op.status !== 'running')
            return;
        appendOutput(op, '\n[error] ' + String((err && err.message) || err));
        settleOp(op, 'failed');
    });
    child.on('close', async (code) => {
        if (op.status !== 'running')
            return;
        const ok = code === 0;
        if (ok && op.kind === 'install' && hotCtx !== null) {
            const after = readProfileDeps(op.profile);
            const added = Object.keys(after).filter((n) => op.beforeDeps[n] === undefined);
            // A client-only plugin (dsh.client, no dsh.bundle) cannot self-register:
            // the browser roster scans Loader entries, so it needs a synthetic row
            // in the profile patch. Scan ALL installed deps (a previous failed
            // attempt may have left the dep present), idempotently.
            let clientRows = 0;
            for (const n of Object.keys(after)) {
                if (hasWebClient(op.profile, n) && !hasBundleManifest(op.profile, n) && ensureClientRow(op.profile, n)) {
                    clientRows += 1;
                }
            }
            if (clientRows > 0) {
                appendOutput(op, '\n[client] 已为 ' + String(clientRows) + ' 个纯客户端插件写入 profile 配置行，重启 web 后生效\n');
            }
            if (added.length > 0) {
                const result = await tryHotMountAll(hotCtx, op.profile, op.beforeDeps);
                if (result.hot) {
                    op.hot = true;
                    appendOutput(op, '\n[hot] 已热挂载（无需重启，刷新页面即可使用）\n');
                }
                else if (result.reason === 'web-client-half') {
                    appendOutput(op, '\n[hot] 该插件包含 Web 客户端，前端清单在启动时已固定，重启 web 后生效（可用横幅的「立即重启」）\n');
                }
                else {
                    appendOutput(op, '\n[hot] 热挂载不可用（插件 patch 较复杂或激活验证未通过），重启 web 后生效\n');
                }
            }
        }
        if (ok && op.kind === 'uninstall') {
            // Drop any synthetic client row the install wrote, so a leftover row
            // cannot fail the next boot pointing at a removed package.
            removeClientRow(op.profile, op.target);
        }
        settleOp(op, ok ? 'done' : 'failed', code);
    });
    op.timer = setTimeout(() => {
        if (op.status !== 'running')
            return;
        appendOutput(op, '\n\n[timeout] 操作超过 ' + Math.round(DEFAULT_TIMEOUT / 1000) + ' 秒未完成，已自动终止（可能是网络不通或 pnpm 卡住，可重试）');
        settleOp(op, 'timeout');
        killChild(child);
    }, DEFAULT_TIMEOUT);
    activeOp = op;
    return { ok: true, opId: op.id };
}
/** Host ctx for hot-mounting, set by apply(); null in headless/test contexts. */
let hotCtx = null;
/** Abort the live op (used by the panel and the global progress pill). */
function killOp() {
    const op = activeOp;
    if (!op || op.status !== 'running')
        return { ok: false, error: '没有正在运行的任务' };
    appendOutput(op, '\n\n[killed] 已由用户终止');
    settleOp(op, 'killed');
    killChild(op.child);
    return { ok: true };
}
/** Raw manifest mirrors, tried in order; GitHub raw is unstable behind CN networks. */
const RAW_MIRRORS = [
    'https://raw.githubusercontent.com',
    'https://raw.gitmirror.com',
    'https://cdn.jsdelivr.net/gh',
    'https://ghproxy.net/https://raw.githubusercontent.com',
];
/** Candidate package.json URLs for a repo, in most-likely-to-succeed order. */
function manifestUrls(owner, repo) {
    const urls = [
        `${RAW_MIRRORS[0]}/${owner}/${repo}/HEAD/package.json`,
        `${RAW_MIRRORS[1]}/${owner}/${repo}/HEAD/package.json`,
    ];
    for (const branch of ['main', 'master']) {
        urls.push(`${RAW_MIRRORS[2]}/${owner}/${repo}@${branch}/package.json`);
    }
    urls.push(`${RAW_MIRRORS[3]}/${owner}/${repo}/HEAD/package.json`);
    return urls;
}
/**
 * Classify a github: source. A manifest declaring a web client half is
 * certainly a web-profile plugin and can install without a trial boot.
 */
async function classifyPlugin(source) {
    const spec = String(source || '');
    const m = /^github:([^/]+)\/([^/]+?)(?:\.git)?$/.exec(spec);
    if (!m)
        return { known: false, webClient: false };
    const [, owner, repo] = m;
    let pkg = null;
    // GitHub contents API (raw media type) first: api.github.com is the host
    // that stays reachable where raw.githubusercontent is blocked. Rate limits
    // or failure fall through to the raw CDN mirrors.
    try {
        const api = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/package.json`, {
            headers: { accept: 'application/vnd.github.raw+json', 'user-agent': 'dsh-market', ...gitHubAuth() },
            signal: AbortSignal.timeout(10000),
        });
        if (api.ok)
            pkg = await api.json();
    }
    catch { }
    if (pkg === null) {
        for (const url of manifestUrls(owner, repo)) {
            try {
                const r = await fetch(url, {
                    redirect: 'follow',
                    signal: AbortSignal.timeout(8000),
                });
                if (!r.ok)
                    continue;
                pkg = await r.json();
                break;
            }
            catch { }
        }
    }
    if (pkg === null || typeof pkg !== 'object')
        return { known: false, webClient: false, fetchFailed: true };
    const dsh = pkg.dsh && typeof pkg.dsh === 'object' ? pkg.dsh : {};
    const client = dsh.client;
    const pkgName = typeof pkg.name === 'string' && pkg.name !== '' ? pkg.name : null;
    return { known: true, webClient: client !== undefined && client.platform === 'web', pkgName };
}
/**
 * Normalize an npm registry repository field to `owner/repo` for comparison:
 * strips git+/ssh/https/git@ prefixes, the .git suffix, and trailing slashes.
 */
function normalizeRepoUrl(value) {
    const s = String(value || '').trim();
    return s
        .replace(/^git\+/, '')
        .replace(/\.git$/, '')
        .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
        .replace(/^git@github\.com:/i, '')
        .replace(/^github\.com\//i, '')
        .replace(/\/+$/, '')
        .toLowerCase();
}
/**
 * Convert a github: source to a codeload tarball URL. Direct git access to
 * github.com hangs on some networks while codeload (Fastly CDN) stays fast,
 * so git-hosted installs prefer the tarball — pnpm treats it as a normal
 * dependency (prepare script still subject to the build-block consent).
 */
function codeloadSpec(target) {
    const m = /^github:([^/]+)\/([^/]+?)(?:\.git)?$/.exec(String(target || ''));
    if (!m)
        return null;
    return `https://codeload.github.com/${m[1]}/${m[2]}/tar.gz/HEAD`;
}
/**
 * Resolve whether a github: plugin is also published to npm under the same
 * repository — registry installs are seconds (tarball, no prepare script).
 * The registry package's `repository` field must point at the exact repo
 * (name-squatting guard); any mismatch or lookup failure returns null so the
 * install falls back to the GitHub source.
 */
async function npmRegistrySpec(target, pkgName) {
    if (pkgName === null || !/^(@[a-z0-9-_.~]+\/)?[a-z0-9-_.~]+$/.test(pkgName))
        return null;
    const repoKey = String(target).replace(/^github:/i, '').replace(/\.git$/i, '').toLowerCase();
    try {
        const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkgName)}/latest`, {
            headers: { accept: 'application/json' },
            signal: AbortSignal.timeout(6000),
        });
        if (!res.ok)
            return null;
        const meta = await res.json();
        const repo = meta.repository && (meta.repository.url || meta.repository);
        if (normalizeRepoUrl(repo) !== repoKey)
            return null;
        return pkgName;
    }
    catch {
        return null;
    }
}
const PROBE_INSTALL_TIMEOUT = 240000;
const PROBE_BOOT_TIMEOUT = 120000;
const READY_LINE_RE = /dsh web:\s+http:\/\//;
/** Trial boot probe: prove the candidate boots under the web profile first. */
async function runProbe(explicitBin, source, allowBuilds) {
    const inv = dshInvoke(explicitBin);
    if (!inv)
        return { ok: false, stage: 'install', output: 'dsh CLI 未定位（可在面板填写路径）' };
    const home = mkdtempSync(join(tmpdir(), 'dsh-mkts-probe-'));
    try {
        const profileDir_ = join(home, 'profiles', 'web');
        mkdirSync(profileDir_, { recursive: true });
        writeFileSync(join(profileDir_, 'package.json'), JSON.stringify({
            name: 'dsh-profile-web',
            private: true,
            dependencies: {},
            dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
        }, null, 2) + '\n');
        writeFileSync(join(profileDir_, 'cordis.patch.yml'), '[]\n');
        // Git dependencies run their prepare script at install; pnpm ≥10 blocks
        // that until the exact package key is allowlisted. The probe is a
        // throwaway environment, so consent to the verified package's build here.
        const builds = Array.isArray(allowBuilds) ? allowBuilds.filter((k) => k && /^(@[a-z0-9-_.~]+\/)?[a-z0-9-_.~]+$/.test(k)) : [];
        writeFileSync(join(profileDir_, 'pnpm-workspace.yaml'), 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n'
            + (builds.length > 0 ? '\nallowBuilds:\n' + builds.map((k) => `  '${k}': true`).join('\n') + '\n' : ''));
        const env = { ...process.env, DSH_HOME: home, CI: 'true' };
        const runCwd = inv.cwd ?? profileDir_;
        const install = await spawnCapture(inv.file, [...inv.args, 'plugin', '--profile', 'web', 'add', source], { cwd: runCwd, env, timeoutMs: PROBE_INSTALL_TIMEOUT });
        if (!install.ok) {
            return { ok: false, stage: 'install', output: install.output };
        }
        const boot = await spawnCapture(inv.file, [...inv.args, '--profile', 'web', '--host', '127.0.0.1', '--port', '0'], { cwd: runCwd, env, timeoutMs: PROBE_BOOT_TIMEOUT, readyRe: READY_LINE_RE });
        if (boot.ready)
            return { ok: true };
        return { ok: false, stage: 'boot', output: boot.output };
    }
    finally {
        try {
            rmSync(home, { recursive: true, force: true, maxRetries: 3 });
        }
        catch { }
    }
}
function spawnCapture(exe, args, { cwd, env, timeoutMs, readyRe }) {
    return new Promise((resolve) => {
        const child = spawn(exe, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '';
        let settled = false;
        let timer;
        const finish = (v) => { if (settled)
            return; settled = true; clearTimeout(timer); resolve(v); };
        const onData = (d) => {
            output = (output + String(d)).slice(-MAX_OUTPUT);
            if (readyRe && readyRe.test(output)) {
                finish({ ok: true, ready: true, output });
                killChild(child);
            }
        };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        child.on('error', (err) => finish({ ok: false, ready: false, output: output + '\n[error] ' + String((err && err.message) || err) }));
        child.on('close', (code) => finish({ ok: code === 0, ready: false, code, output }));
        timer = setTimeout(() => {
            finish({ ok: false, ready: false, timedOut: true, output: output + '\n[probe timeout ' + Math.round(timeoutMs / 1000) + 's]' });
            killChild(child);
        }, timeoutMs);
    });
}
/**
 * Snapshot a profile's manifest before a real write, so a later failure can be
 * rolled back by restoring the file.
 */
function snapshotProfile(profile) {
    try {
        const p = profileDir(profile) + '/package.json';
        if (!existsSync(p))
            return null;
        const snap = p + '.mkts-snapshot-' + Date.now() + '.json';
        writeFileSync(snap, readFileSync(p, 'utf8'));
        return snap;
    }
    catch {
        return null;
    }
}
/**
 * Add one package key to the real profile's pnpm `allowBuilds` list
 * (idempotent). Only called after the market verified the package's dsh
 * manifest (and, for bundle-only plugins, a passing throwaway trial boot),
 * so the consent is scoped to exactly that verified package.
 */
function ensureAllowBuilds(profile, key) {
    // pnpm keys are plain package names for git deps and `<name>@<tarball-url>`
    // for tarball deps. Reject anything quote/newline-shaped (YAML injection).
    if (!key || /['"\n\r]/.test(key))
        return;
    if (!/^(@?[a-z0-9-_.~]+\/)*[a-z0-9-_.~]+(@https?:\/\/[^\s]+)?$/.test(key))
        return;
    const p = join(profileDir(profile), 'pnpm-workspace.yaml');
    if (!existsSync(p))
        return;
    const text = readFileSync(p, 'utf8');
    const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // YAML reserves `@`, so a scoped package key must be single-quoted or the
    // whole workspace file fails to parse (js-yaml "bad indentation").
    if (new RegExp("^\\s*'?" + escapeRe(key) + "'?\\s*:\\s*true\\s*$", 'm').test(text))
        return;
    const quoted = "'" + key + "'";
    const block = /^(\s*)allowBuilds\s*:.*$/m.exec(text);
    if (block !== null) {
        const ind = block[1] + '  ';
        writeFileSync(p, text.replace(/^(\s*)allowBuilds\s*:.*$/m, (line) => line + '\n' + ind + quoted + ': true'));
    }
    else {
        writeFileSync(p, text.replace(/\n+$/, '') + '\n\nallowBuilds:\n  ' + quoted + ': true\n');
    }
}
/**
 * The exact pnpm allowBuilds keys a dependency install may demand: the plain
 * package name (git deps) plus `<name>@<tarball-url>` (tarball deps).
 */
function allowBuildKeys(pkgName, spec) {
    if (pkgName === null || pkgName === undefined || pkgName === '')
        return [];
    const keys = [pkgName];
    if (spec !== null && spec !== undefined && /^https?:\/\//.test(spec))
        keys.push(pkgName + '@' + spec);
    return keys;
}
// ── GitHub real-time search (topic:dsh-plugin) ───────────────────────────────
/** Optional GitHub token (raises the unauthenticated search rate limit). */
function gitHubAuth() {
    const token = process.env.GITHUB_TOKEN || process.env.DSH_MARKET_GITHUB_TOKEN;
    return token ? { authorization: `Bearer ${token}` } : {};
}
/** One GitHub search result mapped to the market's plugin card shape. */
function mapGitHubItem(item) {
    const fullName = String(item.full_name || '');
    const name = fullName.includes('/') ? fullName.slice(fullName.indexOf('/') + 1) : fullName;
    return {
        cat: null,
        name,
        url: item.html_url || ('https://github.com/' + fullName),
        by: item.owner && item.owner.login ? item.owner.login : '',
        desc: item.description || '',
        cmd: 'dsh plugin --profile web add github:' + fullName,
        profile: 'web',
        source: 'github:' + fullName,
        stars: typeof item.stargazers_count === 'number' ? item.stargazers_count : null,
        added: item.pushed_at || item.created_at || null,
        topics: Array.isArray(item.topics) ? item.topics : [],
        lang: typeof item.language === 'string' ? item.language : null,
        license: item.license && typeof item.license.spdx_id === 'string' ? item.license.spdx_id : null,
    };
}
/** Server-side cache for GitHub search (short TTL to respect the rate limit). */
const searchCache = new Map();
const SEARCH_TTL_MS = 60 * 1000;
/**
 * Assemble the GitHub search query: always the `dsh-plugin` topic, and never
 * forks, archived, or private repositories, plus the user's free-text terms
 * when present (topic labels are self-assigned, so this filters the noisiest
 * non-plugin results).
 */
function buildSearchQuery(q) {
    const terms = ['topic:dsh-plugin', 'is:public', 'fork:false', 'archived:false'];
    if (q !== '')
        terms.push(q);
    return terms.join(' ');
}
/**
 * Search GitHub for `topic:dsh-plugin` repositories, optionally narrowed by a
 * free-text query, and map results to market cards. Empty query returns the
 * topic's most-starred repositories. Unauthenticated search is rate-limited
 * (10/min); `GITHUB_TOKEN` raises it and failed/limited calls return an error
 * string the UI surfaces instead of a partial list.
 */
async function searchGitHub(query, opts = {}) {
    const q = String(query || '').trim();
    const sort = opts.sort === 'updated' ? 'updated' : 'stars';
    const order = opts.order === 'asc' ? 'asc' : 'desc';
    const perPage = Math.min(Math.max(Number(opts.perPage) || 30, 1), 100);
    const page = Math.max(Number(opts.page) || 1, 1);
    const qs = new URLSearchParams({
        q: buildSearchQuery(q), sort, order, per_page: String(perPage), page: String(page),
    });
    const cacheKey = qs.toString();
    const hit = searchCache.get(cacheKey);
    if (hit !== undefined && Date.now() - hit.at < SEARCH_TTL_MS)
        return hit.data;
    const url = 'https://api.github.com/search/repositories?' + qs.toString();
    try {
        const res = await fetch(url, {
            headers: { accept: 'application/vnd.github+json', 'user-agent': 'dsh-market', ...gitHubAuth() },
            signal: AbortSignal.timeout(10000),
        });
        if (res.status === 403 || res.status === 429) {
            const remaining = res.headers.get('x-ratelimit-remaining');
            return {
                plugins: [], total: 0,
                rate: { limit: res.headers.get('x-ratelimit-limit'), remaining },
                error: 'GitHub 搜索限速（剩余 ' + (remaining ?? '0') + ' 次/分钟）。配置 GITHUB_TOKEN 可提高配额，或稍后重试。',
            };
        }
        if (!res.ok)
            throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const plugins = (Array.isArray(data.items) ? data.items : []).map(mapGitHubItem);
        const result = {
            plugins,
            total: typeof data.total_count === 'number' ? data.total_count : plugins.length,
            rate: { limit: res.headers.get('x-ratelimit-limit'), remaining: res.headers.get('x-ratelimit-remaining') },
        };
        searchCache.set(cacheKey, { at: Date.now(), data: result });
        return result;
    }
    catch (e) {
        return { plugins: [], total: 0, error: 'GitHub 搜索失败：' + String((e && e.message) || e) };
    }
}
// ── hot mount (restart-free activation) ─────────────────────────────────────
function parseSimplePatch(patchText) {
    const rows = [];
    let pending = null;
    for (const raw of String(patchText || '').split('\n')) {
        const line = raw.replace(/#.*$/, '').trimEnd();
        if (line.trim() === '')
            continue;
        if (/^-\s+insert:\s*$/.test(line))
            continue;
        const id = /^\s+-\s+id:\s*(\S+)\s*$/.exec(line);
        if (id !== null) {
            if (pending !== null)
                return null;
            pending = id[1];
            continue;
        }
        const name = /^\s+name:\s*['"]?([^'"\s]+)['"]?\s*$/.exec(line);
        if (name !== null && pending !== null) {
            rows.push({ id: pending, name: name[1] });
            pending = null;
            continue;
        }
        return null;
    }
    if (pending !== null || rows.length === 0)
        return null;
    return rows;
}
let hotTreeClass = undefined;
async function loadHotTreeClass() {
    if (hotTreeClass !== undefined)
        return hotTreeClass;
    try {
        const mod = await import('@deepseek-ai/cordis-plugin-include');
        const Include = mod.Include;
        if (Include === undefined)
            throw new Error('no Include export');
        class MarketHotTree extends Include {
            write() { }
        }
        hotTreeClass = MarketHotTree;
    }
    catch {
        hotTreeClass = null;
    }
    return hotTreeClass;
}
function cleanHotDir(profile) {
    try {
        rmSync(profileDir(profile) + '/.dsh-market', { force: true, recursive: true, maxRetries: 3 });
    }
    catch { }
}
let hotSequence = 0;
const hotHandles = new Map();
/** Whether an installed package declares a browser client half (`dsh.client`). */
function hasWebClient(profile, packageName) {
    try {
        const manifest = JSON.parse(readFileSync(join(profileDir(profile), 'node_modules', packageName, 'package.json'), 'utf8'));
        const client = manifest.dsh && manifest.dsh.client;
        return client !== undefined && client.platform === 'web';
    }
    catch {
        return false;
    }
}
/** Whether an installed package declares a bundle patch layer (`dsh.bundle`). */
function hasBundleManifest(profile, packageName) {
    try {
        const manifest = JSON.parse(readFileSync(join(profileDir(profile), 'node_modules', packageName, 'package.json'), 'utf8'));
        return manifest.dsh !== undefined && manifest.dsh.bundle !== undefined;
    }
    catch {
        return false;
    }
}
/** Stable synthetic loader-row id for a client-only package. */
function clientRowId(packageName) {
    return 'dsh-market-client-' + String(packageName).replace(/^@/, '').replace(/[^a-zA-Z0-9_-]/g, '-');
}
/**
 * Append a synthetic `insert` row for a client-only package to the profile's
 * cordis.patch.yml (idempotent). The modules node half scans Loader ENTRIES
 * for `dsh.client` declarations, so a bundle-less client plugin needs this
 * row to join the browser roster on the next restart.
 */
function ensureClientRow(profile, packageName) {
    const p = join(profileDir(profile), 'cordis.patch.yml');
    if (!existsSync(p))
        return false;
    const text = readFileSync(p, 'utf8');
    if (text.includes("name: '" + packageName + "'") || text.includes('name: "' + packageName + '"'))
        return false;
    const entry = `- insert:\n    - id: ${clientRowId(packageName)}\n      name: '${packageName}'\n`;
    if (/^\s*\[\s*\]\s*$/m.test(text)) {
        writeFileSync(p, entry);
    }
    else {
        writeFileSync(p, text.replace(/\s+$/, '') + '\n' + entry);
    }
    return true;
}
/**
 * Remove the synthetic loader row for a client-only package (idempotent). A
 * row left behind after uninstall would point at a missing package and fail
 * the next boot.
 */
function removeClientRow(profile, packageName) {
    const p = join(profileDir(profile), 'cordis.patch.yml');
    if (!existsSync(p))
        return;
    let text = readFileSync(p, 'utf8');
    const block = `- insert:\n    - id: ${clientRowId(packageName)}\n      name: '${packageName}'\n`;
    if (!text.includes(block))
        return;
    text = text.split(block).join('');
    text = text.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');
    if (text.trim() === '' || text.trim() === '[]') {
        writeFileSync(p, '[]\n');
    }
    else {
        writeFileSync(p, text.replace(/\s+$/, '') + '\n');
    }
}
/** FiberState.ACTIVE — Cordis's const enum value (no cross-package import here). */
const FIBER_ACTIVE = 2;
/** FiberState.FAILED. */
const FIBER_FAILED = 3;
/**
 * Hot-mount one installed package by replaying its simple patch through a
 * temp include file, then verify the loader entry actually reached ACTIVE.
 * Returns true only on a verified activation — a claim the UI can trust.
 */
async function hotMount(ctx, profile, packageName) {
    let handle = null;
    try {
        const HotTree = await loadHotTreeClass();
        if (HotTree === null)
            return false;
        const patchText = readFileSync(join(profileDir(profile), 'node_modules', packageName, 'cordis.patch.yml'), 'utf8');
        const rows = parseSimplePatch(patchText);
        if (rows === null)
            return false;
        const dir = join(profileDir(profile), '.dsh-market');
        mkdirSync(dir, { recursive: true });
        hotSequence += 1;
        const file = join(dir, 'hot-' + String(hotSequence) + '.yml');
        const yml = rows.map((row) => `- id: mkt-${row.id}\n  name: '${row.name}'\n`).join('');
        writeFileSync(file, yml);
        handle = ctx.plugin(HotTree, { path: pathToFileURL(file).href });
        await handle.await();
        // Verify the mounted row actually activated: a row whose inject
        // dependencies cannot be met stays pending/failed and must never be
        // reported as hot-mounted.
        const loader = ctx.get('loader');
        const deadline = Date.now() + 8000;
        while (Date.now() < deadline) {
            const entry = loader && [...loader.entries()].find((e) => e.options && e.options.name === packageName);
            const state = entry && entry.fiber ? entry.fiber.state : undefined;
            if (state === FIBER_ACTIVE) {
                hotHandles.set(packageName, handle);
                return true;
            }
            if (state === FIBER_FAILED)
                break;
            await new Promise((r) => setTimeout(r, 250));
        }
        try {
            await handle.dispose();
        }
        catch { }
        return false;
    }
    catch (e) {
        if (handle !== null) {
            try {
                await handle.dispose();
            }
            catch { }
        }
        console.warn('[dsh-market] hot mount of ' + packageName + ' failed, restart required: ' + String((e && e.message) || e));
        return false;
    }
}
async function disposeHotMount(packageName) {
    const handle = hotHandles.get(packageName);
    if (!handle)
        return;
    hotHandles.delete(packageName);
    try {
        await handle.dispose();
    }
    catch (e) {
        console.warn('[dsh-market] dispose of hot mount ' + packageName + ' failed: ' + String((e && e.message) || e));
    }
}
async function disableLoaderEntry(packageName) {
    const loader = hotCtx && hotCtx.get('loader');
    if (!loader)
        return;
    let disabled = false;
    for (const entry of loader.entries()) {
        if (entry.options && entry.options.name === packageName && !entry.disabled) {
            try {
                await entry.update({ disabled: true });
                disabled = true;
            }
            catch (e) {
                console.warn('[dsh-market] disable loader entry ' + packageName + ' failed: ' + String((e && e.message) || e));
            }
        }
    }
    if (disabled) {
        console.log('[dsh-market] disabled loader entry ' + packageName + ' (disable)');
    }
}
async function tryHotMountAll(ctx, profile, beforeDeps) {
    try {
        const after = readProfileDeps(profile);
        const added = Object.keys(after).filter((n) => beforeDeps[n] === undefined);
        if (added.length === 0)
            return { hot: false };
        // A browser client half cannot hot-load: the frontend serves client
        // bundles from the boot-time roster, so its UI appears only after a
        // restart. Claiming "hot-mounted" here would promise an effect that
        // never shows.
        for (const n of added) {
            if (hasWebClient(profile, n))
                return { hot: false, reason: 'web-client-half' };
        }
        const results = await Promise.all(added.map((n) => hotMount(ctx, profile, n)));
        return { hot: results.every(Boolean) };
    }
    catch {
        return { hot: false };
    }
}
function readProfileDeps(profile) {
    try {
        const json = JSON.parse(readFileSync(profileDir(profile) + '/package.json', 'utf8'));
        return (json && json.dependencies) || {};
    }
    catch {
        return {};
    }
}
// ── update detection (mirrors dsh-market's checkUpdates) ─────────────────────
function readLockCommits(profile) {
    const commits = new Map();
    try {
        const lock = readFileSync(join(profileDir(profile), 'pnpm-lock.yaml'), 'utf8');
        for (const m of lock.matchAll(/codeload\.github\.com\/([^/\s]+\/[^/\s]+)\/tar\.gz\/([0-9a-f]{40})/g)) {
            commits.set(m[1].toLowerCase(), m[2]);
        }
    }
    catch { }
    return commits;
}
function readInstalledVersion(profile, name) {
    try {
        const manifest = JSON.parse(readFileSync(join(profileDir(profile), 'node_modules', name, 'package.json'), 'utf8'));
        return manifest.version ?? null;
    }
    catch {
        return null;
    }
}
async function fetchJson(url) {
    const res = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'dsh-market' },
        signal: AbortSignal.timeout(6000),
    });
    if (!res.ok)
        throw new Error('HTTP ' + res.status);
    return res.json();
}
function normalizeBundleName(name) {
    return String(name || '').toLowerCase().replace(/^github:/, '');
}
/**
 * Read the ordered, active bundle layer for a profile.
 */
function readProfileBundles(profile) {
    try {
        const json = JSON.parse(readFileSync(profileDir(profile) + '/package.json', 'utf8'));
        const b = json && json.dsh && json.dsh.profile && json.dsh.profile.bundles;
        return Array.isArray(b) ? b : [];
    }
    catch {
        return [];
    }
}
/** Write the ordered, active bundle layer back (reads/writes minimal keys). */
function writeProfileBundles(profile, bundles) {
    const p = profileDir(profile) + '/package.json';
    if (!existsSync(p))
        return false;
    try {
        const json = JSON.parse(readFileSync(p, 'utf8'));
        json.dsh = json.dsh || {};
        json.dsh.profile = json.dsh.profile || {};
        json.dsh.profile.bundles = bundles;
        writeFileSync(p, JSON.stringify(json, null, 2) + '\n');
        return true;
    }
    catch {
        return false;
    }
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
async function toggleActive(profile, name, enabled) {
    const deps = readProfileDeps(profile);
    if (deps[name] === undefined) {
        return { ok: false, error: '插件未安装：' + name };
    }
    const bundles = readProfileBundles(profile);
    const idx = bundles.findIndex((b) => normalizeBundleName(b) === normalizeBundleName(name));
    const present = idx >= 0;
    if (enabled && present)
        return { ok: true, active: true, message: 'already active' };
    if (!enabled && !present)
        return { ok: true, active: false, message: 'already inactive' };
    const snap = snapshotProfile(profile);
    const next = enabled ? [...bundles.filter((b) => normalizeBundleName(b) !== normalizeBundleName(name)), name] : bundles.filter((b) => normalizeBundleName(b) !== normalizeBundleName(name));
    if (!writeProfileBundles(profile, next)) {
        return { ok: false, error: '写入 profile 失败：' + profileDir(profile) };
    }
    if (!enabled) {
        // Stop serving immediately: dispose hot mount + disable loader entry.
        await disposeHotMount(name);
        await disableLoaderEntry(name);
    }
    // For enable, try live hot-mount (only makes sense if the package declares a
    // simple patch and it isn't already loaded). If it can't mount live, say
    // restart is needed.
    let needsRestart = !enabled;
    if (enabled) {
        let mounted = false;
        if (hotCtx !== null) {
            try {
                const patchText = existsSync(join(profileDir(profile), 'node_modules', name, 'cordis.patch.yml'))
                    ? readFileSync(join(profileDir(profile), 'node_modules', name, 'cordis.patch.yml'), 'utf8')
                    : '';
                mounted = parseSimplePatch(patchText) !== null ? await hotMount(hotCtx, profile, name) : false;
            }
            catch {
                mounted = false;
            }
        }
        needsRestart = !mounted;
    }
    return {
        ok: true,
        active: enabled,
        needsRestart,
        lastSnapshot: snap ?? undefined,
        message: enabled
            ? (needsRestart ? 'enabled:restart' : 'enabled:live')
            : 'disabled:live',
    };
}
async function checkUpdates(profile) {
    const cached = updatesCache && updatesCache[profile];
    if (cached && Date.now() - cached.at < UPDATES_TTL_MS)
        return cached.data;
    const installed = readProfileDeps(profile);
    const lockCommits = readLockCommits(profile);
    const result = {};
    await Promise.all(Object.entries(installed).map(async ([name, spec]) => {
        const version = readInstalledVersion(profile, name);
        if (spec.startsWith('link:') || spec.startsWith('file:')) {
            result[name] = { kind: 'linked', version, current: null, latest: null, updateAvailable: false };
            return;
        }
        const gh = /^(?:github:)?([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:#.*)?$/.exec(spec);
        try {
            if (spec.startsWith('github:') && gh !== null) {
                const current = lockCommits.get(gh[1].toLowerCase()) ?? null;
                const head = await fetchJson(`https://api.github.com/repos/${gh[1]}/commits/HEAD`);
                const latest = typeof head.sha === 'string' ? head.sha : null;
                result[name] = {
                    kind: 'github', version, current, latest,
                    updateAvailable: current !== null && latest !== null && current !== latest,
                };
            }
            else {
                const meta = await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`);
                const latest = typeof meta.version === 'string' ? meta.version : null;
                result[name] = {
                    kind: 'npm', version, current: version, latest,
                    updateAvailable: version !== null && latest !== null && version !== latest,
                };
            }
        }
        catch {
            result[name] = {
                kind: spec.startsWith('github:') ? 'github' : 'npm', version, current: null, latest: null,
                updateAvailable: false,
            };
        }
    }));
    updatesCache = { ...updatesCache, [profile]: { at: Date.now(), data: result } };
    return result;
}
const UPDATES_TTL_MS = 10 * 60 * 1000;
let updatesCache = {};
// ── Install spec resolution (shared by the web route and market_install) ─────
/**
 * Resolve the concrete spec pnpm should install and run the safety gate:
 * GitHub sources are verified against their dsh manifest; bundle-only plugins
 * get a throwaway trial boot; web-client plugins prefer a registry-verified
 * npm tarball and fall back to the codeload tarball with build consent.
 * Registry specs pass through untouched.
 */
async function resolveInstallSpec(target, bin, profile) {
    let installSpec = target;
    if (/^github:/.test(target)) {
        const cls = await classifyPlugin(target);
        if (!cls.known) {
            return {
                ok: false,
                refused: true,
                output: '无法验证该插件：读取其 package.json 的 dsh 清单失败'
                    + (cls.fetchFailed ? '（GitHub 抓取失败，可能是网络或镜像问题）' : '，它可能不是 dsh 插件')
                    + '。如确需安装（风险自负），请勾选"跳过安全检查"。',
            };
        }
        // Direct git to github.com hangs on many networks while the codeload CDN
        // stays reachable — install through the tarball URL instead of git.
        const tarball = codeloadSpec(target);
        const buildKeys = allowBuildKeys(cls.pkgName ?? null, tarball);
        if (!cls.webClient) {
            const verdict = await runProbe(bin, tarball ?? target, buildKeys);
            if (!verdict.ok) {
                const stage = verdict.stage === 'install'
                    ? '候选插件安装进试装环境失败'
                    : '试装启动验证失败：该插件装进 web profile 无法正常启动';
                return {
                    ok: false,
                    refused: true,
                    output: stage + '（真实 profile 未受影响，试装目录已清理）：\n\n' + String(verdict.output || '').slice(-8000)
                        + '\n\n如需强制安装（风险自负），请勾选"跳过安全检查"。',
                };
            }
            for (const k of buildKeys)
                ensureAllowBuilds(profile, k);
            if (tarball !== null)
                installSpec = tarball;
        }
        else {
            const npm = await npmRegistrySpec(target, cls.pkgName ?? null);
            if (npm !== null) {
                installSpec = npm;
            }
            else {
                for (const k of buildKeys)
                    ensureAllowBuilds(profile, k);
                if (tarball !== null)
                    installSpec = tarball;
            }
        }
    }
    return { ok: true, installSpec };
}
/**
 * Project a profile's active layer into built-in (template bundles, read-only)
 * and user-installed (profile dependencies) plugin rows, merged with update
 * availability. The market's own package appears as an installed row.
 */
async function listInstalled(profile) {
    const deps = readProfileDeps(profile);
    const bundles = readProfileBundles(profile);
    const updates = await checkUpdates(profile);
    const rows = [];
    for (const name of bundles) {
        if (deps[name] !== undefined)
            continue; // user-installed: emitted below
        rows.push({
            name,
            kind: 'builtin',
            enabled: true,
            version: readInstalledVersion(profile, name),
            spec: null,
            latestVersion: null,
            updateAvailable: false,
        });
    }
    for (const [name, spec] of Object.entries(deps)) {
        const enabled = bundles.some((b) => normalizeBundleName(b) === normalizeBundleName(name));
        const up = updates[name];
        rows.push({
            name,
            kind: 'installed',
            enabled,
            version: readInstalledVersion(profile, name),
            spec: String(spec),
            latestVersion: up && up.latest != null ? String(up.latest) : null,
            updateAvailable: !!(up && up.updateAvailable),
        });
    }
    return rows;
}
// ── Market self-update check ─────────────────────────────────────────────────
const MARKET_NAME = 'dsh-market-github';
/**
 * Compare the installed market version with the latest one on its own GitHub
 * repository (the `repository` field of this very package.json). A fork that
 * repoints `repository` therefore checks against its own upstream.
 */
async function checkSelfUpdate(profile) {
    const version = readInstalledVersion(profile, MARKET_NAME);
    let latestVersion = null;
    try {
        const own = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
        const repoUrl = own.repository && (own.repository.url || own.repository);
        const m = /github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/.exec(String(repoUrl || ''));
        if (m !== null) {
            const res = await fetch(`https://api.github.com/repos/${m[1]}/contents/package.json`, {
                headers: { accept: 'application/vnd.github.raw+json', 'user-agent': 'dsh-market', ...gitHubAuth() },
                signal: AbortSignal.timeout(8000),
            });
            if (res.ok) {
                const meta = await res.json();
                if (typeof meta.version === 'string')
                    latestVersion = meta.version;
            }
        }
    }
    catch { }
    return {
        name: MARKET_NAME,
        version,
        latestVersion,
        updateAvailable: version !== null && latestVersion !== null && version !== latestVersion,
    };
}
// ── Model tools: the agent can search/install/manage plugins itself ─────────
/** The profile the model tools operate on (mirrors the web UI default). */
const TOOL_PROFILE = 'web';
/** Run one dsh CLI invocation synchronously and return the captured result. */
function runCliSync(args, timeoutMs) {
    const inv = dshInvoke();
    if (!inv)
        return Promise.reject(new Error('dsh CLI 未定位（可在面板填写路径）'));
    return spawnCapture(inv.file, [...inv.args, ...args], {
        cwd: inv.cwd ?? profileDir(TOOL_PROFILE),
        env: { ...process.env, CI: 'true' },
        timeoutMs,
    });
}
/** Register the market_* tools when the tool registry service exists. */
function registerMarketTools(ctx) {
    const tools = ctx.get('tools');
    if (tools === undefined)
        return;
    tools.register({
        name: 'market_search',
        description: 'Search the DeepSeek Harness plugin marketplace (GitHub `dsh-plugin` topic) for installable plugins. Returns a JSON list of repositories: full name, stars, language, one-line description, and URL. Supports a keyword and pagination (the topic holds 1800+ repos; page through with `page`/`perPage`). Use this before market_install to find the right repo.',
        parameters: {
            type: 'object',
            properties: {
                q: { type: 'string', description: 'Search keyword within the dsh-plugin topic (name/description/language). Empty returns the top-starred page.' },
                page: { type: 'integer', description: 'Page number (1-based, default 1).' },
                perPage: { type: 'integer', description: 'Results per page (max 100, default 50).' },
            },
        },
        output: {
            schema: {
                type: 'object',
                properties: {
                    items: { type: 'array', items: { type: 'object', properties: { fullName: { type: 'string' }, name: { type: 'string' }, url: { type: 'string' }, description: { type: 'string' }, stars: { type: 'integer' }, language: { type: 'string' }, updatedAt: { type: 'string' } }, additionalProperties: true } },
                    total: { type: 'integer' },
                    page: { type: 'integer' },
                    perPage: { type: 'integer' },
                    hasMore: { type: 'boolean' },
                },
                additionalProperties: true,
            },
            render(_args, value) {
                const v = value;
                const lines = [`DSH 插件市场：共 ${v.total} 个仓库（第 ${v.page} 页 / 每页 ${v.perPage}${v.hasMore ? '，还有更多' : ''}）`];
                for (const it of v.items) {
                    lines.push(`- ${it.fullName} (★${it.stars}${it.language ? ', ' + it.language : ''}) — ${it.description || '无简介'}`);
                }
                if (v.hasMore)
                    lines.push('提示：用 page/perPage 翻页，或用 q 缩小范围。');
                return [{ type: 'text', text: lines.join('\n') }];
            },
        },
        async execute(args) {
            const q = String((args && args.q) || '').trim();
            const page = Math.max(1, Number((args && args.page) || 1));
            const perPage = Math.min(100, Math.max(1, Number((args && args.perPage) || 50)));
            const r = await searchGitHub(q, { sort: 'stars', order: 'desc', page, perPage });
            if (r.error)
                throw new Error(r.error);
            return {
                items: r.plugins.map((p) => ({
                    fullName: String(p.source || '').replace(/^github:/, ''),
                    name: p.name,
                    url: p.url,
                    description: p.desc,
                    stars: p.stars ?? 0,
                    language: p.lang ?? '',
                    updatedAt: p.added ?? '',
                })),
                total: r.total,
                page,
                perPage,
                hasMore: page * perPage < r.total,
            };
        },
    });
    tools.register({
        name: 'market_install',
        description: 'Install a plugin from the DeepSeek Harness plugin marketplace into the `web` profile. Accepts a GitHub repo as `owner/repo`, a git URL, an npm package name, or a local path. Runs the same safety gate as the UI (dsh-manifest verification + throwaway trial boot), then `dsh plugin --profile web add <spec>`; returns the pnpm output and whether a harness restart is required. Verify the repo with market_search first.',
        parameters: {
            type: 'object',
            properties: {
                spec: { type: 'string', description: 'Package name, GitHub owner/repo, git URL, or local path to install.' },
            },
            required: ['spec'],
        },
        output: {
            schema: {
                type: 'object',
                properties: { ok: { type: 'boolean' }, spec: { type: 'string' }, installed: { type: 'string' }, needsRestart: { type: 'boolean' }, output: { type: 'string' } },
                additionalProperties: true,
            },
            render(_args, value) {
                return [{ type: 'text', text: value.ok
                            ? `已安装 ${value.installed}${value.needsRestart ? '（重启 harness 后生效）' : '（已热挂载，免重启）'}\n${value.output}`
                            : `安装失败：\n${value.output}` }];
            },
        },
        async execute(args) {
            const spec = String((args && args.spec) || '').trim();
            if (!spec)
                throw new Error('market_install requires a non-empty spec');
            const bin = String(dshBin() || '');
            if (!bin)
                throw new Error('dsh CLI 未定位（可在面板填写路径）');
            const before = readProfileDeps(TOOL_PROFILE);
            const resolved = await resolveInstallSpec(spec, bin, TOOL_PROFILE);
            if (!resolved.ok)
                throw new Error(resolved.output);
            const result = await runCliSync(['plugin', '--profile', TOOL_PROFILE, 'add', resolved.installSpec], PROBE_INSTALL_TIMEOUT);
            if (!result.ok) {
                throw new Error('安装失败（exit ' + String(result.code ?? '?') + '）：\n' + String(result.output || '').slice(-4000));
            }
            let needsRestart = true;
            if (hotCtx !== null) {
                try {
                    const hot = await tryHotMountAll(hotCtx, TOOL_PROFILE, before);
                    needsRestart = !hot.hot;
                }
                catch {
                    needsRestart = true;
                }
            }
            return { ok: true, spec, installed: resolved.installSpec, needsRestart, output: String(result.output || '').slice(-4000) };
        },
    });
    tools.register({
        name: 'market_installed',
        description: 'List the plugins in the `web` profile with their versions and update availability. Returns `plugins` (each with `name`, `kind` = `builtin` or `installed`, `enabled`, `version`, `latestVersion`, `updateAvailable`) and `self` when this marketplace itself can be updated. Use this before market_update to find names.',
        parameters: { type: 'object', properties: {} },
        output: {
            schema: {
                type: 'object',
                properties: {
                    plugins: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, kind: { type: 'string' }, enabled: { type: 'boolean' }, version: { type: 'string' }, latestVersion: { type: 'string' }, updateAvailable: { type: 'boolean' } }, additionalProperties: true } },
                    self: { type: 'object', properties: { name: { type: 'string' }, version: { type: 'string' }, latestVersion: { type: 'string' } }, additionalProperties: true },
                    restartHint: { type: 'string' },
                },
                additionalProperties: true,
            },
            render(_args, value) {
                const lines = [];
                for (const p of value.plugins) {
                    const upd = p.updateAvailable ? `（可更新：v${p.version} → v${p.latestVersion}，用 market_update name=${p.name}）` : '';
                    lines.push(`- ${p.name} [${p.kind}]${p.enabled ? '' : '（已停用）'} v${p.version ?? '?'}${upd}`);
                }
                if (value.self)
                    lines.push(`插件市场可更新：v${value.self.version} → v${value.self.latestVersion}（用 market_update name=${value.self.name}）`);
                if (value.plugins.length === 0)
                    lines.push('（没有后装插件）');
                return [{ type: 'text', text: lines.join('\n') }];
            },
        },
        async execute() {
            const rows = await listInstalled(TOOL_PROFILE);
            const self = await checkSelfUpdate(TOOL_PROFILE);
            return {
                plugins: rows.map((r) => ({
                    name: r.name,
                    kind: r.kind,
                    enabled: r.enabled,
                    version: r.version,
                    latestVersion: r.latestVersion,
                    updateAvailable: r.updateAvailable,
                })),
                self: self.updateAvailable ? { name: self.name, version: self.version, latestVersion: self.latestVersion } : null,
                restartHint: 'install/update/enable/disable 后通常需要重启 harness 才能生效',
            };
        },
    });
    tools.register({
        name: 'market_update',
        description: 'Update one installed plugin in the `web` profile to its latest version (a harness restart is required to take effect). Accepts the package `name` exactly as reported by market_installed.',
        parameters: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Package name of the installed plugin to update (from market_installed).' },
            },
            required: ['name'],
        },
        output: {
            schema: {
                type: 'object',
                properties: { ok: { type: 'boolean' }, name: { type: 'string' }, target: { type: 'string' }, needsRestart: { type: 'boolean' }, output: { type: 'string' } },
                additionalProperties: true,
            },
            render(_args, value) {
                return [{ type: 'text', text: `已更新 ${value.name} → ${value.target}（重启 harness 后生效）\n${value.output}` }];
            },
        },
        async execute(args) {
            const name = String((args && args.name) || '').trim();
            if (!name)
                throw new Error('market_update requires a plugin name (from market_installed)');
            const deps = readProfileDeps(TOOL_PROFILE);
            const spec = deps[name];
            if (spec === undefined)
                throw new Error('插件未安装：' + name);
            if (String(spec).startsWith('link:') || String(spec).startsWith('file:')) {
                throw new Error('本地链接插件从 checkout 更新，无需通过市场更新');
            }
            const target = String(spec).startsWith('github:') ? String(spec).replace(/#.*$/, '')
                : String(spec).startsWith('https://codeload.github.com/') ? String(spec).replace(/\/tar\.gz\/.+$/, '/tar.gz/HEAD')
                    : `${name}@latest`;
            updatesCache = { ...updatesCache, [TOOL_PROFILE]: null };
            const result = await runCliSync(['plugin', '--profile', TOOL_PROFILE, 'add', target], PROBE_INSTALL_TIMEOUT);
            if (!result.ok) {
                throw new Error('更新失败（exit ' + String(result.code ?? '?') + '）：\n' + String(result.output || '').slice(-4000));
            }
            return { ok: true, name, target, needsRestart: true, output: String(result.output || '').slice(-4000) };
        },
    });
    console.log('[dsh-market] registered model tools: market_search, market_install, market_installed, market_update');
}
export { classifyPlugin, runProbe, parseSimplePatch, checkUpdates, toggleActive, searchGitHub, mapGitHubItem, buildSearchQuery, npmRegistrySpec, normalizeRepoUrl, ensureAllowBuilds, hasWebClient, ensureClientRow, removeClientRow, codeloadSpec, allowBuildKeys, resolveInstallSpec, listInstalled, checkSelfUpdate, detectProxy, probeProxyPort }; // test hooks
export function apply(ctx) {
    const webServer = ctx.get('webServer');
    if (webServer === undefined) {
        console.error('[dsh-market] webServer service unavailable at apply; route not registered');
        return;
    }
    hotCtx = ctx;
    cleanHotDir('web');
    // Detect the device proxy once and apply it to process.env so install
    // children (pnpm/git) inherit it — no hardcoded proxy port.
    void ensureProxyDetected();
    // Model-facing tools (market_search / market_install / market_installed /
    // market_update): registered when the tool registry service exists, so the
    // agent can search and install plugins itself, not only through the UI.
    registerMarketTools(ctx);
    webServer.register({
        kind: 'exact',
        path: '/api/dsh-market',
        handler: async (req, res) => {
            try {
                const body = await readBody(req);
                const method = String(body.method || '');
                if (method === 'search') {
                    // Real-time GitHub search over `topic:dsh-plugin` (server-side proxy
                    // to avoid CORS and share the rate limit). Read-only, so no origin gate.
                    const r = await searchGitHub(String(body.q || ''), {
                        sort: String(body.sort || 'stars'),
                        order: String(body.order || 'desc'),
                        page: Number(body.page || 1),
                        perPage: Number(body.perPage || 30),
                    });
                    if (r.error !== undefined)
                        return sendJson(res, 502, { ok: false, error: r.error });
                    return sendJson(res, 200, { ok: true, plugins: r.plugins, total: r.total, rate: r.rate ?? null, source: 'github' });
                }
                if (method === 'probe') {
                    const explicit = String(body.binPath || '').trim();
                    let binValid = null;
                    if (explicit) {
                        try {
                            binValid = existsSync(explicit);
                        }
                        catch {
                            binValid = false;
                        }
                    }
                    return sendJson(res, 200, {
                        ok: true,
                        dshHome: dshHome(),
                        node: process.execPath || null,
                        cwd: process.cwd(),
                        dshBin: dshBin(),
                        binProvided: explicit || null,
                        binValid,
                        proxy: detectedProxyUrl,
                    });
                }
                if (method === 'installed') {
                    const profile = validProfile(body.profile) ? body.profile : 'web';
                    const p = profileDir(profile) + '/package.json';
                    if (!existsSync(p))
                        return sendJson(res, 200, { ok: true, profile, bundles: [], dependencies: {}, plugins: [], self: null });
                    const json = JSON.parse(readFileSync(p, 'utf8'));
                    const plugins = await listInstalled(profile);
                    const self = await checkSelfUpdate(profile);
                    return sendJson(res, 200, {
                        ok: true,
                        profile,
                        bundles: Array.isArray(json.dsh && json.dsh.profile && json.dsh.profile.bundles) ? json.dsh.profile.bundles : [],
                        dependencies: json.dependencies || {},
                        plugins,
                        self,
                    });
                }
                if (method === 'updates') {
                    const profile = validProfile(body.profile) ? body.profile : 'web';
                    const updates = await checkUpdates(profile);
                    return sendJson(res, 200, { ok: true, profile, updates });
                }
                if (method === 'update') {
                    if (!sameOrigin(req))
                        return sendJson(res, 403, { ok: false, error: 'untrusted origin' });
                    const profile = validProfile(body.profile) ? body.profile : 'web';
                    const name = String(body.name || '').trim();
                    if (!name)
                        return sendJson(res, 400, { ok: false, output: '缺少插件名' });
                    const deps = readProfileDeps(profile);
                    const spec = deps[name];
                    if (spec === undefined)
                        return sendJson(res, 200, { ok: false, output: '插件未安装：' + name });
                    if (spec.startsWith('link:') || spec.startsWith('file:')) {
                        return sendJson(res, 200, { ok: false, output: '本地链接插件从 checkout 更新，无需通过市场更新' });
                    }
                    if (activeOp && activeOp.status === 'running') {
                        return sendJson(res, 200, { ok: false, busy: true, output: '已有任务进行中：' + activeOp.label });
                    }
                    const target = spec.startsWith('github:') ? spec.replace(/#.*$/, '')
                        : spec.startsWith('https://codeload.github.com/') ? spec.replace(/\/tar\.gz\/.+$/, '/tar.gz/HEAD')
                            : `${name}@latest`;
                    const label = String(body.label || name);
                    updatesCache = { ...updatesCache, [profile]: null };
                    await waitProxyReady(2000);
                    const started = startOp('update', profile, target, label, String(body.binPath || '').trim(), '更新 ' + name + ' → ' + target + '\n');
                    if (!started.ok)
                        return sendJson(res, 200, started);
                    return sendJson(res, 200, { ok: true, opId: started.opId, timeoutMs: DEFAULT_TIMEOUT });
                }
                if (method === 'op') {
                    const wanted = String(body.opId || '');
                    const op = opSnapshot();
                    if (op === null)
                        return sendJson(res, 200, { ok: true, op: null });
                    if (wanted && op.id !== wanted)
                        return sendJson(res, 200, { ok: true, op: null });
                    return sendJson(res, 200, { ok: true, op });
                }
                if (method === 'kill') {
                    if (!sameOrigin(req))
                        return sendJson(res, 403, { ok: false, error: 'untrusted origin' });
                    return sendJson(res, 200, killOp());
                }
                if (method === 'restart') {
                    // One-click restart: same-origin PLUS a direct loopback client, so a
                    // forwarded request cannot relaunch the process.
                    if (!sameOrigin(req))
                        return sendJson(res, 403, { ok: false, error: 'untrusted origin' });
                    if (!isLoopback(req))
                        return sendJson(res, 403, { ok: false, error: 'restart requires a direct loopback client' });
                    return sendJson(res, 200, scheduleRestart());
                }
                if (method === 'toggleActive') {
                    // Enable/disable an installed plugin (new in fork).
                    if (!sameOrigin(req))
                        return sendJson(res, 403, { ok: false, error: 'untrusted origin' });
                    const profile = validProfile(body.profile) ? body.profile : 'web';
                    const name = String(body.name || '').trim();
                    if (!name)
                        return sendJson(res, 400, { ok: false, output: '缺少插件名' });
                    const enabled = body.enabled === true;
                    const result = await toggleActive(profile, name, enabled);
                    return sendJson(res, result.ok ? 200 : 200, result);
                }
                if (method === 'install' || method === 'uninstall') {
                    if (!sameOrigin(req))
                        return sendJson(res, 403, { ok: false, error: 'untrusted origin' });
                    const profile = validProfile(body.profile) ? body.profile : 'web';
                    const target = String(method === 'install' ? (body.source || '') : (body.pkg || '')).trim();
                    if (!target)
                        return sendJson(res, 400, { ok: false, output: '缺少参数' });
                    if (activeOp && activeOp.status === 'running') {
                        return sendJson(res, 200, { ok: false, busy: true, output: '已有任务进行中：' + activeOp.label });
                    }
                    if (method === 'install' && profile === 'web' && !body.skipCheck) {
                        const bin = String(body.binPath || '').trim() || dshBin();
                        if (!bin)
                            return sendJson(res, 200, { ok: false, error: 'dsh CLI 未定位（可在面板填写路径）' });
                        const resolved = await resolveInstallSpec(target, bin, profile);
                        if (!resolved.ok) {
                            return sendJson(res, 200, { ok: false, refused: true, output: resolved.output });
                        }
                        const installSpec = resolved.installSpec;
                        const snap = snapshotProfile(profile);
                        const label = String(body.label || target);
                        await waitProxyReady(2000);
                        const started = startOp(method, profile, installSpec, label, bin, snap ? '已备份安装前状态：' + snap + '\n' : '');
                        if (!started.ok)
                            return sendJson(res, 200, started);
                        return sendJson(res, 200, { ok: true, opId: started.opId, timeoutMs: DEFAULT_TIMEOUT, spec: installSpec });
                    }
                    const label = String(body.label || target);
                    if (method === 'uninstall') {
                        await disposeHotMount(target);
                        await disableLoaderEntry(target);
                    }
                    await waitProxyReady(2000);
                    const started = startOp(method, profile, target, label, String(body.binPath || '').trim());
                    if (!started.ok)
                        return sendJson(res, 200, started);
                    return sendJson(res, 200, { ok: true, opId: started.opId, timeoutMs: DEFAULT_TIMEOUT });
                }
                return sendJson(res, 404, { ok: false, error: 'unknown method ' + method });
            }
            catch (e) {
                return sendJson(res, 500, { ok: false, error: String((e && e.message) || e) });
            }
        },
    });
}
