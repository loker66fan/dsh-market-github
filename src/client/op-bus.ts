// Module-level operation bus shared by the market panel and the global
// shell.overlay progress pill.
//
// Why module-level (and not a React useState in the panel): the user's core
// complaint is that starting an install pops a modal that is lost the moment
// they navigate to another project/section — the op keeps running server-side
// but the UI forgets it. Hoisting the op state and its poll loop to module
// scope means the state outlives any single component; a frame-wide
// `shell.overlay` indicator (also registered at apply) stays mounted app-wide
// and keeps showing progress (and a kill button) no matter where the user
// navigates. React components merely subscribe to the current snapshot.
export interface OpState {
  kind: 'install' | 'uninstall' | 'update'
  target: string
  label: string
  profile: string
  /** confirm → starting → running → done */
  phase: string
  opId?: string
  output?: string
  status?: string
  exitCode?: number | null
  minimized: boolean
  elapsedMs?: number
  startingAt?: number
  timeoutMs?: number
  ok?: boolean
  hot?: boolean
  skipCheck?: boolean
}

export type OpListener = (op: OpState | null) => void

let op: OpState | null = null
let pollStop = false
// Generation guard for execute/kill races: bumped ONLY by executeOpState (each
// new attempt) and killCurrentOp — nothing else may transition it. A POST
// response landing with a stale generation must not adopt or overwrite op
// state; this closes the "killed install resurrects when its slow POST finally
// answers ok:true" race (kill during the server-side resolveInstallSpec window).
let opGen = 0
const listeners = new Set<OpListener>()

export function subscribeOp(fn: OpListener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function getOp(): OpState | null { return op }

function emit(): void {
  const snapshot = op
  for (const l of listeners) { try { l(snapshot) } catch {} }
}

/**
 * POST /api/dsh-market. Hardened: always RESOLVES (never rejects) so `.then`
 * callers keep their shape — network errors, timeouts and unparseable bodies
 * all come back as { ok:false, error } instead of throwing. The timeout
 * defaults to 30s; op-creating calls (install/update/uninstall) pass a long
 * one because the server-side resolveInstallSpec gate alone can legally run
 * minutes (probe install 240s + trial boot 120s) before the POST answers.
 */
export function apiOp(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<any> {
  const opts: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ method }, params || {})),
  }
  // AbortSignal.timeout is Node 18+/modern Chromium; feature-check for older
  // runtimes (the loader may hand the bundle to an embedded webview).
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
    try { opts.signal = AbortSignal.timeout(timeoutMs || 30000) } catch {}
  }
  return fetch('/api/dsh-market', opts).then(
    async (r) => {
      try {
        const text = await r.text()
        try { return JSON.parse(text || '{}') } catch { return { ok: false, error: '响应解析失败（HTTP ' + r.status + '）' } }
      } catch (e) {
        return { ok: false, error: String((e as any && (e as any).message) || e) }
      }
    },
    (e) => ({ ok: false, error: String((e && e.message) || e) }),
  )
}

export function setOpState(patch: Partial<OpState> | ((prev: OpState | null) => Partial<OpState> | null)): void {
  if (typeof patch === 'function') {
    const partial = patch(op)
    if (partial === null) { emit(); return }
    op = { profile: 'web', minimized: false, ...(op || {}), ...partial } as OpState
  } else {
    op = op ? { ...op, ...patch } : { profile: 'web', minimized: false, ...patch } as OpState
  }
  emit()
}

export function closeOpState(): void {
  op = null
  pollStop = false
  emit()
}

function stopPolling(): void { pollStop = true }

/** Localized message for a lost op state; set by apply(). */
let opLostMessage = '任务状态丢失（服务可能已重启或任务被其他操作接管），请刷新页面后重试'
export function setOpLostMessage(s: string): void { opLostMessage = s }

