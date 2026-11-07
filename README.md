# dsh-agent-hub

DeepSeek Harness（DSH）插件：以 `~/.agents` 为唯一真源，统一管理并同步各 Agent 的**技能**与 **MCP**。

- 左侧栏常驻「Agent Hub」入口，主面板布局参考 dsh-skills-manager（按来源分组）
- 技能：Codex / DSH 原生读取 `~/.agents/skills`；Claude Code、tclaude 等按「软链（默认）/ 复制」同步；创建、导入、回收站
- MCP：`~/.agents/mcp.json` 统一管理，适配 Codex TOML（区间替换、保留注释）、DSH `cordis.patch.yml`（托管块）、Claude/tclaude/Cursor/OpenCode/Gemini 等 JSON 方言
- 鉴权：每个 Server 设首选方式（OAuth / 请求头 / 环境变量），按各 Agent 能力自动降级；密钥存 `~/.agents/secrets.json`（600），同步时解析
- 对比：三方对比（基线 / Hub / 目标），逐字段选择；60 s ≡ 60000 ms 等规范化
- 只手动同步：生成计划 → 勾选 → 执行；写入前自动备份，可一键回滚
- 界面：所有分组默认折叠（折叠状态会记住），组头显示状态汇总；状态说明收进「?」浮层；未启用的 Agent 只在「来源目录」中出现
- 来源目录：自动检测本机 Agent（Codex、DSH、Claude Code、tclaude、WorkBuddy、CodeBuddy、Cursor、Claude Desktop、OpenCode、Gemini、Windsurf），开关纳入；也可「添加目录」自动识别
- WorkBuddy 等可设为「仅管理」：只查看、启停、复制到 Hub，Hub 永不写入

## 安全边界（不可配置）

| 情形 | 行为 |
|---|---|
| 目标缺 Hub 的技能 / Server | 创建软链、复制或追加条目 |
| 同名但地址不同 / 同名真实目录 | 标为「独有 / 被占用」，不覆盖 |
| 各 Agent 独有内容 | 永不修改或删除 |
| Hub 删除技能 | 只移除指向 Hub 的软链；副本与独有不动 |
| Hub 删除 Server | 只移除与上次同步基线一致的托管条目 |
| DSH 手写的 MCP 行 | 不改动文本，必要时通过 DSH 配置编辑器修改 |

## 文件

```
~/.agents/
  skills/            技能真源
  mcp.json           MCP 真源（只含 ${secret:名称} 引用）
  secrets.json       密钥（600）
  hub/state.json     基线、同步记录、回收站
  hub/sources.json   来源目录设置
  hub/backups/       每次写入前的备份
```

## 安装

```bash
dsh plugin --profile <profile> add github:Dreampip/dsh-agent-hub
```

## 开发

- `npm test`：在临时 HOME 中构造真实结构跑完整流程
- `design/`：设计稿直接渲染 `lib/client.js`（与插件同一份代码），`design/shoot.sh` 出图

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
