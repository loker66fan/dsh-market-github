# 本地维护 / 发布说明（dsh-webui-market-plugin-plus）

本 fork 的本地 git 版本管理约定。克隆/提交/发布都在本目录完成，方便随时更新与回滚。

## 分支约定

- **`main`** —— 稳定成品分支。当前可用版本 `v0.2.0` 即在此。
- 新功能：`git checkout -b feature/<名称>` → 完成并 `npm run typecheck && npm test` → 合并回 `main`。
- 修复：`git checkout -b fix/<名称>`，同上。
- 职责清晰：`main` 始终可运行可发布；`feature/*`/`fix/*` 是未定稿工作。

## 版本标签（发布点）

每个可发布状态打 annotated tag：`vX.Y.Z`（与 `package.json` 的 `version` 一致）。

```bash
git tag -a v0.3.0 -m "release notes…"
git tag -l            # 查看
git show v0.2.0       # 查看某版
git checkout v0.2.0   # 回到某版看代码（记得再切回 main）
```

当前已打：`v0.2.0`。

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

## 推送到 GitHub（需要在你的账号下操作）

本机默认没有可用 GitHub 认证，需要你配置后再推送：

1. 生成一个有 `repo` 权限的 GitHub token（或配好 SSH key）。
2. 关联远程并推送：

```bash
# HTTPS（把 <USER> 换成你的 GitHub 用户名；密码填 token）
git remote add origin https://<USER>@github.com/<USER>/dsh-webui-market-plugin-plus.git
git push -u origin main
git push origin --tags
```

或配好 SSH key 后：

```bash
git remote add origin git@github.com:<USER>/dsh-webui-market-plugin-plus.git
git push -u origin main
git push origin --tags
```

3. 想让社区在 DSH 里更好发现，可在仓库主页的 **Topics** 加：`dsh-plugin`、`deepseek-harness`、`agent-harness`、`web`；并写 release notes（含安装命令）。

> 提示：不要在聊天/issue 里贴 token，用完即吊销、改用最小权限的 token。

## 安装到 dsh web profile

```bash
# 从本地目录（link，开发时即时生效）
dsh plugin --profile web add /path/to/dsh-webui-market-plugin-fork
# 或从 GitHub（发布后）
dsh plugin --profile web add github:<USER>/dsh-webui-market-plugin-plus
# 装完重启 web 生效
pnpm dsh web
```
