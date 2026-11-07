// 来源注册表（参考 skills-manager 的「来源目录」）：
//   1) 内置预设：检测到目录存在即列出，用户用开关决定是否纳入管理；
//   2) 添加目录：用户选一个 Agent 配置目录，按 RECOGNIZERS 自动识别技能目录与 MCP 文件格式；
//   3) 所有改动（开关、路径、角色、添加的目录）保存在 ~/.agents/hub/sources.json，不改插件代码。
// auth：该 Agent 的 MCP 客户端支持的鉴权方式，用于把 Hub 的统一鉴权降级/映射到各 Agent。
//   oauth  客户端自行完成 OAuth 登录并保存令牌（Hub 不写请求头）
//   bearer 静态请求头 Authorization: Bearer <密钥>
//   env    请求头值引用环境变量（GUI 启动常拿不到 shell 变量，默认不选）
//   none   只支持 stdio，远程 Server 不同步
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

export const HOME = os.homedir()
export const expand = (p) => (p && p.startsWith('~') ? path.join(HOME, p.slice(1)) : p)
export const tilde = (p) => (p && p.startsWith(HOME) ? '~' + p.slice(HOME.length) : p)

/**
 * skills.mode:
 *   native  该 Agent 自己读取 ~/.agents/skills，无需同步
 *   link    同步时创建指向 Hub 的软链（默认）
 *   copy    同步时复制目录，用三方对比检测副本被改
 *   none    不管理技能
 * mcp.format:
 *   json        JSON 文件中的一个对象（key 指定路径，dialect 指定字段方言）
 *   codex-toml  ~/.codex/config.toml 的 [mcp_servers.*] 区间
 *   dsh-patch   DSH profile cordis.patch.yml 的哨兵托管块
 * sync（每个 Agent 两个独立开关，默认都开）：
 *   sync.skills=false  不向该 Agent 同步技能，Hub 也不写它的技能目录（只读对照）
 *   sync.mcp=false     不向该 Agent 同步 MCP，Hub 也不写它的 MCP 文件（只读对照）
 *   未经验证的预设默认关闭同步（verified: false），用户验证后可自行打开
 */