function pollOp(opId: string): void {
  // A fresh poll for the CURRENT op begins now: clear the stop flag that a
  // prior openOp()/stopPolling() set, otherwise step() returns immediately and
  // the elapsed timer sits frozen at 0s forever (never reaches 'done' either).
  pollStop = false
  // Consecutive transport-failure counter (network blip, 'signal timed out').
  // apiOp never rejects, so a transport failure arrives as its own fallback
  // { ok:false, error } object — indistinguishable from a lost op unless we
  // look at the shape: a genuine op query answers { ok:true, op:null } when
  // the server moved on. Retried with bounded backoff; reset on any success.
  let pollFailCount = 0
  const step = () => {
    if (pollStop) return
    apiOp('op', { opId }).then((r) => {
      if (pollStop) return
      // Transport failure (apiOp's fallback object, NOT a server reply):
      // the server op may still be running, so retry with bounded backoff
      // instead of settling. After 5 consecutive failed retries settle as
      // failed with a "may still be running" message.
      if (r && r.ok === false && r.error) {
        if (pollFailCount < 5) {
          pollFailCount += 1
          setTimeout(step, Math.min(3000 * Math.pow(2, pollFailCount), 15000))
          return
        }
        setOpState((prev) => (prev && prev.opId === opId
          ? { ...prev, phase: 'done', status: 'failed', ok: false, output: '与服务失去连接（' + String(r.error) + '），任务可能在后台仍在进行，刷新页面可查看状态' }
          : prev))
        return
      }
      pollFailCount = 0
      const o = r && r.ok ? r.op : null
      if (!o) {
        // The server no longer knows this op id (another op took over the
        // single-op slot, or the server restarted). Without this the poll
        // loop dies silently and the UI freezes on "running" forever.
        setOpState((prev) => (prev && prev.opId === opId
          ? { ...prev, phase: 'done', status: 'failed', ok: false, output: opLostMessage }
          : prev))
        return
      }
      // Whether this poll's op is still the CURRENT one, captured BEFORE the
      // setOpState updater runs: the terminal side effects below must never fire
      // against a different op the user started while this response was in
      // flight (premature reload / onTerminal with a foreign object).
      const isCurrent = !!(op && op.opId === opId)
      setOpState((prev) => {
        if (!prev || prev.opId !== opId) return prev
        if (o.status === 'running') {
          return { ...prev, phase: 'running', output: o.output, elapsedMs: o.elapsedMs, timeoutMs: o.timeoutMs }
        }
        return {
          ...prev, phase: 'done', output: o.output, status: o.status,
          exitCode: o.exitCode, ok: o.status === 'done', hot: o.hot === true,
        }
      })
      if (o.status === 'running') {
        setTimeout(step, 2000)
      } else if (isCurrent) {
        // Terminal: refresh dependent buttons (done elsewhere via onTerminal
        // callback set at apply so any component / overlay can run side effects).
        const prev = getOp()
        if (prev && onTerminalCb) onTerminalCb(prev)
        if (o.status === 'done' && o.hot === true && prev && prev.kind === 'install' && !pollStop) {
          // Re-check at fire time: if a fresh op took over during the delay
          // window, the reload must be cancelled (getOp() snapshot no longer
          // matches this poll's opId).
          setTimeout(() => {
            const cur = getOp()
            if (cur && cur.opId === opId) { try { location.reload() } catch {} }
          }, 1600)
        }
      }
    }).catch(() => { if (!pollStop) setTimeout(step, 3000) })
  }
  step()
}

/** Terminal callback (install a live-refresh / installed-refresh side effect). */
let onTerminalCb: ((o: OpState) => void) | null = null
export function setOnTerminal(cb: ((o: OpState) => void) | null): void { onTerminalCb = cb }

