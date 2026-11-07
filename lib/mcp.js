// MCP 统一模型与各家格式适配。
// Hub 模型（~/.agents/mcp.json → servers[name]）：
//   { transport: 'http'|'sse'|'stdio', url, headers, command, args, env, timeoutMs,
//     auth: { prefer: 'oauth'|'bearer'|'env'|'none', secret, envVar, uses: { [agentId]: mode } },
//     targets: { [agentId]: false } }
// 对比统一使用「视图」：把 Hub 期望值与 Agent 实际值都规范化为同一结构，密钥只保留指纹。
import fs from 'node:fs'
import { readText, readJson, writeFileAtomic, fingerprint, deepEqual, canon } from './util.js'

export const normTransport = (t, hasUrl) => {
  const v = String(t || '').toLowerCase().replace(/[^a-z]/g, '')
  if (v === 'sse') return 'sse'
  if (v === 'stdio' || v === 'local') return 'stdio'
  if (v === 'http' || v === 'streamablehttp' || v === 'remote' || v === 'ws') return 'http'
  return hasUrl ? 'http' : 'stdio'
}
const SECRET_RE = /\$\{secret:([A-Za-z0-9_.-]+)\}/g
export const resolveSecrets = (v, secrets) => typeof v === 'string' ? v.replace(SECRET_RE, (_, n) => secrets[n] ?? '') : v
const isAuthKey = (k) => k.toLowerCase() === 'authorization'
const splitHeaders = (h) => {
  const rest = {}; let auth
  for (const [k, v] of Object.entries(h || {})) { if (isAuthKey(k)) auth = v; else rest[k] = v }
  return { rest, auth }
}

// ───────── 鉴权 ─────────
export function pickAuth(agent, prefer = 'none', override) {
  const caps = agent.auth || ['bearer']
  if (override && caps.includes(override)) return override
  if (prefer === 'none') return 'none'
  if (caps.includes(prefer)) return prefer
  if (caps.includes('bearer') && prefer !== 'none') return 'bearer'
  return 'unsupported'
}

/** Hub 定义 → 该 Agent 期望的视图；不支持时返回 { unsupported: 原因 } */
export function expectedView(server, agent, secrets) {
  const d = DIALECTS[agent.mcp.format === 'json' ? agent.mcp.dialect || 'claude' : agent.mcp.format] || {}
  const tr = server.transport || (server.url ? 'http' : 'stdio')
  if (d.stdioOnly && tr !== 'stdio') return { unsupported: '该 Agent 只支持本地命令型 MCP' }
  const remote = tr !== 'stdio'
  const mode = remote ? pickAuth(agent, server.auth?.prefer || 'none', server.auth?.uses?.[agent.id]) : 'none'
  if (mode === 'unsupported') return { unsupported: '该 Agent 不支持此鉴权方式' }
  const { rest } = splitHeaders(server.headers)
  const v = { transport: d.noSse && tr === 'sse' ? 'http' : tr }
  if (remote) {
    v.url = server.url
    v.headers = Object.fromEntries(Object.entries(rest).map(([k, x]) => [k, resolveSecrets(x, secrets)]))
    v.auth = mode === 'oauth' || mode === 'none' ? 'oauth' : mode
    if (mode === 'bearer') { const val = secrets[server.auth?.secret] || ''; v.authFp = fingerprint(val); v._authValue = val }
    if (mode === 'env') v.authEnv = server.auth?.envVar || ''
  } else {
    v.command = server.command; v.args = server.args || []
    v.env = Object.fromEntries(Object.entries(server.env || {}).map(([k, x]) => [k, resolveSecrets(x, secrets)]))
  }
  if (d.timeout && server.timeoutMs) v.timeoutMs = Number(server.timeoutMs)
  return v
}

