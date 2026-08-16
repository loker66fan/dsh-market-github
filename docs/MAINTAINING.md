# 本地维护 / 发布说明（dsh-market-github）

本 fork 的本地 git 版本管理约定。克隆/提交/发布都在本目录完成，方便随时更新与回滚。

## 分支约定

- **`main`** —— 稳定成品分支。当前可用版本 `v0.3.0` 即在此。
- 新功能：`git checkout -b feature/<名称>` → 完成并 `npm run typecheck && npm test` → 合并回 `main`。
- 修复：`git checkout -b fix/<名称>`，同上。
- 职责清晰：`main` 始终可运行可发布；`feature/*`/`fix/*` 是未定稿工作。

## 版本标签（发布点）

每个可发布状态打 annotated tag：`vX.Y.Z`（与 `package.json` 的 `version` 一致）。

```bash
git tag -a v0.3.0 -m "release notes…"
git tag -l            # 查看
git show v0.3.0       # 查看某版
git checkout v0.3.0   # 回到某版看代码（记得再切回 main）
```

当前已打：`v0.3.0`。

## 每次改完必做

```bash
npm install             # 首次或依赖变更后
npm run typecheck       # host + client 类型检查
npm run build           # 重新生成 lib/host.js + lib/client.js
npm test                # node --test tests/*.test.mjs
git status              # 应只有 src/tests/docs 等源码改动、lib/ 已重建
git add -A && git commit -m "说明"
```

> `lib/` 已提交（含构建产物），安装依赖它；改了 `src/` 就必须重建 `lib/` 一起提交。

## devDeps 钉 rc.6、目标运行时 rc.5 的原因

devDependencies 里 `@deepseek-ai/dsh-client-*` 钉在 `^0.1.0-rc.6`（当前最新已发布版），而目标 host 运行时是 rc.5。这是刻意的：

- peerDependencies 是 `*`，安装/宿主解析不锁 host 版本；
- 构建产物 `lib/client.js` 对 dsh 相关包**零运行时导入**（仅类型引用，打包时被擦除）——devDeps 只影响类型检查，不进入运行时；
- 代价：rc.6 新增的 slot key 能通过类型检查，但 rc.5 运行时并不存在。因此代码里用到的 slot key / API 必须在 rc.5 中已存在（当前已核对：`settings.onboarding`、`settings.plugins.tab`、`shell.overlay`）。

## 推送到 GitHub（需要在你的账号下操作）

本机默认没有可用 GitHub 认证，需要你配置后再推送：

1. 生成一个有 `repo` 权限的 GitHub token（或配好 SSH key）。
2. 关联远程并推送：

```bash
# HTTPS（把 <USER> 换成你的 GitHub 用户名；密码填 token）
git remote add origin https://<USER>@github.com/<USER>/dsh-market-github.git
git push -u origin main
git push origin --tags
```

或配好 SSH key 后：

```bash
git remote add origin git@github.com:<USER>/dsh-market-github.git
git push -u origin main
git push origin --tags
```

3. 想让社区在 DSH 里更好发现，可在仓库主页的 **Topics** 加：`dsh-plugin`、`deepseek-harness`、`agent-harness`、`web`；并写 release notes（含安装命令）。

> 提示：不要在聊天/issue 里贴 token，用完即吊销、改用最小权限的 token。

## 发布到 npm（可选，安装最顺）

```bash
npm login                 # 用你的 npm 账号
npm run build && npm test # prepublishOnly 也会跑这两步
npm publish               # 发布当前 version
git tag -a v0.3.0 -m "..." && git push origin --tags
```

发布后用户一行安装：`dsh plugin --profile web add dsh-market-github`（若你改名/加 scope，命令里的包名同步改）。

## 安装到 dsh web profile

```bash
# 从本地目录（link，开发时即时生效）
dsh plugin --profile web add /path/to/dsh-webui-market-plugin-fork
# 或从 GitHub（发布后）
dsh plugin --profile web add github:<USER>/dsh-market-github
# 装完重启 web 生效
pnpm dsh web
```
