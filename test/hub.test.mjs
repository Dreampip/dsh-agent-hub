// 在临时 HOME 中构造与真实机器同结构的配置，验证扫描 / 导入 / 计划 / 执行 / 回滚 / 三方对比 / 安全边界。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-hub-test-'))
process.env.HOME = HOME
process.env.DSH_PROFILE_DIR = path.join(HOME, '.dsh/profiles/desktop')
const w = (rel, txt) => { const p = path.join(HOME, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, txt); return p }
const r = (rel) => fs.readFileSync(path.join(HOME, rel), 'utf8')

w('.agents/skills/alpha/SKILL.md', '---\nname: alpha\ndescription: A\n---\n# alpha\n')
w('.agents/skills/beta/SKILL.md', '---\nname: beta\ndescription: B\n---\n# beta\n')
fs.mkdirSync(path.join(HOME, '.claude/skills'), { recursive: true })
fs.mkdirSync(path.join(HOME, '.tclaude/skills'), { recursive: true })
fs.symlinkSync(path.join(HOME, '.agents/skills/alpha'), path.join(HOME, '.claude/skills/alpha'))
w('.claude/skills/mine/SKILL.md', '---\nname: mine\ndescription: own\n---\n')
w('.claude.json', JSON.stringify({ numStartups: 3, mcpServers: { tapd: { type: 'http', url: 'https://gw/tapd/' }, fetch: { type: 'stdio', command: 'uvx', args: ['mcp-server-fetch'] } } }, null, 2))
w('.tclaude/.claude.json', JSON.stringify({ mcpServers: { tapd: { type: 'http', url: 'https://gw/tapd/' } } }))
const TOML = '# top comment\nmodel = "x"\n\n[mcp_servers.node_repl]\ncommand = "/bin/node_repl"\nargs = []\n\n[mcp_servers.node_repl.env]\nA = "1"\n\n[mcp_servers.tapd]\nurl = "https://gw/tapd/"\ntool_timeout_sec = 60.0\n\n[desktop]\nfoo = "bar"\n'
w('.codex/config.toml', TOML)
const PATCH = '- id: ui-chat\n  name: "@deepseek-ai/dsh-client-ui-chat"\n- insert:\n    - id: mcp-tapd\n      name: \'@deepseek-ai/dsh-mcp-client\'\n      config:\n        serverName: tapd\n        transport: streamable-http\n        url: https://gw/tapd/\n        toolCallTimeoutMs: 60000\n        headers:\n          Authorization: \'Bearer\n            tok123\'\n'
w('.dsh/profiles/desktop/cordis.patch.yml', PATCH)
w('.workbuddy/mcp.json', '{"mcpServers":{}}')
w('.workbuddy/skills/wb-only/SKILL.md', '---\nname: wb-only\ndescription: w\n---\n')

const { Hub } = await import('../lib/core.js')
const hub = () => new Hub({ env: process.env })

test('扫描：技能状态与独有内容', () => {
  const v = hub().view()
  const alpha = v.skills.hub.find((s) => s.name === 'alpha')
  assert.deepEqual(alpha.status, { codex: 'native', dsh: 'native', claude: 'ok', tclaude: 'missing' })
  assert.equal(v.skills.agents.claude.find((x) => x.name === 'mine').kind, 'own')
  assert.equal(v.skills.agents.workbuddy[0].kind, 'own')
  const wb = v.agents.find((a) => a.id === 'workbuddy')
  assert.equal(wb.enabled, true)
  assert.deepEqual(wb.sync, { skills: false, mcp: false })
  assert.equal(v.agents.find((a) => a.id === 'tclaude').name, 'TClaude')
})

test('导入：鉴权按 Agent 能力记录（DSH 请求头，其余 OAuth）', () => {
  const h = hub()
  const ip = h.importPreview()
  const tapd = ip.servers.find((s) => s.name === 'tapd')
  assert.ok(tapd.defs.dsh && tapd.defs.codex && tapd.sameDefinition)
  assert.equal(tapd.defs.dsh.auth, 'bearer')
  assert.equal(tapd.defs.codex.auth, 'oauth')
  assert.equal(tapd.suggest, 'dsh')
  assert.ok(ip.servers.find((s) => s.name === 'node_repl').excluded)
  h.importMcp({ sources: Object.fromEntries(ip.servers.map((s) => [s.name, s.suggest])) })
  const m = JSON.parse(r('.agents/mcp.json')).servers
  assert.equal(m.tapd.auth.prefer, 'oauth')
  assert.equal(m.tapd.auth.uses.dsh, 'bearer')
  assert.equal(m.tapd.auth.uses.codex, 'oauth')
  assert.ok(!('node_repl' in m))
  assert.equal(JSON.parse(r('.agents/secrets.json')).tapd, 'Bearer tok123')
  assert.equal(fs.statSync(path.join(HOME, '.agents/secrets.json')).mode & 0o777, 0o600)
  const v = h.view()
  assert.deepEqual(v.mcp.hub.find((s) => s.name === 'tapd').status, { codex: 'ok', dsh: 'ok', claude: 'ok', tclaude: 'ok' })
})