export const PRESETS = [
  {
    id: 'codex', auth: ['oauth', 'bearer', 'env'], name: 'Codex', short: 'Cx', color: '#10a37f',
    skills: { dir: '~/.codex/skills', mode: 'native', ownSubdirs: ['.system'] },
    mcp: { format: 'codex-toml', path: '~/.codex/config.toml', exclude: ['node_repl', 'cua_repl', 'codex_app'] },
    detect: ['~/.codex'], builtin: true,
  },
  {
    id: 'dsh', auth: ['bearer'], name: 'DSH', short: 'D', color: '#4d6bfe',
    skills: { dir: '~/.dsh/skills', mode: 'native' },
    mcp: { format: 'dsh-patch', path: '$DSH_PROFILE_DIR/cordis.patch.yml' },
    detect: ['~/.dsh'], builtin: true,
  },
  {
    id: 'claude', auth: ['oauth', 'bearer', 'env'], name: 'Claude Code', short: 'C', color: '#c96442',
    skills: { dir: '~/.claude/skills', mode: 'link' },
    mcp: { format: 'json', path: '~/.claude.json', key: 'mcpServers', dialect: 'claude' },
    detect: ['~/.claude', '~/.claude.json'], builtin: true,
  },
  {
    id: 'tclaude', auth: ['oauth', 'bearer', 'env'], name: 'TClaude', short: 'T', color: '#d97757',
    skills: { dir: '~/.tclaude/skills', mode: 'link' },
    mcp: { format: 'json', path: '~/.tclaude/.claude.json', key: 'mcpServers', dialect: 'claude' },
    detect: ['~/.tclaude'], builtin: true,
  },
  {
    id: 'workbuddy', auth: ['oauth', 'bearer'], name: 'WorkBuddy', short: 'W', color: '#7c3aed', verified: false,
    skills: { dir: '~/.workbuddy/skills', mode: 'link' },
    mcp: { format: 'json', path: '~/.workbuddy/mcp.json', key: 'mcpServers', dialect: 'workbuddy',
      extra: [{ label: 'Connectors', path: '~/.workbuddy/connectors/default/mcp.json', key: 'mcpServers' }] },
    detect: ['~/.workbuddy'], builtin: true,
  },
  // —— 以下预设默认不启用：检测到目录存在时列为「已检测到 · 未启用」，打开开关即纳入 ——
  {
    id: 'codebuddy', verified: false, auth: ['oauth', 'bearer'], name: 'CodeBuddy', short: 'CB', color: '#0052d9',
    skills: { dir: '~/.codebuddy/skills', mode: 'link' },
    mcp: { format: 'json', path: '~/.codebuddy/mcp.json', key: 'mcpServers', dialect: 'claude' },
    detect: ['~/.codebuddy/mcp.json'],
  },
  {
    id: 'cursor', verified: false, auth: ['oauth', 'bearer', 'env'], name: 'Cursor', short: 'Cu', color: '#1f2328',
    skills: { dir: '~/.cursor/skills', mode: 'link' },
    mcp: { format: 'json', path: '~/.cursor/mcp.json', key: 'mcpServers', dialect: 'cursor' },
    detect: ['~/.cursor'],
  },
  {
    id: 'claude-desktop', verified: false, auth: ['none'], name: 'Claude Desktop', short: 'CD', color: '#b4793f',
    skills: { mode: 'none' },
    mcp: { format: 'json', path: '~/Library/Application Support/Claude/claude_desktop_config.json', key: 'mcpServers', dialect: 'claude-desktop' },
    detect: ['~/Library/Application Support/Claude/claude_desktop_config.json'],
  },
  {
    id: 'opencode', verified: false, auth: ['oauth', 'bearer', 'env'], name: 'OpenCode', short: 'O', color: '#525866',
    skills: { dir: '~/.config/opencode/skills', mode: 'link' },
    mcp: { format: 'json', path: '~/.config/opencode/opencode.json', key: 'mcp', dialect: 'opencode' },
    detect: ['~/.config/opencode'],
  },
  {
    id: 'gemini', verified: false, auth: ['oauth', 'bearer', 'env'], name: 'Gemini CLI', short: 'G', color: '#1a73e8',
    skills: { mode: 'none' },
    mcp: { format: 'json', path: '~/.gemini/settings.json', key: 'mcpServers', dialect: 'gemini' },
    detect: ['~/.gemini'],
  },
  {
    id: 'windsurf', verified: false, auth: ['bearer', 'env'], name: 'Windsurf', short: 'Ws', color: '#0b7a75',
    skills: { mode: 'none' },
    mcp: { format: 'json', path: '~/.codeium/windsurf/mcp_config.json', key: 'mcpServers', dialect: 'windsurf' },
    detect: ['~/.codeium/windsurf'],
  },
]

/** JSON 方言：同一份统一模型 ↔ 各家字段写法 */
export const DIALECTS = {
  claude: { label: 'Claude 风格（type/url/headers/command/args/env）' },
  'claude-desktop': { label: 'Claude Desktop（仅 stdio：command/args/env）', stdioOnly: true },
  cursor: { label: 'Cursor 风格（url 或 command，无 type）' },
  gemini: { label: 'Gemini 风格（httpUrl / command）' },
  windsurf: { label: 'Windsurf 风格（serverUrl / command）' },
  opencode: { label: 'OpenCode 风格（mcp.{local|remote}）' },
  workbuddy: { label: 'WorkBuddy 风格（type/url/timeout/disabled）' },
}

export function resolvePath(p, env = process.env) {
  if (!p) return p
  const r = p.replace('$DSH_PROFILE_DIR', env.DSH_PROFILE_DIR || path.join(HOME, '.dsh/profiles/desktop'))
  return expand(r)
}

export function hubPaths(root = '~/.agents') {
  const r = expand(root)
  return {
    root: r,
    skills: path.join(r, 'skills'),
    mcp: path.join(r, 'mcp.json'),
    secrets: path.join(r, 'secrets.json'),
    state: path.join(r, 'hub', 'state.json'),
    sources: path.join(r, 'hub', 'sources.json'),
    settings: path.join(r, 'hub', 'settings.json'),
    backups: path.join(r, 'hub', 'backups'),
    trash: path.join(r, 'hub', 'trash'),
    lock: path.join(r, '.skill-lock.json'),
  }
}

