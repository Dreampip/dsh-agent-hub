// Agent Hub 核心：扫描 → 状态视图 → 对比 → 计划 → 执行（带备份与回滚）。
// 安全边界（不可配置）：
//   · 只写「Hub 托管」的内容：指向 Hub 的软链、Hub 复制出去的副本、Hub 写入的 MCP 条目
//   · 各 Agent 独有内容（同名不同 URL、真实目录、手写配置中 Hub 未接管的条目）永不修改或删除
//   · role=manage 的 Agent 永不写入（只允许用户显式的「启停」与「复制到 Hub」）
//   · 每次写入前备份到 ~/.agents/hub/backups/<时间>/，可回滚
import fs from 'node:fs'
import path from 'node:path'
import { hubPaths, loadAgents, expand, resolvePath, tilde, PRESETS, recognizeDir } from './agents.js'
import { readJson, writeJson, readText, exists, lstat, fileHashes, dirHash, stamp, shortTime, Txn, restore, lineDiff, fingerprint, mask, remove, copyDir } from './util.js'
import { adapterFor, expectedView, viewEqual, viewFields, publicView, serverFromView, readHub, writeHub, readSecrets, writeSecrets, DIALECTS, pickAuth } from './mcp.js'
import { listDir, skillStatus, skillInfo, skillFileDiff, linkSkill, copySkill } from './skills.js'

export const VERSION = '0.2.0'

export class Hub {
  constructor(opts = {}) {
    this.env = opts.env || process.env
    this.paths = hubPaths(opts.root || '~/.agents')
    this.editor = opts.editor || null // DSH configEditor（可选）
    this.log = opts.log || (() => {})
  }

  // ───────── 状态文件 ─────────
  state() { return readJson(this.paths.state, null) || { baseline: { mcp: {}, skills: {} }, ignore: [], records: [], trash: [] } }
  saveState(s) { writeJson(this.paths.state, s) }
  sources() { return readJson(this.paths.sources, null) || { agents: [] } }
  saveSources(s) { writeJson(this.paths.sources, s) }
  agents() {
    return loadAgents(this.paths, this.env).map((a) => ({
      ...a,
      skills: { ...a.skills, dir: a.skills.dir },
      mcp: a.mcp ? { ...a.mcp, file: resolvePath(a.mcp.path, this.env), path: a.mcp.path.replace('$DSH_PROFILE_DIR', tilde(resolvePath('$DSH_PROFILE_DIR', this.env))) } : null,
    }))
  }

  // ───────── 扫描 ─────────
  hubSkills() {
    return listDir(this.paths.skills).filter((e) => !e.broken).map((e) => {
      const files = fileHashes(e.realPath)
      return { ...e, path: e.realPath, files, hash: dirHash(files) }
    })
  }
  readAgentMcp(a) {
    try { return { entries: adapterFor(a).read(a, a.mcp.file, this.editor).entries } } catch (e) { return { entries: {}, error: e.message } }
  }

