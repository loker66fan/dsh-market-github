window.__ModuleLoader__.load({
	id: "dsh-market-github",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region src/client/market-css.ts
		const MARKET_CSS = `
.mkts{font-size:14px;line-height:1.6;color:var(--dsw-alias-label-primary);max-width:60rem}
.mkts-env{font-family:ui-monospace,"SF Mono","Cascadia Code",Menlo,monospace;font-size:11px;color:var(--dsw-alias-label-tertiary);margin-bottom:6px;white-space:pre-wrap}
.mkts-env-bad{color:var(--dsw-alias-label-error)}
.mkts-bin-row{display:flex;gap:6px;align-items:center;margin-bottom:6px}
.mkts-bin-input{flex:1;background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;color:var(--dsw-alias-label-primary);font-family:ui-monospace,monospace;font-size:12px;padding:5px 10px;caret-color:var(--dsw-alias-brand-primary)}
.mkts-bin-input::placeholder{color:var(--dsw-alias-label-tertiary)}
.mkts-finder{position:sticky;top:0;z-index:5;background:var(--dsw-alias-bg-layer-2)}
.mkts-row1{display:flex;gap:10px;align-items:center;padding-block:10px}
.mkts-search{flex:1;background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;padding:6px 10px;caret-color:var(--dsw-alias-brand-primary);min-width:0}
.mkts-search::placeholder{color:var(--dsw-alias-label-tertiary)}
.mkts-count{font-family:ui-monospace,monospace;font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
.mkts-livechip{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-static-deepseek-500);border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:2px 10px;cursor:pointer;white-space:nowrap;background:var(--dsw-alias-bg-layer-3)}
.mkts-livechip:hover{border-color:var(--dsw-alias-label-dimmed)}
.mkts-livechip-done{color:var(--dsw-alias-state-success-primary)}
.mkts-livechip-err{color:var(--dsw-alias-label-error)}
.mkts-chips{display:flex;flex-wrap:wrap;gap:6px;padding-bottom:10px;border-bottom:1px solid var(--dsw-alias-border-l2)}
.mkts-chip{font-size:12px;color:var(--dsw-alias-label-secondary);background:none;white-space:nowrap;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:2px 10px;cursor:pointer}
.mkts-chip small{color:var(--dsw-alias-label-tertiary);font-size:10px}
.mkts-chip:hover:not(:disabled){border-color:var(--dsw-alias-label-dimmed)}
.mkts-chip-on{background:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}
.mkts-chip-on small{color:inherit;opacity:.8}
.mkts-sort{display:flex;gap:2px;background:var(--dsw-alias-bg-layer-2);border-radius:8px;padding:2px;margin-left:auto;flex-shrink:0}
.mkts-sort button{border:none;background:none;font:inherit;font-size:12px;color:var(--dsw-alias-label-secondary);padding:3px 10px;border-radius:6px;cursor:pointer;white-space:nowrap}
.mkts-sort button.on{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3);font-weight:600}
.mkts-sec{padding-block:14px 8px;font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary);display:flex;align-items:baseline;gap:8px}
.mkts-sec small{font-size:11px;color:var(--dsw-alias-label-tertiary);font-weight:400}
.mkts-item{display:flex;gap:10px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;margin-bottom:6px;background:var(--dsw-alias-bg-layer-3);transition:border-color .16s;align-items:flex-start}
.mkts-item:hover{border-color:var(--dsw-alias-label-dimmed)}
.mkts-no{flex:none;font-family:ui-monospace,monospace;font-size:11px;color:var(--dsw-alias-label-tertiary);padding-top:3px;min-width:40px}
.mkts-main{flex:1;min-width:0}
.mkts-main h3{margin:0;font-size:14px;font-weight:600;line-height:1.4}
.mkts-main h3 a{color:var(--dsw-alias-label-primary);text-decoration:none}
.mkts-main h3 a:hover{color:var(--dsw-static-deepseek-500)}
.mkts-by{font-family:ui-monospace,monospace;font-size:11px;color:var(--dsw-alias-label-tertiary);margin-left:6px}
.mkts-stars{font-family:ui-monospace,monospace;font-size:11px;color:var(--dsw-alias-label-tertiary);margin-left:6px}
.mkts-gh{margin-left:8px;font-size:11px;color:var(--dsw-static-deepseek-500);text-decoration:none}
.mkts-gh:hover{text-decoration:underline}
.mkts-desc{margin:2px 0 0;color:var(--dsw-alias-label-secondary);font-size:12.5px;max-width:52em;overflow-wrap:break-word}
.mkts-topics{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}
.mkts-topic{font-size:10.5px;font-family:ui-monospace,monospace;color:var(--dsw-alias-label-tertiary);border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:0 8px;line-height:16px}
.mkts-topic:hover{color:var(--dsw-alias-label-secondary);border-color:var(--dsw-alias-label-dimmed)}
.mkts-meta{display:flex;flex-wrap:wrap;gap:10px;margin-top:5px;font-size:11px;font-family:ui-monospace,monospace;color:var(--dsw-alias-label-tertiary)}
.mkts-quota{font-family:ui-monospace,monospace;font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;cursor:help}
.mkts-actions{flex:none;display:flex;flex-direction:column;gap:4px;align-items:flex-end}
.mkts-cmdbtn{appearance:none;background:none;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;font:inherit;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary);padding:3px 12px;cursor:pointer;white-space:nowrap}
.mkts-cmdbtn:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}
.mkts-cmdbtn-primary{background:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}
.mkts-cmdbtn-primary:hover:not(:disabled){opacity:.85;color:var(--dsw-alias-bg-layer-3)}
.mkts-cmdbtn-danger{color:var(--dsw-alias-label-error)}
.mkts-cmdbtn-danger:hover:not(:disabled){border-color:var(--dsw-alias-label-error);color:var(--dsw-alias-label-error)}
.mkts-cmdbtn:disabled{opacity:.4;cursor:default}
.mkts-state{font-size:11px;padding:1px 8px;border-radius:999px;line-height:17px;font-weight:500;white-space:nowrap}
.mkts-state-on{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent);color:var(--dsw-alias-state-success-primary)}
.mkts-state-off{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary)}
.mkts-state-inactive{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent);color:var(--dsw-alias-label-error)}
.mkts-log{background:#1e1e1e;color:#d4d4d4;border-radius:8px;padding:8px 10px;margin-top:6px;white-space:pre-wrap;word-break:break-all;font-size:12px;max-height:240px;overflow:auto}
.mkts-err{color:var(--dsw-alias-label-error);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);border-radius:8px;padding:6px 10px;margin-bottom:10px}
.mkts-toast{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px 10px;margin-bottom:10px}
.mkts-hint{font-size:12px;color:var(--dsw-alias-label-tertiary);margin-top:4px}
.mkts-detail{margin-top:8px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l2);font-size:12px;color:var(--dsw-alias-label-secondary)}
.mkts-detail code{display:block;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px 8px;margin:6px 0;white-space:pre-wrap;word-break:break-all}
.mkts-modal-bg{position:fixed;inset:0;z-index:1000;background:color-mix(in srgb, var(--dsw-alias-bg-base) 60%, transparent);display:flex;align-items:flex-start;justify-content:center;padding:9vh 16px 24px;overflow:auto}
.mkts-modal{width:min(780px,100%);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:14px;padding:16px 18px;box-shadow:0 16px 48px rgba(0,0,0,.35)}
.mkts-modal h4{margin:0 0 10px;font-size:15px;font-weight:600}
.mkts-cmdrow{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px}
.mkts-spin{display:inline-block;width:13px;height:13px;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-static-deepseek-500);border-radius:50%;animation:mkts-spin .7s linear infinite;vertical-align:-2px;margin-right:7px}
@keyframes mkts-spin{to{transform:rotate(360deg)}}
.mkts-site{font-size:12px;color:var(--dsw-alias-label-tertiary);margin-bottom:6px}
.mkts-site a{color:var(--dsw-static-deepseek-500);text-decoration:none}
.mkts-site a:hover{text-decoration:underline}
.mkts-source-note{font-size:11.5px;color:var(--dsw-alias-label-tertiary);margin:0 0 10px}
.mkts-notice{font-size:12px;color:var(--dsw-alias-label-primary);background:color-mix(in srgb, var(--dsw-static-deepseek-500) 12%, transparent);border:1px solid color-mix(in srgb, var(--dsw-static-deepseek-500) 30%, transparent);border-radius:8px;padding:6px 10px;margin-bottom:10px}
.mkts-restart-btn{appearance:none;background:var(--dsw-static-deepseek-500);border:1px solid var(--dsw-static-deepseek-500);color:#fff;border-radius:8px;font-size:12px;line-height:1.5;padding:3px 12px;cursor:pointer;white-space:nowrap}
.mkts-restart-btn:hover:not(:disabled){opacity:.85}
.mkts-restart-btn:disabled{opacity:.5;cursor:default}
.mkts-skipcheck{display:flex;gap:6px;align-items:center;font-size:12px;color:var(--dsw-alias-label-secondary);margin-top:8px;cursor:pointer}

/* ── Global (frame-wide) install progress indicator (shell.overlay) ──
 * Fixed, bottom-right; always visible while an op is in flight, no matter
 * which project/section the user navigated to — the Google-Play-style "still
 * downloading" affordance the market panel alone lost on navigation. */
.mkts-prog{position:fixed;right:18px;bottom:18px;z-index:9990;display:flex;flex-direction:column;gap:6px;width:min(340px,calc(100vw - 36px));pointer-events:none}
.mkts-prog-bar{pointer-events:auto;display:flex;align-items:center;gap:10px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:10px 12px;box-shadow:0 8px 28px rgba(0,0,0,.28);cursor:pointer;transition:border-color .16s}
.mkts-prog-bar:hover{border-color:var(--dsw-static-deepseek-500)}
.mkts-prog-bar.done{border-color:var(--dsw-alias-state-success-primary)}
.mkts-prog-bar.err{border-color:var(--dsw-alias-label-error)}
.mkts-prog-spin{flex:none;width:18px;height:18px;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-static-deepseek-500);border-radius:50%;animation:mkts-spin .7s linear infinite}
.mkts-prog-body{flex:1;min-width:0}
.mkts-prog-title{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mkts-prog-meta{font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}
.mkts-prog-actions{flex:none;display:flex;gap:6px;align-items:center}
.mkts-prog-kill{appearance:none;background:transparent;border:1px solid var(--dsw-alias-label-error);color:var(--dsw-alias-label-error);border-radius:8px;font-size:12px;line-height:1;padding:5px 10px;cursor:pointer;white-space:nowrap}
.mkts-prog-kill:hover{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent)}
.mkts-prog-open{appearance:none;background:none;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);border-radius:8px;font-size:12px;line-height:1;padding:5px 10px;cursor:pointer;white-space:nowrap}
.mkts-prog-open:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}
/* Restart-to-apply toast banner (also frame-wide). */
.mkts-restart{pointer-events:auto;display:flex;align-items:center;gap:10px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-static-deepseek-500);border-left:3px solid var(--dsw-static-deepseek-500);border-radius:10px;padding:9px 12px;box-shadow:0 8px 28px rgba(0,0,0,.25);font-size:12px;color:var(--dsw-alias-label-primary)}
.mkts-restart-close{appearance:none;background:none;border:none;color:var(--dsw-alias-label-tertiary);font-size:14px;cursor:pointer;line-height:1;padding:2px 4px}
.mkts-restart-close:hover{color:var(--dsw-alias-label-primary)}

/* ── Onboarding (startup) plugin market modal ────────────────────────────────
 * The startup/onboarding entry renders the market inside a full-screen modal
 * (the onboarding slot's "a step owns its visible chrome" contract), with a
 * scrim, a header, and a Done/Skip action that hands control back to the
 * settings onboarding coordinator. */
.mkts-ob{position:fixed;inset:0;z-index:1000;display:flex;align-items:flex-start;justify-content:center;padding:6vh 16px 24px;overflow:auto}
.mkts-ob-scrim{position:fixed;inset:0;background:color-mix(in srgb, var(--dsw-alias-bg-base) 62%, transparent)}
.mkts-ob-card{position:relative;width:min(860px,100%);max-height:88vh;display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.4);overflow:hidden}
.mkts-ob-header{display:flex;align-items:center;gap:14px;padding:16px 18px;border-bottom:1px solid var(--dsw-alias-border-l2)}
.mkts-ob-title{flex:1;min-width:0}
.mkts-ob-title h2{margin:0;font-size:17px;font-weight:650;color:var(--dsw-alias-label-primary)}
.mkts-ob-title p{margin:2px 0 0;font-size:12.5px;color:var(--dsw-alias-label-tertiary)}
.mkts-ob-body{overflow:auto;padding:14px 18px 18px}
.mkts-pager{display:flex;justify-content:center;align-items:center;gap:10px;padding:12px 0 4px}
.mkts-pager-info{font-family:ui-monospace,monospace;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.mkts-selfupdate{display:flex;align-items:center;gap:10px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-static-deepseek-500);border-left:3px solid var(--dsw-static-deepseek-500);border-radius:10px;padding:9px 12px;margin-bottom:10px;font-size:12.5px;color:var(--dsw-alias-label-primary)}
.mkts-builtin{margin-top:14px;border-top:1px solid var(--dsw-alias-border-l2);padding-top:10px}
.mkts-builtin-row{display:flex;align-items:baseline;gap:8px;font-family:ui-monospace,monospace;font-size:12px;color:var(--dsw-alias-label-tertiary);padding:3px 0}
.mkts-live-bad{color:var(--dsw-alias-label-error)}
`;
		//#endregion
		//#region src/client/op-bus.ts
		let op = null;
		let pollStop = false;
		const listeners = /* @__PURE__ */ new Set();
		function subscribeOp(fn) {
			listeners.add(fn);
			return () => {
				listeners.delete(fn);
			};
		}
		function getOp() {
			return op;
		}
		function emit() {
			const snapshot = op;
			for (const l of listeners) try {
				l(snapshot);
			} catch {}
		}
		function apiOp(method, params) {
			return fetch("/api/dsh-market", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(Object.assign({ method }, params || {}))
			}).then((r) => r.json());
		}
		function setOpState(patch) {
			if (typeof patch === "function") {
				const partial = patch(op);
				if (partial === null) {
					emit();
					return;
				}
				op = {
					profile: "web",
					minimized: false,
					...op || {},
					...partial
				};
			} else op = op ? {
				...op,
				...patch
			} : {
				profile: "web",
				minimized: false,
				...patch
			};
			emit();
		}
		function closeOpState() {
			op = null;
			pollStop = false;
			emit();
		}
		function stopPolling() {
			pollStop = true;
		}
		/** Localized message for a lost op state; set by apply(). */
		let opLostMessage = "任务状态丢失（服务可能已重启或任务被其他操作接管），请刷新页面后重试";
		function setOpLostMessage(s) {
			opLostMessage = s;
		}
		function pollOp(opId) {
			pollStop = false;
			const step = () => {
				if (pollStop) return;
				apiOp("op", { opId }).then((r) => {
					if (pollStop) return;
					const o = r && r.ok ? r.op : null;
					if (!o) {
						setOpState((prev) => prev && prev.opId === opId ? {
							...prev,
							phase: "done",
							status: "failed",
							ok: false,
							output: opLostMessage
						} : prev);
						return;
					}
					setOpState((prev) => {
						if (!prev || prev.opId !== opId) return prev;
						if (o.status === "running") return {
							...prev,
							phase: "running",
							output: o.output,
							elapsedMs: o.elapsedMs,
							timeoutMs: o.timeoutMs
						};
						return {
							...prev,
							phase: "done",
							output: o.output,
							status: o.status,
							exitCode: o.exitCode,
							ok: o.status === "done",
							hot: o.hot === true
						};
					});
					if (o.status === "running") setTimeout(step, 2e3);
					else {
						const prev = getOp();
						if (prev && onTerminalCb) onTerminalCb(prev);
						if (o.status === "done" && o.hot === true && prev && prev.kind === "install" && !pollStop) setTimeout(() => {
							try {
								location.reload();
							} catch {}
						}, 1600);
					}
				}).catch(() => {
					if (!pollStop) setTimeout(step, 3e3);
				});
			};
			step();
		}
		/** Terminal callback (install a live-refresh / installed-refresh side effect). */
		let onTerminalCb = null;
		function setOnTerminal(cb) {
			onTerminalCb = cb;
		}
		function executeOpState(binPath) {
			const cur = op;
			if (!cur) return;
			setOpState({
				phase: "starting",
				output: "",
				startingAt: Date.now()
			});
			const params = cur.kind === "install" ? {
				source: cur.target,
				profile: cur.profile,
				binPath,
				label: cur.label,
				skipCheck: !!cur.skipCheck
			} : cur.kind === "update" ? {
				name: cur.target,
				profile: cur.profile,
				binPath,
				label: cur.label
			} : {
				pkg: cur.target,
				profile: cur.profile,
				binPath,
				label: cur.label
			};
			apiOp(cur.kind === "uninstall" ? "uninstall" : cur.kind === "update" ? "update" : "install", params).then((r) => {
				if (!r || !r.ok) {
					setOpState({
						phase: "done",
						status: r && r.busy ? "busy" : r && r.refused ? "refused" : "failed",
						output: String(r && (r.output || r.error) || "操作失败"),
						ok: false
					});
					return;
				}
				setOpState({
					phase: "running",
					opId: r.opId,
					output: "",
					status: "running",
					elapsedMs: 0,
					timeoutMs: r.timeoutMs
				});
				pollOp(r.opId);
			}).catch((e) => {
				setOpState({
					phase: "done",
					status: "failed",
					output: String(e && e.message || e),
					ok: false
				});
			});
		}
		function openOp(kind, target, label, profile) {
			stopPolling();
			op = {
				kind,
				target,
				label,
				profile: profile || "web",
				phase: "confirm",
				minimized: false,
				skipCheck: false
			};
			emit();
		}
		function killCurrentOp() {
			apiOp("kill").then((r) => {
				if (r && r.ok) setOpState({
					phase: "done",
					status: "killed",
					ok: false
				});
				else setOpState({
					phase: "done",
					status: "failed",
					output: String(r && r.output || "操作失败"),
					ok: false
				});
			}).catch(() => {});
		}
		function minimizeOp() {
			setOpState({ minimized: true });
		}
		function restoreOp() {
			setOpState({ minimized: false });
		}
		function setSkipCheck(v) {
			setOpState({ skipCheck: v });
		}
		/** Resume a running op after a page refresh / tab switch (call once at apply). */
		function resumeOp() {
			apiOp("op", {}).then((r) => {
				if (!r || !r.ok || !r.op || r.op.status !== "running") return;
				const o = r.op;
				op = {
					kind: o.kind,
					target: o.target,
					label: o.label,
					profile: o.profile,
					phase: "running",
					opId: o.id,
					output: o.output,
					status: "running",
					exitCode: null,
					minimized: false,
					elapsedMs: o.elapsedMs,
					timeoutMs: o.timeoutMs
				};
				emit();
				pollOp(o.id);
			}).catch(() => {});
		}
		//#endregion
		//#region src/client/index.ts
		let LOCALE = "en";
		try {
			if (String(navigator.language || navigator.userLanguage || "").toLowerCase().startsWith("zh")) LOCALE = "zh";
		} catch {}
		const STR = {
			zh: {
				search: "搜索插件…",
				all: "全部",
				instFilter: "已安装",
				detail: "详情",
				collapse: "收起",
				install: "安装",
				uninstall: "卸载",
				execute: "执行",
				cancel: "取消",
				close: "关闭",
				loading: "加载插件目录…",
				noMatch: "没有匹配的插件",
				binPlaceholder: "dsh CLI 路径（自动探测失败时填写，已记住上次填写）",
				reprobe: "重新探测",
				installOk: "安装成功，下次重启 Web 服务后生效",
				uninstallOk: "卸载成功，下次重启 Web 服务后生效",
				opFailed: "操作失败",
				hotOk: "安装成功，已热挂载，即将自动刷新页面生效",
				updateOk: "更新成功，下次重启 Web 服务后生效",
				updateBtn: "更新",
				updating: "更新中…",
				upToDate: "已是最新",
				updateFail: "更新检测失败",
				updLocal: "本地链接",
				running: "执行中…（pnpm 安装可能需要一段时间）",
				cmdLabel: "安装命令（来自官网，含目标 profile）:",
				noCmd: "（无官方安装命令）",
				hint: "安装后需重启 Web 服务生效；GitHub 源会执行包内 prepare 脚本（验证通过后本市场会自动为该包在 profile 的 pnpm-workspace.yaml 放行构建）。装进 web 前会自动把关：① 读取该仓库的 dsh 清单（声明 dsh.client 的 web 插件直接安装，仅声明 bundle 的走临时环境试装启动验证）；② 验证失败会给出真实错误且不改动现有安装。纯 host 插件装好后会自动热挂载（无需重启）；含 Web 客户端的插件需重启后生效。确实需要强制安装时可勾选\"跳过安全检查\"（风险自负）。",
				gh: "GitHub ↗",
				envLine: "环境",
				parseFail: "解析失败",
				fetchFail: "抓取失败",
				submit: "提交任务…",
				probing: "试装验证中…（临时环境实际启动验证 web 可正常启动后才安装，约 1~6 分钟）",
				min: "最小化到后台",
				kill: "终止任务",
				back: "返回",
				stDone: "完成",
				stFailed: "失败",
				stKilled: "已终止",
				stTimeout: "超时终止",
				stBusy: "已有任务进行中",
				stRefused: "已拒绝",
				liveChip: "插件任务",
				elapsed: "已耗时 {s}s（超过 {t}s 自动终止）",
				newOp: "新任务",
				site: "插件来源",
				sourceNote: "结果实时来自 GitHub topic:dsh-plugin，未经人工审核；请自行确认插件可信后再安装。",
				sortDefault: "默认",
				sortHot: "最热",
				sortNew: "最新",
				enable: "启用",
				disable: "停用",
				active: "已启用",
				inactive: "已停用",
				activeLive: "已启用（热挂载生效）",
				inactiveLive: "已停用（立即生效）",
				toggling: "切换中…",
				progRunning: "安装进行中",
				progDone: "安装完成",
				progErr: "安装失败",
				restartBanner: "插件状态已变更，重启 Web 服务后生效",
				restartHint: "重启后生效",
				restartNow: "立即重启",
				restarting: "重启中…",
				progMetaCmd: "{kind} {label} · {s}s",
				noActive: "未安装",
				marketTitle: "插件商城",
				marketSubtitle: "搜索并安装 GitHub 上的 dsh 社区插件",
				done: "完成 / 跳过",
				searching: "搜索 GitHub…",
				prev: "上一页",
				next: "下一页",
				totalResults: "共 {n} 个",
				updatedAt: "更新于 {d}",
				quotaHint: "GitHub 搜索剩余配额（次/分钟）；配置 GITHUB_TOKEN 可提高",
				opLost: "任务状态丢失（服务可能已重启或任务被其他操作接管），请刷新页面后重试",
				waiting: "已等待 {s}s…",
				installedTab: "已安装",
				noInstalled: "还没有安装过第三方插件，去「插件市场」逛逛吧",
				selfUpdate: "插件市场可更新：v{cur} → v{latest}",
				builtin: "内置插件（随 harness 提供，只读）",
				updTo: "→ v{latest}",
				specNote: "安装源",
				liveActive: "运行中",
				livePending: "待加载",
				liveLoading: "加载中",
				liveFailed: "加载失败",
				liveUnloading: "卸载中",
				liveStale: "已启用（重启后生效）"
			},
			en: {
				search: "Search plugins…",
				all: "All",
				instFilter: "Installed",
				detail: "Details",
				collapse: "Collapse",
				install: "Install",
				uninstall: "Uninstall",
				execute: "Run",
				cancel: "Cancel",
				close: "Close",
				loading: "Loading plugin directory…",
				noMatch: "No matching plugins",
				binPlaceholder: "dsh CLI path (fill when auto-detection fails; remembered)",
				reprobe: "Re-probe",
				installOk: "Installed — restart the web server to activate",
				uninstallOk: "Uninstalled — restart the web server to activate",
				opFailed: "Operation failed",
				hotOk: "Installed and hot-mounted — refreshing the page now",
				updateOk: "Updated — restart the web server to activate",
				updateBtn: "Update",
				updating: "Updating…",
				upToDate: "Up to date",
				updateFail: "Update check failed",
				updLocal: "linked (dev)",
				running: "Running… (pnpm install may take a while)",
				cmdLabel: "Install command (from the site, incl. target profile):",
				noCmd: "(no official install command)",
				hint: "Restart the web server after install. GitHub sources run the package prepare script (after verification, the market consents the build for exactly that package in the profile pnpm-workspace.yaml). Installing into web is gated: ① the repo's dsh manifest is read (a plugin declaring dsh.client installs directly; a bundle-only plugin goes through a trial boot in a throwaway environment); ② a failed verification shows the real error and leaves the current install untouched. Host-only plugins hot-mount after install (no restart); plugins with a web client half need a restart. To force-install anyway, tick \"skip safety checks\" (at your own risk).",
				gh: "GitHub ↗",
				envLine: "Env",
				parseFail: "Parse failed",
				fetchFail: "Fetch failed",
				submit: "Submitting…",
				probing: "Trial-boot verifying… (installing into a throwaway env and starting it once to prove web still boots; ~1-6 min)",
				min: "Minimize to background",
				kill: "Kill task",
				back: "Back",
				stDone: "Done",
				stFailed: "Failed",
				stKilled: "Killed",
				stTimeout: "Timed out",
				stBusy: "A task is already running",
				stRefused: "Refused",
				liveChip: "Plugin task",
				elapsed: "{s}s elapsed (auto-kill after {t}s)",
				newOp: "New task",
				site: "Plugin source",
				sourceNote: "Results come live from GitHub topic:dsh-plugin (unreviewed) — verify a plugin yourself before installing.",
				sortDefault: "Default",
				sortHot: "Top",
				sortNew: "New",
				enable: "Enable",
				disable: "Disable",
				active: "Active",
				inactive: "Inactive",
				activeLive: "Enabled (hot-mounted)",
				inactiveLive: "Disabled (live)",
				toggling: "Switching…",
				progRunning: "Install in progress",
				progDone: "Install done",
				progErr: "Install failed",
				restartBanner: "Plugin state changed — restart the web server to activate",
				restartHint: "Restart required",
				restartNow: "Restart now",
				restarting: "Restarting…",
				progMetaCmd: "{kind} {label} · {s}s",
				noActive: "Not installed",
				marketTitle: "Plugin Market",
				marketSubtitle: "Search and install community dsh plugins from GitHub",
				done: "Done / Skip",
				searching: "Searching GitHub…",
				prev: "Prev",
				next: "Next",
				totalResults: "{n} total",
				updatedAt: "Updated {d}",
				quotaHint: "GitHub search quota remaining (per minute); set GITHUB_TOKEN to raise it",
				opLost: "Task state lost (the server may have restarted or another task took over); refresh the page and retry",
				waiting: "Waited {s}s…",
				installedTab: "Installed",
				noInstalled: "No third-party plugins installed yet — browse the Plugin Market",
				selfUpdate: "Market update available: v{cur} → v{latest}",
				builtin: "Built-in plugins (shipped with the harness, read-only)",
				updTo: "→ v{latest}",
				specNote: "source",
				liveActive: "running",
				livePending: "pending",
				liveLoading: "loading",
				liveFailed: "load failed",
				liveUnloading: "unloading",
				liveStale: "enabled (restart to load)"
			}
		};
		const t = (k) => {
			const m = STR[LOCALE];
			return m && m[k] !== void 0 ? m[k] : STR["zh"][k] !== void 0 ? STR["zh"][k] : k;
		};
		const fmt = (k, map) => String(t(k)).replace(/\{(\w+)\}/g, (_, n) => String(map[n] !== void 0 ? map[n] : ""));
		let MARKET_PER_PAGE = 50;
		function repoNameOf(url) {
			const s = String(url || "").replace(/\/+$/, "");
			const i = s.lastIndexOf("/");
			return i >= 0 ? s.slice(i + 1) : s;
		}
		function repoOfValue(v) {
			const s = String(v || "").replace(/\/+$/, "");
			const i = Math.max(s.lastIndexOf("/"), s.lastIndexOf(":"));
			return s.slice(i + 1).replace(/\.git$/, "").replace(/#.*$/, "");
		}
		function installedPkgName(plugin, installed) {
			if (!installed) return null;
			const repo = repoNameOf(plugin.url).toLowerCase();
			const deps = installed.dependencies || {};
			for (const key of Object.keys(deps)) {
				const k = key.toLowerCase();
				if (k === repo || k.endsWith("/" + repo) || k === "github:" + repo) return key;
				if (repoOfValue(deps[key]).toLowerCase() === repo) return key;
			}
			for (const b of installed.bundles || []) {
				const n = String(b || "").toLowerCase();
				if (n === repo || n.endsWith("/" + repo) || n === "github:" + repo) return b;
			}
			return null;
		}
		function isInstalled(plugin, installedMap) {
			return installedPkgName(plugin, installedMap && installedMap[plugin.profile || "web"]) !== null;
		}
		function isActive(plugin, installedMap) {
			const state = installedMap && installedMap[plugin.profile || "web"];
			const pkgName = installedPkgName(plugin, state);
			if (!pkgName || !state) return false;
			const norm = (s) => String(s).toLowerCase().replace(/^github:/, "").replace(/\.git$/, "").replace(/#.*$/, "");
			const needle = norm(pkgName);
			return (state.bundles || []).some((b) => norm(b) === needle) || Array.isArray(state.clientRows) && state.clientRows.some((b) => norm(b) === needle);
		}
		let reloadAttempts = 0;
		/** Poll the origin until the restarted server answers, then reload the page. */
		function pollReload() {
			reloadAttempts += 1;
			if (reloadAttempts > 60) {
				reloadAttempts = 0;
				return;
			}
			fetch(window.location.origin + "/", { cache: "no-store" }).then((r) => {
				if (r.ok) try {
					location.reload();
				} catch {}
				else setTimeout(pollReload, 2e3);
			}).catch(() => {
				setTimeout(pollReload, 2e3);
			});
		}
		function GlobalProgress() {
			const [, force] = (0, react.useState)(0);
			const [restarting, setRestarting] = (0, react.useState)(false);
			(0, react.useEffect)(() => subscribeOp(() => force((n) => n + 1)), []);
			const [, tick] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				const iv = setInterval(() => tick((n) => n + 1), 1e3);
				return () => {
					clearInterval(iv);
				};
			}, []);
			const op = getOp();
			if (!op || op.phase === "confirm") return null;
			const running = op.phase === "starting" || op.phase === "running";
			const colored = op.phase === "done" ? op.ok ? "done" : "err" : "";
			const kindLabel = op.kind === "install" ? t("install") : op.kind === "update" ? t("updateBtn") : t("uninstall");
			const elapsedS = op.phase === "starting" ? Math.max(0, Math.round((Date.now() - (op.startingAt || Date.now())) / 1e3)) : Math.round((op.elapsedMs || 0) / 1e3);
			const title = running ? kindLabel + " · " + op.label : op.phase === "done" ? op.ok ? op.hot ? t("hotOk") : op.kind === "install" ? t("installOk") : t("updateOk") : t("progErr") + " · " + op.label : "";
			const meta = running ? fmt("progMetaCmd", {
				kind: kindLabel,
				label: op.label,
				s: elapsedS
			}) : op.status === "killed" ? t("stKilled") : op.status === "timeout" ? t("stTimeout") : op.kind === "install" ? op.hot ? t("progDone") : t("restartHint") : "";
			const needRestart = op.phase === "done" && op.ok && op.hot !== true && op.kind !== "uninstall";
			const requestRestart = () => {
				if (restarting) return;
				setRestarting(true);
				apiOp("restart").then((r) => {
					if (r && r.ok) {
						pollReload();
						return;
					}
					setRestarting(false);
				}).catch(() => {
					setRestarting(false);
				});
			};
			return (0, react.createElement)("div", { className: "mkts mkts-prog" }, needRestart ? (0, react.createElement)("div", { className: "mkts-restart" }, (0, react.createElement)("span", { style: { flex: 1 } }, t("restartBanner")), (0, react.createElement)("button", {
				className: "mkts-restart-btn",
				disabled: restarting,
				onClick: requestRestart
			}, restarting ? t("restarting") : t("restartNow"))) : null, (0, react.createElement)("div", {
				className: "mkts-prog-bar " + colored,
				onClick: running ? minimizeOp : closeOpState,
				title
			}, running ? (0, react.createElement)("span", { className: "mkts-prog-spin" }) : null, (0, react.createElement)("div", { className: "mkts-prog-body" }, (0, react.createElement)("div", { className: "mkts-prog-title" }, title), (0, react.createElement)("div", { className: "mkts-prog-meta" }, meta)), (0, react.createElement)("div", { className: "mkts-prog-actions" }, running ? (0, react.createElement)("button", {
				className: "mkts-prog-kill",
				onClick: (e) => {
					e.stopPropagation();
					killCurrentOp();
				},
				title: t("kill")
			}, t("kill")) : (0, react.createElement)("button", {
				className: "mkts-prog-open",
				onClick: closeOpState
			}, t("close")))));
		}
		function MarketPanel(props) {
			const embedded = !!props.embedded;
			const [data, setData] = (0, react.useState)({
				phase: "loading",
				plugins: [],
				cats: [],
				installed: null,
				updates: null,
				error: null
			});
			const [envInfo, setEnvInfo] = (0, react.useState)(null);
			const [binPath, setBinPath] = (0, react.useState)((() => {
				try {
					return localStorage.getItem("mktsBin") || "";
				} catch {
					return "";
				}
			})());
			const [query, setQuery] = (0, react.useState)("");
			const [showInstalled, setShowInstalled] = (0, react.useState)(false);
			const [sortBy, setSortBy] = (0, react.useState)("stars");
			const [page, setPage] = (0, react.useState)(1);
			const [open, setOpen] = (0, react.useState)(null);
			const [, force] = (0, react.useState)(0);
			const [, tick] = (0, react.useState)(0);
			const topRef = (0, react.useRef)(null);
			const op = getOp();
			(0, react.useEffect)(() => {
				const iv = setInterval(() => tick((n) => n + 1), 1e3);
				return () => {
					clearInterval(iv);
				};
			}, []);
			(0, react.useEffect)(() => {
				return subscribeOp(() => force((n) => n + 1));
			}, []);
			const changeBin = (v) => {
				setBinPath(v);
				try {
					localStorage.setItem("mktsBin", v);
				} catch {}
			};
			const probe = () => {
				apiOp("probe", { binPath }).then((r) => setEnvInfo(r)).catch(() => setEnvInfo({ error: "probe failed" }));
			};
			const loadInstalled = (plugins) => {
				const list = plugins || data.plugins || [];
				const profiles = [...new Set(list.map((p) => p.profile || "web").concat("web"))];
				Promise.all(profiles.map((profile) => apiOp("installed", { profile }).then((r) => [profile, r]).catch(() => [profile, null]))).then((entries) => {
					const webEntry = entries.find(([profile]) => profile === "web");
					const self = webEntry && webEntry[1] && webEntry[1].self ? webEntry[1].self : null;
					setData((d) => ({
						...d,
						installed: Object.fromEntries(entries),
						self
					}));
				}).catch(() => setData((d) => ({
					...d,
					installed: null
				})));
				Promise.all(profiles.map((profile) => apiOp("updates", { profile }).then((r) => [profile, r && r.ok ? r.updates || {} : {}]).catch(() => [profile, {}]))).then((entries) => setData((d) => ({
					...d,
					updates: Object.fromEntries(entries)
				}))).catch(() => setData((d) => ({
					...d,
					updates: null
				})));
			};
			(0, react.useEffect)(() => {
				probe();
			}, []);
			const PER_PAGE = MARKET_PER_PAGE;
			const MAX_RESULTS = 1e3;
			const searchSeq = (0, react.useRef)(0);
			const pageCount = (total) => Math.max(1, Math.ceil(Math.min(total, MAX_RESULTS) / PER_PAGE));
			const failNotice = (message) => {
				setData((d) => d.phase === "ready" ? {
					...d,
					notice: message
				} : {
					...d,
					phase: "error",
					error: message
				});
			};
			const runSearch = (q, sort, pageNum) => {
				const sortParam = sort === "updated" ? "updated" : "stars";
				const seq = ++searchSeq.current;
				apiOp("search", {
					q,
					sort: sortParam,
					order: "desc",
					perPage: PER_PAGE,
					page: pageNum
				}).then((r) => {
					if (seq !== searchSeq.current) return;
					if (!r || !r.ok) {
						failNotice(String(r && r.error || "search failed"));
						return;
					}
					const plugins = r.plugins || [];
					setData((d) => ({
						...d,
						phase: "ready",
						notice: null,
						plugins,
						cats: [],
						total: typeof r.total === "number" ? r.total : null,
						rate: r.rate ?? null
					}));
					loadInstalled(plugins);
				}).catch((e) => {
					if (seq !== searchSeq.current) return;
					failNotice(t("fetchFail") + ": " + String(e && e.message || e));
				});
			};
			(0, react.useEffect)(() => {
				setPage(1);
				const timer = setTimeout(() => {
					setData((d) => ({
						...d,
						phase: "loading",
						error: null
					}));
					runSearch(query, sortBy, 1);
				}, query.trim() === "" ? 0 : 350);
				return () => {
					clearTimeout(timer);
				};
			}, [query, sortBy]);
			const goPage = (n) => {
				const total = typeof data.total === "number" ? data.total : (data.plugins || []).length;
				if (n < 1 || n > pageCount(total) || n === page) return;
				setPage(n);
				runSearch(query, sortBy, n);
				topRef.current?.scrollIntoView({
					block: "start",
					behavior: "smooth"
				});
			};
			(0, react.useEffect)(() => subscribeOp((o) => {
				if (!o || o.phase !== "done") return;
				loadInstalled();
			}), []);
			const toggle = (p, active) => {
				const pkgName = installedPkgName(p, data.installed && data.installed[p.profile || "web"]);
				if (!pkgName) {
					openOp("install", p.source, p.name, p.profile);
					return;
				}
				setToggling(p.url);
				apiOp("toggleActive", {
					profile: p.profile,
					name: pkgName,
					enabled: !active
				}).then((r) => {
					setToggling(null);
					if (r && r.ok) {
						const toast = toggleOkToast(r);
						setData((d) => ({
							...d,
							toast: toast.text,
							toastKind: toast.kind
						}));
						loadInstalled();
					} else setData((d) => ({
						...d,
						toast: String(r && r.error || t("opFailed")),
						toastKind: "err"
					}));
				}).catch(() => {
					setToggling(null);
				});
			};
			const [toggling, setToggling] = (0, react.useState)(null);
			const filtered = (data.plugins || []).filter((p) => {
				if (showInstalled && !isInstalled(p, data.installed)) return false;
				return true;
			});
			const installedCount = (data.plugins || []).filter((p) => isInstalled(p, data.installed)).length;
			const groups = [{
				id: "all",
				label: null,
				items: sortBy === "updated" ? [...filtered].sort((a, b) => String(b.added || "").localeCompare(String(a.added || ""))) : filtered
			}];
			const totalCount = typeof data.total === "number" ? data.total : (data.plugins || []).length;
			const totalPages = pageCount(totalCount);
			const binOk = envInfo && (envInfo.dshBin || envInfo.binProvided && envInfo.binValid);
			const envReady = envInfo && binOk && envInfo.node && envInfo.dshHome;
			const statusText = (s) => ({
				done: t("stDone"),
				failed: t("stFailed"),
				killed: t("stKilled"),
				timeout: t("stTimeout"),
				busy: t("stBusy"),
				refused: t("stRefused")
			})[s] || t("opFailed");
			const opTitle = (o) => (o.kind === "install" ? t("install") : o.kind === "update" ? t("updateBtn") : t("uninstall")) + " " + o.label;
			const modal = op && !op.minimized ? (0, react.createElement)("div", {
				className: "mkts-modal-bg",
				onClick: () => {
					if (op.phase === "running" || op.phase === "starting") minimizeOp();
					else closeOpState();
				}
			}, (0, react.createElement)("div", {
				className: "mkts-modal",
				onClick: (e) => e.stopPropagation()
			}, (0, react.createElement)("h4", null, opTitle(op)), (0, react.createElement)("div", { style: {
				fontSize: 12,
				color: "var(--dsw-alias-label-secondary)",
				fontFamily: "ui-monospace,monospace"
			} }, op.kind === "uninstall" ? "dsh plugin --profile " + op.profile + " remove " + op.target : op.kind === "update" ? "dsh plugin --profile " + op.profile + " add <latest " + op.target + ">" : "dsh plugin --profile " + op.profile + " add " + op.target), op.phase === "confirm" ? (0, react.createElement)("div", null, (0, react.createElement)("div", { className: "mkts-cmdrow" }, (0, react.createElement)("span", { style: {
				fontSize: 12,
				color: "var(--dsw-alias-label-secondary)"
			} }, "✓ " + t("cmdLabel").replace(":", "")), (0, react.createElement)("button", {
				className: "mkts-cmdbtn mkts-cmdbtn-primary",
				onClick: () => executeOpState(binPath)
			}, t("execute")), (0, react.createElement)("button", {
				className: "mkts-cmdbtn",
				onClick: closeOpState
			}, t("cancel"))), op.kind === "install" ? (0, react.createElement)("label", { className: "mkts-skipcheck" }, (0, react.createElement)("input", {
				type: "checkbox",
				checked: !!op.skipCheck,
				onChange: (e) => setSkipCheck(e.target.checked)
			}), (0, react.createElement)("span", null, LOCALE === "zh" ? "跳过安全检查（跳过 dsh 清单校验与试装验证，风险自负：可能装坏 web 启动）" : "Skip safety checks (skip dsh-manifest verification and trial boot; risky: may break web boot)")) : null) : null, op.phase === "starting" ? (0, react.createElement)("div", { className: "mkts-cmdrow" }, (0, react.createElement)("span", { className: "mkts-spin" }), (0, react.createElement)("span", { style: { fontSize: 12 } }, (op.kind === "install" && op.profile === "web" && !op.skipCheck ? t("probing") : t("submit")) + " · " + fmt("waiting", { s: Math.max(0, Math.round((Date.now() - (op.startingAt || Date.now())) / 1e3)) }))) : null, op.phase === "running" ? (0, react.createElement)("div", null, (0, react.createElement)("div", { className: "mkts-cmdrow" }, (0, react.createElement)("span", { className: "mkts-spin" }), (0, react.createElement)("span", { style: { fontSize: 12 } }, t("running") + " · " + fmt("elapsed", {
				s: Math.round((op.elapsedMs || 0) / 1e3),
				t: op.timeoutMs ? Math.round(op.timeoutMs / 1e3) : 120
			})), (0, react.createElement)("button", {
				className: "mkts-cmdbtn",
				onClick: minimizeOp
			}, t("min")), (0, react.createElement)("button", {
				className: "mkts-cmdbtn mkts-cmdbtn-danger",
				onClick: killCurrentOp
			}, t("kill"))), op.output ? (0, react.createElement)("div", { className: "mkts-log" }, op.output) : null) : null, op.phase === "done" ? (0, react.createElement)("div", null, (0, react.createElement)("div", { style: {
				fontSize: 12,
				fontWeight: 600,
				color: op.ok ? "var(--dsw-alias-state-success-primary)" : "var(--dsw-alias-label-error)"
			} }, op.ok ? op.kind === "install" ? op.hot ? t("hotOk") : t("installOk") : op.kind === "update" ? t("updateOk") : t("uninstallOk") : statusText(op.status || "") + (op.exitCode !== null && op.exitCode !== void 0 ? " (exit " + op.exitCode + ")" : "")), op.output ? (0, react.createElement)("div", { className: "mkts-log" }, op.output) : null, (0, react.createElement)("div", { className: "mkts-cmdrow" }, (0, react.createElement)("button", {
				className: "mkts-cmdbtn",
				onClick: closeOpState
			}, t("close")))) : null)) : null;
			const liveChip = op && op.minimized ? (0, react.createElement)("button", {
				className: "mkts-livechip" + (op.phase === "done" ? op.ok ? " mkts-livechip-done" : " mkts-livechip-err" : ""),
				onClick: restoreOp,
				title: op.label
			}, op.phase === "done" ? op.ok ? t("stDone") : statusText(op.status || "") : t("liveChip"), " · " + op.label) : null;
			const toast = data.toast;
			return (0, react.createElement)("div", {
				className: "mkts",
				ref: topRef
			}, toast ? (0, react.createElement)("div", { className: data.toastKind === "ok" ? "mkts-toast" : "mkts-err" }, toast) : null, data.self && data.self.updateAvailable ? (0, react.createElement)("div", { className: "mkts-selfupdate" }, (0, react.createElement)("span", { style: { flex: 1 } }, fmt("selfUpdate", {
				cur: data.self.version,
				latest: data.self.latestVersion
			})), (0, react.createElement)("button", {
				className: "mkts-cmdbtn mkts-cmdbtn-primary",
				disabled: !!(op && op.phase !== "done"),
				onClick: () => openOp("update", data.self.name, data.self.name, "web")
			}, t("updateBtn"))) : null, data.notice ? (0, react.createElement)("div", { className: "mkts-notice" }, data.notice) : null, embedded ? null : envInfo ? (0, react.createElement)("div", { className: "mkts-env" + (envReady ? "" : " mkts-env-bad") }, t("envLine") + ": DSH_HOME " + (envInfo.dshHome ? "✓ " + envInfo.dshHome : "✗") + " · node " + (envInfo.node ? "✓" : "✗") + " · dsh " + (binOk ? "✓" : "✗") + (envInfo.proxy ? " · proxy ✓ " + envInfo.proxy : " · proxy ✗（直连）") + (!envInfo.dshBin && !(envInfo.binProvided && envInfo.binValid) ? " — dsh CLI 未定位" : "")) : null, embedded ? null : (0, react.createElement)("div", { className: "mkts-bin-row" }, (0, react.createElement)("input", {
				className: "mkts-bin-input",
				placeholder: t("binPlaceholder"),
				value: binPath,
				onChange: (e) => changeBin(e.target.value)
			}), (0, react.createElement)("button", {
				className: "mkts-cmdbtn",
				onClick: probe
			}, t("reprobe"))), (0, react.createElement)("div", { className: "mkts-site" }, (0, react.createElement)("span", null, t("site") + ": "), (0, react.createElement)("a", {
				href: "https://github.com/topics/dsh-plugin",
				target: "_blank",
				rel: "noopener noreferrer"
			}, "github.com/topics/dsh-plugin"), (0, react.createElement)("span", null, " ↗")), (0, react.createElement)("div", { className: "mkts-source-note" }, t("sourceNote")), modal, (0, react.createElement)("div", { className: "mkts-finder" }, (0, react.createElement)("div", { className: "mkts-row1" }, (0, react.createElement)("input", {
				className: "mkts-search",
				placeholder: t("search"),
				value: query,
				onChange: (e) => setQuery(e.target.value)
			}), liveChip, (0, react.createElement)("span", { className: "mkts-count" }, showInstalled ? filtered.length + " " + t("instFilter") : fmt("totalResults", { n: totalCount })), data.rate && data.rate.remaining !== null && data.rate.remaining !== void 0 ? (0, react.createElement)("span", {
				className: "mkts-quota",
				title: t("quotaHint")
			}, "GH " + data.rate.remaining + "/" + (data.rate.limit ?? "?")) : null), (0, react.createElement)("div", { className: "mkts-chips" }, (0, react.createElement)("button", {
				className: "mkts-chip" + (showInstalled ? " mkts-chip-on" : ""),
				onClick: () => {
					setShowInstalled(!showInstalled);
				}
			}, t("instFilter"), " ", (0, react.createElement)("small", null, installedCount)), (0, react.createElement)("div", { className: "mkts-sort" }, [["stars", t("sortHot")], ["updated", t("sortNew")]].map(([key, label]) => (0, react.createElement)("button", {
				key,
				className: sortBy === key ? "on" : "",
				onClick: () => setSortBy(key)
			}, label))))), data.phase === "loading" ? (0, react.createElement)("div", null, t("loading")) : null, data.phase === "error" ? (0, react.createElement)("div", { className: "mkts-err" }, data.error) : null, data.phase === "ready" ? groups.map((g) => (0, react.createElement)("div", { key: g.id }, g.label ? (0, react.createElement)("div", { className: "mkts-sec" }, g.label, (0, react.createElement)("small", null, g.items.length)) : null, g.items.map((p, i) => {
				const inst = isInstalled(p, data.installed);
				const active = isActive(p, data.installed);
				const isOpen = open === p.url;
				const opActive = !!(op && op.phase !== "done");
				const isToggling = toggling === p.url;
				return (0, react.createElement)("div", {
					key: p.url,
					className: "mkts-item"
				}, (0, react.createElement)("span", { className: "mkts-no" }, "№ " + String(i + 1).padStart(2, "0")), (0, react.createElement)("div", { className: "mkts-main" }, (0, react.createElement)("h3", null, (0, react.createElement)("a", {
					href: p.url,
					target: "_blank",
					rel: "noopener noreferrer"
				}, p.name), typeof p.stars === "number" ? (0, react.createElement)("span", { className: "mkts-stars" }, "★ " + p.stars) : null, p.by ? (0, react.createElement)("span", { className: "mkts-by" }, "@" + p.by) : null, (0, react.createElement)("a", {
					className: "mkts-gh",
					href: p.url,
					target: "_blank",
					rel: "noopener noreferrer"
				}, t("gh"))), p.desc ? (0, react.createElement)("p", { className: "mkts-desc" }, p.desc) : null, Array.isArray(p.topics) && p.topics.length > 0 ? (0, react.createElement)("div", { className: "mkts-topics" }, p.topics.slice(0, 6).map((topic) => (0, react.createElement)("span", {
					key: topic,
					className: "mkts-topic"
				}, topic))) : null, p.lang || p.license || p.added ? (0, react.createElement)("div", { className: "mkts-meta" }, p.lang ? (0, react.createElement)("span", null, p.lang) : null, p.license ? (0, react.createElement)("span", null, p.license) : null, p.added ? (0, react.createElement)("span", null, fmt("updatedAt", { d: String(p.added).slice(0, 10) })) : null) : null, isOpen ? (0, react.createElement)("div", { className: "mkts-detail" }, (0, react.createElement)("div", null, t("cmdLabel")), (0, react.createElement)("code", null, p.cmd || t("noCmd")), (0, react.createElement)("div", { className: "mkts-hint" }, t("hint"))) : null), (0, react.createElement)("div", { className: "mkts-actions" }, (0, react.createElement)("span", { className: "mkts-state " + (inst ? active ? "mkts-state-on" : "mkts-state-inactive" : "mkts-state-off") }, inst ? active ? t("active") : t("inactive") : t("noActive")), (0, react.createElement)("button", {
					className: "mkts-cmdbtn",
					onClick: () => setOpen(isOpen ? null : p.url)
				}, isOpen ? t("collapse") : t("detail")), inst ? (0, react.createElement)(react.Fragment, null, (0, react.createElement)("button", {
					className: "mkts-cmdbtn" + (active ? " mkts-cmdbtn-danger" : " mkts-cmdbtn-primary"),
					disabled: opActive || isToggling,
					onClick: () => toggle(p, active)
				}, isToggling ? t("toggling") : active ? t("disable") : t("enable")), (() => {
					const pkgName = installedPkgName(p, data.installed && data.installed[p.profile || "web"]);
					const up = pkgName && data.updates && data.updates[p.profile || "web"] && data.updates[p.profile || "web"][pkgName];
					if (!up) return (0, react.createElement)("button", {
						className: "mkts-cmdbtn",
						disabled: true,
						title: t("updateFail")
					}, t("upToDate"));
					if (up.kind === "linked") return (0, react.createElement)("span", { className: "mkts-state mkts-state-off" }, t("updLocal"));
					if (up.updateAvailable) return (0, react.createElement)("button", {
						className: "mkts-cmdbtn",
						disabled: opActive,
						onClick: () => openOp("update", pkgName, p.name, p.profile)
					}, t("updateBtn") + (up.latest ? " (" + String(up.latest).slice(0, 8) + ")" : ""));
					return (0, react.createElement)("span", { className: "mkts-state mkts-state-on" }, t("upToDate"));
				})(), (0, react.createElement)("button", {
					className: "mkts-cmdbtn mkts-cmdbtn-danger",
					disabled: opActive,
					onClick: () => openOp("uninstall", installedPkgName(p, data.installed && data.installed[p.profile || "web"]) || p.name, p.name, p.profile)
				}, t("uninstall"))) : p.source ? (0, react.createElement)("button", {
					className: "mkts-cmdbtn mkts-cmdbtn-primary",
					disabled: opActive,
					onClick: () => openOp("install", p.source, p.name, p.profile)
				}, t("install")) : null));
			}))) : null, data.phase === "ready" && totalPages > 1 ? (0, react.createElement)("div", { className: "mkts-pager" }, (0, react.createElement)("button", {
				className: "mkts-cmdbtn",
				disabled: page <= 1,
				onClick: () => goPage(page - 1)
			}, t("prev")), (0, react.createElement)("span", { className: "mkts-pager-info" }, page + " / " + totalPages), (0, react.createElement)("button", {
				className: "mkts-cmdbtn",
				disabled: page >= totalPages,
				onClick: () => goPage(page + 1)
			}, t("next"))) : null, data.phase === "ready" && filtered.length === 0 ? (0, react.createElement)("div", { className: "mkts-hint" }, t("noMatch")) : null);
		}
		const ONBOARDING_DONE_KEY = "mktsOnboardingDone";
		function MarketOnboarding(props) {
			const [done, setDone] = (0, react.useState)(() => {
				try {
					return localStorage.getItem(ONBOARDING_DONE_KEY) === "1";
				} catch {
					return false;
				}
			});
			(0, react.useEffect)(() => {
				if (done && props.complete) props.complete();
			}, []);
			const finish = () => {
				try {
					localStorage.setItem(ONBOARDING_DONE_KEY, "1");
				} catch {}
				setDone(true);
				if (props.complete) props.complete();
			};
			if (done) return null;
			return (0, react.createElement)("div", { className: "mkts-ob" }, (0, react.createElement)("div", {
				className: "mkts-ob-scrim",
				onClick: finish
			}), (0, react.createElement)("div", {
				className: "mkts-ob-card",
				onClick: (e) => e.stopPropagation()
			}, (0, react.createElement)("div", { className: "mkts-ob-header" }, (0, react.createElement)("div", { className: "mkts-ob-title" }, (0, react.createElement)("h2", null, t("marketTitle")), (0, react.createElement)("p", null, t("marketSubtitle"))), (0, react.createElement)("button", {
				className: "mkts-cmdbtn mkts-cmdbtn-primary",
				onClick: finish
			}, t("done"))), (0, react.createElement)("div", { className: "mkts-ob-body" }, (0, react.createElement)(MarketPanel, { embedded: true }))));
		}
		/**
		* Toast copy for a successful toggleActive, keyed by the host's `message`
		* discriminator ('enabled:live' / 'enabled:restart' / 'disabled:live' /
		* 'disabled:restart'); when the host sends no message, fall back to the
		* pre-message needsRestart/active inference. Always a 'ok' toast.
		*/
		function toggleOkToast(r) {
			switch (r && r.message) {
				case "disabled:live": return {
					text: t("inactiveLive"),
					kind: "ok"
				};
				case "disabled:restart": return {
					text: t("restartBanner"),
					kind: "ok"
				};
				case "enabled:live": return {
					text: t("activeLive"),
					kind: "ok"
				};
				case "enabled:restart": return {
					text: t("restartBanner"),
					kind: "ok"
				};
				default: return {
					text: r && r.needsRestart ? t("restartBanner") : r && r.active ? t("activeLive") : t("inactiveLive"),
					kind: "ok"
				};
			}
		}
		/**
		* State badge for an installed row, upgraded from the two-state
		* enabled/disabled pill to the runtime loader phase when the host reports one
		* (`live`): running (green) when the fiber is ACTIVE, load-failed (red) when
		* FAILED, neutral transitional labels for pending/loading/unloading, and a
		* neutral "enabled (restart to load)" when the file state says enabled but no
		* loader entry exists in this process. Disabled rows keep the old badge.
		*/
		function liveBadge(p) {
			if (!p.enabled) return (0, react.createElement)("span", { className: "mkts-state mkts-state-inactive" }, t("inactive"));
			if (p.live === "active") return (0, react.createElement)("span", { className: "mkts-state mkts-state-on" }, t("liveActive"));
			if (p.live === "failed") return (0, react.createElement)("span", { className: "mkts-state mkts-state-inactive" }, t("liveFailed"));
			if (p.live === null) return (0, react.createElement)("span", { className: "mkts-state mkts-state-off" }, t("liveStale"));
			const label = p.live === "loading" ? t("liveLoading") : p.live === "unloading" ? t("liveUnloading") : t("livePending");
			return (0, react.createElement)("span", { className: "mkts-state mkts-state-off" }, label);
		}
		function InstalledPanel() {
			const [data, setData] = (0, react.useState)({
				phase: "loading",
				plugins: [],
				self: null,
				toast: null
			});
			const [toggling, setToggling] = (0, react.useState)(null);
			const [showBuiltin, setShowBuiltin] = (0, react.useState)(false);
			const load = () => {
				apiOp("installed", { profile: "web" }).then((r) => {
					setData((d) => ({
						...d,
						phase: "ready",
						plugins: r && Array.isArray(r.plugins) && r.plugins || d && d.plugins || [],
						self: r && r.self || null
					}));
				}).catch(() => setData((d) => ({
					...d,
					phase: "error"
				})));
			};
			(0, react.useEffect)(() => {
				load();
			}, []);
			(0, react.useEffect)(() => subscribeOp((o) => {
				if (!o || o.phase !== "done") return;
				load();
			}), []);
			const toggle = (row) => {
				setToggling(row.name);
				apiOp("toggleActive", {
					profile: "web",
					name: row.name,
					enabled: !row.enabled
				}).then((r) => {
					setToggling(null);
					if (r && r.ok) {
						const toast = toggleOkToast(r);
						setData((d) => ({
							...d,
							toast: toast.text,
							toastKind: toast.kind
						}));
						load();
					} else setData((d) => ({
						...d,
						toast: String(r && (r.error || r.output) || t("opFailed")),
						toastKind: "err"
					}));
				}).catch((e) => {
					setToggling(null);
					setData((d) => ({
						...d,
						toast: String(e && e.message || t("opFailed")),
						toastKind: "err"
					}));
				});
			};
			const installed = (data.plugins || []).filter((p) => p.kind === "installed");
			const builtin = (data.plugins || []).filter((p) => p.kind === "builtin");
			const opActive = !!(getOp() && getOp().phase !== "done");
			return (0, react.createElement)("div", { className: "mkts" }, data.toast ? (0, react.createElement)("div", { className: data.toastKind === "ok" ? "mkts-toast" : "mkts-err" }, data.toast) : null, data.self && data.self.updateAvailable ? (0, react.createElement)("div", { className: "mkts-selfupdate" }, (0, react.createElement)("span", { style: { flex: 1 } }, fmt("selfUpdate", {
				cur: data.self.version,
				latest: data.self.latestVersion
			})), (0, react.createElement)("button", {
				className: "mkts-cmdbtn mkts-cmdbtn-primary",
				disabled: opActive,
				onClick: () => openOp("update", data.self.name, data.self.name, "web")
			}, t("updateBtn"))) : null, data.phase === "loading" ? (0, react.createElement)("div", null, t("loading")) : null, data.phase === "error" ? (0, react.createElement)("div", { className: "mkts-err" }, t("fetchFail")) : null, installed.length === 0 && data.phase === "ready" ? (0, react.createElement)("div", { className: "mkts-hint" }, t("noInstalled")) : null, installed.map((p) => (0, react.createElement)("div", {
				key: p.name,
				className: "mkts-item"
			}, (0, react.createElement)("div", { className: "mkts-main" }, (0, react.createElement)("h3", null, p.name, p.version ? (0, react.createElement)("span", { className: "mkts-by" }, "v" + p.version) : null, p.updateAvailable ? (0, react.createElement)("span", { className: "mkts-state mkts-state-inactive" }, t("updTo").replace("{latest}", String(p.latestVersion ?? "?"))) : null), p.spec ? (0, react.createElement)("div", { className: "mkts-meta" }, (0, react.createElement)("span", null, t("specNote") + ": " + String(p.spec))) : null), (0, react.createElement)("div", { className: "mkts-actions" }, liveBadge(p), (0, react.createElement)("button", {
				className: "mkts-cmdbtn" + (p.enabled ? "" : " mkts-cmdbtn-primary"),
				disabled: opActive || toggling === p.name,
				onClick: () => toggle(p)
			}, toggling === p.name ? t("toggling") : p.enabled ? t("disable") : t("enable")), p.updateAvailable ? (0, react.createElement)("button", {
				className: "mkts-cmdbtn",
				disabled: opActive,
				onClick: () => openOp("update", p.name, p.name, "web")
			}, t("updateBtn")) : null, (0, react.createElement)("button", {
				className: "mkts-cmdbtn mkts-cmdbtn-danger",
				disabled: opActive,
				onClick: () => openOp("uninstall", p.name, p.name, "web")
			}, t("uninstall"))))), builtin.length > 0 ? (0, react.createElement)("div", { className: "mkts-builtin" }, (0, react.createElement)("button", {
				className: "mkts-cmdbtn",
				onClick: () => setShowBuiltin(!showBuiltin)
			}, (showBuiltin ? t("collapse") : t("builtin")) + " (" + builtin.length + ")"), showBuiltin ? builtin.map((p) => (0, react.createElement)("div", {
				key: p.name,
				className: "mkts-builtin-row"
			}, (0, react.createElement)("span", null, p.name), (0, react.createElement)("span", { className: "mkts-by" }, p.version ? "v" + p.version : ""), (0, react.createElement)("span", { className: "mkts-by" + (p.live === "failed" ? " mkts-live-bad" : "") }, p.live === "active" ? t("liveActive") : p.live === "failed" ? t("liveFailed") : p.live === "loading" ? t("liveLoading") : p.live === "pending" ? t("livePending") : p.live === "unloading" ? t("liveUnloading") : ""))) : null) : null);
		}
		const inject = ["slots"];
		function apply(ctx, config = {}) {
			const slots = ctx.slots;
			if (slots === void 0) return;
			const perPage = Number(config?.perPage);
			if (Number.isInteger(perPage) && perPage >= 1 && perPage <= 100) MARKET_PER_PAGE = perPage;
			resumeOp();
			setOnTerminal((o) => {
				if (o.kind === "install" && o.ok && o.hot) setTimeout(() => {
					try {
						location.reload();
					} catch {}
				}, 1600);
			});
			setOpLostMessage(t("opLost"));
			ctx.effect(() => {
				const id = "dsh-market-style";
				if (!document.getElementById(id)) {
					const s = document.createElement("style");
					s.id = id;
					s.textContent = MARKET_CSS;
					document.head.appendChild(s);
				}
				return () => {
					const el = document.getElementById(id);
					if (el) el.remove();
				};
			}, "market-style");
			slots.inject("settings.plugins.tab", () => slots.register({
				name: "settings.plugins.tab",
				id: "market",
				order: 5,
				label: () => LOCALE === "zh" ? "插件市场" : "Plugin Market"
			}, MarketPanel));
			slots.inject("settings.plugins.tab", () => slots.register({
				name: "settings.plugins.tab",
				id: "installed",
				order: 6,
				label: () => t("installedTab")
			}, InstalledPanel));
			slots.inject("settings.onboarding", () => slots.register({
				name: "settings.onboarding",
				id: "plugin-market",
				order: 10
			}, MarketOnboarding));
			slots.inject("shell.overlay", () => slots.register({
				name: "shell.overlay",
				id: "market-progress",
				order: -50
			}, GlobalProgress));
		}
		//#endregion
		exports.GlobalProgress = GlobalProgress;
		exports.InstalledPanel = InstalledPanel;
		exports.MarketOnboarding = MarketOnboarding;
		exports.MarketPanel = MarketPanel;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map