/** 从各家原始条目读出视图（密钥只留指纹） */
function viewFromGeneric(e, d) {
  const url = e.url ?? e.httpUrl ?? e.serverUrl
  const tr = normTransport(e.type ?? e.transport, !!url)
  const v = { transport: d.noSse && tr === 'sse' ? 'http' : tr }
  if (tr !== 'stdio') {
    v.url = url
    const { rest, auth } = splitHeaders(e.headers || e.http_headers || e.staticHeaders)
    v.headers = rest
    if (auth != null && /\$\{[A-Za-z_]/.test(auth)) { v.auth = 'env'; v.authEnv = (auth.match(/\$\{([A-Za-z0-9_]+)/) || [])[1] || '' }
    else if (auth != null) { v.auth = 'bearer'; v.authFp = fingerprint(auth); v._authValue = auth }
    else if (e.bearer_token_env_var) { v.auth = 'env'; v.authEnv = e.bearer_token_env_var }
    else v.auth = 'oauth'
  } else {
    if (Array.isArray(e.command)) { v.command = e.command[0]; v.args = e.command.slice(1) } else { v.command = e.command; v.args = e.args || [] }
    v.env = e.env || e.environment || {}
  }
  if (d.timeout && d.timeoutKey && e[d.timeoutKey] != null) v.timeoutMs = Number(e[d.timeoutKey]) * (d.timeoutScale || 1)
  return v
}

/** 视图 → Hub 定义（用于导入/回写） */
export function serverFromView(v, secretName) {
  const s = { transport: v.transport }
  if (v.transport === 'stdio') { s.command = v.command; s.args = v.args || []; if (v.env && Object.keys(v.env).length) s.env = v.env }
  else {
    s.url = v.url
    if (v.headers && Object.keys(v.headers).length) s.headers = v.headers
    s.auth = v.auth === 'bearer' ? { prefer: 'bearer', secret: secretName } : v.auth === 'env' ? { prefer: 'env', envVar: v.authEnv } : { prefer: 'oauth' }
  }
  if (v.timeoutMs) s.timeoutMs = v.timeoutMs
  return s
}

export const publicView = (v) => { if (!v) return v; const { _authValue, ...r } = v; return r }
export const viewEqual = (a, b) => deepEqual(publicView(a), publicView(b))

/** 视图逐字段：用于对比表 */
export function viewFields(v) {
  if (!v) return {}
  const f = { transport: v.transport }
  if (v.transport === 'stdio') { f.command = v.command; f.args = (v.args || []).join(' '); for (const [k, x] of Object.entries(v.env || {})) f['env.' + k] = x }
  else { f.url = v.url; for (const [k, x] of Object.entries(v.headers || {})) f['headers.' + k] = x; f.auth = v.auth === 'bearer' ? 'Bearer ' + v.authFp : v.auth === 'env' ? 'env ' + v.authEnv : 'OAuth / 无' }
  if (v.timeoutMs != null) f.timeout = v.timeoutMs + ' ms'
  return f
}

// ───────── 方言 ─────────
// timeoutKey/timeoutScale：该方言的超时字段与换算到毫秒的倍数
export const DIALECTS = {
  claude: { label: 'Claude 风格', render: (v, prev) => keep(prev, ['type', 'url', 'headers', 'command', 'args', 'env'], v.transport === 'stdio'
    ? { type: 'stdio', command: v.command, args: v.args, ...(nz(v.env) ? { env: v.env } : {}) }
    : { type: v.transport, url: v.url, ...hdr(v, 'json') }) },
  cursor: { label: 'Cursor 风格', render: (v, prev) => keep(prev, ['url', 'headers', 'command', 'args', 'env', 'type'], v.transport === 'stdio'
    ? { command: v.command, args: v.args, ...(nz(v.env) ? { env: v.env } : {}) } : { url: v.url, ...hdr(v, 'json') }) },
  'claude-desktop': { label: 'Claude Desktop（仅本地命令）', stdioOnly: true, render: (v, prev) => keep(prev, ['command', 'args', 'env'], { command: v.command, args: v.args, ...(nz(v.env) ? { env: v.env } : {}) }) },
  gemini: { label: 'Gemini 风格', timeout: true, timeoutKey: 'timeout', render: (v, prev) => keep(prev, ['url', 'httpUrl', 'headers', 'command', 'args', 'env', 'timeout'], v.transport === 'stdio'
    ? { command: v.command, args: v.args, ...(nz(v.env) ? { env: v.env } : {}), ...(v.timeoutMs ? { timeout: v.timeoutMs } : {}) }
    : { [v.transport === 'sse' ? 'url' : 'httpUrl']: v.url, ...hdr(v, 'json'), ...(v.timeoutMs ? { timeout: v.timeoutMs } : {}) }) },
  windsurf: { label: 'Windsurf 风格', render: (v, prev) => keep(prev, ['serverUrl', 'headers', 'command', 'args', 'env'], v.transport === 'stdio'
    ? { command: v.command, args: v.args, ...(nz(v.env) ? { env: v.env } : {}) } : { serverUrl: v.url, ...hdr(v, 'json') }) },
  opencode: { label: 'OpenCode 风格', noSse: true, render: (v, prev) => keep(prev, ['type', 'url', 'headers', 'command', 'environment'], v.transport === 'stdio'
    ? { type: 'local', command: [v.command, ...(v.args || [])], ...(nz(v.env) ? { environment: v.env } : {}) } : { type: 'remote', url: v.url, ...hdr(v, 'json') }) },
  workbuddy: { label: 'WorkBuddy 风格', render: (v, prev) => keep(prev, ['type', 'url', 'headers', 'command', 'args', 'env'], v.transport === 'stdio'
    ? { command: v.command, args: v.args, ...(nz(v.env) ? { env: v.env } : {}) } : { type: v.transport === 'sse' ? 'sse' : 'streamableHttp', url: v.url, ...hdr(v, 'json') }) },
  'codex-toml': { timeout: true, timeoutKey: 'tool_timeout_sec', timeoutScale: 1000 },
  'dsh-patch': { timeout: true, timeoutKey: 'toolCallTimeoutMs', noSse: true },
}
const nz = (o) => o && Object.keys(o).length
const keep = (prev, managed, next) => ({ ...Object.fromEntries(Object.entries(prev || {}).filter(([k]) => !managed.includes(k))), ...next })
function hdr(v, style) {
  const h = { ...(v.headers || {}) }
  if (v.auth === 'bearer') h.Authorization = v._authValue
  if (v.auth === 'env') h.Authorization = 'Bearer ${' + v.authEnv + '}'
  return nz(h) ? { headers: h } : {}
}

// ───────── JSON 适配 ─────────
/** 宽松 JSON：允许注释与尾逗号（OpenCode 等使用 JSONC） */
export function parseJsonc(t) {
  try { return JSON.parse(t) } catch {}
  let out = ''; let i = 0; let str = false
  while (i < t.length) {
    const c = t[i]
    if (str) { out += c; if (c === '\\') { out += t[i + 1]; i += 2; continue } if (c === '"') str = false; i++; continue }
    if (c === '"') { str = true; out += c; i++; continue }
    if (c === '/' && t[i + 1] === '/') { while (i < t.length && t[i] !== '\n') i++; continue }
    if (c === '/' && t[i + 1] === '*') { i = t.indexOf('*/', i + 2) + 2; continue }
    out += c; i++
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'))
}
const getPath = (o, p) => p.split('.').reduce((x, k) => (x && typeof x === 'object' ? x[k] : undefined), o)
function setPath(o, p, v) { const ks = p.split('.'); let x = o; for (const k of ks.slice(0, -1)) x = x[k] = x[k] && typeof x[k] === 'object' ? x[k] : {}; x[ks.at(-1)] = v }

export const jsonAdapter = {
  read(agent, file) {
    const t = readText(file)
    if (t == null) return { entries: {} }
    const obj = parseJsonc(t)
    const m = getPath(obj, agent.mcp.key || 'mcpServers') || {}
    const d = DIALECTS[agent.mcp.dialect || 'claude']
    const entries = {}
    for (const [name, e] of Object.entries(m)) entries[name] = { view: viewFromGeneric(e, d), enabled: e.disabled === true ? false : e.enabled === false ? false : undefined, raw: e }
    return { entries }
  },
  /** ops: [{ name, view } | { name, remove: true } | { name, enabled }] */
  write(agent, file, ops) {
    const t = readText(file)
    const obj = t == null ? {} : parseJsonc(t)
    const key = agent.mcp.key || 'mcpServers'
    const m = getPath(obj, key) || {}
    const d = DIALECTS[agent.mcp.dialect || 'claude']
    for (const op of ops) {
      if (op.remove) delete m[op.name]
      else if (typeof op.enabled === 'boolean') { if (m[op.name]) { if ('disabled' in m[op.name] || agent.mcp.dialect === 'workbuddy') m[op.name].disabled = !op.enabled; else m[op.name].enabled = op.enabled } }
      else m[op.name] = d.render(op.view, m[op.name])
    }
    setPath(obj, key, m)
    writeFileAtomic(file, JSON.stringify(obj, null, 2) + '\n')
  },
}

// ───────── Codex TOML 适配（文本区间替换，保留注释与其他段） ─────────
function tomlValue(s) {
  s = s.trim()
  if (s.startsWith('"')) return JSON.parse(s.replace(/\\'/g, "'"))
  if (s.startsWith("'")) return s.slice(1, s.lastIndexOf("'"))
  if (s === 'true' || s === 'false') return s === 'true'
  if (s.startsWith('[')) return splitTop(s.slice(1, -1)).filter((x) => x.trim()).map(tomlValue)
  if (s.startsWith('{')) return Object.fromEntries(splitTop(s.slice(1, -1)).filter((x) => x.trim()).map((kv) => { const i = kv.indexOf('='); return [unq(kv.slice(0, i).trim()), tomlValue(kv.slice(i + 1))] }))
  const n = Number(s.split('#')[0]); return Number.isNaN(n) ? s : n
}
const unq = (k) => (k.startsWith('"') ? JSON.parse(k) : k)
function splitTop(s) {
  const out = []; let depth = 0; let q = null; let cur = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) { cur += c; if (c === '\\' && q === '"') { cur += s[++i]; continue } if (c === q) q = null; continue }
    if (c === '"' || c === "'") { q = c; cur += c; continue }
    if (c === '[' || c === '{') depth++
    if (c === ']' || c === '}') depth--
    if (c === ',' && depth === 0) { out.push(cur); cur = ''; continue }
    cur += c
  }
  if (cur.trim()) out.push(cur)
  return out
}
const tstr = (s) => JSON.stringify(String(s))
const tkey = (k) => (/^[A-Za-z0-9_-]+$/.test(k) ? k : JSON.stringify(k))
const tinline = (o) => '{ ' + Object.entries(o).map(([k, v]) => `${tkey(k)} = ${tstr(v)}`).join(', ') + ' }'
const HEADER_RE = /^\s*\[([^\]]+)\]\s*(#.*)?$/

/** 把 TOML 文本切成段：{ header, path:[...], start, end }（行号，end 不含） */
function tomlSections(lines) {
  const secs = []
  lines.forEach((l, i) => {
    const m = l.match(HEADER_RE)
    if (m && !l.trim().startsWith('[[')) {
      const p = []; let s = m[1].trim()
      while (s) { if (s.startsWith('"')) { const j = s.indexOf('"', 1); p.push(s.slice(1, j)); s = s.slice(j + 1).replace(/^\s*\.\s*/, '') } else { const j = s.indexOf('.'); p.push((j < 0 ? s : s.slice(0, j)).trim()); s = j < 0 ? '' : s.slice(j + 1) } }
      if (secs.length) secs.at(-1).end = i
      secs.push({ path: p, start: i, end: lines.length })
    }
  })
  return secs
}
function readKeys(lines, s, e) {
  const o = {}
  for (let i = s + 1; i < e; i++) {
    const l = lines[i]; if (!l.trim() || l.trim().startsWith('#')) continue
    const j = l.indexOf('='); if (j < 0) continue
    try { o[unq(l.slice(0, j).trim())] = tomlValue(l.slice(j + 1)) } catch { o[unq(l.slice(0, j).trim())] = l.slice(j + 1).trim() }
  }
  return o
}
export const codexAdapter = {
  read(agent, file) {
    const t = readText(file)
    if (t == null) return { entries: {} }
    const lines = t.split('\n'); const secs = tomlSections(lines)
    const raw = {}
    for (const s of secs) {
      if (s.path[0] !== 'mcp_servers' || s.path.length < 2) continue
      const name = s.path[1]; raw[name] = raw[name] || {}
      const kv = readKeys(lines, s.start, s.end)
      if (s.path.length === 2) Object.assign(raw[name], kv)
      else if (s.path[2] === 'env') raw[name].env = { ...(raw[name].env || {}), ...kv }
      else if (s.path[2] === 'http_headers') raw[name].http_headers = { ...(raw[name].http_headers || {}), ...kv }
    }
    const d = DIALECTS['codex-toml']
    const entries = {}
    for (const [n, e] of Object.entries(raw)) entries[n] = { view: viewFromGeneric({ ...e, type: e.url ? 'http' : 'stdio' }, d), enabled: e.enabled === false ? false : undefined, raw: e }
    return { entries }
  },
  render(name, v, prevKeys) {
    const keepKeys = Object.entries(prevKeys || {}).filter(([k]) => !['url', 'command', 'args', 'env', 'http_headers', 'tool_timeout_sec', 'bearer_token_env_var', 'type'].includes(k))
    const out = [`[mcp_servers.${tkey(name)}]`]
    if (v.transport === 'stdio') {
      out.push(`command = ${tstr(v.command)}`, `args = [${(v.args || []).map(tstr).join(', ')}]`)
      if (nz(v.env)) out.push(`env = ${tinline(v.env)}`)
    } else {
      out.push(`url = ${tstr(v.url)}`)
      const h = { ...(v.headers || {}) }
      if (v.auth === 'bearer') h.Authorization = v._authValue
      if (v.auth === 'env') out.push(`bearer_token_env_var = ${tstr(v.authEnv)}`)
      if (nz(h)) out.push(`http_headers = ${tinline(h)}`)
    }
    if (v.timeoutMs) out.push(`tool_timeout_sec = ${v.timeoutMs / 1000}`)
    for (const [k, x] of keepKeys) out.push(`${tkey(k)} = ${typeof x === 'string' ? tstr(x) : Array.isArray(x) ? '[' + x.map((y) => (typeof y === 'string' ? tstr(y) : y)).join(', ') + ']' : typeof x === 'object' ? tinline(x) : x}`)
    return out
  },
  write(agent, file, ops) {
    const t = readText(file) ?? ''
    let lines = t.split('\n')
    const cur = this.read(agent, file).entries
    for (const op of ops) {
      const secs = tomlSections(lines)
      const mine = secs.filter((s) => s.path[0] === 'mcp_servers' && s.path[1] === op.name)
      let block = null
      if (op.remove) block = []
      else if (typeof op.enabled === 'boolean') { if (!cur[op.name]) continue; block = this.render(op.name, cur[op.name].view, { ...cur[op.name].raw, enabled: op.enabled }) }
      else block = this.render(op.name, op.view, cur[op.name] ? cur[op.name].raw : null)
      if (mine.length) {
        const s = mine[0].start; const e = mine.at(-1).end
        let tail = e; while (tail > s && !lines[tail - 1].trim()) tail--
        const keepComments = []
        lines.splice(s, tail - s, ...block, ...keepComments)
        if (!block.length && lines[s] === '' && lines[s - 1] === '') lines.splice(s, 1)
      } else if (block.length) {
        const all = secs.filter((x) => x.path[0] === 'mcp_servers')
        let at = all.length ? all.at(-1).end : lines.length
        while (at > 0 && !lines[at - 1].trim()) at--
        lines.splice(at, 0, '', ...block)
      }
    }
    writeFileAtomic(file, lines.join('\n'))
  },
}

// ───────── DSH 适配：托管块 + 运行时配置编辑器 ─────────
export const BLOCK_BEGIN = '# >>> agent-hub: managed block (由 Agent Hub 维护，请勿手改) >>>'
export const BLOCK_END = '# <<< agent-hub: managed block <<<'
export const DSH_PKG = '@deepseek-ai/dsh-mcp-client'

export function splitBlock(text) {
  const a = text.indexOf(BLOCK_BEGIN); const b = text.indexOf(BLOCK_END)
  if (a < 0 || b < a) return { before: text, block: '', after: '' }
  return { before: text.slice(0, a), block: text.slice(a, b + BLOCK_END.length), after: text.slice(b + BLOCK_END.length) }
}
function parseBlock(block) {
  const out = {}; let cur = null
  for (const l of block.split('\n')) {
    let m
    if ((m = l.match(/^\s*- id: (\S+)/))) { cur = { id: m[1], config: {} }; continue }
    if (cur && (m = l.match(/^\s{8}([A-Za-z]+): (.*)$/))) { try { cur.config[m[1]] = JSON.parse(m[2]) } catch { cur.config[m[1]] = m[2] } if (m[1] === 'serverName') out[cur.config.serverName] = cur }
  }
  return out
}
function renderBlock(entries) {
  const names = Object.keys(entries).sort()
  if (!names.length) return ''
  const rows = names.map((n) => {
    const c = entries[n]
    return [`    - id: ${c.id}`, `      name: '${DSH_PKG}'`, `      config:`, ...Object.entries(c.config).map(([k, v]) => `        ${k}: ${JSON.stringify(v)}`)].join('\n')
  })
  return [BLOCK_BEGIN, '- insert:', ...rows, BLOCK_END].join('\n')
}
export const dshIdFor = (name) => 'agent-hub-mcp-' + name.replace(/[^A-Za-z0-9_-]/g, '-')
function dshConfig(name, v) {
  const c = { serverName: name, transport: v.transport === 'stdio' ? 'stdio' : 'streamable-http' }
  if (v.transport === 'stdio') { c.command = v.command; c.args = v.args || []; if (nz(v.env)) c.env = v.env }
  else { c.url = v.url; const h = { ...(v.headers || {}) }; if (v.auth === 'bearer') h.Authorization = v._authValue; if (nz(h)) c.headers = h }
  if (v.timeoutMs) c.toolCallTimeoutMs = v.timeoutMs
  return c
}
/** 手写区里的 dsh-mcp-client 行（只读解析，用于无配置编辑器时的回退） */
function parseHandwritten(text) {
  const out = {}
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)- id: (\S+)\s*$/)
    if (!m) continue
    const ind = m[1].length; let j = i + 1; const body = []
    while (j < lines.length && (!lines[j].trim() || lines[j].search(/\S/) > ind)) body.push(lines[j++])
    const txt = body.join('\n')
    if (!txt.includes(DSH_PKG)) continue
    const get = (k) => { const r = txt.match(new RegExp('^\\s*' + k + ":\\s*(.*)$", 'm')); return r ? r[1].trim().replace(/^['"]|['"]$/g, '') : undefined }
    const cfg = { serverName: get('serverName'), transport: get('transport'), url: get('url'), command: get('command') }
    const t = get('toolCallTimeoutMs'); if (t) cfg.toolCallTimeoutMs = Number(t)
    const a = txt.match(/Authorization:\s*('([^']|'')*'|"(?:[^"\\]|\\.)*"|[^\n]*)/)
    if (a) { let v = a[1].trim(); if (v.startsWith("'")) v = v.slice(1, -1).replace(/''/g, "'"); else if (v.startsWith('"')) v = JSON.parse(v); cfg.headers = { Authorization: v.replace(/\s*\n\s*/g, ' ').trim() } }
    if (cfg.serverName) out[cfg.serverName] = { id: m[2], config: cfg }
  }
  return out
}
export const dshAdapter = {
  /** editor：DSH 的 configEditor（运行时注入），用于读取所有层的实际配置与修改手写行 */
  read(agent, file, editor) {
    const text = readText(file) ?? ''
    const { before, block, after } = splitBlock(text)
    const managed = parseBlock(block)
    let hand = {}
    if (editor) {
      try {
        for (const r of editor.configuration()) {
          const e = r.entry || {}
          const o = e.options || {}
          if (o.name !== DSH_PKG || e.disabled) continue
          const id = String(o.id || e.id || '')
          if (id.startsWith('agent-hub-mcp-')) continue
          const cfg = { ...(r.inherited || {}), ...(r.override || {}) }
          if (cfg.serverName) hand[cfg.serverName] = { id, config: cfg, entry: e }
        }
      } catch { hand = parseHandwritten(before + after) }
    } else hand = parseHandwritten(before + after)
    const d = DIALECTS['dsh-patch']
    const entries = {}
    for (const [n, e] of Object.entries(hand)) entries[n] = { view: viewFromGeneric({ ...e.config, type: e.config.transport }, d), raw: e.config, where: 'hand', ref: e }
    for (const [n, e] of Object.entries(managed)) entries[n] = { view: viewFromGeneric({ ...e.config, type: e.config.transport }, d), raw: e.config, where: 'block', ref: e }
    return { entries }
  },
  async write(agent, file, ops, editor) {
    const text = readText(file) ?? ''
    const { before, block, after } = splitBlock(text)
    const managed = parseBlock(block)
    const cur = this.read(agent, file, editor).entries
    const handEdits = []
    for (const op of ops) {
      const e = cur[op.name]
      if (e && e.where === 'hand') {
        if (op.remove) continue // 手写行不删除
        handEdits.push({ e, cfg: dshConfig(op.name, op.view) })
        continue
      }
      if (op.remove) delete managed[op.name]
      else if (op.view) managed[op.name] = { id: dshIdFor(op.name), config: dshConfig(op.name, op.view) }
    }
    const blk = renderBlock(managed)
    let next
    if (block) next = before + blk + after
    else next = blk ? text.replace(/\s*$/, '\n\n') + blk + '\n' : text
    if (next !== text) writeFileAtomic(file, next.replace(/\n{3,}(?=# >>> agent-hub)/, '\n\n'))
    for (const { e, cfg } of handEdits) {
      if (!editor || !e.ref.entry) throw new Error(`DSH 中的 ${e.raw.serverName} 是手写配置，需要在 DSH 运行时通过配置编辑器修改`)
      await editor.edit(e.ref.entry, (current) => ({ ...current, ...cfg }))
    }
  },
}

export const adapterFor = (agent) => (agent.mcp.format === 'codex-toml' ? codexAdapter : agent.mcp.format === 'dsh-patch' ? dshAdapter : jsonAdapter)

// ───────── Hub 文件 ─────────
export function readHub(hub) {
  const j = readJson(hub.mcp, null) || { $schema: 'agent-hub/mcp@1', servers: {} }
  j.servers = j.servers || {}
  return j
}
export function readSecrets(hub) { return readJson(hub.secrets, {}) || {} }
export function writeSecrets(hub, s) { writeFileAtomic(hub.secrets, JSON.stringify(canon(s), null, 2) + '\n', 0o600) }
export const writeHub = (hub, j) => writeFileAtomic(hub.mcp, JSON.stringify({ $schema: 'agent-hub/mcp@1', ...j, servers: canon(j.servers) }, null, 2) + '\n')
