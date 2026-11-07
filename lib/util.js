import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')
/** 密钥指纹：sha256 前 6 位，只用于对比与展示，不可逆 */
export const fingerprint = (s) => (s ? '#' + sha(String(s)).slice(0, 6) : '')
export const mask = (s) => (s ? '••••' + fingerprint(s) : '')

export function lstat(p) { try { return fs.lstatSync(p) } catch { return null } }
export function stat(p) { try { return fs.statSync(p) } catch { return null } }
export const exists = (p) => !!lstat(p)

export function readText(p, fallback = null) { try { return fs.readFileSync(p, 'utf8') } catch { return fallback } }
export function readJson(p, fallback = null) {
  const t = readText(p)
  if (t == null) return fallback
  try { return JSON.parse(t) } catch (e) { const err = new Error(`无法解析 JSON：${p}（${e.message}）`); err.code = 'bad-json'; throw err }
}

/** 原子写：写临时文件再 rename；目标是软链时写到真实文件；保留原文件权限 */
export function writeFileAtomic(p, data, mode) {
  let real = p
  try { real = fs.realpathSync(p) } catch {}
  fs.mkdirSync(path.dirname(real), { recursive: true })
  const st = stat(real)
  const m = mode ?? (st ? st.mode & 0o777 : undefined)
  const tmp = `${real}.agent-hub-${process.pid}-${Date.now()}.tmp`
  fs.writeFileSync(tmp, data, m != null ? { mode: m } : undefined)
  if (m != null) fs.chmodSync(tmp, m)
  fs.renameSync(tmp, real)
}
export const writeJson = (p, obj, mode) => writeFileAtomic(p, JSON.stringify(obj, null, 2) + '\n', mode)

const SKIP = new Set(['.DS_Store', '.git', 'node_modules', '__pycache__'])
/** 目录内文件 → 内容哈希（相对路径，按字典序） */
export function fileHashes(dir) {
  const out = {}
  const walk = (d, rel) => {
    let names = []
    try { names = fs.readdirSync(d).sort() } catch { return }
    for (const n of names) {
      if (SKIP.has(n)) continue
      const p = path.join(d, n)
      const st = stat(p)
      if (!st) continue
      const r = rel ? rel + '/' + n : n
      if (st.isDirectory()) walk(p, r)
      else if (st.isFile()) out[r] = sha(fs.readFileSync(p)).slice(0, 16)
    }
  }
  walk(dir, '')
  return out
}
export const dirHash = (files) => sha(Object.entries(files).map(([k, v]) => k + ':' + v).join('\n')).slice(0, 16)

export function copyDir(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  fs.cpSync(src, dst, { recursive: true, dereference: true, filter: (s) => !SKIP.has(path.basename(s)) })
}
export function remove(p) { const st = lstat(p); if (!st) return; if (st.isSymbolicLink() || st.isFile()) fs.unlinkSync(p); else fs.rmSync(p, { recursive: true, force: true }) }

export function stamp(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`
}
export function shortTime(iso) {
  const d = new Date(iso); const z = (n) => String(n).padStart(2, '0')
  return `${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`
}

/** 写入事务：每个路径第一次被修改前完整备份；失败或用户回滚时按逆序恢复 */
export class Txn {
  constructor(dir) { this.dir = dir; this.files = []; this.seen = new Set() }
  touch(p) {
    if (this.seen.has(p)) return
    this.seen.add(p)
    const st = lstat(p)
    const e = { path: p, existed: !!st, kind: st ? (st.isSymbolicLink() ? 'link' : st.isDirectory() ? 'dir' : 'file') : null }
    if (st) {
      if (e.kind === 'link') e.link = fs.readlinkSync(p)
      else {
        const dst = path.join(this.dir, String(this.files.length) + '-' + path.basename(p))
        fs.mkdirSync(this.dir, { recursive: true })
        fs.cpSync(p, dst, { recursive: true })
        e.backup = dst
      }
    }
    this.files.push(e)
  }
}
export function restore(files) {
  for (const f of [...files].reverse()) {
    remove(f.path)
    if (!f.existed) continue
    fs.mkdirSync(path.dirname(f.path), { recursive: true })
    if (f.kind === 'link') fs.symlinkSync(f.link, f.path)
    else fs.cpSync(f.backup, f.path, { recursive: true })
  }
}

/** 简易逐行差异：返回带 '+ ' / '- ' / '  ' 前缀的行 */
export function lineDiff(a, b) {
  const A = a.split('\n'); const B = b.split('\n')
  const n = A.length; const m = B.length
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out = []; let i = 0; let j = 0
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push('  ' + A[i]); i++; j++ } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push('- ' + A[i++]); else out.push('+ ' + B[j++])
  }
  while (i < n) out.push('- ' + A[i++])
  while (j < m) out.push('+ ' + B[j++])
  return out
}

export const deepEqual = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b))
export function canon(v) {
  if (Array.isArray(v)) return v.map(canon)
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]))
  return v
}
