# dsh-webui-market-plugin-plus

> **Fork / 分叉说明（不是原创）** — 本项目是社区插件
> **[`@sanqi-normal/dsh-webui-market-plugin`](https://github.com/Sanqi-normal/dsh-webui-market-plugin)**
> 的一个 **fork（分支）**，基于其 MIT 代码二次开发，**原作者为 Sanqi-normal**。
> 本仓库的维护者**并非原作者**；请把原作者应有的致谢与 credit 归于
> [`@Sanqi-normal/dsh-webui-market-plugin`](https://github.com/Sanqi-normal/dsh-webui-market-plugin)。
>
> **Attribution / Credit**: This is a **fork** — not an original project. Derived
> from the MIT-licensed plugin
> [`@Sanqi-normal/dsh-webui-market-plugin`](https://github.com/Sanqi-normal/dsh-webui-market-plugin)
> by **Sanqi-normal** (the original author). This fork's maintainer is **not** the
> original author; please attribute the original work to the upstream repo above.

在 dsh web GUI 内部的社区插件市场 —— **`@sanqi-normal/dsh-webui-market-plugin` 的 fork**，重点改进了安装体验。

An in-harness community plugin market for the dsh web GUI — a **fork of
[@sanqi-normal/dsh-webui-market-plugin](https://github.com/Sanqi-normal/dsh-webui-market-plugin)**
that focuses on a never-lost install experience and plugin enable/disable
management.

## 相比原版的改进 What's different

### 1. 后台安装进度**永久可见**，切换项目不再丢失
你从市场点“安装”后，即使立刻离开插件市场、切到**别的项目/会话/设置页**，也不会再“弹窗消失、不知道后台还在不在跑”。插件注册了一个**全应用级别的进度浮条**（`shell.overlay`），像 Google Play 下载 App 一样固定在右下角：

- 显示安装中 / 完成 / 失败状态、插件名、已耗时；
- 随时可见，**不必回到插件市场就能看到进度**；
- 点它可展开/收起，浮条上就有**“终止任务”**按钮；
- 安装状态的轮询被提升到模块级（`src/client/op-bus.ts`），与任何组件挂载无关，页面刷新 / 标签切换后也会自动恢复进行中的任务。

### 2. 可终止安装
确认与运行中的任务在浮层和全局进度浮条上都有明确的 **“终止任务”** 按钮，点击后立刻停止 pnpm 子进程并标记“已终止”。

### 3. 需要重启时会明确提示
安装成功后如果**没有走免重启热挂载**，会弹出一个明显的“重启 Web 服务后生效”横幅（全局可见），不再让你猜。

### 4. 插件**启用 / 停用**管理（全新功能）
已安装插件的卡片上新增 **启用 / 停用** 切换按钮，通过编辑 profile 的 `dsh.profile.bundles` 层实现（停用只去掉配置层、保留依赖；立即生效；启用会尝试热挂载，否则提示重启）。卡片状态区分 **已启用 / 已停用**。

## 安装 Install

```sh
# npm registry（如已发布）
dsh plugin --profile web add dsh-webui-market-plugin-plus

# 或从本地 fork 目录（link，开发）
dsh plugin --profile web add /path/to/dsh-webui-market-plugin-plus
```

安装后**重启 web 服务**生效（热挂载成功的除外）：

```sh
pnpm dsh web
```

## 本地构建 Build

仓库自带 `src/` 源码 + 构建（host 用 tsc、client 用 tsdown 打 `__ModuleLoader__` bundle）。

```sh
npm install               # 安装构建工具链
npm run typecheck         # host + client 类型检查
npm run build             # 生成 lib/host.js + lib/client.js
npm test                  # node --test tests/*.test.mjs
```

## 使用 Usage

打开 **设置（Settings）→ 插件（Plugins）→ 插件市场（Plugin Market）**：

- 目录按分类分组，支持搜索与“已安装”过滤、按最热/最新排序；每个卡片显示 GitHub Star、安装/卸载、更新检测；
- 已安装插件的卡片显示 **已启用 / 已停用** 状态，并可一键 **启用 / 停用**；
- 安装/更新/卸载以弹窗确认，任务**后台执行**，全局进度浮条随时可见、可终止；
- 安装后若需重启会有明确提示；简单插件装好后会自动热挂载（免重启）。

## 工作原理 How it works

持久化 bundle（`dsh.bundle.patch` → `cordis.patch.yml`），由 `dsh plugin add` 的 reconcile 自动加入 profile 的 `dsh.profile.bundles` 层：

- **Host 半**（`src/host.ts` → `lib/host.js`）：注册 `/api/dsh-market` 路由，提供 `list` / `probe` / `installed` / `install` / `uninstall` / `update` / `op` / `kill`，以及**新增的 `toggleActive`（启用/停用）**。
- **Client 半**（`src/client/*` → `lib/client.js`）：通过 `exports["./client"]` + `dsh.client` 被 web 前端加载，注册到 `settings.plugins.tab`（市场面板）与 `shell.overlay`（全局进度浮条）两个 slot。

## 安全与限制 Safety and limitations

沿袭原版：来源白名单、试装验证（trial boot）、同源校验、离线目录快照、安装前自动快照。`toggleActive`（启用/停用）为同源 POST 写操作，与 install/uninstall 同样受同源保护。

## License

MIT. Forked from [Sanqi-normal/dsh-webui-market-plugin](https://github.com/Sanqi-normal/dsh-webui-market-plugin) (also MIT).
