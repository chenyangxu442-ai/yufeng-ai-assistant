# 第三方组件与内容

本项目的自有代码用 MIT（见 `LICENSE`）。下面这些**不是**本项目版权，按各自条款分发。

## 1. AI 助手内核

| 组件 | 版本 | 许可 / 归属 |
|---|---|---|
| `@deepseek-ai/dsh`（DeepSeek Harness） | `0.1.5-rc.2`（本版固定） | 版权归 DeepSeek。本项目只下载、托管并调起它，不改写其许可。 |
| `@deepseek-ai/dsh-win32-process` | `0.1.5-rc.3`（固定） | 同上 |

## 2. 随包分发的运行时

| 组件 | 版本 | 来源 | 许可 |
|---|---|---|---|
| Node.js | v24.21.0 | <https://nodejs.org> | 见 `app/runtime/node/LICENSE`（MIT 及第三方）。随包附带 npm。 |

另在**需要时**由 `engine/private-env.js` 下载到用户本机私有目录（不进仓库、不打进安装包）：

| 组件 | 版本 | 来源 | 校验 |
|---|---|---|---|
| PortableGit | 2.56.0.2 | github.com/git-for-windows/git | 见 `engine/private-runtimes.json`（sha256 已核对） |
| CPython | 3.13.12 | python.org | 同上 |

## 3. 技能库内容（538 条）

技能内容来自公开提示词合集，**按上游条款使用**：

| 来源仓库 | 许可 | 条数 |
|---|---|---|
| [f/prompts.chat](https://github.com/f/prompts.chat) | CC0-1.0（公共领域贡献） | 533 |
| [PlexPt/awesome-chatgpt-prompts-zh](https://github.com/PlexPt/awesome-chatgpt-prompts-zh) | MIT | 5 |

机器可读的逐条来源在 `app/skill-library/catalog.json` 每条记录的
`source_repo` / `source_url` / `license` 字段里。

## 4. 第三方 npm 依赖

Electron、Express、yauzl 等随构建工具链使用；安装后的包内自带各自 LICENSE，未在此逐条复制。
