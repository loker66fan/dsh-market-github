// Market panel + global progress overlay styles. Injected as one <style> tag
// on apply (matches the original plugin's approach; avoids a CSS-modules build
// dependency). Kept as a plain string so the client bundle needs no css plugin.
export const MARKET_CSS = `
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
`
