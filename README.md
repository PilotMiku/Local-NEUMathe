# Local-NEUMathe

NeuMathe 风格的本地高等数学刷题网站，包含 7 章、122 份 PDF、3010 道原题。
支持章节练习、自动判分、原题解析、错题本、收藏、模拟考试和学习进度保存。

题目、公式、图形与解析按 PDF 原版面显示，答案与原 PDF 标记保持一致。
其中 7 道题的原 PDF 未附解析，页面会如实标注。

## 本地运行

克隆仓库后，在项目目录创建 Python 环境并安装依赖：

```sh
python3 -m venv .tools/pdf
.tools/pdf/bin/pip install -r requirements.txt
.tools/pdf/bin/python server.py --port 4178
```

打开 <http://127.0.0.1:4178/>。
macOS 安装依赖后也可双击 `启动网站.command`，通过 `停止网站.command` 停止服务。

服务仅监听本机，无需前端构建或 NeuMathe 在线账号。学习记录保存在当前浏览器中，
可通过“题库管理”导出和恢复完整备份。

## 文件

- `dist/`：前端源码、公式资源和题库数据。
- `server.py`：本地服务器、PDF 题图渲染及原文件访问。
- `scripts/`：题库索引和 macOS 服务管理。
- `data/`：原 PDF 清单、校验信息和渲染索引。
- 七个章节目录：网站运行所需的原始 PDF。
- `tests/`：核心逻辑和浏览器流程验证。

核心测试：`npm test`（需要 Node.js）。
浏览器测试的本机依赖说明及完整使用文档见 [README.txt](README.txt)。
