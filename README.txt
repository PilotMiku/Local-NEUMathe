Local-NEUMathe · 本地数学刷题网站

完整使用说明、题库更新步骤、源码结构及网站预览图见 README.md。

当前题库
  高等数学：7 章、122 份 PDF、3010 题。
  线性代数：5 章、10 份 PDF、491 题。
  合计：12 章、132 份 PDF、3501 题。
  原 PDF 未修改；7 道高数原题未附解析，页面如实标注。

运行
  python3 -m venv .tools/pdf
  .tools/pdf/bin/python -m pip install -r requirements.txt
  .tools/pdf/bin/python server.py --port 4178
  打开 http://127.0.0.1:4178/
  macOS 可使用 启动网站.command / 停止网站.command 管理后台服务。

更新题库
  在 data/catalog.json 登记新增 PDF，然后停止网站并执行：
  .tools/pdf/bin/python scripts/index_pdf_bank.py
  重启网站并刷新页面。
  已安装的 PDF 题库会按版本升级，并保留已有题目的学习记录。
  请保持已有 PDF 的相对路径和题目编号稳定。

备份
  使用题库管理中的“导出完整备份”。
  迁移时需要同时保留仓库原 PDF，备份 JSON 不含 PDF 本身。
  改名后沿用旧版浏览器存储键，兼容旧版备份。

测试
  npm test
  npm run test:pdf
  npm ci
  npx playwright install chromium
  npm run test:browser
  浏览器测试前需启动本地服务器；macOS 已安装 Chrome 时无需另装浏览器。