test('计划与执行：只追加，保留注释与其他段；幂等', async () => {
  const h = hub()
  const p = h.plan()
  const kinds = p.items.map((i) => i.agent + ':' + i.actions.join('/'))
  assert.ok(kinds.includes('codex:add') && kinds.includes('dsh:add') && kinds.includes('tclaude:add') && kinds.includes('tclaude:link'))
  assert.ok(!p.items.some((i) => i.agent === 'workbuddy'))
  assert.ok(p.syncOff.some((x) => x.startsWith('WorkBuddy')))
  await h.apply({ planId: p.id, ids: p.items.map((i) => i.id) })
  const toml = r('.codex/config.toml')
  assert.ok(toml.startsWith('# top comment\nmodel = "x"'))
  assert.ok(toml.includes('[mcp_servers.node_repl.env]\nA = "1"') && toml.includes('[desktop]\nfoo = "bar"'))
  assert.ok(toml.includes('[mcp_servers.fetch]'))
  const patch = r('.dsh/profiles/desktop/cordis.patch.yml')
  assert.ok(patch.startsWith(PATCH.trimEnd()))
  assert.ok(patch.includes('agent-hub-mcp-fetch'))
  assert.equal(JSON.parse(r('.claude.json')).numStartups, 3)
  assert.ok(fs.lstatSync(path.join(HOME, '.tclaude/skills/alpha')).isSymbolicLink())
  const p2 = h.plan()
  assert.deepEqual(p2.items, [])
})

test('三方对比：目标改动 → 回写 Hub；两边都改 → 冲突', async () => {
  const h = hub()
  fs.writeFileSync(path.join(HOME, '.codex/config.toml'), r('.codex/config.toml').replace('url = "https://gw/tapd/"\ntool_timeout_sec = 60', 'url = "https://gw/tapd/"\ntool_timeout_sec = 120'))
  assert.equal(h.view().mcp.hub.find((s) => s.name === 'tapd').status.codex, 'target-changed')
  const d = h.diff({ kind: 'mcp', name: 'tapd', agent: 'codex' })
  assert.equal(d.fields.find((f) => f.field === 'timeout').verdict, 'target')
  const hm = JSON.parse(r('.agents/mcp.json')); hm.servers.tapd.url = 'https://gw/tapd2/'; fs.writeFileSync(path.join(HOME, '.agents/mcp.json'), JSON.stringify(hm))
  // 改了 URL → 身份不同，判为被占用（不覆盖）
  assert.equal(h.view().mcp.hub.find((s) => s.name === 'tapd').status.codex, 'blocked')
  hm.servers.tapd.url = 'https://gw/tapd/'; hm.servers.tapd.timeoutMs = 30000; fs.writeFileSync(path.join(HOME, '.agents/mcp.json'), JSON.stringify(hm))
  assert.equal(h.view().mcp.hub.find((s) => s.name === 'tapd').status.codex, 'conflict')
  await h.resolve({ kind: 'mcp', name: 'tapd', agent: 'codex', pick: { timeout: 'target' } })
  assert.equal(JSON.parse(r('.agents/mcp.json')).servers.tapd.timeoutMs, 120000)
  assert.equal(h.view().mcp.hub.find((s) => s.name === 'tapd').status.codex, 'ok')
})

test('回滚：恢复到同步前', async () => {
  const h = hub()
  const before = r('.claude.json')
  const hm = JSON.parse(r('.agents/mcp.json')); hm.servers.extra = { transport: 'stdio', command: 'x' }; fs.writeFileSync(path.join(HOME, '.agents/mcp.json'), JSON.stringify(hm))
  const p = h.plan(); await h.apply({ planId: p.id, ids: p.items.filter((i) => i.agent === 'claude').map((i) => i.id) })
  assert.ok(r('.claude.json').includes('"extra"'))
  const rec = h.state().records.at(-1)
  h.rollback({ id: rec.id })
  assert.equal(r('.claude.json'), before)
})

