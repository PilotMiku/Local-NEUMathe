Local-NEUMathe · 本地刷题与知识复习网站

完整使用说明、题库更新步骤、源码结构及网站预览图见 README.md。

当前题库
  高等数学：7 章、122 份 PDF、3010 题。
  线性代数：5 章、10 份 PDF、491 题。
  合计：12 章、132 份 PDF、3501 题。
  原 PDF 未修改；7 道高数原题未附解析，页面如实标注。
  原始资料统一位于 question-bank/，按高等数学、线性代数和习概分类。

习概知识点
  14 份 Markdown 整理为 20 篇笔记，另有 2 份 PDF 汇编，保留 16 份原 PDF。
  从首页或导航进入“习概知识点”，支持原文阅读、搜索、目录、收藏和已读记录。
  更新资料后执行 npm run index:knowledge，并重新启动服务。
  内容保留原文，知识点不计入数学题量。

运行
  python3 -m venv .tools/pdf
  .tools/pdf/bin/python -m pip install -r requirements.txt
  .tools/pdf/bin/python server.py --port 4178
  打开 http://127.0.0.1:4178/
  macOS 可使用 启动网站.command / 停止网站.command 管理后台服务。

更新题库
  将新增 PDF 放入 question-bank/ 并在 data/catalog.json 登记，然后停止网站并执行：
  .tools/pdf/bin/python scripts/index_pdf_bank.py
  重启网站并刷新页面。
  已安装的 PDF 题库会按版本升级，并保留已有题目的学习记录。
  移动或改名 PDF 时更新 path，保留固定 id 和原题编号，即可保持学习记录。

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
