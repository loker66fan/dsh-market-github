# dsh-market-github

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

在 dsh web GUI 内部的插件商城：**启动页引导入口 + GitHub `topic:dsh-plugin` 实时搜索 + 一键安装/启用停用/一键重启**。

An in-harness plugin market for the dsh web GUI: **startup-page onboarding entry + real-time GitHub `topic:dsh-plugin` search + one-click install, enable/disable, and restart**.

## 功能 Features

- **启动页入口**：首次运行（尚无会话）时，onboarding 引导多出「插件商城」步骤；也可随时从 设置 → 插件 → 插件市场 打开。
- **GitHub 实时搜索**：host 端代理 `api.github.com/search/repositories`，搜索框防抖 350ms 实时请求，每页 50 条 + 上一页/下一页翻页；自动过滤 fork、归档、私有仓库。空查询返回最热插件，支持按 Star / 最近更新排序。
- **一键安装**：安装/更新/卸载走后台任务，全应用右下角进度浮条常驻（切页面不丢），可终止、可最小化；简单插件装好后**热挂载免重启**。
- **安装安全把关**：GitHub 源先读其 `package.json` 的 `dsh` 清单——声明 `dsh.client` 的 web 插件直接安装；仅声明 `dsh.bundle` 的走**临时环境试装启动验证**（真实 profile 不受影响）；读不到清单则拒绝（可勾选「跳过安全检查」）。
- **启用 / 停用**：编辑 profile 的 `dsh.profile.bundles` 层；停用立即生效（保留依赖、只去配置层），启用尝试热挂载。
- **一键重启**：安装/停用后需要重启时，横幅自带「立即重启」按钮（同源 + 直连 loopback 双重校验，detached 拉起同一命令），重启完成后页面自动刷新。
- **更新检测**：GitHub 源比对锁文件 commit 与 HEAD，npm 源比对 registry 版本；一键更新。

## 安装 Install

已发布 npm（推荐，预构建、零授权）：

```sh
dsh plugin --profile web add dsh-market-github
```

从 GitHub 安装（本仓库提交了预构建的 `lib/`，无需任何安装期构建授权）：

```sh
dsh plugin --profile web add github:loker66fan/dsh-market-github
```

本地开发链接：

```sh
dsh plugin --profile web add /path/to/dsh-market-github
```

安装后重启 `dsh web`（热挂载成功的除外）：

```sh
dsh web
```

## 使用 Usage

- **启动页**：首次运行（无会话）时引导里会出现「插件商城」步骤，可「完成 / 跳过」。
- **设置 → 插件 → 插件市场**：随时打开同一面板。

搜索框实时搜索 GitHub `topic:dsh-plugin`；每页 50 条，底部「上一页 / 下一页」翻页；每个卡片显示 Star、作者、描述，支持安装 / 卸载 / 更新 / 启用 / 停用。安装中右下角进度浮条常驻，可终止；需要重启时横幅提供「立即重启」。

> 搜索未鉴权限速约 10 次/分钟；给 host 进程配 `GITHUB_TOKEN`（或 `DSH_MARKET_GITHUB_TOKEN`）可提高配额。结果来自 GitHub 话题标签，**未经人工审核**——安装前请自行确认插件可信。

## 工作原理 How it works

持久化 bundle（`dsh.bundle.patch` → `cordis.patch.yml`），由 `dsh plugin add` 的 reconcile 自动加入 profile 的 `dsh.profile.bundles` 层：

- **Host 半**（`src/host.ts` → `lib/host.js`）：注册 `/api/dsh-market` 路由，提供 `search`（GitHub 实时搜索）/ `probe` / `installed` / `install` / `uninstall` / `update` / `updates` / `op` / `kill` / `toggleActive` / `restart`。
- **Client 半**（`src/client/*` → `lib/client.js`）：通过 `exports["./client"]` + `dsh.client` 被 web 前端加载，注册到 `settings.onboarding`（启动页商城步骤）、`settings.plugins.tab`（市场面板）、`shell.overlay`（全局进度浮条）三个 slot。

## 安全与限制 Safety and limitations

- 写操作（install/uninstall/update/kill/toggleActive）仅接受同源 POST；`restart` 额外要求直连 loopback 客户端（转发请求被拒）。
- GitHub 源装前校验 `dsh` 清单；无 `dsh.client` 的走临时环境试装启动验证，验证失败不改动现有安装。
- GitHub 源会执行包内 `prepare` 脚本（由 pnpm 授权机制约束），且不在 agent 沙箱内——只装你信任的源。
- 搜索受 GitHub API 限速（未鉴权 10 次/分钟，服务端 60s 短缓存；`GITHUB_TOKEN` 可提高）。
- 热挂载只支持 patch 结构简单的插件；复杂 patch 需重启（面板会给出「立即重启」）。
- 本市场本身不是安全审查：列表存在 ≠ 背书。

## 开发 Development

```sh
npm install        # 装构建工具链
npm run typecheck  # host + client 类型检查
npm run build      # 生成 lib/host.js + lib/client.js（提交进仓库）
npm test           # node --test tests/*.test.mjs
```

发布前自动跑 `npm run build && npm test`（`prepublishOnly`）。版本/分支约定见 [docs/MAINTAINING.md](docs/MAINTAINING.md)。

## 致谢 Credits

- 原作者 [@Sanqi-normal/dsh-webui-market-plugin](https://github.com/Sanqi-normal/dsh-webui-market-plugin)（MIT）——市场 UI、后台安装、试装验证的原始实现。
- [@condaThinker/dsh-webui-market-plugin-plus](https://github.com/condaThinker/dsh-webui-market-plugin-plus)（MIT）——全局进度浮条、可终止安装、启用/停用。
- 本仓库在此基础上二次开发：启动页 onboarding 入口、GitHub 实时搜索 + 翻页、搜索噪音过滤、竞态保护、一键重启。

## License

MIT. Forked from [Sanqi-normal/dsh-webui-market-plugin](https://github.com/Sanqi-normal/dsh-webui-market-plugin) (also MIT).
