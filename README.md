# dsh-market-github

> 参考项目（MIT）：[@sanqi-normal/dsh-webui-market-plugin](https://github.com/Sanqi-normal/dsh-webui-market-plugin) 与 [@condaThinker/dsh-webui-market-plugin-plus](https://github.com/condaThinker/dsh-webui-market-plugin-plus)，致谢见文末。

在 dsh web GUI 内部的插件商城：**启动页引导入口 + GitHub `topic:dsh-plugin` 实时搜索 + 一键安装/启用停用/一键重启**。

An in-harness plugin market for the dsh web GUI: **startup-page onboarding entry + real-time GitHub `topic:dsh-plugin` search + one-click install, enable/disable, and restart**.

## 功能 Features

- **启动页入口**：首次运行（尚无会话）时，onboarding 引导多出「插件商城」步骤（**只出现一次**——完成/跳过即被记住，之后刷新或重启不再弹）；也可随时从 设置 → 插件 → 插件市场 打开。
- **GitHub 实时搜索**：host 端代理 `api.github.com/search/repositories`，搜索框防抖 350ms 实时请求，每页 50 条 + 上一页/下一页翻页；自动过滤 fork、归档、私有仓库。空查询返回最热插件，支持按 Star / 最近更新排序；卡片显示 topics、语言、许可证、更新时间；搜索配额（GH remaining/limit）可见，配 `GITHUB_TOKEN` 可提高。
- **一键安装**：安装/更新/卸载走后台任务，全应用右下角进度浮条常驻（切页面不丢），可终止、可最小化；**已发布 npm 的插件优先走 registry tarball 安装（registry 校验与仓库一致防抢注，否则回退 GitHub 源）**；纯 host 插件装好后**热挂载免重启**（校验 fiber 真实激活才报成功）。
- **可靠网络**：**自动识别设备代理**（环境变量 → 系统代理 → Clash/mihomo/v2rayN 常见端口探测），无需手动配置；GitHub 源走 **codeload tarball 直链**（绕开易卡的 git 协议）；清单校验在 raw.githubusercontent 被封时自动回退 GitHub contents API / jsDelivr / ghproxy。
- **安装安全把关**：GitHub 源先读其 `package.json` 的 `dsh` 清单——声明 `dsh.client` 的 web 插件直接安装；仅声明 `dsh.bundle` 的走**临时环境试装启动验证**（真实 profile 不受影响）；读不到清单则拒绝（可勾选「跳过安全检查」）。pnpm 构建放行按**精确键**（裸包名 + `包名@tarball地址`）写入，scoped 包名加引号防 YAML 解析失败。
- **纯客户端插件支持**：只有 `dsh.client` 没有 `dsh.bundle` 的插件（如主题/UI 插件）安装后**自动写入合成配置行**，重启即加载；卸载时同步移除。
- **启用 / 停用**：编辑 profile 的 `dsh.profile.bundles` 层；停用立即生效（保留依赖、只去配置层），启用尝试热挂载。
- **一键重启**：安装/停用后需要重启时，横幅自带「立即重启」按钮（同源 + 直连 loopback 双重校验，detached 拉起同一命令），重启完成后页面自动刷新。
- **更新检测**：GitHub 源比对锁文件 commit 与 HEAD，npm 源比对 registry 版本；一键更新。
- **模型可用**：注册 `market_search` / `market_install` / `market_installed` / `market_update` 工具，agent 可直接搜索并安装插件。

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

### 入口 Entry

- **启动页**：首次运行（无会话）时引导里会出现「插件商城」步骤，可「完成 / 跳过」；该步骤只展示一次（localStorage 记忆），之后的启动不再打扰。
- **设置 → 插件 → 插件市场**：随时打开同一面板。

### 搜索与浏览 Browse

- 搜索框**实时**搜索 GitHub `topic:dsh-plugin`（防抖 350ms），空查询返回最热插件；支持**最热**（Star）/ **最新**（更新时间）排序和**已安装**过滤。
- 翻页：每页 50 条，列表底部「上一页 / 下一页」。
- 卡片显示：名称、作者、Star、topics、语言、许可证、更新时间——方便自行判断可信度。

### 安装 / 更新 / 卸载 / 启停 Manage

- **安装**：点卡片「安装」→ 弹窗确认（显示将执行的 `dsh plugin add` 命令，可勾选"跳过安全检查"）→ 后台执行 → 右下角**进度浮条**常驻（切页面不丢，可终止/最小化）→ 成功后简单插件**热挂载免重启**，否则横幅提示重启。
- **启用 / 停用**：已安装卡片上的按钮（停用立即生效；启用尝试热挂载）。
- **更新**：检测到新版本时卡片出现「更新」按钮，一键更新。
- **卸载**：两步确认后后台执行。
- **一键重启**：需要重启时，横幅提供「立即重启」（同源 + 直连 loopback 校验），重启完成后页面自动刷新。

### 让 agent 帮你用（模型工具 `market_*`）

装好后，模型会话里直接多出四个工具，无需打开 UI 即可搜索并安装插件：

| 工具 | 作用 | 示例 |
|---|---|---|
| `market_search` | 搜索插件（GitHub `dsh-plugin` 话题） | `market_search({ q: "terminal" })`；分页用 `page` / `perPage` |
| `market_install` | 安装插件（接受 GitHub `owner/repo`、git URL、npm 包名或本地路径，走与 UI 相同的安全校验） | `market_install({ spec: "github:owner/repo" })` |
| `market_installed` | 列出已装插件及其版本与更新情况 | `market_installed()` |
| `market_update` | 更新指定插件（用 `market_installed` 返回的包名） | `market_update({ name: "<package-name>" })` |

例如直接对 agent 说：「搜索 dsh 插件市场里的终端 UI 插件，选最火的装一个」。

> 搜索未鉴权限速约 10 次/分钟；给 host 进程配 `GITHUB_TOKEN`（或 `DSH_MARKET_GITHUB_TOKEN`）可提高配额。结果来自 GitHub 话题标签，**未经人工审核**——安装前请自行确认插件可信。

## 工作原理 How it works

持久化 bundle（`dsh.bundle.patch` → `cordis.patch.yml`），由 `dsh plugin add` 的 reconcile 自动加入 profile 的 `dsh.profile.bundles` 层：

- **Host 半**（`src/host.ts` → `lib/host.js`）：注册 `/api/dsh-market` 路由，提供 `search`（GitHub 实时搜索）/ `probe` / `installed` / `install` / `uninstall` / `update` / `updates` / `op` / `kill` / `toggleActive` / `restart`。
- **Client 半**（`src/client/*` → `lib/client.js`）：通过 `exports["./client"]` + `dsh.client` 被 web 前端加载，注册到 `settings.onboarding`（启动页商城步骤）、`settings.plugins.tab`（市场面板）、`shell.overlay`（全局进度浮条）三个 slot。

## 安全与限制 Safety and limitations

- 写操作（install/uninstall/update/kill/toggleActive）仅接受同源 POST；`restart` 额外要求直连 loopback 客户端（转发请求被拒）。
- GitHub 源装前校验 `dsh` 清单；无 `dsh.client` 的走临时环境试装启动验证，验证失败不改动现有安装。
- GitHub 源会执行包内 `prepare` 脚本（市场只对已验证的包精确放行 `allowBuilds`），且不在 agent 沙箱内——只装你信任的源。
- 搜索受 GitHub API 限速（未鉴权 10 次/分钟，服务端 60s 短缓存；`GITHUB_TOKEN` 可提高）。
- 热挂载只支持 patch 结构简单且**无 Web 客户端**的插件；含 `dsh.client` 的插件需重启（横幅自带「立即重启」）。
- 代理自动探测最多等待数秒，极端网络下安装会回退直连 codeload；探测到的代理仅注入安装子进程，不影响 dsh 自身流量。
- 本市场本身不是安全审查：列表存在 ≠ 背书。

## 开发 Development

```sh
npm install        # 装构建工具链
npm run typecheck  # host + client 类型检查
npm run build      # 生成 lib/host.js + lib/client.js（提交进仓库）
npm test           # node --test tests/*.test.mjs
```

推送触发 GitHub Actions CI（Node 22/24 矩阵：typecheck + build + test，见 [`.github/workflows/ci.yml`](.github/workflows/ci.yml)）。发布前自动跑 `npm run build && npm test`（`prepublishOnly`）。版本/分支约定见 [docs/MAINTAINING.md](docs/MAINTAINING.md)。

## 致谢 Credits

本仓库作者：**loker66fan**。开发过程中参考了以下 MIT 项目，谨此致谢：

- 参考项目 [@Sanqi-normal/dsh-webui-market-plugin](https://github.com/Sanqi-normal/dsh-webui-market-plugin)（MIT）——市场 UI、后台安装、试装验证的思路来源。
- 参考项目 [@condaThinker/dsh-webui-market-plugin-plus](https://github.com/condaThinker/dsh-webui-market-plugin-plus)（MIT）——全局进度浮条、可终止安装、启用/停用的思路来源。

本仓库在参考基础上完善的功能：启动页 onboarding 入口、GitHub 实时搜索 + 翻页、codeload tarball 安装、设备代理自动识别、纯客户端插件合成行、模型可用 `market_*` 工具、一键重启。

## License

MIT. 参考 [Sanqi-normal/dsh-webui-market-plugin](https://github.com/Sanqi-normal/dsh-webui-market-plugin)（亦为 MIT）编写；版权声明见 [LICENSE](LICENSE)。