  scan() {
    const agents = this.agents()
    const st = this.state()
    const hubSkills = this.hubSkills()
    const hubMcp = readHub(this.paths)
    const secrets = readSecrets(this.paths)
    const ignore = new Set(st.ignore || [])
    const view = { agents, skills: { hub: [], agents: {} }, mcp: { hub: [], agents: {}, extra: {} }, errors: [] }

    // 技能
    const perAgentEntries = {}
    for (const a of agents) perAgentEntries[a.id] = a.skills.dir ? listDir(a.skills.dir, { ownSubdirs: a.skills.ownSubdirs }) : []
    for (const s of hubSkills) {
      const status = {}
      for (const a of agents) {
        if (a.enabled === false || a.role !== 'sync' || a.skills.mode === 'none') continue
        const entry = perAgentEntries[a.id].find((e) => e.dir === s.dir && !e.builtin)
        const base = st.baseline.skills[a.id + '/' + s.dir]
        let r = skillStatus(a, s, entry, base)
        if (ignore.has('skill:' + a.id + ':' + s.dir) && r.state !== 'ok' && r.state !== 'native') r = { ...r, state: 'ok' }
        status[a.id] = r.state
      }
      view.skills.hub.push({ name: s.dir, description: s.description, status })
    }
    const hubSet = new Map(hubSkills.map((s) => [s.dir, s]))
    for (const a of agents) {
      view.skills.agents[a.id] = perAgentEntries[a.id].map((e) => {
        if (e.builtin) return { name: e.dir, kind: 'builtin', note: e.sub + ' · ' + (e.description || '') }
        const hs = hubSet.get(e.dir)
        if (e.broken) return { name: e.dir, kind: 'hub-link', state: 'broken', note: '→ ' + e.link + '（不存在）' }
        if (e.link && hs && e.realPath === hs.path) return { name: e.dir, kind: 'hub-link', state: 'ok', note: '→ ' + tilde(hs.path) }
        if (hs && a.role === 'sync' && a.skills.mode === 'copy') {
          const r = skillStatus(a, hs, e, st.baseline.skills[a.id + '/' + e.dir])
          return { name: e.dir, kind: 'hub-copy', state: r.state, note: r.state === 'ok' ? 'Hub 副本 · 与 Hub 一致' : 'Hub 副本' }
        }
        if (hs && a.role === 'sync' && a.skills.mode === 'link') return { name: e.dir, kind: 'own', state: 'blocked', note: (e.link ? '软链 → ' + e.link : '同名真实目录') + '，不会覆盖' }
        return { name: e.dir, kind: 'own', note: e.link ? '软链 → ' + e.link : (e.description || '') }
      })
    }

    // MCP
    const agentMcp = {}
    for (const a of agents) if (a.mcp) { agentMcp[a.id] = this.readAgentMcp(a); if (agentMcp[a.id].error) view.errors.push(a.name + '：' + agentMcp[a.id].error) }
    for (const [name, srv] of Object.entries(hubMcp.servers)) {
      const status = {}
      for (const a of agents) {
        if (!a.mcp || a.enabled === false || a.role !== 'sync') continue
        status[a.id] = this.mcpStatus(a, name, srv, agentMcp[a.id].entries[name], secrets, st, ignore)
      }
      const uses = {}
      for (const a of agents) if (a.mcp && a.role === 'sync') uses[a.id] = srv.transport === 'stdio' ? 'none' : pickAuth(a, srv.auth?.prefer || 'none', srv.auth?.uses?.[a.id])
      view.mcp.hub.push({
        name, transport: srv.transport, endpoint: srv.transport === 'stdio' ? [srv.command, ...(srv.args || [])].join(' ') : String(srv.url || '').replace(/^https?:\/\//, ''),
        url: srv.url, timeoutMs: srv.timeoutMs, status,
        auth: srv.transport === 'stdio' ? { prefer: 'none' } : { prefer: srv.auth?.prefer || 'none', secret: srv.auth?.secret, fingerprint: fingerprint(secrets[srv.auth?.secret]), envVar: srv.auth?.envVar, uses },
      })
    }
    for (const a of agents) {
      if (!a.mcp) continue
      const ents = agentMcp[a.id].entries
      const exclude = new Set(a.mcp.exclude || [])
      view.mcp.agents[a.id] = Object.entries(ents).map(([n, e]) => {
        const v = e.view
        const base = { name: n, transport: v.transport, endpoint: v.transport === 'stdio' ? [v.command, ...(v.args || [])].join(' ') : String(v.url || '').replace(/^https?:\/\//, ''), note: v.transport !== 'stdio' ? (v.auth === 'bearer' ? '🔑 ' + v.authFp : v.auth === 'env' ? '🔑 $' + v.authEnv : 'OAuth') : '' }
        if (typeof e.enabled === 'boolean' || a.role === 'manage') base.enabled = e.enabled !== false
        if (exclude.has(n)) return { ...base, kind: 'excluded', note: '内置，永不托管' }
        const srv = hubMcp.servers[n]
        if (srv && a.role === 'sync' && a.enabled !== false && this.sameIdentity(srv, v)) return { ...base, kind: 'managed', state: this.mcpStatus(a, n, srv, e, secrets, st, ignore) }
        if (srv && a.role === 'sync' && a.enabled !== false) return { ...base, kind: 'own', state: 'blocked', note: '同名但地址不同，不会覆盖' }
        return { ...base, kind: 'own' }
      })
      if (a.mcp.extra) for (const x of a.mcp.extra) {
        const xa = { ...a, mcp: { ...a.mcp, path: x.path, key: x.key, file: expand(x.path) } }
        const r = this.readAgentMcp(xa)
        const items = Object.entries(r.entries).map(([n, e]) => ({ name: n, transport: e.view.transport, endpoint: String(e.view.url || e.view.command || '').replace(/^https?:\/\//, ''), kind: 'own', enabled: e.enabled !== false, extra: x.path }))
        view.mcp.extra[a.id] = { label: x.label, path: x.path, total: items.length, enabledCount: items.filter((i) => i.enabled).length, items }
      }
    }
    return view
  }

  sameIdentity(srv, v) {
    if ((srv.transport === 'stdio') !== (v.transport === 'stdio')) return false
    if (srv.transport === 'stdio') return srv.command === v.command
    const n = (u) => String(u || '').toLowerCase().replace(/\/+$/, '')
    return n(srv.url) === n(v.url)
  }

  mcpStatus(a, name, srv, entry, secrets, st, ignore) {
    if ((a.mcp.exclude || []).includes(name)) return 'excluded'
    if (srv.targets && srv.targets[a.id] === false) return 'off'
    const exp = expectedView(srv, a, secrets)
    if (exp.unsupported) return 'off'
    if (!entry) return 'missing'
    if (!this.sameIdentity(srv, entry.view)) return 'blocked'
    if (viewEqual(exp, entry.view)) return 'ok'
    if (ignore.has('mcp:' + a.id + ':' + name)) return 'ok'
    const base = st.baseline.mcp[a.id + '/' + name]
    if (!base) return 'differs'
    const hubChanged = !viewEqual(base, exp); const tgtChanged = !viewEqual(base, entry.view)
    return hubChanged && tgtChanged ? 'conflict' : hubChanged ? 'hub-changed' : tgtChanged ? 'target-changed' : 'differs'
  }

  // ───────── 对外视图 ─────────
  view() {
    const v = this.scan()
    const st = this.state()
    const pending = [...v.skills.hub, ...v.mcp.hub].reduce((n, s) => n + Object.values(s.status).filter((x) => ['missing', 'hub-changed', 'target-changed', 'differs', 'conflict', 'broken'].includes(x)).length, 0)
    const mcpPending = v.mcp.hub.reduce((n, s) => n + Object.values(s.status).filter((x) => !['ok', 'excluded', 'off'].includes(x)).length, 0)
    const skillPending = v.skills.hub.reduce((n, s) => n + Object.values(s.status).filter((x) => !['ok', 'native', 'excluded', 'off'].includes(x)).length, 0)
    return {
      version: VERSION,
      hub: { skillsDir: tilde(this.paths.skills), mcpPath: tilde(this.paths.mcp), mcpExists: exists(this.paths.mcp) },
      agents: v.agents.map(({ detect, mcp, ...a }) => ({ ...a, mcp: mcp ? { format: mcp.format, path: mcp.path, key: mcp.key, dialect: mcp.dialect, exclude: mcp.exclude } : null })),
      candidates: [],
      dialects: Object.entries(DIALECTS).filter(([, d]) => d.label).map(([id, d]) => ({ id, label: d.label })),
      authNotes: AUTH_NOTES,
      counts: { skills: skillPending, mcp: mcpPending, pending },
      skills: v.skills, mcp: v.mcp, errors: v.errors,
      records: (st.records || []).slice(-50).reverse().map((r) => ({ id: r.id, time: shortTime(r.time), summary: r.summary, ok: r.ok, rolledBack: !!r.rolledBack })),
      trash: (st.trash || []).slice().reverse().map((t) => ({ id: t.id, name: t.name, type: t.type, time: shortTime(t.time) })),
    }
  }

  // ───────── 对比 ─────────
  diff({ kind, name, agent: agentId }) {
    const a = this.agents().find((x) => x.id === agentId)
    if (!a) throw new Error('未知 Agent：' + agentId)
    const st = this.state()
    if (kind === 'mcp') {
      const hub = readHub(this.paths); const secrets = readSecrets(this.paths)
      const srv = hub.servers[name]; if (!srv) throw new Error('Hub 中没有 ' + name)
      const cur = this.readAgentMcp(a).entries[name]
      const exp = expectedView(srv, a, secrets)
      const base = st.baseline.mcp[a.id + '/' + name]
      const H = viewFields(exp); const T = viewFields(cur?.view); const B = base ? viewFields(base) : null
      const keys = [...new Set([...Object.keys(H), ...Object.keys(T), ...Object.keys(B || {})])]
      const fields = keys.map((k) => {
        const h = H[k]; const t = T[k]; const b = B ? B[k] : undefined
        let verdict
        if (h === t) verdict = 'same'
        else if (!B) verdict = 'diff'
        else if (h === b) verdict = 'target'
        else if (t === b) verdict = 'hub'
        else verdict = 'both'
        return { field: k, base: b, hub: h, target: t, verdict, default: verdict === 'target' ? 'target' : 'hub' }
      })
      const merged = this.mergeView(exp, cur?.view, Object.fromEntries(fields.map((f) => [f.field, f.default])))
      const targetPatch = this.previewTarget(a, name, merged)
      const hubNext = serverFromMerged(srv, merged, a, name)
      const hubPatch = lineDiff(JSON.stringify({ [name]: srv }, null, 2), JSON.stringify({ [name]: hubNext }, null, 2)).map(fmtDiff)
      return { state: this.mcpStatus(a, name, srv, cur, secrets, st, new Set()), baseTime: base ? shortTime(st.baselineTime?.[a.id + '/' + name] || st.lastSync || new Date().toISOString()) : null, targetPath: a.mcp.path, fields, targetPatch, hubPatch }
    }
    // 技能（复制模式）
    const hs = this.hubSkills().find((s) => s.dir === name)
    const target = path.join(expand(a.skills.dir), name)
    const base = st.baseline.skills[a.id + '/' + name]
    const fields = skillFileDiff(hs.path, target, base?.files)
    const changed = fields.filter((f) => f.verdict !== 'same' && f.verdict !== 'eq').map((f) => f.field)
    const show = changed[0]
    const targetPatch = show ? lineDiff(readText(path.join(hs.path, show)) ?? '', readText(path.join(target, show)) ?? '').filter((l) => l[0] !== ' ').slice(0, 60).map(fmtDiff) : []
    return { state: skillStatus(a, hs, listDir(a.skills.dir).find((e) => e.dir === name), base).state, baseTime: base ? shortTime(base.time) : null, targetPath: tilde(target) + (show ? '/' + show : ''), fields, targetPatch: targetPatch.length ? ['  # ' + show + '（Hub → ' + a.name + '）', ...targetPatch] : [], hubPatch: [] }
  }

  mergeView(exp, cur, pick) {
    if (!cur) return exp
    const out = JSON.parse(JSON.stringify(publicView(exp))); out._authValue = exp._authValue
    const T = viewFields(cur)
    for (const [k, who] of Object.entries(pick || {})) {
      if (who !== 'target') continue
      if (k === 'timeout') out.timeoutMs = cur.timeoutMs
      else if (k === 'auth') { out.auth = cur.auth; out.authFp = cur.authFp; out.authEnv = cur.authEnv; out._authValue = cur._authValue }
      else if (k.startsWith('headers.')) { out.headers = { ...(out.headers || {}) }; if (T[k] === undefined) delete out.headers[k.slice(8)]; else out.headers[k.slice(8)] = cur.headers[k.slice(8)] }
      else if (k.startsWith('env.')) { out.env = { ...(out.env || {}) }; if (T[k] === undefined) delete out.env[k.slice(4)]; else out.env[k.slice(4)] = cur.env[k.slice(4)] }
      else if (k === 'args') out.args = cur.args
      else out[k] = cur[k]
    }
    return out
  }

  previewTarget(a, name, view) {
    const ad = adapterFor(a)
    if (a.mcp.format === 'codex-toml') return ad.render(name, redactView(view), ad.read(a, a.mcp.file).entries[name]?.raw).map((l) => '  ' + l)
    if (a.mcp.format === 'dsh-patch') return ['  # 写入 agent-hub 托管块（或通过 DSH 配置编辑器修改手写行）', ...JSON.stringify({ serverName: name, ...redactView(view) }, null, 2).split('\n').map((l) => '  ' + l)]
    const d = DIALECTS[a.mcp.dialect || 'claude']
    return JSON.stringify({ [name]: d.render(redactView(view), null) }, null, 2).split('\n').map((l) => '  ' + l)
  }

  // ───────── 计划 ─────────
  plan() {
    const v = this.scan(); const agents = v.agents
    const hub = readHub(this.paths); const secrets = readSecrets(this.paths)
    const st = this.state()
    const items = []; const skipped = []; const reload = new Set()
    let id = 1
    const byAgent = (a) => agents.find((x) => x.id === a)
    // MCP：按目标文件聚合
    for (const a of agents) {
      if (!a.mcp || a.enabled === false || a.role !== 'sync') continue
      const ops = []; const adds = []; const upds = []; const rms = []
      const ents = this.readAgentMcp(a).entries
      for (const s of v.mcp.hub) {
        const stt = s.status[a.id]
        if (stt === 'missing') { ops.push({ name: s.name, view: expectedView(hub.servers[s.name], a, secrets) }); adds.push(s.name) }
        else if (stt === 'hub-changed' || stt === 'differs') {
          if (a.mcp.format === 'dsh-patch' && ents[s.name]?.where === 'hand' && !this.editor) { skipped.push(s.name + '（DSH 手写配置，需在 DSH 内执行）'); continue }
          ops.push({ name: s.name, view: expectedView(hub.servers[s.name], a, secrets) }); upds.push(s.name)
        }
        else if (stt === 'conflict') skipped.push(s.name + '（' + a.name + '）')
      }
      // Hub 已删除但目标仍有 Hub 写入过的条目 → 移除
      for (const key of Object.keys(st.baseline.mcp)) {
        const [aid, n] = splitKey(key)
        if (aid !== a.id || hub.servers[n] || !ents[n]) continue
        if (viewEqual(st.baseline.mcp[key], ents[n].view)) { ops.push({ name: n, remove: true }); rms.push(n) }
      }
      if (ops.length) {
        const acts = [...(adds.length ? ['add'] : []), ...(upds.length ? ['update'] : []), ...(rms.length ? ['remove'] : [])]
        items.push({ id: id++, agent: a.id, kind: 'mcp', target: a.mcp.path, actions: acts, object: [adds.length ? '新增 ' + adds.join('、') : '', upds.length ? '更新 ' + upds.join('、') : '', rms.length ? '移除 ' + rms.join('、') : ''].filter(Boolean).join('；'), ops })
        reload.add(a.name)
      }
    }
    // MCP 回写 Hub
    for (const s of v.mcp.hub) for (const [aid, stt] of Object.entries(s.status)) {
      if (stt !== 'target-changed') continue
      const a = byAgent(aid)
      items.push({ id: id++, agent: 'hub', kind: 'mcp-writeback', target: tilde(this.paths.mcp), actions: ['writeback'], object: s.name + ' ← ' + a.name, name: s.name, from: aid })
    }
    // 技能
    const hubSkills = new Map(this.hubSkills().map((s) => [s.dir, s]))
    for (const s of v.skills.hub) for (const [aid, stt] of Object.entries(s.status)) {
      const a = byAgent(aid); const dst = path.join(expand(a.skills.dir), s.name)
      if (stt === 'missing') items.push({ id: id++, agent: aid, kind: 'skill', target: tilde(dst), actions: [a.skills.mode === 'copy' ? 'copy' : 'link'], object: (a.skills.mode === 'copy' ? '从 ' : '→ ') + tilde(hubSkills.get(s.name).path), name: s.name, op: a.skills.mode })
      else if (stt === 'broken') items.push({ id: id++, agent: aid, kind: 'skill', target: tilde(dst), actions: ['link'], object: '修复死链 → ' + tilde(hubSkills.get(s.name).path), name: s.name, op: 'relink' })
      else if (stt === 'hub-changed' || stt === 'differs') items.push({ id: id++, agent: aid, kind: 'skill', target: tilde(dst), actions: ['update'], object: '用 Hub 版本覆盖副本', name: s.name, op: 'copy' })
      else if (stt === 'target-changed') items.push({ id: id++, agent: 'hub', kind: 'skill-writeback', target: tilde(hubSkills.get(s.name).path), actions: ['writeback'], object: s.name + ' ← ' + a.name, name: s.name, from: aid })
      else if (stt === 'conflict') skipped.push(s.name + '（' + a.name + '）')
    }
    // Hub 删除的技能：只移除指向 Hub 的软链（含死链）；副本与独有不动
    for (const a of agents) {
      if (a.enabled === false || a.role !== 'sync' || !['link', 'copy'].includes(a.skills.mode)) continue
      for (const e of listDir(a.skills.dir)) {
        if (hubSkills.has(e.dir) || !e.link) continue
        const t = path.resolve(path.dirname(e.path), e.link)
        const roots = [this.paths.skills]; try { roots.push(fs.realpathSync(this.paths.skills)) } catch {}
        if (roots.some((r) => t.startsWith(r + path.sep))) items.push({ id: id++, agent: a.id, kind: 'skill', target: tilde(e.path), actions: ['unlink'], object: 'Hub 已删除该技能；目标是指向 Hub 的软链', name: e.dir, op: 'unlink' })
      }
    }
    for (const a of agents) if (a.role === 'manage' && a.enabled !== false) items.push({ id: id++, agent: a.id, kind: 'skip', target: tilde(expand(a.mcp?.path || a.skills.dir || '')), actions: ['skip'], object: '仅管理，不同步' })
    const plan = { id: stamp() + '-' + Math.random().toString(36).slice(2, 6), items, skippedConflicts: skipped, reload: [...reload].map((n) => n === 'DSH' ? 'DSH（自动重载 MCP 插件）' : n + '（新会话生效）') }
    this._plan = plan
    return { ...plan, items: items.map(({ ops, ...i }) => i) }
  }

  // ───────── 执行 ─────────
  async apply({ planId, ids }) {
    const plan = this._plan && this._plan.id === planId ? this._plan : null
    if (!plan) throw new Error('同步计划已过期，请重新生成')
    const pick = new Set(ids)
    const items = plan.items.filter((i) => pick.has(i.id) && i.kind !== 'skip')
    const time = new Date().toISOString()
    const txn = new Txn(path.join(this.paths.backups, stamp()))
    const st = this.state()
    const agents = this.agents()
    const byId = (x) => agents.find((a) => a.id === x)
    const secrets = readSecrets(this.paths)
    const done = []
    try {
      for (const it of items) {
        if (it.kind === 'mcp') {
          const a = byId(it.agent)
          if (a.role !== 'sync') continue
          txn.touch(a.mcp.file)
          await adapterFor(a).write(a, a.mcp.file, it.ops, this.editor)
          const after = this.readAgentMcp(a).entries
          for (const op of it.ops) {
            const k = a.id + '/' + op.name
            if (op.remove) delete st.baseline.mcp[k]
            else if (after[op.name]) { st.baseline.mcp[k] = publicView(after[op.name].view); (st.baselineTime ||= {})[k] = time }
          }
          done.push(a.name + ' MCP：' + it.object)
        } else if (it.kind === 'mcp-writeback') {
          const a = byId(it.from)
          txn.touch(this.paths.mcp); txn.touch(this.paths.secrets)
          this.writebackMcp(it.name, a, null, st, time)
          done.push('回写 Hub：' + it.object)
        } else if (it.kind === 'skill') {
          const a = byId(it.agent)
          if (a.role !== 'sync') continue
          const dst = path.join(expand(a.skills.dir), it.name)
          const src = path.join(this.paths.skills, it.name)
          txn.touch(dst)
          if (it.op === 'unlink') { const ls = lstat(dst); if (ls && ls.isSymbolicLink()) fs.unlinkSync(dst); delete st.baseline.skills[a.id + '/' + it.name] }
          else if (it.op === 'link' || it.op === 'relink') { remove(dst); linkSkill(fs.realpathSync(src), dst) }
          else { copySkill(src, dst); const f = fileHashes(dst); st.baseline.skills[a.id + '/' + it.name] = { hub: dirHash(fileHashes(src)), target: dirHash(f), files: f, time } }
          done.push(a.name + ' 技能：' + it.name + '（' + it.actions.join('/') + '）')
        } else if (it.kind === 'skill-writeback') {
          const a = byId(it.from)
          const src = path.join(expand(a.skills.dir), it.name); const dst = fs.realpathSync(path.join(this.paths.skills, it.name))
          txn.touch(dst); copySkill(src, dst)
          const f = fileHashes(dst); st.baseline.skills[a.id + '/' + it.name] = { hub: dirHash(f), target: dirHash(f), files: f, time }
          done.push('回写 Hub 技能：' + it.object)
        }
      }
    } catch (e) {
      restore(txn.files)
      this.record(st, { time, summary: '同步失败，已自动还原：' + e.message, ok: false, files: [] })
      throw e
    }
    st.lastSync = time
    this.record(st, { time, summary: done.join('；') || '无改动', ok: true, files: txn.files })
    this._plan = null
    return { done }
  }

  record(st, r) {
    st.records = st.records || []
    st.records.push({ id: stamp() + '-' + st.records.length, ...r, files: (r.files || []).map((f) => ({ ...f, path: f.path })) })
    this.saveState(st)
  }

  rollback({ id }) {
    const st = this.state()
    const r = (st.records || []).find((x) => x.id === id)
    if (!r) throw new Error('找不到记录')
    if (!r.files?.length) throw new Error('该记录没有可回滚的文件')
    if (r.rolledBack) throw new Error('该记录已经回滚过')
    const txn = new Txn(path.join(this.paths.backups, stamp() + '-rollback'))
    for (const f of r.files) txn.touch(f.path)
    restore(r.files)
    r.rolledBack = true
    this.record(st, { time: new Date().toISOString(), summary: '回滚：' + r.summary, ok: true, files: txn.files })
    return { ok: true }
  }

  // ───────── 冲突处理 ─────────
  async resolve({ kind, name, agent: agentId, pick }) {
    const a = this.agents().find((x) => x.id === agentId)
    const st = this.state(); const time = new Date().toISOString()
    const txn = new Txn(path.join(this.paths.backups, stamp() + '-resolve'))
    try {
      if (kind === 'mcp') {
        const hub = readHub(this.paths); const secrets = readSecrets(this.paths)
        const srv = hub.servers[name]; const cur = this.readAgentMcp(a).entries[name]
        const merged = this.mergeView(expectedView(srv, a, secrets), cur?.view, pick)
        txn.touch(this.paths.mcp); txn.touch(this.paths.secrets)
        if (Object.values(pick || {}).includes('target')) this.writebackMcp(name, a, merged, st, time)
        if (a.role === 'sync') {
          txn.touch(a.mcp.file)
          await adapterFor(a).write(a, a.mcp.file, [{ name, view: merged }], this.editor)
          const after = this.readAgentMcp(a).entries[name]
          st.baseline.mcp[a.id + '/' + name] = publicView(after.view); (st.baselineTime ||= {})[a.id + '/' + name] = time
        }
      } else {
        const useTarget = Object.values(pick || {}).filter((x) => x === 'target').length > Object.values(pick || {}).filter((x) => x === 'hub').length
        const hubDir = fs.realpathSync(path.join(this.paths.skills, name)); const tgt = path.join(expand(a.skills.dir), name)
        if (useTarget) { txn.touch(hubDir); copySkill(tgt, hubDir) } else { txn.touch(tgt); copySkill(hubDir, tgt) }
        const f = fileHashes(tgt); st.baseline.skills[a.id + '/' + name] = { hub: dirHash(fileHashes(hubDir)), target: dirHash(f), files: f, time }
      }
    } catch (e) { restore(txn.files); throw e }
    this.record(st, { time, summary: `解决差异：${name}（Hub ⇄ ${a.name}）`, ok: true, files: txn.files })
    return { ok: true }
  }

  writebackMcp(name, a, mergedView, st, time) {
    const hub = readHub(this.paths); const secrets = readSecrets(this.paths)
    const srv = hub.servers[name]
    const cur = mergedView || this.readAgentMcp(a).entries[name]?.view
    if (!cur) throw new Error(a.name + ' 中没有 ' + name)
    const next = serverFromMerged(srv, cur, a, name)
    if (cur.auth === 'bearer' && cur._authValue && secrets[next.auth.secret] !== cur._authValue) { secrets[next.auth.secret] = cur._authValue; writeSecrets(this.paths, secrets) }
    hub.servers[name] = next
    writeHub(this.paths, hub)
    st.baseline.mcp[a.id + '/' + name] = publicView(this.readAgentMcp(a).entries[name]?.view || cur); (st.baselineTime ||= {})[a.id + '/' + name] = time
  }

  ignore({ kind, name, agent }) {
    const st = this.state(); st.ignore = [...new Set([...(st.ignore || []), (kind === 'mcp' ? 'mcp:' : 'skill:') + agent + ':' + name])]; this.saveState(st); return { ok: true }
  }

  // ───────── 首次导入 ─────────
  importPreview() {
    const agents = this.agents().filter((a) => a.mcp && a.enabled !== false)
    const hub = readHub(this.paths)
    const found = {}
    for (const a of agents) for (const [n, e] of Object.entries(this.readAgentMcp(a).entries)) (found[n] ||= []).push({ a, e })
    const servers = Object.entries(found).filter(([n]) => !hub.servers[n]).map(([n, list]) => {
      const excluded = list.every(({ a }) => (a.mcp.exclude || []).includes(n))
      const withAuth = list.find(({ e }) => e.view.auth === 'bearer')
      const sync = list.filter(({ a }) => a.role === 'sync')
      const suggest = excluded ? 'skip' : (withAuth || sync[0] || list[0]).a.id
      const urls = new Set(list.map(({ e }) => String(e.view.url || e.view.command)))
      const auths = list.map(({ a, e }) => a.name + '：' + (e.view.auth === 'bearer' ? '请求头 ' + e.view.authFp : e.view.auth === 'env' ? '环境变量' : e.view.transport === 'stdio' ? '本地命令' : 'OAuth')).join('；')
      const diffs = []
      if (urls.size > 1) diffs.push('地址不同：' + [...urls].join(' / '))
      if (new Set(list.map(({ e }) => e.view.auth)).size > 1) diffs.push(auths)
      return { name: n, endpoint: String(list[0].e.view.url || [list[0].e.view.command, ...(list[0].e.view.args || [])].join(' ')).replace(/^https?:\/\//, ''), found: list.map(({ a }) => a.id), suggest, diff: diffs.join('；'), excluded }
    })
    return { servers }
  }

  importMcp({ sources }) {
    const agents = this.agents()
    const hub = readHub(this.paths); const secrets = readSecrets(this.paths)
    const st = this.state(); const time = new Date().toISOString()
    const txn = new Txn(path.join(this.paths.backups, stamp() + '-import'))
    txn.touch(this.paths.mcp); txn.touch(this.paths.secrets)
    const imported = []
    for (const [n, aid] of Object.entries(sources || {})) {
      if (aid === 'skip' || hub.servers[n]) continue
      const a = agents.find((x) => x.id === aid); if (!a) continue
      const e = this.readAgentMcp(a).entries[n]; if (!e) continue
      const srv = serverFromView(publicView(e.view), n)
      if (e.view.auth === 'bearer') { secrets[n] = e.view._authValue; srv.auth = { prefer: 'oauth', secret: n } }
      // 鉴权：按各 Agent 现状记录 uses；若来源 Agent 只支持 bearer，则首选 oauth、该 Agent 用 bearer
      if (srv.transport !== 'stdio') {
        const uses = {}
        let anyOauth = false
        for (const b of agents) {
          if (!b.mcp || b.role !== 'sync') continue
          const be = this.readAgentMcp(b).entries[n]
          if (be && this.sameIdentity(srv, be.view)) { uses[b.id] = be.view.auth === 'oauth' ? 'oauth' : be.view.auth; if (be.view.auth === 'oauth') anyOauth = true }
        }
        srv.auth = { ...srv.auth, prefer: anyOauth ? 'oauth' : (e.view.auth === 'bearer' ? 'bearer' : srv.auth?.prefer || 'oauth'), uses }
        if (!srv.auth.secret) delete srv.auth.secret
      }
      hub.servers[n] = srv
      imported.push(n)
    }
    writeHub(this.paths, hub); writeSecrets(this.paths, secrets)
    // 导入后，与 Hub 期望一致的目标直接建立基线
    for (const a of agents) {
      if (!a.mcp || a.role !== 'sync' || a.enabled === false) continue
      const ents = this.readAgentMcp(a).entries
      for (const n of imported) {
        if (!ents[n]) continue
        const exp = expectedView(hub.servers[n], a, secrets)
        if (!exp.unsupported && viewEqual(exp, ents[n].view)) { st.baseline.mcp[a.id + '/' + n] = publicView(ents[n].view); (st.baselineTime ||= {})[a.id + '/' + n] = time }
      }
    }
    this.record(st, { time, summary: '从各 Agent 导入 MCP：' + (imported.join('、') || '无'), ok: true, files: txn.files })
    return { imported }
  }

  // ───────── Hub MCP 编辑 ─────────
  saveServer(body) {
    const hub = readHub(this.paths); const secrets = readSecrets(this.paths)
    const name = String(body.name || '').trim()
    if (!/^[A-Za-z0-9_.-]{1,48}$/.test(name)) throw new Error('名称只能包含字母、数字、- _ .')
    const prev = hub.servers[body.originalName || name] || {}
    const s = { ...prev }
    if (body.transport) s.transport = body.transport
    if (s.transport === 'stdio') { if (body.command != null) { const parts = String(body.command).trim().split(/\s+/); s.command = parts[0]; s.args = parts.slice(1) } delete s.url; delete s.headers }
    else if (body.url != null) { s.url = String(body.url).trim(); if (!/^https?:\/\//.test(s.url)) s.url = 'https://' + s.url; delete s.command; delete s.args }
    if (body.timeoutMs != null) { const t = Number(String(body.timeoutMs).replace(/[^0-9.]/g, '')); if (t) s.timeoutMs = t; else delete s.timeoutMs }
    if (body.auth) {
      s.auth = { ...(prev.auth || {}), prefer: body.auth.prefer, uses: Object.fromEntries(Object.entries(body.auth.uses || {}).filter(([, v]) => v && v !== 'unsupported')) }
      if (body.auth.secretValue) { const key = body.auth.secret || name; secrets[key] = String(body.auth.secretValue); s.auth.secret = key; writeSecrets(this.paths, secrets) }
      else if (body.auth.secret !== undefined) s.auth.secret = body.auth.secret || undefined
      if (body.auth.envVar !== undefined) s.auth.envVar = body.auth.envVar
    }
    if (body.targets) s.targets = body.targets
    if (body.originalName && body.originalName !== name) delete hub.servers[body.originalName]
    hub.servers[name] = s
    writeHub(this.paths, hub)
    return { ok: true }
  }
  removeServer({ name }) {
    const hub = readHub(this.paths)
    if (!hub.servers[name]) return { ok: true }
    const st = this.state()
    st.trash = st.trash || []
    st.trash.push({ id: stamp() + '-' + name, name, type: 'MCP', time: new Date().toISOString(), data: hub.servers[name] })
    delete hub.servers[name]
    writeHub(this.paths, hub); this.saveState(st)
    return { ok: true }
  }

  async toggleMcp({ agent, name, enabled, extra }) {
    const a = this.agents().find((x) => x.id === agent)
    let target = a
    if (extra) { const x = (a.mcp.extra || []).find((e) => e.path === extra); target = { ...a, mcp: { ...a.mcp, path: x.path, key: x.key, file: expand(x.path) } } }
    const txn = new Txn(path.join(this.paths.backups, stamp() + '-toggle'))
    txn.touch(target.mcp.file)
    await adapterFor(target).write(target, target.mcp.file, [{ name, enabled }], this.editor)
    const st = this.state(); this.record(st, { time: new Date().toISOString(), summary: `${enabled ? '启用' : '停用'} ${a.name} 的 ${name}`, ok: true, files: txn.files })
    return { ok: true }
  }

  copyMcpToHub({ agent, name, extra }) {
    const a = this.agents().find((x) => x.id === agent)
    let target = a
    if (extra) { const x = (a.mcp.extra || []).find((e) => e.path === extra); target = { ...a, mcp: { ...a.mcp, path: x.path, key: x.key, file: expand(x.path) } } }
    const e = this.readAgentMcp(target).entries[name]; if (!e) throw new Error('找不到 ' + name)
    const hub = readHub(this.paths); const secrets = readSecrets(this.paths)
    const hubName = name.replace(/^connector:/, '')
    if (hub.servers[hubName]) throw new Error('Hub 中已有同名 Server：' + hubName)
    const srv = serverFromView(publicView(e.view), hubName)
    if (e.view.auth === 'bearer') { secrets[hubName] = e.view._authValue; writeSecrets(this.paths, secrets) }
    hub.servers[hubName] = srv; writeHub(this.paths, hub)
    return { ok: true, name: hubName }
  }

  // ───────── 技能操作 ─────────
  skillDetail({ name }) {
    const p = path.join(this.paths.skills, name)
    const info = skillInfo(p)
    if (!info) throw new Error('找不到技能 ' + name)
    const diagnostics = []
    if (!/^[a-z0-9-]+$/.test(info.name)) diagnostics.push('frontmatter name 不是 kebab-case，DSH 可能无法加载')
    if (!info.description) diagnostics.push('缺少 description')
    return { body: info.body, diagnostics }
  }
  trashSkill({ name }) {
    const src = path.join(this.paths.skills, name)
    if (!exists(src)) throw new Error('找不到技能 ' + name)
    const st = this.state()
    const id = stamp() + '-' + name
    const dst = path.join(this.paths.trash, id)
    fs.mkdirSync(this.paths.trash, { recursive: true })
    fs.renameSync(src, dst)
    st.trash = st.trash || []
    st.trash.push({ id, name, type: '技能', time: new Date().toISOString(), path: dst })
    this.saveState(st)
    return { ok: true }
  }
  restoreTrash({ id }) {
    const st = this.state()
    const i = (st.trash || []).findIndex((t) => t.id === id)
    if (i < 0) throw new Error('回收站中没有该条目')
    const t = st.trash[i]
    if (t.type === 'MCP') { const hub = readHub(this.paths); if (hub.servers[t.name]) throw new Error('Hub 已有同名 Server'); hub.servers[t.name] = t.data; writeHub(this.paths, hub) }
    else { const dst = path.join(this.paths.skills, t.name); if (exists(dst)) throw new Error('已存在同名技能'); fs.renameSync(t.path, dst) }
    st.trash.splice(i, 1); this.saveState(st)
    return { ok: true }
  }
  copySkillToHub({ agent, name }) {
    const a = this.agents().find((x) => x.id === agent)
    const src = path.join(expand(a.skills.dir), name); const dst = path.join(this.paths.skills, name)
    if (exists(dst)) throw new Error('Hub 中已有同名技能：' + name)
    copyDir(src, dst)
    return { ok: true }
  }
  unlinkSkill({ agent, name }) {
    const a = this.agents().find((x) => x.id === agent)
    const p = path.join(expand(a.skills.dir), name); const ls = lstat(p)
    if (!ls || !ls.isSymbolicLink()) throw new Error('目标不是软链，不会删除')
    const txn = new Txn(path.join(this.paths.backups, stamp() + '-unlink')); txn.touch(p)
    fs.unlinkSync(p)
    const st = this.state(); this.record(st, { time: new Date().toISOString(), summary: `移除 ${a.name} 中 ${name} 的软链`, ok: true, files: txn.files })
    return { ok: true }
  }
  createSkill({ name, description, body }) {
    if (!/^[a-z0-9-]{1,64}$/.test(name || '')) throw new Error('技能名称需为 kebab-case（小写字母、数字、-）')
    const dst = path.join(this.paths.skills, name)
    if (exists(dst)) throw new Error('已存在同名技能')
    fs.mkdirSync(dst, { recursive: true })
    fs.writeFileSync(path.join(dst, 'SKILL.md'), `---\nname: ${name}\ndescription: ${String(description || '').replace(/\n/g, ' ')}\n---\n\n${body || '# ' + name + '\n'}`)
    return { ok: true }
  }
  importSkill({ dir }) {
    const src = expand(String(dir || '').trim())
    const info = skillInfo(src)
    if (!info) throw new Error('该目录下没有 SKILL.md')
    const dst = path.join(this.paths.skills, path.basename(src))
    if (exists(dst)) throw new Error('已存在同名技能：' + path.basename(src))
    copyDir(src, dst)
    return { ok: true }
  }

  // ───────── 来源目录 ─────────
  setSource(id, patch) {
    const s = this.sources()
    const i = s.agents.findIndex((a) => a.id === id)
    const cur = i >= 0 ? s.agents[i] : { id }
    const next = { ...cur, ...patch, skills: { ...(cur.skills || {}), ...(patch.skills || {}) }, mcp: { ...(cur.mcp || {}), ...(patch.mcp || {}) } }
    if (!Object.keys(next.skills).length) delete next.skills
    if (!Object.keys(next.mcp).length) delete next.mcp
    if (i >= 0) s.agents[i] = next; else s.agents.push(next)
    this.saveSources(s)
    return { ok: true }
  }
  addSource({ dir }) {
    const r = recognizeDir(dir)
    if (!r) throw new Error('无法识别该目录：没有找到 mcp.json / settings.json 或 skills 目录')
    const { recognizedBy, count, detect, ...rest } = r
    if (PRESETS.some((p) => p.id === r.id)) return this.setSource(r.id, { enabled: true })
    const s = this.sources()
    if (s.agents.some((a) => a.id === r.id)) throw new Error('已添加过：' + r.name)
    s.agents.push({ ...rest, enabled: true, role: 'sync' })
    this.saveSources(s)
    return { ok: true, recognized: r }
  }
  recognize({ dir }) {
    const r = recognizeDir(dir)
    if (!r) return { text: '无法识别：没有找到 mcp.json / settings.json 或 skills 目录' }
    const mcp = r.mcp ? `MCP 文件 ${r.mcp.path}（${r.mcp.format === 'json' ? 'JSON · ' + r.mcp.key : r.mcp.format}${r.count != null ? '，' + r.count + ' 个 Server' : ''}）` : '没有 MCP 文件'
    const sk = r.skills?.dir ? `技能目录 ${r.skills.dir}${exists(expand(r.skills.dir)) ? '' : '（不存在，同步时创建）'}` : ''
    return { text: `识别为 ${r.name}${PRESETS.some((p) => p.id === r.id) ? '（内置预设）' : ''}：${[mcp, sk].filter(Boolean).join('；')}` }
  }
}

// ───────── 辅助 ─────────
const AUTH_NOTES = {
  'codex:oauth': '首次使用时 Codex 弹出登录', 'codex:bearer': 'http_headers = { Authorization = … }', 'codex:env': 'bearer_token_env_var',
  'dsh:bearer': 'DSH mcp-client 只支持静态请求头，写入明文 Bearer',
  'claude:oauth': '/mcp 里登录，令牌由 Claude 自己保存', 'claude:bearer': 'headers.Authorization', 'claude:env': 'headers 中 ${VAR}（GUI 启动可能拿不到）',
  'tclaude:oauth': '/mcp 里登录，令牌由 tclaude 自己保存', 'tclaude:bearer': 'headers.Authorization',
  'codebuddy:bearer': 'headers.Authorization', 'cursor:oauth': 'Cursor 设置里登录', 'workbuddy:oauth': 'WorkBuddy 连接器里登录',
}
const splitKey = (k) => { const i = k.indexOf('/'); return [k.slice(0, i), k.slice(i + 1)] }
const fmtDiff = (l) => (l[0] === '+' ? '+ ' + l.slice(2) : l[0] === '-' ? '- ' + l.slice(2) : '  ' + l.slice(2))
function redactView(v) { const r = publicView(v); if (v.auth === 'bearer') r._authValue = 'Bearer ••••' + (v.authFp || ''); return r }

function serverFromMerged(srv, v, a, name) {
  const next = JSON.parse(JSON.stringify(srv))
  if (v.transport === 'stdio') { next.command = v.command; next.args = v.args; if (v.env && Object.keys(v.env).length) next.env = v.env; else delete next.env }
  else {
    next.url = v.url
    if (v.headers && Object.keys(v.headers).length) next.headers = v.headers; else delete next.headers
    next.auth = { prefer: 'oauth', ...(next.auth || {}), uses: { ...(next.auth?.uses || {}), [a.id]: v.auth } }
    if (v.auth === 'bearer') next.auth.secret = next.auth.secret || name
    if (v.auth === 'env') next.auth.envVar = v.authEnv
  }
  if (v.timeoutMs) next.timeoutMs = v.timeoutMs; else delete next.timeoutMs
  return next
}