test('删除：Hub 删技能只移除指向 Hub 的软链，独有不动', async () => {
  const h = hub()
  h.trashSkill({ name: 'alpha' })
  const p = h.plan()
  const un = p.items.filter((i) => i.actions.includes('unlink'))
  assert.deepEqual(un.map((i) => i.agent).sort(), ['claude', 'tclaude'])
  await h.apply({ planId: p.id, ids: un.map((i) => i.id) })
  assert.ok(!fs.existsSync(path.join(HOME, '.claude/skills/alpha')))
  assert.ok(fs.existsSync(path.join(HOME, '.claude/skills/mine/SKILL.md')))
  h.restoreTrash({ id: h.state().trash[0].id })
  assert.ok(fs.existsSync(path.join(HOME, '.agents/skills/alpha/SKILL.md')))
})

test('复制模式：副本被改 → 目标改动 → 回写', async () => {
  const h = hub()
  h.setSource('tclaude', { skills: { mode: 'copy' } })
  try { fs.unlinkSync(path.join(HOME, '.tclaude/skills/alpha')) } catch {}
  let p = h.plan(); await h.apply({ planId: p.id, ids: p.items.filter((i) => i.agent === 'tclaude').map((i) => i.id) })
  assert.ok(fs.lstatSync(path.join(HOME, '.tclaude/skills/alpha')).isDirectory())
  fs.appendFileSync(path.join(HOME, '.tclaude/skills/alpha/SKILL.md'), 'edit\n')
  assert.equal(h.view().skills.hub.find((s) => s.name === 'alpha').status.tclaude, 'target-changed')
  await h.resolve({ kind: 'skill', name: 'alpha', agent: 'tclaude', pick: { 'SKILL.md': 'target' } })
  assert.ok(r('.agents/skills/alpha/SKILL.md').endsWith('edit\n'))
})

test('同名不同 URL：标为独有/被占用，不覆盖', () => {
  w('.codebuddy/mcp.json', JSON.stringify({ mcpServers: { tapd: { type: 'http', url: 'https://other/tapd' }, iWiki: { type: 'sse', url: 'https://x' } } }))
  const h = hub()
  assert.deepEqual(h.view().agents.find((a) => a.id === 'codebuddy').sync, { skills: false, mcp: false })
  h.setSource('codebuddy', { sync: { mcp: true } })
  const v = h.view()
  const cb = v.mcp.agents.codebuddy
  assert.equal(cb.find((x) => x.name === 'iWiki').kind, 'own')
  assert.equal(cb.find((x) => x.name === 'tapd').state, 'blocked')
  const p = h.plan()
  assert.ok(!p.items.some((i) => i.agent === 'codebuddy' && i.object.includes('tapd')))
})

test('来源目录：识别目录', () => {
  w('.foo/mcp.json', JSON.stringify({ mcpServers: { a: { command: 'x' } } }))
  const h = hub()
  assert.match(h.recognize({ dir: '~/.foo' }).text, /识别为 foo/)
  h.addSource({ dir: '~/.foo' })
  assert.ok(h.view().agents.some((a) => a.id === 'foo' && a.enabled))
})

test('同步机制演示：各 Agent 的写法与鉴权降级', () => {
  const h = hub()
  const x = h.explain({ name: 'tapd' })
  const dsh = x.targets.find((t) => t.agent === 'dsh'); const cx = x.targets.find((t) => t.agent === 'codex')
  assert.equal(dsh.auth, 'bearer'); assert.ok(dsh.lines.some((l) => l.includes('Authorization: Bearer ••••')))
  assert.equal(cx.auth, 'oauth'); assert.ok(cx.lines[0].startsWith('[mcp_servers.tapd]'))
  assert.ok(!JSON.stringify(x).includes('tok123'))
})

test('只读模式：拒绝一切写入（含回滚）', async () => {
  const h = hub()
  h.saveSettings({ readOnly: true })
  const p = h.plan()
  await assert.rejects(() => h.apply({ planId: p.id, ids: [] }), /只读/)
  assert.throws(() => h.rollback({ id: h.state().records.at(-1).id }), /只读/)
  assert.throws(() => h.createSkill({ name: 'x', description: 'x' }), /只读/)
  assert.throws(() => h.saveServer({ name: 'x', transport: 'stdio', command: 'x' }), /只读/)
  h.saveSettings({ readOnly: false })
  assert.equal(h.settings().readOnly, false)
})
