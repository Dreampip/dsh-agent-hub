// dsh-agent-hub · Host 插件：注册 /api/dsh-agent-hub/* 路由，供 Web 面板调用。
import { Hub } from './core.js'

export const name = 'dsh-agent-hub'
export const inject = { connection: { required: true }, configEditor: { required: false } }

const PREFIX = '/api/dsh-agent-hub'
const MARKER = 'x-dsh-agent-hub'

const ok = (data) => new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
const fail = (status, error) => new Response(JSON.stringify({ ok: false, error }), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })

export function apply(ctx, config = {}) {
  const hub = new Hub({ root: config.root || '~/.agents', editor: ctx.get('configEditor') || null, log: (...a) => ctx.logger?.info?.(...a) })

  const get = (path, fn) => ({ path: PREFIX + path, methods: ['GET'], fn })
  const post = (path, fn) => ({ path: PREFIX + path, methods: ['POST'], fn })
  const routes = [
    get('/state', () => hub.view()),
    get('/skills/detail', (_, url) => hub.skillDetail({ name: url.searchParams.get('name') })),
    post('/diff', (b) => hub.diff(b)),
    post('/plan', () => hub.plan()),
    post('/apply', (b) => hub.apply(b)),
    post('/resolve', (b) => hub.resolve(b)),
    post('/ignore', (b) => hub.ignore(b)),
    post('/records/rollback', (b) => hub.rollback(b)),
    post('/trash/restore', (b) => hub.restoreTrash(b)),
    post('/mcp/import-preview', () => hub.importPreview()),
    post('/mcp/import', (b) => hub.importMcp(b)),
    post('/mcp/save', (b) => hub.saveServer(b)),
    post('/mcp/remove', (b) => hub.removeServer(b)),
    post('/mcp/toggle', (b) => hub.toggleMcp(b)),
    post('/mcp/copy-to-hub', (b) => hub.copyMcpToHub(b)),
    post('/skills/trash', (b) => hub.trashSkill(b)),
    post('/skills/copy-to-hub', (b) => hub.copySkillToHub(b)),
    post('/skills/unlink', (b) => hub.unlinkSkill(b)),
    post('/skills/create', (b) => hub.createSkill(b)),
    post('/skills/import', (b) => hub.importSkill(b)),
    post('/sources/toggle', (b) => hub.setSource(b.id, { enabled: !!b.enabled })),
    post('/sources/role', (b) => hub.setSource(b.id, { role: b.role === 'manage' ? 'manage' : 'sync' })),
    post('/sources/path', (b) => hub.setSource(b.id, b.which === 'mcp' ? { mcp: { path: b.path } } : { skills: { dir: b.path } })),
    post('/agents/mode', (b) => hub.setSource(b.id, { skills: { mode: b.mode === 'copy' ? 'copy' : 'link' } })),
    post('/sources/add', (b) => hub.addSource(b)),
    post('/sources/recognize', (b) => hub.recognize(b)),
  ]

  ctx.effect(() => {
    const disposers = routes.map((r) => ctx.connection.fetch.register({
      path: r.path,
      methods: r.methods,
      requestBody: 'buffered',
      fetch: async (req) => {
        try {
          let body = {}
          if (r.methods[0] === 'POST') {
            if (req.headers.get(MARKER) !== '1') return fail(403, 'forbidden')
            const t = await req.text()
            body = t ? JSON.parse(t) : {}
          }
          return ok(await r.fn(body, new URL(req.url)))
        } catch (e) {
          ctx.logger?.warn?.('agent-hub', r.path, e?.message)
          return fail(e?.code === 'bad-json' ? 422 : 400, e?.message || String(e))
        }
      },
    }))
    return () => { for (const d of disposers) { try { d() } catch {} } }
  }, 'agent-hub: API routes')
}
