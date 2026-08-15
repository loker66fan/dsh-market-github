# Release Notes — dsh-market-github v0.3.0

English | 中文

首个公开发布版。基于 [@sanqi-normal/dsh-webui-market-plugin](https://github.com/Sanqi-normal/dsh-webui-market-plugin)（MIT）与
[condaThinker/dsh-webui-market-plugin-plus](https://github.com/condaThinker/dsh-webui-market-plugin-plus)（MIT）的二次开发，
更名为 **dsh-market-github**，定位：**启动页插件商城 + GitHub `topic:dsh-plugin` 实时搜索**。

First public release. Built on [@sanqi-normal/dsh-webui-market-plugin](https://github.com/Sanqi-normal/dsh-webui-market-plugin) (MIT) and
[condaThinker/dsh-webui-market-plugin-plus](https://github.com/condaThinker/dsh-webui-market-plugin-plus) (MIT), renamed to
**dsh-market-github**: a plugin market on the dsh startup page with real-time GitHub `topic:dsh-plugin` search.

## 安装 Install

```sh
# npm（推荐）
dsh plugin --profile web add dsh-market-github
# 或 GitHub（仓库内置预构建 lib/，无需安装期构建授权）
dsh plugin --profile web add github:loker66fan/dsh-market-github
# 重启生效
dsh web
```

## 新特性 What's new

- **启动页入口 Startup entry**：首次运行（无会话）的 onboarding 引导新增「插件商城」步骤（精简模式，可完成/跳过）；设置 → 插件 → 插件市场 随时可开。
- **GitHub 实时搜索 Real-time search**：host 代理 GitHub 搜索 API，防抖 350ms，每页 50 条 + 上一页/下一页；过滤 fork/归档/私有仓库；空查询返回最热插件，支持 Star/最近更新排序；卡片显示 topics、语言、许可证、更新时间；搜索配额（GH remaining/limit）在 UI 可见，配 `GITHUB_TOKEN` 可提高。
- **一键安装 One-click install**：后台任务 + 全局进度浮条（切页面不丢）、可终止/最小化；安装安全把关（读 dsh 清单校验 + 临时环境试装启动验证 + 防抢注的 npm 优先安装）；简单插件热挂载免重启。
- **启用/停用 Enable/disable**：编辑 `dsh.profile.bundles` 层，停用立即生效。
- **一键重启 One-click restart**：同源 + 直连 loopback 双重校验，detached 拉起同一命令，重启后页面自动刷新。
- **更新检测 Update checks**：GitHub 源比对 commit、npm 源比对版本，一键更新。

## 已知限制 Known limitations

- 搜索结果来自 GitHub 话题标签（仓库主人自加，**未经人工审核**），可能混入蹭话题的仓库——卡片 topics/语言/许可证供自行判断，安装前仍有 dsh 清单校验 + 试装验证兜底。
- GitHub 搜索 API 最多返回前 1000 条（20 页）。
- 热挂载仅支持 patch 结构简单的插件；复杂插件需重启（横幅自带「立即重启」）。

## 校验 Checks

GitHub Actions CI（Node 22/24 矩阵：typecheck + build + test，57 项用例）；`npm pack` 产物 7 文件 / ~50 kB。