const exists = (p) => { try { fs.lstatSync(p); return true } catch { return false } }

/**
 * 合并预设与 sources.json，返回所有已检测到/已添加的来源。
 * settings.autoEnable（默认 true）：检测到即启用；settings.defaultMode：软链/复制 的默认值。
 */
export function loadAgents(hub, env = process.env, settings = {}) {
  let user = { agents: [] }
  try { user = JSON.parse(fs.readFileSync(hub.sources, 'utf8')) } catch {}
  const overrides = new Map((user.agents || []).map((a) => [a.id, a]))
  const autoEnable = settings.autoEnable !== false
  const defMode = settings.defaultMode === 'copy' ? 'copy' : 'link'
  const list = []
  for (const p of PRESETS) {
    const o = overrides.get(p.id)
    const detected = (p.detect || []).some((d) => exists(resolvePath(d, env)))
    if (!detected && !o) continue
    const base = { ...p, skills: { ...p.skills, mode: p.skills.mode === 'link' ? defMode : p.skills.mode } }
    const merged = o ? { ...base, ...o, skills: { ...base.skills, ...o.skills }, mcp: { ...base.mcp, ...o.mcp } } : base
    const defSync = p.verified === false ? { skills: false, mcp: false } : { skills: true, mcp: true }
    const sync = { ...defSync, ...(o && o.sync) }
    const enabled = o && typeof o.enabled === 'boolean' ? o.enabled : autoEnable
    const { role, ...rest } = merged
    list.push({ ...rest, sync, enabled, detected, preset: true })
  }
  for (const a of user.agents || []) {
    if (PRESETS.some((p) => p.id === a.id)) continue
    const { role, ...rest } = a
    list.push({ auth: ['bearer'], enabled: true, ...rest, sync: { skills: true, mcp: true, ...a.sync }, custom: true, detected: true })
  }
  return list
}

/** 是否向该 Agent 同步某类内容（技能 / MCP） */
export const syncOn = (a, k) => a.enabled !== false && !(a.sync && a.sync[k] === false)

/** 选择一个 Agent 鉴权方式：优先 Hub 首选，其次 bearer，否则不同步 */
export function pickAuth(agent, prefer, override) {
  if (override && (agent.auth || []).includes(override)) return override
  const caps = agent.auth || []
  if (caps.includes(prefer)) return prefer
  if (prefer !== 'none' && caps.includes('bearer')) return 'bearer'
  return prefer === 'none' ? 'none' : 'unsupported'
}

/** 添加目录：按目录特征识别 Agent 结构 */
export function recognizeDir(dir) {
  const d = expand(dir)
  const tryJson = (f, key) => { try { const j = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); return j && typeof j[key] === 'object' ? j : null } catch { return null } }
  const preset = PRESETS.find((p) => p.mcp.path && expand(p.mcp.path).startsWith(d + path.sep))
  if (preset) return { ...preset, id: preset.id, recognizedBy: 'preset' }
  for (const [file, key] of [['mcp.json', 'mcpServers'], ['settings.json', 'mcpServers'], ['.mcp.json', 'mcpServers'], ['mcp_config.json', 'mcpServers']]) {
    const j = tryJson(file, key)
    if (j) {
      const name = path.basename(d).replace(/^\./, '')
      return { id: name.toLowerCase(), name, short: name.slice(0, 2).toUpperCase(), color: '#64748b', auth: ['bearer'],
        skills: { dir: tilde(path.join(d, 'skills')), mode: 'link' },
        mcp: { format: 'json', path: tilde(path.join(d, file)), key, dialect: 'claude' }, recognizedBy: file, count: Object.keys(j[key]).length }
    }
  }
  if (exists(path.join(d, 'skills'))) {
    const name = path.basename(d).replace(/^\./, '')
    return { id: name.toLowerCase(), name, short: name.slice(0, 2).toUpperCase(), color: '#64748b', auth: ['bearer'], skills: { dir: tilde(path.join(d, 'skills')), mode: 'link' }, mcp: null, recognizedBy: 'skills' }
  }
  return null
}