export function executeOpState(binPath: string): void {
  const cur = op
  if (!cur) return
  const gen = ++opGen
  setOpState({ phase: 'starting', output: '', startingAt: Date.now() })
  const params = cur.kind === 'install'
    ? { source: cur.target, profile: cur.profile, binPath, label: cur.label, skipCheck: !!cur.skipCheck }
    : cur.kind === 'update'
      ? { name: cur.target, profile: cur.profile, binPath, label: cur.label }
      : { pkg: cur.target, profile: cur.profile, binPath, label: cur.label }
  // Install/update/uninstall POSTs legitimately wait minutes (the gated
  // install's server-side resolveInstallSpec runs 1-6 min: probe install
  // timeout 240s + trial boot 120s; uninstall also runs pnpm), so they get a
  // 6-minute transport timeout — the blanket 30s default killed gated
  // installs mid-flight. Everything else keeps the 30s default.
  const OP_START_TIMEOUT_MS = 360000
  apiOp(cur.kind === 'uninstall' ? 'uninstall' : (cur.kind === 'update' ? 'update' : 'install'), params, OP_START_TIMEOUT_MS).then((r) => {
    if (gen !== opGen) {
      // Stale attempt: the user killed (or restarted) while this POST was in
      // flight. If the server DID start an op anyway, kill it best-effort —
      // the user already rejected it — and never adopt the response.
      if (r && r.ok && r.opId) { try { apiOp('kill', { opId: r.opId }) } catch {} }
      return
    }
    if (!r || !r.ok) {
      setOpState({
        phase: 'done', status: r && r.busy ? 'busy' : (r && r.refused ? 'refused' : 'failed'),
        output: String((r && (r.output || r.error)) || '操作失败'), ok: false,
      })
      return
    }
    setOpState({ phase: 'running', opId: r.opId, output: '', status: 'running', elapsedMs: 0, timeoutMs: r.timeoutMs })
    pollOp(r.opId)
  }).catch((e) => {
    if (gen !== opGen) return
    setOpState({ phase: 'done', status: 'failed', output: String((e && e.message) || e), ok: false })
  })
}

export function openOp(kind: 'install' | 'uninstall' | 'update', target: string, label: string, profile: string): void {
  stopPolling()
  op = { kind, target, label, profile: profile || 'web', phase: 'confirm', minimized: false, skipCheck: false }
  emit()
}

export function killCurrentOp(): void {
  // Invalidate any in-flight executeOpState adoption: its .then must land on a
  // stale generation and skip resurrecting the op the user just rejected.
  opGen++
  // Scope the kill to the adopted op when there is one: a kill clicked for op
  // A must not murder an op B the server has since moved to. No opId yet
  // (confirm/starting phase, op not adopted) = kill-any, which the
  // starting-phase kill relies on.
  const params = op && op.opId ? { opId: op.opId } : {}
  apiOp('kill', params).then((r) => {
    if (r && r.ok) {
      setOpState({ phase: 'done', status: 'killed', ok: false })
      return
    }
    // Server reports no running op ("没有正在运行的任务" and friends): nothing
    // was running server-side, so from the user's point of view the kill
    // succeeded — settle as killed instead of a scary generic failure.
    const err = String((r && r.error) || (r && r.output) || '')
    if (r && r.ok === false && /没有正在运行|no.*running/i.test(err)) {
      setOpState({ phase: 'done', status: 'killed', ok: false })
      return
    }
    setOpState({ phase: 'done', status: 'failed', output: String((r && (r.output || r.error)) || '操作失败'), ok: false })
  }).catch(() => {})
}

export function minimizeOp(): void { setOpState({ minimized: true }) }
export function restoreOp(): void { setOpState({ minimized: false }) }
export function setSkipCheck(v: boolean): void { setOpState({ skipCheck: v }) }

/** Resume a running op after a page refresh / tab switch (call once at apply). */
export function resumeOp(): void {
  apiOp('op', {}).then((r) => {
    if (!r || !r.ok || !r.op || r.op.status !== 'running') return
    // Clobber guard: `op` is module state; if the user already started
    // something while this resume response was in flight, keep theirs.
    if (op !== null) return
    const o = r.op
    op = {
      kind: o.kind, target: o.target, label: o.label, profile: o.profile,
      phase: 'running', opId: o.id, output: o.output, status: 'running', exitCode: null,
      minimized: false, elapsedMs: o.elapsedMs, timeoutMs: o.timeoutMs,
    }
    emit()
    pollOp(o.id)
  }).catch(() => {})
}
