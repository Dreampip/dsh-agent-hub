// 设计稿数据：来自 2026-11-07 对本机的真实扫描（名称、路径、数量、MCP 定义均为真实值；密钥仅以引用表示）。
// 标注 [示例] 的条目为演示某种状态而假设的变化，其余均为当前真实状态。
window.FIXTURE = (() => {
  const agents = [
    { id: 'codex', name: 'Codex', short: 'Cx', color: '#10a37f', role: 'sync', preset: true, auth: ['oauth', 'bearer', 'env'],
      skills: { dir: '~/.codex/skills', mode: 'native' }, mcp: { format: 'codex-toml', path: '~/.codex/config.toml', exclude: ['node_repl', 'cua_repl', 'codex_app'] } },
    { id: 'dsh', name: 'DSH', short: 'D', color: '#4d6bfe', role: 'sync', preset: true, auth: ['bearer'],
      skills: { dir: '~/.dsh/skills', mode: 'native' }, mcp: { format: 'dsh-patch', path: '~/.dsh/profiles/desktop/cordis.patch.yml' } },
    { id: 'claude', name: 'Claude Code', short: 'C', color: '#c96442', role: 'sync', preset: true, auth: ['oauth', 'bearer', 'env'],
      skills: { dir: '~/.claude/skills', mode: 'link' }, mcp: { format: 'json', path: '~/.claude.json', key: 'mcpServers', dialect: 'claude' } },
    { id: 'tclaude', name: 'TClaude', short: 'T', color: '#d97757', role: 'sync', preset: true, auth: ['oauth', 'bearer', 'env'],
      skills: { dir: '~/.tclaude/skills', mode: 'link' }, mcp: { format: 'json', path: '~/.tclaude/.claude.json', key: 'mcpServers', dialect: 'claude' } },
    { id: 'workbuddy', verified: false, name: 'WorkBuddy', short: 'W', color: '#7c3aed', role: 'sync', sync: { skills: false, mcp: false }, preset: true, auth: ['oauth', 'bearer'],
      skills: { dir: '~/.workbuddy/skills', mode: 'link' }, mcp: { format: 'json', path: '~/.workbuddy/mcp.json', key: 'mcpServers', dialect: 'workbuddy' } },
  ]
  // 自动检测到但未启用（真实存在于本机）
  agents.push(
    { id: 'codebuddy', verified: false, sync: { skills: false, mcp: false }, name: 'CodeBuddy', short: 'CB', color: '#0052d9', role: 'sync', auth: ['oauth', 'bearer'],
      skills: { dir: '~/.codebuddy/skills', mode: 'link' }, mcp: { format: 'json', path: '~/.codebuddy/mcp.json', key: 'mcpServers', dialect: 'claude' } },
    { id: 'cursor', verified: false, sync: { skills: false, mcp: false }, name: 'Cursor', short: 'Cu', color: '#1f2328', role: 'sync', auth: ['oauth', 'bearer', 'env'],
      skills: { dir: '~/.cursor/skills', mode: 'link' }, mcp: { format: 'json', path: '~/.cursor/mcp.json', key: 'mcpServers', dialect: 'cursor' } },
    { id: 'claude-desktop', verified: false, sync: { skills: false, mcp: false }, name: 'Claude Desktop', short: 'CD', color: '#b4793f', role: 'sync', auth: ['none'],
      skills: { mode: 'none' }, mcp: { format: 'json', path: '~/Library/Application Support/Claude/claude_desktop_config.json', key: 'mcpServers', dialect: 'claude-desktop' } },
    { id: 'opencode', verified: false, sync: { skills: false, mcp: false }, name: 'OpenCode', short: 'O', color: '#525866', role: 'sync', auth: ['oauth', 'bearer', 'env'],
      skills: { dir: '~/.config/opencode/skills', mode: 'link' }, mcp: { format: 'json', path: '~/.config/opencode/opencode.json', key: 'mcp', dialect: 'opencode' } },
  )
  const candidates = []
  const dialects = [
    { id: 'claude', label: 'Claude 风格' }, { id: 'cursor', label: 'Cursor 风格' }, { id: 'gemini', label: 'Gemini 风格' },
    { id: 'windsurf', label: 'Windsurf 风格' }, { id: 'opencode', label: 'OpenCode 风格' }, { id: 'claude-desktop', label: 'Claude Desktop（仅 stdio）' }, { id: 'workbuddy', label: 'WorkBuddy 风格' },
  ]
  const skillsHub = [
    { name: 'archify', description: 'Create validated architecture, workflow, sequence, data-flow, lifecycle/state, ERD … diagrams',
      source: 'github tt-a1i/archify', status: { codex: 'native', dsh: 'native', claude: 'ok', tclaude: 'ok' } },
    { name: 'kier-adp-work-knowledge-loop', description: 'Kier 的 ADP 私有化开发与知识沉淀工作流：分析代码与调用链、排查工单、周报、版本升级…',
      source: '本地', status: { codex: 'native', dsh: 'native', claude: 'ok', tclaude: 'ok' } },
  ]
  const skillsAgents = {
    codex: [
      { name: 'imagegen', kind: 'builtin', note: '.system · Generate or edit raster images' },
      { name: 'openai-docs', kind: 'builtin', note: '.system · Codex models/pricing, settings…' },
      { name: 'review-agent', kind: 'builtin', note: '.system · read-only defect-first review' },
      { name: 'skill-creator', kind: 'builtin', note: '.system · Create or update a Codex skill' },
      { name: 'skill-installer', kind: 'builtin', note: '.system · Install Codex skills' },
    ],
    dsh: [],
    claude: [
      { name: 'archify', kind: 'hub-link', note: '→ ~/.agents/skills/archify', state: 'ok' },
      { name: 'kier-adp-work-knowledge-loop', kind: 'hub-link', note: '→ ~/.agents/skills/kier-adp-work-knowledge-loop', state: 'ok' },
    ],
    tclaude: [
      { name: 'archify', kind: 'hub-link', note: '→ ~/.agents/skills/archify', state: 'ok' },
      { name: 'kier-adp-work-knowledge-loop', kind: 'hub-link', note: '→ ~/.agents/skills/kier-adp-work-knowledge-loop', state: 'ok' },
    ],
    codebuddy: [],
    cursor: [],
    opencode: [],
    workbuddy: [
      { name: 'josonyang-1772008589__knot', kind: 'own', note: 'iwiki-doc · 与腾讯 iWiki 文档交互的集成接口' },
      { name: 'shaowenyan-1775206377__knot', kind: 'own', note: 'gongfeng · 工蜂代码平台 MCP skill' },
      { name: 'tapd-openapi', kind: 'own', note: 'Query or update TAPD stories, bugs, tasks…' },
    ],
  }
  const http = (u) => u.replace(/^https?:\/\//, '')
  const mcpHub = [
    { name: 'tapd', transport: 'http', endpoint: http('https://mcpgw.knot.woa.com/tapd/'), url: 'https://mcpgw.knot.woa.com/tapd/', timeoutMs: 60000, auth: { prefer: 'oauth', secret: 'tapd', fingerprint: '#bbe542', uses: { codex: 'oauth', dsh: 'bearer', claude: 'oauth', tclaude: 'oauth' } }, status: { codex: 'ok', dsh: 'ok', claude: 'ok', tclaude: 'ok' } },
    { name: 'iwiki', transport: 'http', endpoint: http('https://prod.mcp.it.woa.com/app_iwiki_mcp/mcp3'), url: 'https://prod.mcp.it.woa.com/app_iwiki_mcp/mcp3', timeoutMs: 60000, auth: { prefer: 'oauth', secret: 'tai-pat', fingerprint: '#a97e81', uses: { codex: 'oauth', dsh: 'bearer', claude: 'oauth', tclaude: 'oauth' } }, status: { codex: 'ok', dsh: 'ok', claude: 'ok', tclaude: 'ok' } },
    { name: 'gongfeng', transport: 'http', endpoint: http('https://mcpgw.knot.woa.com/gongfeng'), url: 'https://mcpgw.knot.woa.com/gongfeng', timeoutMs: 60000, auth: { prefer: 'oauth', secret: 'tai-pat', fingerprint: '#a97e81', uses: { codex: 'oauth', dsh: 'bearer', claude: 'oauth', tclaude: 'oauth' } }, status: { codex: 'ok', dsh: 'ok', claude: 'ok', tclaude: 'ok' } },
    { name: 'kier-adp-kb', transport: 'http', endpoint: '127.0.0.1:27123/mcp/', url: 'http://127.0.0.1:27123/mcp/', timeoutMs: 60000, auth: { prefer: 'bearer', secret: 'kier-adp-kb', fingerprint: '#4850c7', uses: { codex: 'bearer', dsh: 'bearer', claude: 'bearer', tclaude: 'bearer' } }, status: { codex: 'target-changed', dsh: 'ok', claude: 'ok', tclaude: 'ok' } },
    { name: 'url_fetch', transport: 'stdio', auth: { prefer: 'none' }, endpoint: 'uvx mcp-server-fetch', status: { codex: 'missing', dsh: 'missing', claude: 'ok', tclaude: 'ok' } },
    { name: 'codegraph', transport: 'stdio', auth: { prefer: 'none' }, endpoint: 'codegraph serve --mcp', status: { codex: 'missing', dsh: 'missing', claude: 'ok', tclaude: 'ok' } },
  ]
  const m = (name, transport, endpoint, kind, state, note) => ({ name, transport, endpoint, kind, state, note })
  const mcpAgents = {
    codex: [
      m('tapd', 'http', 'mcpgw.knot.woa.com/tapd/', 'managed', 'ok', 'OAuth'),
      m('iwiki', 'http', 'prod.mcp.it.woa.com/app_iwiki_mcp/mcp3', 'managed', 'ok', 'OAuth'),
      m('gongfeng', 'http', 'mcpgw.knot.woa.com/gongfeng', 'managed', 'ok', 'OAuth'),
      m('kier-adp-kb', 'http', '127.0.0.1:27123/mcp/', 'managed', 'target-changed', '[示例] 在 Codex 里改了 timeout'),
      m('node_repl', 'stdio', '/Applications/ChatGPT.app/…/node_repl', 'excluded', null, 'Codex 内置，永不托管'),
    ],
    dsh: [
      m('tapd', 'http', 'mcpgw.knot.woa.com/tapd/', 'managed', 'ok', '🔑 tapd'),
      m('iwiki', 'http', 'prod.mcp.it.woa.com/app_iwiki_mcp/mcp3', 'managed', 'ok', '🔑 iwiki'),
      m('gongfeng', 'http', 'mcpgw.knot.woa.com/gongfeng', 'managed', 'ok', '🔑 gongfeng'),
      m('kier-adp-kb', 'http', '127.0.0.1:27123/mcp/', 'managed', 'ok', '🔑 kier-adp-kb'),
    ],
    claude: ['url_fetch|stdio|uvx mcp-server-fetch', 'codegraph|stdio|codegraph serve --mcp', 'tapd|http|mcpgw.knot.woa.com/tapd/', 'gongfeng|http|mcpgw.knot.woa.com/gongfeng', 'iwiki|http|prod.mcp.it.woa.com/app_iwiki_mcp/mcp3', 'kier-adp-kb|http|127.0.0.1:27123/mcp/']
      .map((s) => { const [n, tr, e] = s.split('|'); return m(n, tr, e, 'managed', 'ok') }),
    tclaude: ['url_fetch|stdio|uvx mcp-server-fetch', 'codegraph|stdio|codegraph serve --mcp', 'gongfeng|http|mcpgw.knot.woa.com/gongfeng', 'iwiki|http|prod.mcp.it.woa.com/app_iwiki_mcp/mcp3', 'tapd|http|mcpgw.knot.woa.com/tapd/', 'kier-adp-kb|http|127.0.0.1:27123/mcp/']
      .map((s) => { const [n, tr, e] = s.split('|'); return m(n, tr, e, 'managed', 'ok') }),
    workbuddy: [],
    codebuddy: ['tRPC-MCP-Server|sse|trpc-mcp-server.woa.com/sse', 'iWiki|sse|prod.mcp.it.woa.com/app_iwiki_mcp/mcp3', 'tapd_mcp_http|http|mcpgw.knot.woa.com/tapd/', 'gongfeng|http|mcpgw.knot.woa.com/gongfeng', 'url_fetch|stdio|uvx mcp-server-fetch', 'tencent-docs|http|docs.qq.com/openapi/mcp', 'codegraph|stdio|codegraph serve --mcp', 'zhiyan-cicd-mcp|http|mcpgw.knot.woa.com/zhiyan/delivery', 'coding-mcp|http|mcpgw.knot.woa.com/zhiyan/qci']
      .map((x) => { const [n, tr, e] = x.split('|'); return m(n, tr, e, 'own') }),
    cursor: [],
    opencode: [],
    'claude-desktop': [m('dbx-mcp-server', 'stdio', 'node ~/WebstormProjects/dbx-mcp-server/build/src/index.js', 'own')],
  }
  const connectors = [
    ['connector:linear-mcp', 'http', 'mcp.linear.app/mcp'], ['connector:canva-ai', 'streamableHttp', 'mcp.canva.com/mcp'],
    ['connector:tdx-connector', 'streamable-http', 'txmcp.tdx.com.cn:3001/txmcp'], ['connector:westock-mcp', 'streamableHttp', 'stockbuddy.qq.com/…/mcp'],
  ].map(([n, tr, e]) => ({ ...m(n, tr, e, 'own'), enabled: false }))
  const mcpExtra = { workbuddy: { label: 'Connectors', path: '~/.workbuddy/connectors/default/mcp.json', total: 102, enabledCount: 0, items: connectors } }

  const state = {
    version: '0.3.0',
    hub: { skillsDir: '~/.agents/skills', mcpPath: '~/.agents/mcp.json' },
    agents, candidates, dialects,
    authNotes: {
      'codex:oauth': '首次使用时 Codex 弹出登录', 'codex:bearer': 'http_headers = { Authorization = … }',
      'dsh:bearer': 'DSH mcp-client 只支持静态请求头，写入明文 Bearer',
      'claude:oauth': '/mcp 里登录，令牌由 Claude 自己保存', 'claude:bearer': 'headers.Authorization',
      'tclaude:oauth': '/mcp 里登录，令牌由 TClaude 自己保存', 'tclaude:bearer': 'headers.Authorization',
      'codebuddy:bearer': 'headers.Authorization', 'cursor:oauth': 'Cursor 设置里登录',
    },
    recognize: { '~/.codebuddy': '识别为 CodeBuddy（内置预设，已在上方列表）：MCP 文件 ~/.codebuddy/mcp.json（JSON · mcpServers · Claude 风格，9 个 Server）；技能目录 ~/.codebuddy/skills（不存在，同步时创建）。点「添加目录」等同于打开它的开关。' },
    counts: { skills: 0, mcp: 5, pending: 5 },
    skills: { hub: skillsHub, agents: skillsAgents },
    mcp: { hub: mcpHub, agents: mcpAgents, extra: mcpExtra },
    records: [],
    trash: [],
    settings: { root: '~/.agents', defaultMode: 'link', readOnly: false, autoEnable: true },
  }

  const routes = {
    '/state': () => state,
    '/skills/detail': () => ({ diagnostics: [], body: '---\nname: kier-adp-work-knowledge-loop\ndescription: Kier 的 ADP 私有化开发与知识沉淀工作流。用于：分析代码与调用链、改代码；按日志或截图排查工单；…\n---\n\n# Kier 的 ADP 开发与排查工作流\n\n本文件只放所有任务共用的规则、路径约定和分册路由。具体做法在子目录分册里，按本次任务读对应那一份…\n\n## 路径约定\n\n| 变量 | 取值 | 含义 |\n|---|---|---|\n| `<工作区根>` | 取 Kier 本次提示词里给的路径 | 本次任务对应版本的代码工作区根 |' }),
    '/diff': () => ({
      state: 'target-changed', baseTime: '11-07 18:20', targetPath: '~/.codex/config.toml',
      fields: [
        { field: 'transport', base: 'http', hub: 'http', target: 'http（由 url 推断）', verdict: 'same' },
        { field: 'url', base: '…27123/mcp/', hub: '…27123/mcp/', target: '…27123/mcp/', verdict: 'same' },
        { field: 'timeout', base: '60000 ms', hub: '60000 ms', target: 'tool_timeout_sec = 120', verdict: 'target', default: 'target' },
        { field: 'headers.Authorization', base: 'Bearer ••••f39f', hub: 'Bearer ••••f39f', target: 'Bearer ••••f39f', verdict: 'same' },
      ],
      targetPatch: ['  [mcp_servers.kier-adp-kb]', '  url = "http://127.0.0.1:27123/mcp/"', '  tool_timeout_sec = 120', '  http_headers = { Authorization = "Bearer ••••f39f" }', '', '  [desktop]   # 其余内容保持原样'],
      hubPatch: ['  "kier-adp-kb": {', '    "transport": "http",', '    "url": "http://127.0.0.1:27123/mcp/",', '-   "timeoutMs": 60000,', '+   "timeoutMs": 120000,', '    "headers": { "Authorization": "Bearer ${secret:kier-adp-kb}" }', '  }'],
    }),
    '/plan': () => ({
      id: 'p1', skippedConflicts: [], reload: ['DSH（重载插件）', 'Codex（新会话）'],
      items: [
        { id: 1, agent: 'codex', target: '~/.codex/config.toml', actions: ['add'], object: 'url_fetch、codegraph（追加 [mcp_servers.*] 段，其余内容不动）' },
        { id: 2, agent: 'dsh', target: '~/.dsh/profiles/desktop/cordis.patch.yml', actions: ['add'], object: 'url_fetch、codegraph（写入 agent-hub 托管块）' },
        { id: 3, agent: 'hub', target: '~/.agents/mcp.json', actions: ['writeback'], object: 'kier-adp-kb.timeoutMs ← Codex（[示例]）' },
        { id: 4, agent: 'workbuddy', target: '~/.workbuddy/…', actions: ['skip'], object: '仅管理，不同步' },
      ],
    }),
    '/mcp/import-preview': () => {
      const oa = { auth: 'oauth' }; const kb = { auth: 'bearer', fp: '#c56a06' }; const cmd = { auth: 'none' }
      const tri = (fp) => ({ codex: oa, dsh: { auth: 'bearer', fp }, claude: oa, tclaude: oa })
      const res = '首选 OAuth；DSH 记为请求头（密钥取自 DSH）'
      return { servers: [
        { name: 'tapd', endpoint: 'mcpgw.knot.woa.com/tapd/', defs: tri('#9c264d'), sameDefinition: true, suggest: 'dsh', result: res },
        { name: 'iwiki', endpoint: 'prod.mcp.it.woa.com/app_iwiki_mcp/mcp3', defs: tri('#081dc6'), sameDefinition: true, suggest: 'dsh', result: res },
        { name: 'gongfeng', endpoint: 'mcpgw.knot.woa.com/gongfeng', defs: tri('#081dc6'), sameDefinition: true, suggest: 'dsh', result: res },
        { name: 'kier-adp-kb', endpoint: '127.0.0.1:27123/mcp/', defs: { codex: kb, dsh: kb, claude: kb, tclaude: kb }, sameDefinition: true, suggest: 'codex', result: '首选请求头（4 个 Agent 密钥相同）' },
        { name: 'url_fetch', endpoint: 'uvx mcp-server-fetch', defs: { claude: cmd, tclaude: cmd }, sameDefinition: true, suggest: 'claude', result: '本地命令' },
        { name: 'codegraph', endpoint: 'codegraph serve --mcp', defs: { claude: cmd, tclaude: cmd }, sameDefinition: true, suggest: 'claude', result: '本地命令' },
        { name: 'node_repl', endpoint: '/Applications/ChatGPT.app/…/node_repl', defs: { codex: cmd }, excluded: true, note: 'Codex 内置，永不托管' },
      ] }
    },
    '/mcp/explain': () => ({
      hub: ['"tapd": {', '  "transport": "http",', '  "url": "https://mcpgw.knot.woa.com/tapd/",', '  "timeoutMs": 60000,', '  "auth": {', '    "prefer": "oauth",', '    "secret": "tapd",', '    "uses": { "dsh": "bearer" }', '  }', '}'],
      targets: [
        { agent: 'codex', file: '~/.codex/config.toml', auth: 'oauth', lines: ['[mcp_servers.tapd]', 'url = "https://mcpgw.knot.woa.com/tapd/"', 'tool_timeout_sec = 60'], note: '不写请求头，首次使用时 Codex 弹出 OAuth 登录' },
        { agent: 'dsh', file: '~/.dsh/…/cordis.patch.yml', auth: 'bearer', lines: ['- id: agent-hub-mcp-tapd', "  name: '@deepseek-ai/dsh-mcp-client'", '  config:', '    serverName: tapd', '    transport: streamable-http', '    url: https://mcpgw.knot.woa.com/tapd/', '    toolCallTimeoutMs: 60000', '    headers:', '      Authorization: Bearer ••••#9c264d'], note: 'DSH 不支持 OAuth → 自动退为请求头，密钥从 secrets.json 解析' },
        { agent: 'claude', file: '~/.claude.json', auth: 'oauth', lines: ['"tapd": {', '  "type": "http",', '  "url": "https://mcpgw.knot.woa.com/tapd/"', '}'], note: '在 /mcp 里登录' },
        { agent: 'tclaude', file: '~/.tclaude/.claude.json', auth: 'oauth', lines: ['"tapd": {', '  "type": "http",', '  "url": "https://mcpgw.knot.woa.com/tapd/"', '}'], note: '同 Claude Code 格式' },
      ],
    }),
  }
  const qs0 = new URLSearchParams(location.search)
  if (qs0.get('readonly')) state.settings.readOnly = true
  if (qs0.get('fresh')) {
    state.mcp = { hub: [], agents: Object.fromEntries(Object.entries(mcpAgents).map(([k, v]) => [k, v.map((x) => ({ ...x, kind: x.kind === 'excluded' ? 'excluded' : 'own', state: null }))])), extra: mcpExtra }
    state.counts = { skills: 0, mcp: 0, pending: 0 }
    state.hub.mcpExists = false
  }
  return { routes }
})()
