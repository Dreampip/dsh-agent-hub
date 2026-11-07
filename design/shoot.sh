#!/usr/bin/env bash
# 用无头浏览器渲染 design/index.html（即真实 lib/client.js + fixtures），输出 design/shots/*.png
set -euo pipefail
cd "$(dirname "$0")"
S="${CHROME:-$(ls -d ~/.cache/puppeteer/chrome-headless-shell/*/*/chrome-headless-shell 2>/dev/null | head -1)}"
shot() { # name height query
  "$S" --no-sandbox --disable-gpu --hide-scrollbars --allow-file-access-from-files --user-data-dir=/tmp/ah-shoot \
    --window-size=1440,"$2" --virtual-time-budget=4000 --screenshot="$PWD/shots/$1.png" "file://$PWD/index.html?$3" >/dev/null 2>&1
  echo "shots/$1.png"
}
mkdir -p shots
enc() { python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$1"; }
shot 1-skills 1500 'tab=skills'
shot 2-mcp 1420 'tab=mcp'
shot 3-sources 1120 "tab=skills&modal=$(enc '{"type":"sources"}')"
shot 4-server-auth 1060 "tab=mcp&modal=$(enc '{"type":"server","name":"tapd"}')"
shot 5-skill-detail 900 "tab=skills&modal=$(enc '{"type":"skill","name":"kier-adp-work-knowledge-loop"}')"
shot 6-diff 900 "tab=mcp&modal=$(enc '{"type":"diff","kind":"mcp","name":"kier-adp-kb","agent":"codex"}')"
shot 7-plan 900 "tab=mcp&modal=$(enc '{"type":"plan"}')"
shot 8-import 900 "tab=mcp&fresh=1&modal=$(enc '{"type":"import"}')"
shot 10-skills-dark 1500 'tab=skills&theme=dark'
shot 11-mcp-first-run 1100 'tab=mcp&fresh=1'
shot 12-skills-expanded 900 'tab=skills&open=skills:hub,skills:tclaude'
shot 13-legend 900 'tab=skills&legend=1'
shot 14-mcp-expanded 1100 'tab=mcp&open=mcp:hub,mcp:codex'
shot 15-how 1000 "tab=mcp&modal=$(enc '{"type":"how"}')"
shot 16-settings 900 "tab=mcp&modal=$(enc '{"type":"settings"}')"
shot 17-readonly 900 'tab=mcp&readonly=1&open=mcp:hub'
