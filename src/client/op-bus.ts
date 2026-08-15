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
  timeoutMs?: number
  ok?: boolean
  hot?: boolean
  skipCheck?: boolean
}

export type OpListener = (op: OpState | null) => void

let op: OpState | null = null
let pollStop = false
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

export function apiOp(method: string, params?: Record<string, unknown>): Promise<any> {
  return fetch('/api/dsh-market', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ method }, params || {})),
  }).then((r) => r.json())
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

function pollOp(opId: string): void {
  const step = () => {
    if (pollStop) return
    apiOp('op', { opId }).then((r) => {
      if (pollStop) return
      const o = r && r.ok ? r.op : null
      if (!o) return
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
      } else {
        // Terminal: refresh dependent buttons (done elsewhere via onTerminal
        // callback set at apply so any component / overlay can run side effects).
        const prev = getOp()
        if (prev && onTerminalCb) onTerminalCb(prev)
        if (o.status === 'done' && o.hot === true && prev && prev.kind === 'install' && !pollStop) {
          setTimeout(() => { try { location.reload() } catch {} }, 1600)
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
  setOpState({ phase: 'starting', output: '' })
  const params = cur.kind === 'install'
    ? { source: cur.target, profile: cur.profile, binPath, label: cur.label, skipCheck: !!cur.skipCheck }
    : cur.kind === 'update'
      ? { name: cur.target, profile: cur.profile, binPath, label: cur.label }
      : { pkg: cur.target, profile: cur.profile, binPath, label: cur.label }
  apiOp(cur.kind === 'uninstall' ? 'uninstall' : (cur.kind === 'update' ? 'update' : 'install'), params).then((r) => {
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
    setOpState({ phase: 'done', status: 'failed', output: String((e && e.message) || e), ok: false })
  })
}

export function openOp(kind: 'install' | 'uninstall' | 'update', target: string, label: string, profile: string): void {
  stopPolling()
  op = { kind, target, label, profile: profile || 'web', phase: 'confirm', minimized: false, skipCheck: false }
  emit()
}

export function killCurrentOp(): void {
  apiOp('kill').then((r) => {
    if (r && r.ok) {
      setOpState({ phase: 'done', status: 'killed', ok: false })
    } else {
      setOpState({ phase: 'done', status: 'failed', output: String((r && r.output) || '操作失败'), ok: false })
    }
  }).catch(() => {})
}

export function minimizeOp(): void { setOpState({ minimized: true }) }
export function restoreOp(): void { setOpState({ minimized: false }) }
export function setSkipCheck(v: boolean): void { setOpState({ skipCheck: v }) }

/** Resume a running op after a page refresh / tab switch (call once at apply). */
export function resumeOp(): void {
  apiOp('op', {}).then((r) => {
    if (!r || !r.ok || !r.op || r.op.status !== 'running') return
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
