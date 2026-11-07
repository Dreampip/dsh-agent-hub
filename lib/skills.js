// 技能：扫描真源与各 Agent 目录、判定状态、执行软链/复制/删除软链。
import fs from 'node:fs'
import path from 'node:path'
import { lstat, stat, exists, readText, fileHashes, dirHash, copyDir, remove } from './util.js'
import { expand, tilde } from './agents.js'

export function frontmatter(text) {
  const m = /^---\s*\n([\s\S]*?)\n---/.exec(text || '')
  if (!m) return {}
  const out = {}; const lines = m[1].split('\n')
  for (let i = 0; i < lines.length; i++) {
    const r = /^([A-Za-z_-]+):\s*(.*)$/.exec(lines[i]); if (!r) continue
    let v = r[2].trim()
    if (v === '>' || v === '|' || v === '>-' || v === '|-') { const buf = []; while (i + 1 < lines.length && /^\s+/.test(lines[i + 1])) buf.push(lines[++i].trim()); v = buf.join(' ') }
    out[r[1]] = v.replace(/^["']|["']$/g, '')
  }
  return out
}
export function skillInfo(dir) {
  const md = path.join(dir, 'SKILL.md')
  const text = readText(md)
  if (text == null) return null
  const fm = frontmatter(text)
  return { name: fm.name || path.basename(dir), description: fm.description || '', body: text }
}

/** 列出目录下的技能条目（含软链/死链/无 SKILL.md 的目录） */
export function listDir(dir, opts = {}) {
  const d = expand(dir)
  const out = []
  let names = []
  try { names = fs.readdirSync(d) } catch { return out }
  for (const n of names.sort()) {
    if (n === '.DS_Store' || n.endsWith('.json')) continue
    const p = path.join(d, n)
    const ls = lstat(p)
    if (!ls) continue
    if (n.startsWith('.')) {
      if (opts.ownSubdirs && opts.ownSubdirs.includes(n) && stat(p)?.isDirectory()) for (const x of listDir(p)) out.push({ ...x, builtin: true, sub: n })
      continue
    }
    const isLink = ls.isSymbolicLink()
    const target = isLink ? fs.readlinkSync(p) : null
    const st = stat(p)
    if (!st) { out.push({ dir: n, path: p, link: target, broken: true }); continue }
    if (!st.isDirectory()) continue
    const info = skillInfo(p)
    out.push({ dir: n, path: p, link: target, realPath: isLink ? fs.realpathSync(p) : p, name: info?.name || n, description: info?.description || '', hasSkill: !!info })
  }
  return out
}

/**
 * 某 Agent 中某技能的状态（相对 Hub）：
 *   native / ok / missing / differs / hub-changed / target-changed / conflict / broken / blocked
 * baseline：上次同步时记录的 { hub: hash, target: hash }
 */
export function skillStatus(agent, hubSkill, entry, baseline) {
  const mode = agent.skills.mode
  if (mode === 'native') return { state: 'native' }
  if (!entry) return { state: 'missing' }
  if (entry.broken) return { state: entry.link && isUnder(resolveLink(entry), hubSkill.path) ? 'broken' : 'broken' }
  if (entry.link) {
    const real = entry.realPath
    if (real === fs.realpathSync(hubSkill.path)) return { state: 'ok', kind: 'hub-link' }
    return { state: 'blocked', reason: '指向别处的软链' }
  }
  // 真实目录
  const tFiles = fileHashes(entry.path); const tHash = dirHash(tFiles)
  const hHash = hubSkill.hash
  if (tHash === hHash) return { state: 'ok', kind: 'hub-copy', hash: tHash }
  if (!baseline) return { state: mode === 'copy' ? 'differs' : 'blocked', kind: mode === 'copy' ? 'hub-copy' : 'own', hash: tHash, reason: mode === 'copy' ? '' : '同名真实目录' }
  const hubChanged = hHash !== baseline.hub; const tgtChanged = tHash !== baseline.target
  const state = hubChanged && tgtChanged ? 'conflict' : hubChanged ? 'hub-changed' : tgtChanged ? 'target-changed' : 'ok'
  return { state, kind: 'hub-copy', hash: tHash }
}
const resolveLink = (e) => path.resolve(path.dirname(e.path), e.link)
const isUnder = (p, root) => p === root || p.startsWith(root + path.sep)

/** 技能内文件级三方对比（复制模式） */
export function skillFileDiff(hubPath, targetPath, baseFiles) {
  const H = fileHashes(hubPath); const T = fileHashes(targetPath); const B = baseFiles || null
  const names = [...new Set([...Object.keys(H), ...Object.keys(T), ...Object.keys(B || {})])].sort()
  return names.map((f) => {
    const h = H[f] ?? null; const t = T[f] ?? null; const b = B ? B[f] ?? null : undefined
    let verdict
    if (h === t) verdict = B && b !== h ? 'eq' : 'same'
    else if (!B) verdict = 'diff'
    else if (h === b) verdict = 'target'
    else if (t === b) verdict = 'hub'
    else verdict = 'both'
    return { field: f, base: B ? (b ? b.slice(0, 7) : '—') : undefined, hub: h ? h.slice(0, 7) : '—', target: t ? t.slice(0, 7) : '—', verdict, default: verdict === 'target' ? 'target' : 'hub' }
  })
}

export function linkSkill(hubPath, dst) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.symlinkSync(hubPath, dst) }
export function copySkill(hubPath, dst) { remove(dst); copyDir(hubPath, dst) }
export { remove as removePath, exists, tilde }
