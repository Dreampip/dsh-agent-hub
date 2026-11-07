/* dsh-agent-hub · Web 客户端
 * 本文件既是插件真实运行的界面，也是 design/ 里设计图的唯一渲染来源（设计图 = 这份代码 + 固定数据）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-agent-hub',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useMemo, useCallback, useRef } = React
    const NS = 'agent-hub'
    const API = 'api/dsh-agent-hub'

    // ───────────────────────── 文案 ─────────────────────────
    const ZH = {
      title: 'Agent Hub',
      desc: '以 ~/.agents 为真源，统一管理并同步各 Agent 的技能与 MCP。',
      'tab.skills': '技能', 'tab.mcp': 'MCP', 'tab.repos': '技能仓库', 'tab.records': '记录',
      'btn.sources': '来源目录…', 'btn.changeDir': '修改目录', 'btn.browse': '浏览…', 'btn.addDir': '添加目录', 'btn.recognize': '识别',
      'src.title': '来源目录', 'src.desc': '自动检测本机已安装的 Agent；打开开关即参与管理。路径可改，不移动任何文件。',
      'src.enabled': '已启用', 'src.detected': '已检测到 · 未启用', 'src.custom': '自定义', 'src.skillsDir': '技能目录', 'src.mcpFile': 'MCP 文件',
      'src.role': '角色', 'src.add': '添加目录', 'src.addHint': '选一个 Agent 的配置目录，自动识别技能目录和 MCP 文件格式；识别不了时再手动选格式。',
      'src.result': '识别结果', 'src.store': '保存在 ~/.agents/hub/sources.json', 'src.off': '未启用',
      'auth.title': '鉴权', 'auth.prefer': '首选方式', 'auth.secret': '密钥', 'auth.header': '请求头', 'auth.matrix': '各 Agent 实际写入方式',
      'auth.supports': '该 Agent 支持', 'auth.uses': '实际写入', 'auth.note': '说明', 'auth.compare': '对比规则',
      'auth.compareRule': 'OAuth 方式的 Agent 不比较 Authorization 头；请求头方式只比较密钥指纹（sha256 前 6 位），不比较明文。',
      'auth.oauth': 'OAuth 登录', 'auth.bearer': 'Bearer 请求头', 'auth.env': '环境变量', 'auth.none': '无需鉴权', 'auth.unsupported': '不支持 → 不同步',
      'auth.summary.oauth': 'OAuth', 'auth.summary.bearer': '请求头',
      'server.title': 'MCP Server', 'server.name': '名称', 'server.transport': '传输', 'server.url': 'URL', 'server.command': '命令', 'server.timeout': '超时', 'server.targets': '同步到',
      'btn.refresh': '刷新', 'btn.plan': '生成同步计划', 'btn.create': '创建技能', 'btn.import': '导入技能',
      'btn.addServer': '新增 Server', 'btn.secrets': '密钥', 'btn.importMcp': '从各 Agent 导入', 'btn.editJson': '编辑 mcp.json',
      'btn.addAgent': '自定义 Agent', 'btn.add': '添加', 'btn.edit': '编辑', 'btn.disable': '停用', 'btn.remove': '移除',
      'btn.diff': '对比', 'btn.copyToHub': '复制到 Hub', 'btn.close': '关闭', 'btn.cancel': '取消', 'btn.save': '保存',
      'btn.copyBody': '复制正文', 'btn.detail': '查看详情', 'btn.trash': '移到回收站', 'btn.restore': '恢复',
      'btn.rollback': '回滚', 'btn.install': '安装', 'btn.previewUpdate': '预览更新', 'btn.addRepo': '添加仓库',
      'btn.checkUpdates': '刷新并检查更新', 'btn.execute': '确认执行 {count} 项', 'btn.merge': '按所选合并（自动备份）',
      'btn.useHub': '全部以 Hub 为准', 'btn.useTarget': '全部以 {agent} 为准', 'btn.ignore': '忽略', 'btn.showAll': '展开全部 {count} 个',
      'btn.removeLink': '移除软链', 'btn.view': '查看',
      'search.skills': '搜索技能名称或描述', 'search.mcp': '搜索 Server', 'search.repos': '搜索仓库技能',
      'filter.allAgents': '全部 Agent', 'filter.allStatus': '全部状态', 'filter.pending': '待同步', 'filter.conflict': '有冲突', 'filter.own': '各 Agent 独有',
      'stat.agents': '个 Agent', 'stat.hubSkills': '个真源技能', 'stat.own': '个各 Agent 独有', 'stat.pending': '处待同步', 'stat.conflicts': '处冲突',
      'stat.hubServers': '个真源 Server', 'stat.targets': '个同步目标', 'stat.candidates': '个可添加',
      'hub.name': '公共 Agent（真源）', 'hub.skillsNote': '{native} 直接读取此目录；{synced} 通过同步获得。右侧标签是该技能在各 Agent 的状态。',
      'hub.mcpNote': '只存 ${secret:名称} 引用，真实密钥在 secrets.json（权限 600），同步时解析为明文写入各 Agent。',
      'agents.section': '各 Agent 实际拥有的内容（Hub 只管理自己同步出去的，独有内容不改不删）',
      'agents.detectedSection': '检测到但未启用的来源（打开开关即纳入管理）',
      'group.count': '{count} 个', 'group.fromHub': '{count} 来自 Hub', 'group.own': '{count} 独有', 'group.builtin': '{count} 内置',
      'group.native': '原生读取 ~/.agents/skills，无需同步', 'group.manage': '仅管理 · 不同步', 'group.mode': '同步方式',
      'mode.native': '原生读取', 'mode.link': '软链', 'mode.copy': '复制', 'mode.none': '不管理',
      'fmt.json': 'JSON', 'fmt.codex-toml': 'Codex TOML', 'fmt.dsh-patch': 'DSH patch',
      'role.sync': '同步', 'role.manage': '仅管理',
      'kind.hub-link': 'Hub 软链', 'kind.hub-copy': 'Hub 副本', 'kind.own': '独有', 'kind.builtin': '内置', 'kind.managed': 'Hub 托管',
      'st.native': '原生', 'st.ok': '一致', 'st.missing': '待同步', 'st.hub-changed': 'Hub 改动', 'st.target-changed': '目标改动',
      'st.conflict': '两边都改', 'st.differs': '有差异', 'st.broken': '死链', 'st.blocked': '被占用', 'st.excluded': '排除', 'st.off': '不同步',
      'st.update': '有新版本', 'st.installed': '已安装', 'st.disabled': '已停用', 'st.enabled': '已启用',
      'legend': '状态说明', 'legend.native': '该 Agent 自己读 ~/.agents', 'legend.ok': '与 Hub 一致', 'legend.missing': 'Hub 有、目标没有',
      'legend.hub-changed': '上次同步后只有 Hub 改了，可安全推送', 'legend.target-changed': '只有目标改了，默认回写 Hub',
      'legend.conflict': '两边都改了，需逐字段选择', 'legend.differs': '无同步基线，两方内容不同',
      'legend.broken': '软链指向的位置不存在', 'legend.blocked': '目标处已有同名真实目录，不会覆盖',
      'agents.enabled': '已接入的 Agent', 'agents.candidates': '检测到但未接入', 'agents.custom': '自定义 Agent 存在 ~/.agents/hub/agents.json，无需改插件代码',
      'agents.skills': '技能', 'agents.mcp': 'MCP', 'agents.detected': '已检测到', 'agents.notDetected': '未检测到',
      'agents.preset': '预设', 'agents.customTag': '自定义',
      'agentForm.title': '自定义 Agent', 'agentForm.name': '名称', 'agentForm.short': '图标缩写', 'agentForm.role': '角色',
      'agentForm.skillsDir': '技能目录', 'agentForm.skillsMode': '技能方式', 'agentForm.mcpPath': 'MCP 配置文件',
      'agentForm.mcpFormat': '文件格式', 'agentForm.mcpKey': 'JSON 键路径', 'agentForm.dialect': '字段方言', 'agentForm.exclude': '排除的 Server',
      'agentForm.preview': '写入 ~/.agents/hub/agents.json', 'agentForm.hint': '保存后立即参与扫描；首次同步前会出现在同步计划里供你确认。',
      'repos.note': '安装/更新只写入 ~/.agents/skills，并记录在 ~/.agents/.skill-lock.json；再按「技能」页的同步方式分发到各 Agent。',
      'repos.branch': '默认分支',
      'records.sync': '同步记录', 'records.trash': '回收站', 'records.backup': '每次写入前备份到 ~/.agents/hub/backups/<时间>/，可一键回滚。',
      'records.trashNote': 'Hub 删除的技能先进回收站；同步时只移除指向 Hub 的软链与 Hub 托管的 MCP 条目。',
      'detail.status': '在各 Agent 中的状态', 'detail.diagnose': '诊断', 'detail.noIssue': '未发现诊断问题。', 'detail.body': '正文（SKILL.md）',
      'detail.agent': 'Agent', 'detail.way': '方式', 'detail.state': '状态', 'detail.path': '路径',
      'diff.title': '{name} · Hub ⇄ {agent}', 'diff.base': '基线（上次同步）', 'diff.noBase': '无基线（尚未同步过），按两方对比',
      'diff.withBase': '基线 = {time} 同步', 'diff.field': '字段', 'diff.verdict': '判定', 'diff.pick': '采用',
      'diff.rule': '仅 Hub 改 → 推送；仅目标改 → 默认回写 Hub；两边都改 → 逐字段选择。60 s 与 60000 ms、http 与 streamable-http 视为相同。',
      'diff.writeTarget': '写入 {path}（只改这一段）', 'diff.writeHub': '回写 ~/.agents/mcp.json', 'diff.masked': '密钥已打码',
      'v.same': '未变', 'v.eq': '相同', 'v.hub': '仅 Hub 改', 'v.target': '仅目标改', 'v.both': '两边都改', 'v.diff': '不同',
      'plan.title': '同步计划 · {count} 项', 'plan.target': '目标', 'plan.action': '动作', 'plan.object': '对象',
      'plan.backup': '写入前备份所有涉及文件', 'plan.skipConflict': '冲突项未解决，已排除：{names}', 'plan.manage': 'WorkBuddy 等“仅管理”的 Agent 不在范围内',
      'plan.reload': '{agents} 需要重启或重载后生效',
      'act.add': '新增', 'act.update': '更新', 'act.link': '建软链', 'act.copy': '复制', 'act.unlink': '删除软链',
      'act.writeback': '回写 Hub', 'act.skip': '不处理', 'act.remove': '移除托管条目',
      'import.title': '首次导入：从各 Agent 汇总 MCP 到 Hub', 'import.note': '同名 Server 在多个 Agent 中定义不同，请为每个选择以谁为准。',
      'import.server': 'Server', 'import.found': '出现在', 'import.source': '以谁为准', 'import.diff': '差异',
      'empty.mcp': '~/.agents/mcp.json 还没有内容。先从各 Agent 导入现有 MCP。',
      'loading': '加载中…', 'error': '加载失败：{msg}',
    }
    const EN = {}
    let translate = null
    let pickDirectory = null
    const t = (key, params) => {
      let s
      try { s = translate ? translate(key) : undefined } catch { s = undefined }
      if (!s || s === key || typeof s !== 'string') s = ZH[key] ?? key
      if (params) s = s.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? ''))
      return s
    }

    // ───────────────────────── 样式（仅用宿主主题 token） ─────────────────────────
    const CSS = `
.ah{box-sizing:border-box;height:100%;overflow-y:auto;display:flex;flex-direction:column;align-items:center;padding:28px clamp(24px,4vw,48px) 48px;color:var(--dsw-alias-label-primary);font-size:13px}
.ah *{box-sizing:border-box}
.ah>.ah-in{width:100%;max-width:960px}
.ah-title{display:flex;align-items:center;gap:10px}
.ah-title h1{margin:0;font-size:22px;font-weight:650}
.ah-ver{font-size:11px;color:var(--dsw-alias-label-tertiary);border:0.5px solid var(--dsw-alias-border-l3);border-radius:6px;padding:1px 6px}
.ah-desc{color:var(--dsw-alias-label-secondary);margin:6px 0 16px}
.ah-sp{flex:1}
.ah-btn{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:999px;border:0.5px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-button-elevated-fill,transparent);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;cursor:pointer;white-space:nowrap}
.ah-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.ah-btn.pri{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-inverted);border-color:transparent}
.ah-btn.pri:hover{background:var(--dsw-alias-button-primary-hover)}
.ah-btn.sm{height:24px;padding:0 9px;font-size:12px}
.ah-btn.danger{color:var(--dsw-alias-state-error-primary)}
.ah-btn:disabled{opacity:.45;cursor:default}
.ah-icon-btn{width:26px;height:24px;border-radius:999px;border:0.5px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:12px;line-height:1}
.ah-tabs{display:flex;background:var(--dsw-alias-bg-layer-2);border:0.5px solid var(--dsw-alias-border-l2);border-radius:12px;padding:3px;margin-bottom:14px}
.ah-tabs button{flex:1;height:30px;border:0;border-radius:9px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer}
.ah-tabs button.on{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-weight:600;box-shadow:0 0 0 0.5px var(--dsw-alias-border-l3)}
.ah-tabs .n{margin-left:5px;font-size:11px;color:var(--dsw-alias-state-warn-primary)}
.ah-bar{display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.ah-stats{display:flex;border:0.5px solid var(--dsw-alias-border-l2);border-radius:10px;margin-bottom:12px;background:var(--dsw-alias-bg-layer-2)}
.ah-stats>div{flex:1;padding:8px 12px;color:var(--dsw-alias-label-secondary);border-left:0.5px solid var(--dsw-alias-border-l2)}
.ah-stats>div:first-child{border-left:0}
.ah-stats b{color:var(--dsw-alias-label-primary);margin-right:4px;font-weight:650}
.ah-stats .warn b{color:var(--dsw-alias-state-warn-primary)}.ah-stats .err b{color:var(--dsw-alias-state-error-primary)}
.ah-select,.ah-input{height:30px;border-radius:8px;border:0.5px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;padding:0 10px}
.ah-input.search{width:240px}
.ah-group{border:0.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);margin-bottom:10px;overflow:hidden}
.ah-group.manage{background:var(--dsw-alias-bg-layer-2)}
.ah-ghead{display:flex;align-items:center;gap:9px;padding:10px 13px;cursor:pointer;user-select:none}
.ah-fold{width:12px;color:var(--dsw-alias-label-tertiary);font-size:10px}
.ah-badge{width:22px;height:22px;border-radius:6px;color:#fff;font-size:10.5px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex:none}
.ah-gname{font-weight:650}
.ah-gmeta{color:var(--dsw-alias-label-tertiary);font-size:12px}
.ah-path{margin-left:auto;font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:340px}
.ah-gnote{padding:0 13px 9px 56px;color:var(--dsw-alias-label-tertiary);font-size:12px}
.ah-row{display:flex;align-items:center;gap:10px;padding:10px 13px 10px 56px;border-top:0.5px solid var(--dsw-alias-border-l1)}
.ah-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.ah-row .main{flex:1;min-width:0;cursor:pointer}
.ah-row .nm{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ah-row .ds{color:var(--dsw-alias-label-tertiary);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.ah-chips{display:flex;gap:4px;flex:none;align-items:center}
.ah-chip{display:inline-flex;align-items:center;gap:4px;height:20px;border-radius:6px;padding:0 6px;font-size:11px;white-space:nowrap;border:0.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:transparent}
.ah-chip i{font-style:normal;min-width:14px;height:14px;padding:0 2px;border-radius:3px;color:#fff;font-size:8.5px;font-weight:700;display:inline-flex;align-items:center;justify-content:center}
.ah-chip.ok,.ah-chip.native{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 9%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 25%,transparent)}
.ah-chip.missing,.ah-chip.hub-changed,.ah-chip.update{color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 9%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 25%,transparent)}
.ah-chip.target-changed,.ah-chip.differs{color:var(--dsw-alias-state-warn-label,var(--dsw-alias-state-warn-primary));background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 10%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 30%,transparent)}
.ah-chip.conflict,.ah-chip.broken,.ah-chip.blocked{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 28%,transparent)}
.ah-chip.excluded,.ah-chip.off,.ah-chip.own,.ah-chip.builtin{color:var(--dsw-alias-label-tertiary)}
.ah-tag{font-size:11px;border-radius:5px;padding:1px 6px;border:0.5px solid var(--dsw-alias-border-l3);color:var(--dsw-alias-label-secondary);white-space:nowrap}
.ah-switch{width:30px;height:18px;border-radius:999px;border:0;background:var(--dsw-alias-state-idle-primary);position:relative;cursor:pointer;flex:none}
.ah-switch[aria-checked=true]{background:var(--dsw-alias-state-success-primary)}
.ah-switch::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-switch-thumb,#fff);transition:left .15s}
.ah-switch[aria-checked=true]::after{left:14px}
.ah-section{font-size:12px;color:var(--dsw-alias-label-tertiary);margin:18px 2px 8px}
.ah-legend{display:flex;flex-wrap:wrap;gap:6px 10px;color:var(--dsw-alias-label-tertiary);font-size:12px;margin:2px 2px 12px;align-items:center}
.ah-more{padding:8px 13px 10px 56px;border-top:0.5px solid var(--dsw-alias-border-l1)}
.ah-mask{position:fixed;inset:0;background:var(--dsw-alias-bg-mask-1);z-index:50;display:flex;align-items:center;justify-content:center}
.ah-modal{width:min(820px,92vw);max-height:86vh;display:flex;flex-direction:column;background:var(--dsw-alias-bg-overlay);border:0.5px solid var(--dsw-alias-border-l3);border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.18);color:var(--dsw-alias-label-primary)}
.ah-mhead{display:flex;align-items:center;gap:10px;padding:16px 20px;border-bottom:0.5px solid var(--dsw-alias-border-l2)}
.ah-mhead b{font-size:16px}
.ah-mbody{padding:14px 20px;overflow:auto}
.ah-mfoot{display:flex;align-items:center;gap:8px;padding:12px 20px;border-top:0.5px solid var(--dsw-alias-border-l2)}
.ah-drawer{position:fixed;top:0;right:0;bottom:0;width:min(760px,96vw);display:flex;flex-direction:column;background:var(--dsw-alias-bg-overlay);border-left:0.5px solid var(--dsw-alias-border-l3);box-shadow:-12px 0 30px rgba(0,0,0,.12)}
.ah-table{width:100%;border-collapse:separate;border-spacing:0;border:0.5px solid var(--dsw-alias-border-l2);border-radius:10px;overflow:hidden}
.ah-table th{font-weight:500;color:var(--dsw-alias-label-tertiary);font-size:12px;text-align:left;padding:8px 10px;background:var(--dsw-alias-bg-layer-2);border-bottom:0.5px solid var(--dsw-alias-border-l2)}
.ah-table td{padding:8px 10px;border-top:0.5px solid var(--dsw-alias-border-l1);vertical-align:middle}
.ah-table tr:nth-child(2) td{border-top:0}
.ah-mono{font-family:ui-monospace,Menlo,monospace;font-size:12px}
.ah-muted{color:var(--dsw-alias-label-tertiary)}
.ah-sub{font-size:12px;color:var(--dsw-alias-label-tertiary);margin:14px 0 8px}
.ah-pre{margin:0;padding:10px 12px;border-radius:10px;border:0.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-markdown-code-block,var(--dsw-alias-bg-layer-2));font-family:ui-monospace,Menlo,monospace;font-size:12px;line-height:1.6;white-space:pre-wrap;overflow:auto}
.ah-pre .add{display:block;background:var(--dsw-alias-file-diff-added-bg)}
.ah-pre .del{display:block;background:var(--dsw-alias-file-diff-deleted-bg)}
.ah-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.ah-form{display:grid;grid-template-columns:120px 1fr;gap:10px 12px;align-items:center}
.ah-form label{color:var(--dsw-alias-label-secondary);font-size:12.5px}
.ah-form .ah-input,.ah-form .ah-select{width:100%}
.ah-fieldset{border:0.5px solid var(--dsw-alias-border-l2);border-radius:10px;padding:12px;margin-top:12px}
.ah-fieldset>.lg{font-weight:600;margin-bottom:10px;display:block}
.ah-card-row{display:grid;grid-template-columns:28px 1.1fr 1.6fr 1.6fr auto;gap:12px;align-items:center;padding:11px 13px;border-top:0.5px solid var(--dsw-alias-border-l1)}
.ah-card-row:first-of-type{border-top:0}
.ah-kv{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.6}
.ah-kv .ah-mono{font-size:11px;color:var(--dsw-alias-label-tertiary)}
.ah-menu{position:absolute;right:0;top:28px;z-index:20;min-width:140px;background:var(--dsw-alias-bg-overlay);border:0.5px solid var(--dsw-alias-border-l3);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.12);padding:4px}
.ah-menu button{display:block;width:100%;text-align:left;border:0;background:transparent;padding:7px 10px;border-radius:7px;font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer}
.ah-menu button:hover{background:var(--dsw-alias-interactive-bg-hover)}
.ah-seg{display:inline-flex;background:var(--dsw-alias-bg-layer-2);border:0.5px solid var(--dsw-alias-border-l2);border-radius:9px;padding:2px}
.ah-seg button{border:0;background:transparent;border-radius:7px;padding:4px 12px;font:inherit;font-size:12.5px;color:var(--dsw-alias-label-secondary);cursor:pointer}
.ah-seg button.on{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-weight:600}
.ah-group.off{opacity:.72}
.ah-group.off .ah-ghead{padding-top:8px;padding-bottom:8px}
.ah-gact{display:flex;align-items:center;gap:6px;flex:none}
.ah-src-row{display:grid;grid-template-columns:30px 150px 1fr 1fr 110px 34px;gap:10px;align-items:center;padding:10px 13px;border-top:0.5px solid var(--dsw-alias-border-l1)}
.ah-src-row.hd{border-top:0;color:var(--dsw-alias-label-tertiary);font-size:12px;background:var(--dsw-alias-bg-layer-2)}
.ah-pathcell{display:flex;align-items:center;gap:6px;min-width:0}
.ah-pathcell .ah-mono{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11.5px}
.ah-pathcell .fmt{font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
.ah-callout{border:0.5px solid var(--dsw-alias-border-l2);border-radius:10px;padding:10px 12px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.7}
.ah-empty{padding:28px;text-align:center;color:var(--dsw-alias-label-tertiary)}
.ah-check{width:14px;height:14px}
`

    // ───────────────────────── 数据 ─────────────────────────
    const url = (p) => new URL(API + p, document.baseURI).toString()
    async function api(p, body) {
      const init = body === undefined ? { cache: 'no-store' }
        : { method: 'POST', headers: { 'content-type': 'application/json', 'x-dsh-agent-hub': '1' }, body: JSON.stringify(body) }
      const res = await fetch(url(p), init)
      const json = await res.json().catch(() => ({ ok: false, error: 'non-json response' }))
      if (!res.ok || json.ok === false) throw new Error(json.error || res.statusText)
      return json.data
    }

    // ───────────────────────── 小部件 ─────────────────────────
    const agentById = (data, id) => data.agents.find((a) => a.id === id) || { id, short: '?', color: '#888', name: id }
    function Badge({ agent, size }) {
      return h('span', { className: 'ah-badge', style: { background: agent.color, ...(size ? { width: size, height: size } : null) } }, agent.short)
    }
    function Chip({ state, agent, label }) {
      return h('span', { className: 'ah-chip ' + (state || ''), title: agent ? agent.name + ' · ' + t('st.' + state) : undefined },
        agent ? h('i', { style: { background: agent.color } }, agent.short) : null,
        label ?? t('st.' + state))
    }
    function Switch({ on, onChange, label }) {
      return h('button', { className: 'ah-switch', role: 'switch', 'aria-checked': !!on, 'aria-label': label, onClick: (e) => { e.stopPropagation(); onChange && onChange(!on) } })
    }
    function Btn({ children, pri, sm, danger, onClick, disabled, title }) {
      return h('button', { className: 'ah-btn' + (pri ? ' pri' : '') + (sm ? ' sm' : '') + (danger ? ' danger' : ''), onClick, disabled, title }, children)
    }
    function Select({ value, options, onChange, width }) {
      return h('select', { className: 'ah-select', value, style: width ? { width } : undefined, onChange: (e) => onChange && onChange(e.target.value) },
        options.map((o) => h('option', { key: o.value, value: o.value }, o.label)))
    }
    function Menu({ items }) {
      const [open, setOpen] = useState(false)
      const ref = useRef(null)
      useEffect(() => {
        if (!open) return
        const off = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
        document.addEventListener('mousedown', off)
        return () => document.removeEventListener('mousedown', off)
      }, [open])
      return h('span', { ref, style: { position: 'relative', flex: 'none' } },
        h('button', { className: 'ah-icon-btn', 'aria-label': '更多', onClick: (e) => { e.stopPropagation(); setOpen(!open) } }, '•••'),
        open ? h('div', { className: 'ah-menu' }, items.filter(Boolean).map((it) =>
          h('button', { key: it.label, onClick: () => { setOpen(false); it.onClick() } }, it.label))) : null)
    }
    function Group({ head, note, children, defaultOpen = true, manage, off }) {
      const [open, setOpen] = useState(defaultOpen)
      return h('div', { className: 'ah-group' + (manage ? ' manage' : '') + (off ? ' off' : '') },
        h('div', { className: 'ah-ghead', onClick: () => setOpen(!open) }, h('span', { className: 'ah-fold' }, open ? '▼' : '▶'), head),
        open && note ? h('div', { className: 'ah-gnote' }, note) : null,
        open ? children : null)
    }
    function Stats({ items }) {
      return h('div', { className: 'ah-stats' }, items.map((it, i) => h('div', { key: i, className: it.tone || '' }, h('b', null, it.n), it.label)))
    }
    function Legend({ states }) {
      return h('div', { className: 'ah-legend' }, t('legend') + '：', states.map((s) => h('span', { key: s, title: t('legend.' + s) }, h(Chip, { state: s }), ' ', t('legend.' + s))))
    }
    const matches = (q, ...xs) => !q || xs.some((x) => String(x || '').toLowerCase().includes(q.toLowerCase()))

    // ───────────────────────── 技能页 ─────────────────────────
    function SkillsTab({ data, actions }) {
      const [q, setQ] = useState('')
      const [agentF, setAgentF] = useState('all')
      const [statusF, setStatusF] = useState('all')
      const sync = data.agents.filter((a) => a.enabled !== false && a.role === 'sync' && a.skills.mode !== 'none')
      const native = sync.filter((a) => a.skills.mode === 'native')
      const synced = sync.filter((a) => a.skills.mode === 'link' || a.skills.mode === 'copy')
      const hub = data.skills.hub
      const pending = hub.reduce((n, s) => n + Object.values(s.status).filter((st) => st !== 'ok' && st !== 'native' && st !== 'excluded').length, 0)
      const ownCount = data.agents.filter((a) => a.enabled !== false).flatMap((a) => data.skills.agents[a.id] || []).filter((x) => x.kind === 'own').length
      const passStatus = (s) => statusF === 'all'
        || (statusF === 'pending' && Object.values(s.status).some((st) => ['missing', 'hub-changed', 'target-changed', 'differs', 'broken'].includes(st)))
        || (statusF === 'conflict' && Object.values(s.status).some((st) => st === 'conflict' || st === 'blocked'))
      const visibleAgents = data.agents.filter((a) => a.skills.dir && (agentF === 'all' || agentF === a.id))
      return h(React.Fragment, null,
        h('div', { className: 'ah-bar' },
          h(Btn, { pri: true, onClick: () => actions.open({ type: 'createSkill' }) }, t('btn.create')),
          h(Btn, { onClick: () => actions.open({ type: 'importSkill' }) }, t('btn.import')),
          h(Btn, { onClick: () => actions.open({ type: 'sources' }) }, t('btn.sources')),
          h('span', { className: 'ah-sp' }),
          h(Select, { value: agentF, onChange: setAgentF, options: [{ value: 'all', label: t('filter.allAgents') }, ...data.agents.filter((a) => a.skills.dir).map((a) => ({ value: a.id, label: a.name }))] }),
          h(Select, { value: statusF, onChange: setStatusF, options: [{ value: 'all', label: t('filter.allStatus') }, { value: 'pending', label: t('filter.pending') }, { value: 'conflict', label: t('filter.conflict') }] }),
          h('input', { className: 'ah-input search', placeholder: t('search.skills'), value: q, onChange: (e) => setQ(e.target.value) })),
        h(Stats, { items: [
          { n: data.agents.filter((a) => a.enabled !== false).length, label: t('stat.agents') }, { n: hub.length, label: t('stat.hubSkills') },
          { n: ownCount, label: t('stat.own') }, { n: pending, label: t('stat.pending'), tone: pending ? 'warn' : '' }] }),
        h(Legend, { states: ['native', 'ok', 'missing', 'differs', 'target-changed', 'conflict', 'broken', 'blocked'] }),
        agentF === 'all' || true ? h(Group, {
          head: [h('span', { key: 'b', className: 'ah-badge', style: { background: 'var(--dsw-alias-label-primary)', color: 'var(--dsw-alias-label-primary-inverted)' } }, 'A'),
            h('span', { key: 'n', className: 'ah-gname' }, t('hub.name')), h('span', { key: 'c', className: 'ah-gmeta' }, t('group.count', { count: hub.length })),
            h('span', { key: 'p', className: 'ah-path' }, data.hub.skillsDir)],
          note: t('hub.skillsNote', { native: native.map((a) => a.name).join('、'), synced: synced.map((a) => a.name).join('、') }),
        }, hub.filter((s) => matches(q, s.name, s.description) && passStatus(s)).map((s) =>
          h('div', { key: s.name, className: 'ah-row' },
            h('div', { className: 'main', onClick: () => actions.open({ type: 'skill', name: s.name }) },
              h('div', { className: 'nm' }, s.name),
              h('div', { className: 'ds' }, [s.description, s.source ? s.source : null].filter(Boolean).join(' · '))),
            h('div', { className: 'ah-chips' },
              s.update ? h(Chip, { state: 'update' }) : null,
              sync.filter((a) => agentF === 'all' || a.id === agentF).map((a) => h(Chip, { key: a.id, state: s.status[a.id] || 'off', agent: a }))),
            h(Menu, { items: [
              { label: t('btn.detail'), onClick: () => actions.open({ type: 'skill', name: s.name }) },
              s.update ? { label: t('btn.previewUpdate'), onClick: () => actions.open({ type: 'repoUpdate', name: s.name }) } : null,
              { label: t('btn.trash'), onClick: () => actions.post('/skills/trash', { name: s.name }) }] })))) : null,
        h('div', { className: 'ah-section' }, t('agents.section')),
        visibleAgents.filter((a) => a.enabled !== false).map((a) => h(AgentSkillGroup, { key: a.id, agent: a, items: (data.skills.agents[a.id] || []).filter((x) => matches(q, x.name, x.description)), actions })),
        visibleAgents.some((a) => a.enabled === false) ? h('div', { className: 'ah-section' }, t('agents.detectedSection')) : null,
        visibleAgents.filter((a) => a.enabled === false).map((a) => h(AgentSkillGroup, { key: a.id, agent: a, items: data.skills.agents[a.id] || [], actions })))
    }

    function AgentSkillGroup({ agent, items, actions }) {
      const fromHub = items.filter((x) => x.kind === 'hub-link' || x.kind === 'hub-copy').length
      const own = items.filter((x) => x.kind === 'own').length
      const builtin = items.filter((x) => x.kind === 'builtin').length
      const native = agent.skills.mode === 'native'
      const meta = native ? t('group.native') + (builtin || own ? ' · ' + [builtin ? t('group.builtin', { count: builtin }) : '', own ? t('group.own', { count: own }) : ''].filter(Boolean).join(' · ') : '')
        : [t('group.count', { count: items.length }), fromHub ? t('group.fromHub', { count: fromHub }) : '', own ? t('group.own', { count: own }) : ''].filter(Boolean).join(' · ')
      const head = [h(Badge, { key: 'b', agent }), h('span', { key: 'n', className: 'ah-gname' }, agent.name),
        agent.role === 'manage' ? h('span', { key: 'r', className: 'ah-tag' }, t('group.manage')) : null,
        h('span', { key: 'm', className: 'ah-gmeta' }, meta),
        h('span', { key: 'p', className: 'ah-path' }, agent.skills.dir),
        agent.enabled !== false && agent.role === 'sync' && !native && agent.skills.mode !== 'none' ? h('span', { key: 's', onClick: (e) => e.stopPropagation() },
          h(Select, { value: agent.skills.mode, onChange: (v) => actions.post('/agents/mode', { id: agent.id, mode: v }),
            options: [{ value: 'link', label: t('group.mode') + '：' + t('mode.link') }, { value: 'copy', label: t('group.mode') + '：' + t('mode.copy') }] })) : null,
        h(SourceControls, { key: 'c', agent, actions, which: 'skills' })]
      if (agent.enabled === false) return h(Group, { head: offHead(agent, agent.skills.dir, items.length ? t('group.count', { count: items.length }) : ''), defaultOpen: false, off: true, actions })
      return h(Group, { head, defaultOpen: !native, manage: agent.role === 'manage' },
        items.length === 0 ? h('div', { className: 'ah-more ah-muted' }, '—') : items.map((x) =>
          h('div', { key: x.name, className: 'ah-row' },
            h('div', { className: 'main', onClick: () => x.kind !== 'builtin' && actions.open({ type: 'agentSkill', agent: agent.id, name: x.name }) },
              h('div', { className: 'nm' }, x.name),
              h('div', { className: 'ds' }, x.note || x.description || '')),
            h('div', { className: 'ah-chips' },
              h(Chip, { state: x.kind === 'own' || x.kind === 'builtin' ? x.kind : 'ok', label: t('kind.' + x.kind) }),
              x.state && x.state !== 'ok' ? h(Chip, { state: x.state }) : null),
            x.state === 'target-changed' || x.state === 'conflict' || x.state === 'differs'
              ? h(Btn, { sm: true, onClick: () => actions.open({ type: 'diff', kind: 'skill', name: x.name, agent: agent.id }) }, t('btn.diff')) : null,
            x.kind === 'own' ? h(Btn, { sm: true, onClick: () => actions.post('/skills/copy-to-hub', { agent: agent.id, name: x.name }, '已复制到 Hub') }, t('btn.copyToHub')) : null)))
    }

    // ───────────────────────── MCP 页 ─────────────────────────
    function McpTab({ data, actions }) {
      const [q, setQ] = useState('')
      const [agentF, setAgentF] = useState('all')
      const targets = data.agents.filter((a) => a.enabled !== false && a.role === 'sync' && a.mcp)
      const hub = data.mcp.hub
      const pending = hub.reduce((n, s) => n + Object.values(s.status).filter((st) => !['ok', 'excluded', 'off'].includes(st)).length, 0)
      const conflicts = hub.reduce((n, s) => n + Object.values(s.status).filter((st) => st === 'conflict').length, 0)
      const own = data.agents.filter((a) => a.enabled !== false).flatMap((a) => data.mcp.agents[a.id] || []).filter((x) => x.kind === 'own').length
      return h(React.Fragment, null,
        h('div', { className: 'ah-bar' },
          h(Btn, { pri: true, onClick: () => actions.open({ type: 'server' }) }, '+ ' + t('btn.addServer')),
          h(Btn, { onClick: () => actions.open({ type: 'import' }) }, t('btn.importMcp')),
          h(Btn, { onClick: () => actions.open({ type: 'secrets' }) }, t('btn.secrets')),
          h(Btn, { onClick: () => actions.open({ type: 'sources' }) }, t('btn.sources')),
          h('span', { className: 'ah-sp' }),
          h(Select, { value: agentF, onChange: setAgentF, options: [{ value: 'all', label: t('filter.allAgents') }, ...data.agents.map((a) => ({ value: a.id, label: a.name }))] }),
          h('input', { className: 'ah-input search', placeholder: t('search.mcp'), value: q, onChange: (e) => setQ(e.target.value) })),
        h(Stats, { items: [
          { n: hub.length, label: t('stat.hubServers') }, { n: targets.length, label: t('stat.targets') },
          { n: pending, label: t('stat.pending'), tone: pending ? 'warn' : '' }, { n: conflicts, label: t('stat.conflicts'), tone: conflicts ? 'err' : '' },
          { n: own, label: t('stat.own') }] }),
        h(Group, {
          head: [h('span', { key: 'b', className: 'ah-badge', style: { background: 'var(--dsw-alias-label-primary)', color: 'var(--dsw-alias-label-primary-inverted)' } }, 'A'),
            h('span', { key: 'n', className: 'ah-gname' }, t('hub.name')), h('span', { key: 'c', className: 'ah-gmeta' }, t('group.count', { count: hub.length })),
            h('span', { key: 'p', className: 'ah-path' }, data.hub.mcpPath + ' · secrets.json')],
          note: t('hub.mcpNote'),
        }, hub.length === 0 ? h('div', { className: 'ah-empty' }, t('empty.mcp'), ' ', h(Btn, { sm: true, pri: true, onClick: () => actions.open({ type: 'import' }) }, t('btn.importMcp')))
          : hub.filter((s) => matches(q, s.name, s.endpoint)).map((s) =>
            h('div', { key: s.name, className: 'ah-row' },
              h('div', { className: 'main', onClick: () => actions.open({ type: 'server', name: s.name }) },
                h('div', { className: 'nm' }, s.name),
                h('div', { className: 'ds' }, [s.transport, s.endpoint, authSummary(s, data)].filter(Boolean).join(' · '))),
              h('div', { className: 'ah-chips' }, targets.filter((a) => agentF === 'all' || a.id === agentF).map((a) => {
                const st = s.status[a.id] || 'off'
                const clickable = ['differs', 'target-changed', 'conflict', 'hub-changed'].includes(st)
                return h('span', { key: a.id, style: clickable ? { cursor: 'pointer' } : undefined, onClick: clickable ? () => actions.open({ type: 'diff', kind: 'mcp', name: s.name, agent: a.id }) : undefined }, h(Chip, { state: st, agent: a }))
              })),
              h(Menu, { items: [
                { label: t('btn.edit'), onClick: () => actions.open({ type: 'server', name: s.name }) },
                { label: t('btn.trash'), onClick: () => actions.post('/mcp/remove', { name: s.name }) }] })))),
        h('div', { className: 'ah-section' }, t('agents.section')),
        data.agents.filter((a) => a.enabled !== false && a.mcp && (agentF === 'all' || agentF === a.id)).map((a) =>
          h(AgentMcpGroup, { key: a.id, agent: a, items: (data.mcp.agents[a.id] || []).filter((x) => matches(q, x.name, x.endpoint)), extra: (data.mcp.extra || {})[a.id], actions })),
        data.agents.some((a) => a.enabled === false && a.mcp) ? h('div', { className: 'ah-section' }, t('agents.detectedSection')) : null,
        data.agents.filter((a) => a.enabled === false && a.mcp && (agentF === 'all' || agentF === a.id)).map((a) =>
          h(AgentMcpGroup, { key: a.id, agent: a, items: data.mcp.agents[a.id] || [], actions })))
    }

    function McpRow({ agent, x, actions }) {
      return h('div', { className: 'ah-row' },
        h('div', { className: 'main' },
          h('div', { className: 'nm' }, x.name),
          h('div', { className: 'ds' }, [x.transport, x.endpoint, x.note].filter(Boolean).join(' · '))),
        h('div', { className: 'ah-chips' },
          h(Chip, { state: x.kind === 'own' ? 'own' : x.kind === 'excluded' ? 'excluded' : 'ok', label: x.kind === 'excluded' ? t('st.excluded') : t('kind.' + x.kind) }),
          x.state && x.state !== 'ok' ? h(Chip, { state: x.state }) : null),
        ['differs', 'target-changed', 'conflict'].includes(x.state) ? h(Btn, { sm: true, onClick: () => actions.open({ type: 'diff', kind: 'mcp', name: x.name, agent: agent.id }) }, t('btn.diff')) : null,
        x.kind === 'own' ? h(Btn, { sm: true, onClick: () => actions.post('/mcp/copy-to-hub', { agent: agent.id, name: x.name, extra: x.extra }, '已复制到 Hub') }, t('btn.copyToHub')) : null,
        typeof x.enabled === 'boolean' ? h(Switch, { on: x.enabled, label: x.name, onChange: (v) => actions.post('/mcp/toggle', { agent: agent.id, name: x.name, enabled: v, extra: x.extra }, v ? '已启用' : '已停用') }) : null)
    }

    function AgentMcpGroup({ agent, items, extra, actions }) {
      const [showAll, setShowAll] = useState(false)
      const managed = items.filter((x) => x.kind === 'managed').length
      const own = items.filter((x) => x.kind === 'own').length
      const meta = [t('group.count', { count: items.length }), managed ? t('group.fromHub', { count: managed }) : '', own ? t('group.own', { count: own }) : ''].filter(Boolean).join(' · ')
      const head = [h(Badge, { key: 'b', agent }), h('span', { key: 'n', className: 'ah-gname' }, agent.name),
        agent.role === 'manage' ? h('span', { key: 'r', className: 'ah-tag' }, t('group.manage')) : null,
        h('span', { key: 'm', className: 'ah-gmeta' }, meta + (extra ? ' · ' + extra.label + ' ' + extra.total : '')),
        h('span', { key: 'p', className: 'ah-path' }, agent.mcp.path + ' · ' + t('fmt.' + agent.mcp.format)),
        h(SourceControls, { key: 'c', agent, actions, which: 'mcp' })]
      if (agent.enabled === false) return h(Group, { head: offHead(agent, agent.mcp.path, t('group.count', { count: items.length })), defaultOpen: false, off: true },
        items.map((x) => h(McpRow, { key: x.name, agent, x: { ...x, kind: 'own', state: null }, actions })))
      const LIMIT = 4
      const extraItems = extra ? (showAll ? extra.items : extra.items.slice(0, LIMIT)) : []
      return h(Group, { head, defaultOpen: items.some((x) => x.state && x.state !== 'ok') || items.some((x) => x.kind === 'own') || !!extra, manage: agent.role === 'manage' },
        items.map((x) => h(McpRow, { key: x.name, agent, x, actions })),
        extra ? h(React.Fragment, null,
          h('div', { className: 'ah-gnote', style: { paddingTop: 8, borderTop: '0.5px solid var(--dsw-alias-border-l1)' } }, extra.label + ' · ' + extra.path + ' · ' + t('st.enabled') + ' ' + extra.enabledCount + '/' + extra.total),
          extraItems.map((x) => h(McpRow, { key: x.name, agent, x, actions })),
          !showAll && extra.items.length > LIMIT ? h('div', { className: 'ah-more' }, h(Btn, { sm: true, onClick: () => setShowAll(true) }, t('btn.showAll', { count: extra.total }))) : null) : null)
    }


    // ───────────────────────── 来源目录（自动检测 + 开关 + 改路径，参考 skills-manager） ─────────────────────────
    function SourceControls({ agent, actions, which }) {
      return h('span', { className: 'ah-gact', onClick: (e) => e.stopPropagation() },
        h(Btn, { sm: true, onClick: () => actions.open({ type: 'sources', focus: agent.id, which }) }, t('btn.changeDir')),
        h(Switch, { on: agent.enabled !== false, label: agent.name, onChange: (v) => actions.post('/sources/toggle', { id: agent.id, enabled: v }, v ? '已启用 ' + agent.name : '已停用 ' + agent.name) }))
    }
    function offHead(agent, path, meta) {
      if (!offHead.actions) offHead.actions = { open() {}, post() {} }
      return [h(Badge, { key: 'b', agent }), h('span', { key: 'n', className: 'ah-gname' }, agent.name),
        h('span', { key: 't', className: 'ah-tag' }, t('src.detected')), meta ? h('span', { key: 'm', className: 'ah-gmeta' }, meta) : null,
        h('span', { key: 'p', className: 'ah-path' }, path || '—'),
        h(SourceControls, { key: 'c', agent, actions: offHead.actions, which: 'skills' })]
    }
    function SourcesModal({ data, onClose, actions, focus }) {
      const [adding, setAdding] = useState(false)
      const [dir, setDir] = useState('~/.codebuddy')
      const [rec, setRec] = useState((data.recognize || {})[dir] || null)
      useEffect(() => { const id = setTimeout(() => { if (data.recognize) setRec(data.recognize[dir] || null); else api('/sources/recognize', { dir }).then((r) => setRec(r.text), () => setRec(null)) }, 300); return () => clearTimeout(id) }, [dir])
      const row = (a) => h('div', { key: a.id, className: 'ah-src-row', style: focus === a.id ? { background: 'var(--dsw-alias-interactive-bg-hover)' } : undefined },
        h(Badge, { agent: a }),
        h('div', null, h('div', { style: { fontWeight: 650 } }, a.name), h('div', { className: 'ah-muted', style: { fontSize: 11.5 } }, a.custom ? t('src.custom') : a.enabled === false ? t('src.off') : t('role.' + a.role))),
        h('div', { className: 'ah-pathcell' }, h('span', { className: 'ah-mono' }, a.skills.dir || '—'), h('span', { className: 'fmt' }, t('mode.' + a.skills.mode)),
          a.skills.dir ? h('button', { className: 'ah-icon-btn', title: t('btn.changeDir'), onClick: () => actions.open({ type: 'path', id: a.id, which: 'skills', value: a.skills.dir, back: { type: 'sources' } }) }, '✎') : null),
        h('div', { className: 'ah-pathcell' }, h('span', { className: 'ah-mono' }, a.mcp.path), h('span', { className: 'fmt' }, t('fmt.' + a.mcp.format)),
          h('button', { className: 'ah-icon-btn', title: t('btn.changeDir'), onClick: () => actions.open({ type: 'path', id: a.id, which: 'mcp', value: a.mcp.path, back: { type: 'sources' } }) }, '✎')),
        h(Select, { value: a.role, onChange: (v) => actions.post('/sources/role', { id: a.id, role: v }), options: [{ value: 'sync', label: t('role.sync') }, { value: 'manage', label: t('role.manage') }] }),
        h(Switch, { on: a.enabled !== false, label: a.name, onChange: (v) => actions.post('/sources/toggle', { id: a.id, enabled: v }) }))
      const head = h('div', { className: 'ah-src-row hd' }, h('span'), h('span', null, 'Agent'), h('span', null, t('src.skillsDir')), h('span', null, t('src.mcpFile')), h('span', null, t('src.role')), h('span'))
      return h(Modal, { title: t('src.title'), onClose, width: 'min(1040px,96vw)',
        foot: [h('span', { key: 'n', className: 'ah-muted' }, t('src.store')), h('span', { key: 's', className: 'ah-sp' }), h(Btn, { key: 'c', onClick: onClose }, t('btn.close'))] },
        h('div', { className: 'ah-muted', style: { marginBottom: 10 } }, t('src.desc')),
        h('div', { className: 'ah-sub', style: { marginTop: 0 } }, t('src.enabled')),
        h('div', { className: 'ah-group' }, head, data.agents.filter((a) => a.enabled !== false).map(row)),
        h('div', { className: 'ah-sub' }, t('src.detected')),
        h('div', { className: 'ah-group' }, head, data.agents.filter((a) => a.enabled === false).map(row)),
        h('div', { className: 'ah-sub' }, t('src.add')),
        h('div', { className: 'ah-callout' },
          h('div', { style: { marginBottom: 8 } }, t('src.addHint')),
          h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
            h('input', { className: 'ah-input ah-mono', style: { flex: 1 }, value: dir, onChange: (e) => setDir(e.target.value) }),
            h(Btn, { onClick: () => actions.pick().then((d) => d && setDir(d)) }, t('btn.browse')),
            h(Btn, { pri: true, onClick: () => actions.post('/sources/add', { dir }, '已添加来源') }, t('btn.addDir'))),
          rec ? h('div', { style: { marginTop: 10 } }, h('b', null, t('src.result') + '：'), ' ', rec) : null))
    }

    // ───────────────────────── MCP Server 编辑 + 鉴权矩阵 ─────────────────────────
    const AUTH_LABEL = { oauth: 'auth.oauth', bearer: 'auth.bearer', env: 'auth.env', none: 'auth.none' }
    function authSummary(s, data) {
      if (!s.auth || s.auth.prefer === 'none') return s.transport === 'stdio' ? '' : t('auth.none')
      const by = {}
      for (const a of data.agents) if (a.enabled !== false && a.role === 'sync' && s.auth.uses && s.auth.uses[a.id]) (by[s.auth.uses[a.id]] = by[s.auth.uses[a.id]] || []).push(a.name)
      return '🔑 ' + Object.entries(by).map(([m, names]) => t('auth.summary.' + m) + '（' + names.join('、') + '）').join(' · ')
    }
    function ServerEditor({ data, name, onClose, actions }) {
      const s = data.mcp.hub.find((x) => x.name === name) || { name: '', transport: 'http', url: '', auth: { prefer: 'oauth', uses: {} } }
      const isNew = !name
      const [f, setF] = useState(() => ({ name: s.name, transport: s.transport === 'stdio' ? 'stdio' : 'http', url: s.url || '', command: s.transport === 'stdio' ? s.endpoint : '', timeoutMs: s.timeoutMs ? String(s.timeoutMs) : '' }))
      const [prefer, setPrefer] = useState(s.auth ? s.auth.prefer : 'none')
      const [uses, setUses] = useState(() => ({ ...(s.auth && s.auth.uses) }))
      const [secretValue, setSecretValue] = useState('')
      const [envVar, setEnvVar] = useState((s.auth && s.auth.envVar) || '')
      const set = (k) => (e) => setF({ ...f, [k]: typeof e === 'string' ? e : e.target.value })
      const targets = data.agents.filter((a) => a.mcp && a.role === 'sync')
      const caps = (a) => a.auth || ['bearer']
      const auto = (a) => (caps(a).includes(prefer) ? prefer : prefer !== 'none' && caps(a).includes('bearer') ? 'bearer' : prefer === 'none' ? 'none' : 'unsupported')
      const pickFor = (a) => (uses[a.id] && caps(a).includes(uses[a.id]) ? uses[a.id] : auto(a))
      const note = (a, m) => (data.authNotes || {})[a.id + ':' + m] || ''
      const remote = f.transport !== 'stdio'
      const save = () => {
        const u = {}; for (const a of targets) if (uses[a.id] && uses[a.id] !== auto(a)) u[a.id] = uses[a.id]
        actions.post('/mcp/save', { originalName: isNew ? undefined : s.name, name: f.name, transport: f.transport, url: remote ? f.url : undefined, command: remote ? undefined : f.command, timeoutMs: f.timeoutMs,
          auth: remote ? { prefer, uses: u, secret: (s.auth && s.auth.secret) || f.name, secretValue: secretValue || undefined, envVar } : { prefer: 'none' } }, '已保存到 ~/.agents/mcp.json')
        onClose()
      }
      return h(Modal, { title: t('server.title') + (s.name ? ' · ' + s.name : ''), onClose, width: 'min(900px,94vw)',
        foot: [h('span', { key: 's', className: 'ah-sp' }), h(Btn, { key: 'c', onClick: onClose }, t('btn.cancel')), h(Btn, { key: 'o', pri: true, disabled: !f.name, onClick: save }, t('btn.save'))] },
        h('div', { className: 'ah-form' },
          h('label', null, t('server.name')), h('input', { className: 'ah-input', value: f.name, onChange: set('name') }),
          h('label', null, t('server.transport')), h('div', { className: 'ah-seg' }, ['http', 'stdio'].map((k) => h('button', { key: k, className: f.transport === k ? 'on' : '', onClick: () => setF({ ...f, transport: k }) }, k))),
          h('label', null, remote ? t('server.url') : t('server.command')), h('input', { className: 'ah-input ah-mono', value: remote ? f.url : f.command, onChange: set(remote ? 'url' : 'command'), placeholder: remote ? 'https://…' : 'uvx mcp-server-fetch' }),
          h('label', null, t('server.timeout')), h('input', { className: 'ah-input', value: f.timeoutMs, onChange: set('timeoutMs'), placeholder: '60000（毫秒，可留空）', style: { width: 200 } })),
        remote ? h('div', { className: 'ah-fieldset' }, h('span', { className: 'lg' }, t('auth.title')),
          h('div', { className: 'ah-form' },
            h('label', null, t('auth.prefer')), h(Select, { value: prefer, onChange: setPrefer, options: ['oauth', 'bearer', 'env', 'none'].map((m) => ({ value: m, label: t(AUTH_LABEL[m]) })) }),
            h('label', null, t('auth.secret')), h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
              h('input', { className: 'ah-input ah-mono', type: 'password', style: { flex: 1 }, value: secretValue, onChange: (e) => setSecretValue(e.target.value), placeholder: s.auth && s.auth.fingerprint ? '已保存 ' + s.auth.fingerprint + '（留空不修改）' : '粘贴 Bearer 令牌（写入 secrets.json）' }),
              h('span', { className: 'ah-muted', style: { whiteSpace: 'nowrap' } }, '${secret:' + ((s.auth && s.auth.secret) || f.name || '名称') + '}')),
            prefer === 'env' || Object.values(uses).includes('env') ? [h('label', { key: 'el' }, t('auth.env')), h('input', { key: 'ei', className: 'ah-input ah-mono', value: envVar, onChange: (e) => setEnvVar(e.target.value), placeholder: 'TAPD_TOKEN' })] : null),
          h('div', { className: 'ah-sub' }, t('auth.matrix')),
          h('table', { className: 'ah-table' }, h('tbody', null,
            h('tr', null, h('th', null, 'Agent'), h('th', null, t('auth.supports')), h('th', null, t('auth.uses')), h('th', null, t('auth.note'))),
            targets.map((a) => {
              const m = pickFor(a); const off = a.enabled === false
              return h('tr', { key: a.id, style: off ? { opacity: 0.55 } : undefined },
                h('td', null, h('span', { style: { display: 'inline-flex', gap: 8, alignItems: 'center' } }, h(Badge, { agent: a, size: 18 }), a.name, off ? h('span', { className: 'ah-tag' }, t('src.off')) : null)),
                h('td', null, h('div', { className: 'ah-chips' }, caps(a).map((c) => h(Chip, { key: c, state: c === m ? 'ok' : 'off', label: t(AUTH_LABEL[c]) })))),
                h('td', null, m === 'unsupported' ? h(Chip, { state: 'blocked', label: t('auth.unsupported') })
                  : h(Select, { value: m, onChange: (v) => setUses({ ...uses, [a.id]: v }), options: caps(a).map((c) => ({ value: c, label: t(AUTH_LABEL[c]) })) })),
                h('td', { className: 'ah-muted', style: { fontSize: 12 } }, note(a, m)))
            }))),
          h('div', { className: 'ah-sub' }, t('auth.compare') + '：' + t('auth.compareRule'))) : null)
    }

    function SecretsModal({ data, onClose, actions }) {
      const rows = data.mcp.hub.filter((x) => x.auth && x.auth.secret)
      return h(Modal, { title: t('btn.secrets'), onClose, width: 'min(720px,92vw)' },
        h('div', { className: 'ah-muted', style: { marginBottom: 10 } }, '真实密钥存放在 ~/.agents/secrets.json（权限 600），mcp.json 中只保存 ${secret:名称} 引用。这里只显示指纹，修改请在对应 Server 的编辑页粘贴新值。'),
        h('table', { className: 'ah-table' }, h('tbody', null,
          h('tr', null, h('th', null, '名称'), h('th', null, '指纹'), h('th', null, '被引用')),
          rows.length === 0 ? h('tr', null, h('td', { colSpan: 3, className: 'ah-muted' }, '暂无密钥')) : null,
          rows.map((r) => h('tr', { key: r.name }, h('td', { className: 'ah-mono' }, r.auth.secret), h('td', { className: 'ah-mono' }, r.auth.fingerprint || '（未设置）'),
            h('td', null, h(Btn, { sm: true, onClick: () => actions.open({ type: 'server', name: r.name, back: { type: 'secrets' } }) }, r.name)))))))
    }

    // ───────────────────────── 小表单弹窗 ─────────────────────────
    function FormModal({ title, fields, submit, onClose, note, okText }) {
      const [v, setV] = useState(() => Object.fromEntries(fields.map((f) => [f.key, f.value || ''])))
      return h(Modal, { title, onClose, width: 'min(640px,92vw)',
        foot: [h('span', { key: 'n', className: 'ah-muted' }, note || ''), h('span', { key: 's', className: 'ah-sp' }), h(Btn, { key: 'c', onClick: onClose }, t('btn.cancel')),
          h(Btn, { key: 'o', pri: true, onClick: () => { submit(v); onClose() } }, okText || t('btn.save'))] },
        h('div', { className: 'ah-form' }, fields.map((f) => [
          h('label', { key: f.key + 'l' }, f.label),
          f.multiline ? h('textarea', { key: f.key, className: 'ah-input ah-mono', style: { height: 140, padding: 8 }, value: v[f.key], placeholder: f.placeholder, onChange: (e) => setV({ ...v, [f.key]: e.target.value }) })
            : h('div', { key: f.key, style: { display: 'flex', gap: 8 } },
              h('input', { className: 'ah-input' + (f.mono ? ' ah-mono' : ''), style: { flex: 1 }, value: v[f.key], placeholder: f.placeholder, onChange: (e) => setV({ ...v, [f.key]: e.target.value }) }),
              f.browse ? h(Btn, { onClick: () => f.browse().then((d) => d && setV({ ...v, [f.key]: d })) }, t('btn.browse')) : null)])))
    }

    // ───────────────────────── 技能仓库 / 记录 ─────────────────────────
    function ReposTab({ data, actions }) {
      const [q, setQ] = useState('')
      return h(React.Fragment, null,
        h('div', { className: 'ah-bar' },
          h(Btn, { onClick: () => actions.post('/repos/refresh', {}) }, t('btn.checkUpdates')),
          h(Btn, { pri: true, onClick: () => actions.open({ type: 'addRepo' }) }, t('btn.addRepo')),
          h('span', { className: 'ah-sp' }),
          h('input', { className: 'ah-input search', placeholder: t('search.repos'), value: q, onChange: (e) => setQ(e.target.value) })),
        h('div', { className: 'ah-legend' }, t('repos.note')),
        data.repos.length === 0 ? h('div', { className: 'ah-empty' }, '还没有仓库。点「刷新并检查更新」读取 ~/.agents/.skill-lock.json 中的 GitHub 来源，或「添加仓库」。') : null,
        data.repos.map((r) => h(Group, { key: r.repo,
          head: [h('span', { key: 'n', className: 'ah-gname' }, r.repo), h('span', { key: 'c', className: 'ah-tag' }, r.skills.length),
            h('span', { key: 'p', className: 'ah-path' }, t('repos.branch') + ' ' + r.branch + ' · ' + r.commit)] },
          r.skills.filter((s) => matches(q, s.name, s.description)).map((s) => h('div', { key: s.name, className: 'ah-row' },
            h('div', { className: 'main' }, h('div', { className: 'nm' }, s.name), h('div', { className: 'ds' }, s.description)),
            s.state ? h(Chip, { state: s.state === 'installed' ? 'ok' : 'update', label: t('st.' + s.state) }) : null,
            s.state === 'update' ? h(Btn, { sm: true, onClick: () => actions.open({ type: 'repoUpdate', name: s.name }) }, t('btn.previewUpdate'))
              : s.state ? h(Btn, { sm: true, onClick: () => actions.open({ type: 'skill', name: s.name }) }, t('btn.view'))
              : h(Btn, { sm: true, pri: true, onClick: () => actions.post('/repos/install', { repo: r.repo, name: s.name }) }, t('btn.install')))))))
    }

    function RecordsTab({ data, actions }) {
      const [sub, setSub] = useState('sync')
      return h(React.Fragment, null,
        h('div', { className: 'ah-bar' },
          h('div', { className: 'ah-seg' }, ['sync', 'trash'].map((k) => h('button', { key: k, className: sub === k ? 'on' : '', onClick: () => setSub(k) }, t('records.' + k)))),
          h('span', { className: 'ah-muted' }, sub === 'sync' ? t('records.backup') : t('records.trashNote'))),
        sub === 'sync'
          ? h('table', { className: 'ah-table' },
            h('tbody', null, h('tr', null, h('th', null, '时间'), h('th', null, '内容'), h('th', null, '结果'), h('th', null, '')),
              data.records.length === 0 ? h('tr', null, h('td', { colSpan: 4, className: 'ah-muted' }, '暂无同步记录')) : null,
              data.records.map((r) => h('tr', { key: r.id }, h('td', { className: 'ah-muted' }, r.time), h('td', null, r.summary),
                h('td', null, h(Chip, { state: r.ok ? 'ok' : 'conflict', label: r.ok ? '成功 · 已备份' : '失败' })),
                h('td', null, r.rolledBack ? h('span', { className: 'ah-muted' }, '已回滚') : h(Btn, { sm: true, onClick: () => actions.post('/records/rollback', { id: r.id }, '已回滚') }, t('btn.rollback')))))))
          : h('table', { className: 'ah-table' },
            h('tbody', null, h('tr', null, h('th', null, '名称'), h('th', null, '类型'), h('th', null, '删除时间'), h('th', null, '')),
              data.trash.length === 0 ? h('tr', null, h('td', { colSpan: 4, className: 'ah-muted' }, '回收站是空的')) : null,
              data.trash.map((r) => h('tr', { key: r.id }, h('td', null, r.name), h('td', { className: 'ah-muted' }, r.type), h('td', { className: 'ah-muted' }, r.time),
                h('td', null, h(Btn, { sm: true, onClick: () => actions.post('/trash/restore', { id: r.id }) }, t('btn.restore'))))))))
    }

    // ───────────────────────── 弹窗 ─────────────────────────
    function Modal({ title, extra, children, foot, onClose, width }) {
      useEffect(() => {
        const k = (e) => e.key === 'Escape' && onClose()
        document.addEventListener('keydown', k)
        return () => document.removeEventListener('keydown', k)
      }, [onClose])
      return h('div', { className: 'ah-mask', onMouseDown: (e) => e.target === e.currentTarget && onClose() },
        h('div', { className: 'ah-modal', style: width ? { width } : undefined, role: 'dialog' },
          h('div', { className: 'ah-mhead' }, h('b', null, title), extra, h('span', { className: 'ah-sp' }), h(Btn, { onClick: onClose }, t('btn.close'))),
          h('div', { className: 'ah-mbody' }, children),
          foot ? h('div', { className: 'ah-mfoot' }, foot) : null))
    }

    function SkillDetail({ data, name, onClose, actions }) {
      const [detail, setDetail] = useState(null)
      useEffect(() => { api('/skills/detail?name=' + encodeURIComponent(name)).then(setDetail, () => setDetail({ error: true })) }, [name])
      const s = data.skills.hub.find((x) => x.name === name)
      return h(Modal, { title: name, extra: h(Chip, { state: 'ok', label: '真源 ~/.agents' }), onClose },
        h('div', { className: 'ah-sub', style: { marginTop: 0 } }, t('detail.status')),
        h('table', { className: 'ah-table' }, h('tbody', null,
          h('tr', null, ['detail.agent', 'detail.way', 'detail.state', 'detail.path'].map((k) => h('th', { key: k }, t(k))), h('th', null, '')),
          data.agents.filter((a) => a.role === 'sync' && a.skills.mode !== 'none').map((a) => {
            const st = s ? s.status[a.id] : 'off'
            return h('tr', { key: a.id }, h('td', null, h('span', { style: { display: 'inline-flex', gap: 8, alignItems: 'center' } }, h(Badge, { agent: a, size: 18 }), a.name)),
              h('td', null, t('mode.' + a.skills.mode)), h('td', null, h(Chip, { state: st })),
              h('td', { className: 'ah-mono ah-muted' }, a.skills.mode === 'native' ? data.hub.skillsDir + '/' + name : a.skills.dir + '/' + name),
              h('td', null, a.skills.mode === 'link' && st === 'ok' ? h(Btn, { sm: true, onClick: () => actions.post('/skills/unlink', { agent: a.id, name }) }, t('btn.removeLink'))
                : ['differs', 'target-changed', 'conflict'].includes(st) ? h(Btn, { sm: true, onClick: () => actions.open({ type: 'diff', kind: 'skill', name, agent: a.id }) }, t('btn.diff')) : null))
          }))),
        h('div', { className: 'ah-sub' }, t('detail.diagnose')),
        h('div', null, detail && detail.diagnostics && detail.diagnostics.length ? detail.diagnostics.join('；') : t('detail.noIssue')),
        h('div', { className: 'ah-sub' }, t('detail.body'), ' ', h(Btn, { sm: true, onClick: () => detail && navigator.clipboard && navigator.clipboard.writeText(detail.body || '') }, t('btn.copyBody'))),
        h('pre', { className: 'ah-pre', style: { maxHeight: 260 } }, detail ? (detail.body || '') : t('loading')))
    }

    function DiffDrawer({ data, req, onClose, actions }) {
      const [d, setD] = useState(null)
      const [pick, setPick] = useState({})
      useEffect(() => { api('/diff', req).then((x) => { setD(x); setPick(Object.fromEntries((x.fields || []).map((f) => [f.field, f.default]))) }, (e) => setD({ error: e.message })) }, [req.name, req.agent])
      const agent = agentById(data, req.agent)
      if (!d) return null
      const three = !!d.baseTime
      const verdict = (v) => h(Chip, { state: { same: 'ok', eq: 'ok', hub: 'hub-changed', target: 'target-changed', both: 'conflict', diff: 'differs' }[v], label: t('v.' + v) })
      return h('div', { className: 'ah-mask', style: { justifyContent: 'flex-end' }, onMouseDown: (e) => e.target === e.currentTarget && onClose() },
        h('div', { className: 'ah-drawer' },
          h('div', { className: 'ah-mhead' }, h('b', null, t('diff.title', { name: req.name, agent: agent.name })), h(Chip, { state: d.state }),
            h('span', { className: 'ah-muted' }, three ? t('diff.withBase', { time: d.baseTime }) : t('diff.noBase')), h('span', { className: 'ah-sp' }), h(Btn, { onClick: onClose }, t('btn.close'))),
          h('div', { className: 'ah-mbody', style: { flex: 1 } },
            h('table', { className: 'ah-table' }, h('tbody', null,
              h('tr', null, h('th', null, t('diff.field')), three ? h('th', null, t('diff.base')) : null, h('th', null, 'Hub'), h('th', null, agent.name), h('th', null, t('diff.verdict')), h('th', null, t('diff.pick'))),
              d.fields.map((f) => h('tr', { key: f.field },
                h('td', null, f.field), three ? h('td', { className: 'ah-mono' }, f.base ?? '—') : null,
                h('td', { className: 'ah-mono' }, f.hub ?? '—'), h('td', { className: 'ah-mono' }, f.target ?? '—'),
                h('td', null, verdict(f.verdict)),
                h('td', null, f.verdict === 'same' || f.verdict === 'eq' ? h('span', { className: 'ah-muted' }, '—')
                  : h(Select, { value: pick[f.field], onChange: (v) => setPick({ ...pick, [f.field]: v }), options: [{ value: 'hub', label: 'Hub' }, { value: 'target', label: agent.name }] })))))),
            h('div', { className: 'ah-sub' }, t('diff.rule')),
            h('div', { className: 'ah-grid2' },
              h('div', null, h('div', { className: 'ah-sub', style: { marginTop: 4 } }, t('diff.writeTarget', { path: d.targetPath })), h(DiffText, { lines: d.targetPatch })),
              h('div', null, h('div', { className: 'ah-sub', style: { marginTop: 4 } }, t('diff.writeHub')), h(DiffText, { lines: d.hubPatch })))),
          h('div', { className: 'ah-mfoot' }, h('span', { className: 'ah-muted' }, t('diff.masked')), h('span', { className: 'ah-sp' }),
            h(Btn, { onClick: () => setPick(Object.fromEntries(d.fields.map((f) => [f.field, 'target']))) }, t('btn.useTarget', { agent: agent.name })),
            h(Btn, { onClick: () => setPick(Object.fromEntries(d.fields.map((f) => [f.field, 'hub']))) }, t('btn.useHub')),
            h(Btn, { onClick: () => { actions.post('/ignore', req); onClose() } }, t('btn.ignore')),
            h(Btn, { pri: true, onClick: () => { actions.post('/resolve', { ...req, pick }, '已合并，已备份'); onClose() } }, t('btn.merge')))))
    }
    function DiffText({ lines }) {
      return h('pre', { className: 'ah-pre' }, (lines || []).map((l, i) => h('span', { key: i, className: l[0] === '+' ? 'add' : l[0] === '-' ? 'del' : '' }, l + (l[0] === '+' || l[0] === '-' ? '' : '\n'))))
    }

    function PlanModal({ data, onClose, actions }) {
      const [plan, setPlan] = useState(null)
      const [sel, setSel] = useState({})
      useEffect(() => { api('/plan', {}).then((p) => { setPlan(p); setSel(Object.fromEntries(p.items.map((i) => [i.id, !i.actions.includes('skip')]))) }) }, [])
      if (!plan) return null
      const n = plan.items.filter((i) => sel[i.id]).length
      return h(Modal, { title: t('plan.title', { count: plan.items.length }), onClose, width: 'min(860px,94vw)',
        foot: [h('span', { key: 's', className: 'ah-sp' }), h(Btn, { key: 'c', onClick: onClose }, t('btn.cancel')),
          h(Btn, { key: 'x', pri: true, disabled: !n, onClick: () => { actions.post('/apply', { ids: plan.items.filter((i) => sel[i.id]).map((i) => i.id), planId: plan.id }, '同步完成，已备份'); onClose() } }, t('btn.execute', { count: n }))] },
        plan.items.filter((i) => !i.actions.includes('skip')).length === 0 ? h('div', { className: 'ah-callout', style: { marginBottom: 10 } }, '所有 Agent 都与 Hub 一致，没有需要同步的内容。') : null,
        h('table', { className: 'ah-table' }, h('tbody', null,
          h('tr', null, h('th', { style: { width: 28 } }), h('th', null, t('plan.target')), h('th', null, t('plan.action')), h('th', null, t('plan.object'))),
          plan.items.map((i) => {
            const a = agentById(data, i.agent)
            return h('tr', { key: i.id },
              h('td', null, h('input', { type: 'checkbox', className: 'ah-check', checked: !!sel[i.id], disabled: i.actions.includes('skip'), onChange: (e) => setSel({ ...sel, [i.id]: e.target.checked }) })),
              h('td', null, h('span', { style: { display: 'inline-flex', gap: 8, alignItems: 'center' } }, i.agent === 'hub' ? null : h(Badge, { agent: a, size: 18 }), h('span', { className: 'ah-mono' }, i.target))),
              h('td', null, i.actions.map((x) => h('span', { key: x, style: { marginRight: 4 } }, h(Chip, { state: { add: 'missing', update: 'hub-changed', link: 'missing', copy: 'missing', unlink: 'conflict', remove: 'conflict', writeback: 'target-changed', skip: 'excluded' }[x], label: t('act.' + x) })))),
              h('td', null, i.object))
          }))),
        h('div', { className: 'ah-grid2', style: { marginTop: 12 } },
          h('div', { className: 'ah-muted', style: { lineHeight: 1.8 } }, '✔ ' + t('plan.backup'), h('br'),
            plan.skippedConflicts.length ? ['✔ ' + t('plan.skipConflict', { names: plan.skippedConflicts.join('、') }), h('br', { key: 'b' })] : null, '✔ ' + t('plan.manage')),
          h('div', { className: 'ah-muted', style: { lineHeight: 1.8 } }, plan.reload.length ? '⚠ ' + t('plan.reload', { agents: plan.reload.join('、') }) : null)))
    }

    function ImportModal({ data, onClose, actions }) {
      const [d, setD] = useState(null)
      const [src, setSrc] = useState({})
      useEffect(() => { api('/mcp/import-preview', {}).then((x) => { setD(x); setSrc(Object.fromEntries(x.servers.map((s) => [s.name, s.suggest]))) }) }, [])
      if (!d) return null
      return h(Modal, { title: t('import.title'), onClose, width: 'min(900px,94vw)',
        foot: [h('span', { key: 's', className: 'ah-sp' }), h(Btn, { key: 'c', onClick: onClose }, t('btn.cancel')),
          h(Btn, { key: 'x', pri: true, onClick: () => { actions.post('/mcp/import', { sources: src }, '已导入到 ~/.agents/mcp.json'); onClose() } }, t('btn.save'))] },
        h('div', { className: 'ah-muted', style: { marginBottom: 10 } }, t('import.note')),
        h('table', { className: 'ah-table' }, h('tbody', null,
          h('tr', null, h('th', null, t('import.server')), h('th', null, t('import.found')), h('th', null, t('import.diff')), h('th', null, t('import.source'))),
          d.servers.map((s) => h('tr', { key: s.name },
            h('td', null, h('div', { style: { fontWeight: 600 } }, s.name), h('div', { className: 'ah-muted ah-mono' }, s.endpoint)),
            h('td', null, h('div', { className: 'ah-chips', style: { flexWrap: 'wrap' } }, s.found.map((id) => h(Chip, { key: id, state: 'ok', agent: agentById(data, id), label: agentById(data, id).name })))),
            h('td', { className: 'ah-muted', style: { fontSize: 12 } }, s.diff || '一致'),
            h('td', null, s.excluded ? h(Chip, { state: 'excluded' }) : h(Select, { value: src[s.name], onChange: (v) => setSrc({ ...src, [s.name]: v }), options: [...s.found.map((id) => ({ value: id, label: agentById(data, id).name })), { value: 'skip', label: '不导入' }] })))))))
    }

    // ───────────────────────── 主面板 ─────────────────────────
    function App({ initial }) {
      const boot = initial || {}
      const [tab, setTab] = useState(boot.tab || 'skills')
      const [data, setData] = useState(null)
      const [err, setErr] = useState(null)
      const [modal, setModal] = useState(boot.modal || null)
      const [toast, setToast] = useState(null)
      const [busy, setBusy] = useState(false)
      const load = useCallback(() => api('/state').then((d) => { setData(d); setErr(null) }, (e) => setErr(e.message)), [])
      useEffect(() => { load() }, [load])
      const actions = useMemo(() => ({
        open: (m) => setModal(m),
        _bind: null,
        post: (p, body, msg) => { setBusy(true); return api(p, body).then((r) => { setToast(msg || '已完成'); return load().then(() => r) }, (e) => { setToast('失败：' + e.message) }).finally(() => setBusy(false)) },
        pick: () => (pickDirectory ? pickDirectory() : Promise.resolve(null)),
      }), [load])
      offHead.actions = actions
      const close = () => setModal(modal && modal.back ? modal.back : null)
      useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 3200); return () => clearTimeout(id) }, [toast])
      if (!data) return h('div', { className: 'ah' }, h('style', null, CSS), h('div', { className: 'ah-in ah-empty' }, err ? t('error', { msg: err }) : t('loading')))
      const tabs = [['skills', data.counts.skills], ['mcp', data.counts.mcp], ['repos', data.counts.updates], ['records', 0]]
      return h('div', { className: 'ah' }, h('style', null, CSS),
        h('div', { className: 'ah-in' },
          h('div', { className: 'ah-title' }, h('h1', null, t('title')), h('span', { className: 'ah-ver' }, 'v' + data.version), h('span', { className: 'ah-sp' }),
            h(Btn, { onClick: load }, '↻ ' + t('btn.refresh')),
            h(Btn, { pri: true, onClick: () => setModal({ type: 'plan' }) }, t('btn.plan') + (data.counts.pending ? ' (' + data.counts.pending + ')' : ''))),
          h('div', { className: 'ah-desc' }, t('desc')),
          h('div', { className: 'ah-tabs', role: 'tablist' }, tabs.map(([k, n]) => h('button', { key: k, role: 'tab', className: tab === k ? 'on' : '', onClick: () => setTab(k) }, t('tab.' + k), n ? h('span', { className: 'n' }, n) : null))),
          err ? h('div', { className: 'ah-legend', style: { color: 'var(--dsw-alias-state-error-primary)' } }, t('error', { msg: err })) : null,
          (data.errors || []).length ? h('div', { className: 'ah-callout', style: { marginBottom: 12, color: 'var(--dsw-alias-state-warn-label)' } }, '读取失败：' + data.errors.join('；')) : null,
          tab === 'skills' ? h(SkillsTab, { data, actions }) : null,
          tab === 'mcp' ? h(McpTab, { data, actions }) : null,
          tab === 'repos' ? h(ReposTab, { data, actions }) : null,
          tab === 'records' ? h(RecordsTab, { data, actions }) : null),
        modal && modal.type === 'skill' ? h(SkillDetail, { data, name: modal.name, onClose: close, actions }) : null,
        modal && modal.type === 'diff' ? h(DiffDrawer, { data, req: modal, onClose: close, actions }) : null,
        modal && modal.type === 'plan' ? h(PlanModal, { data, onClose: close, actions }) : null,
        modal && modal.type === 'sources' ? h(SourcesModal, { data, focus: modal.focus, onClose: close, actions }) : null,
        modal && modal.type === 'server' ? h(ServerEditor, { data, name: modal.name, onClose: close, actions }) : null,
        modal && modal.type === 'import' ? h(ImportModal, { data, onClose: close, actions }) : null,
        modal && modal.type === 'path' ? h(FormModal, { title: t('btn.changeDir') + ' · ' + agentById(data, modal.id).name, onClose: close, note: '只改插件读取位置，不移动文件',
          fields: [{ key: 'path', label: modal.which === 'mcp' ? t('src.mcpFile') : t('src.skillsDir'), value: modal.value, mono: true, browse: actions.pick }],
          submit: (v) => actions.post('/sources/path', { id: modal.id, which: modal.which, path: v.path }, '已更新路径') }) : null,
        modal && modal.type === 'createSkill' ? h(FormModal, { title: t('btn.create'), onClose: close, note: '写入 ~/.agents/skills/<名称>/SKILL.md', okText: t('btn.create'),
          fields: [{ key: 'name', label: '名称', placeholder: 'my-skill（kebab-case）', mono: true }, { key: 'description', label: '描述', placeholder: '什么时候使用这个技能' }, { key: 'body', label: '正文', multiline: true, placeholder: '# 我的技能\n…' }],
          submit: (v) => actions.post('/skills/create', v, '已创建技能') }) : null,
        modal && modal.type === 'importSkill' ? h(FormModal, { title: t('btn.import'), onClose: close, note: '复制到 ~/.agents/skills', okText: t('btn.import'),
          fields: [{ key: 'dir', label: '技能目录', placeholder: '包含 SKILL.md 的目录', mono: true, browse: actions.pick }],
          submit: (v) => actions.post('/skills/import', v, '已导入技能') }) : null,
        modal && modal.type === 'addRepo' ? h(FormModal, { title: t('btn.addRepo'), onClose: close, okText: t('btn.add'),
          fields: [{ key: 'repo', label: 'GitHub 仓库', placeholder: 'obra/superpowers 或 https://github.com/…', mono: true }],
          submit: (v) => actions.post('/repos/add', v, '已添加仓库') }) : null,
        modal && modal.type === 'repoUpdate' ? h(FormModal, { title: t('btn.previewUpdate') + ' · ' + modal.name, onClose: close, okText: '更新（自动备份）', note: '用仓库最新版本覆盖 ~/.agents/skills/' + modal.name,
          fields: [], submit: () => { const r = data.repos.find((x) => x.skills.some((k) => k.name === modal.name)); r && actions.post('/repos/install', { repo: r.repo, name: modal.name }, '已更新') } }) : null,
        modal && modal.type === 'secrets' ? h(SecretsModal, { data, onClose: close, actions }) : null,
        toast ? h('div', { style: { position: 'fixed', left: '50%', bottom: 28, transform: 'translateX(-50%)', background: 'var(--dsw-alias-toast-bg, #222)', color: 'var(--dsw-alias-toast-label, #fff)', padding: '8px 16px', borderRadius: 999, fontSize: 13, zIndex: 60 } }, toast) : null,
        busy ? h('div', { style: { position: 'fixed', right: 24, top: 18, fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', zIndex: 60 } }, '处理中…') : null)
    }

    function SidebarIcon({ size = 16, active }) {
      return h('svg', { viewBox: '0 0 16 16', width: size, height: size, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', 'aria-hidden': true },
        h('circle', { cx: 8, cy: 8, r: 2.2, fill: active ? 'currentColor' : 'none' }),
        h('circle', { cx: 3, cy: 3.5, r: 1.3 }), h('circle', { cx: 13, cy: 3.5, r: 1.3 }), h('circle', { cx: 3, cy: 12.5, r: 1.3 }), h('circle', { cx: 13, cy: 12.5, r: 1.3 }),
        h('path', { d: 'M4.1 4.4 6.3 6.6M11.9 4.4 9.7 6.6M4.1 11.6l2.2-2.2M11.9 11.6 9.7 9.4' }))
    }

    return {
      inject: ['slots', 'locale'],
      App, SidebarIcon, ZH,
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: { ...ZH, ...EN } }))
        translate = ctx.locale.bind(NS)
        if (typeof ctx.inject === 'function') ctx.inject(['uiWorkspace'], (c) => { pickDirectory = () => c.uiWorkspace.pickDirectory(); return () => { pickDirectory = null } })
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'agent-hub', order: 3, label: () => t('title') }, SidebarIcon))
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'agent-hub' }, () => h(App, null)))
      },
    }
  },
})
