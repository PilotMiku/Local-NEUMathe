import {
  BANK_FORMAT,
  BACKUP_FORMAT,
  emptyBank,
  emptyState,
  normalizeBank,
  judge,
  hasResponse,
  shuffle,
  filterQuestions,
  createPractice,
  recordAttempt,
  createExam,
  finishExam,
  dayKey,
  stats,
  validateBackup,
  textOnly,
} from "./core.mjs";
import { openStorage, saveStorage } from "./storage.mjs";

let bank = emptyBank(),
  state = emptyState(),
  storageReady = false,
  saving = Promise.resolve(),
  mobileOpen = false;
let toastTimer,
  timerInterval,
  fileMode = "bank",
  pendingImport = null,
  autoSubmitting = false;
const app = document.querySelector("#app"),
  dialog = document.querySelector("#dialog");
const names = {
  single: "单选题",
  multiple: "多选题",
  boolean: "判断题",
  fill: "填空题",
  solution: "解答题",
};
const difficultyNames = { easy: "基础", medium: "进阶", hard: "挑战" };
const DEFAULT_QUESTION_COUNT = 25;
const routes = {
  dashboard: "学习概览",
  practice: "题库练习",
  exams: "模拟考试",
  exam: "模拟考试",
  review: "错题本",
  favorites: "我的收藏",
  stats: "学习统计",
  library: "题库管理",
};
const paths = {
  home: "M3 10 12 3l9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z M9 21v-8h6v8",
  book: "M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-3H4z M13 7a3 3 0 0 1 3-3h5v14h-4a4 4 0 0 0-4 3",
  exam: "M7 4h10v3H7z M7 5H5v16h14V5h-2 M8 12h8 M8 16h5",
  mistake: "M14 3H5v18h14V8z M14 3v5h5 M9 12l6 5 M15 12l-6 5",
  star: "m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4-5.7-3-5.7 3 1.1-6.4-4.6-4.5 6.4-.9Z",
  chart: "M4 20V10 M10 20V4 M16 20v-7 M22 20H2",
  folder: "M3 7V4h6l2 3h10v13H3z",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  chevron: "m9 5 7 7-7 7",
  search: "M20 20l-5-5 M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14",
  moon: "M20 14A9 9 0 0 1 10 3a9 9 0 1 0 10 11",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5 19 19 M19 5l-1.5 1.5 M6.5 17.5 5 19",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  close: "M6 6l12 12 M18 6 6 18",
  check: "m5 12 4 4L19 6",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2",
  flame:
    "M13 3c2 5 6 6 6 11a7 7 0 0 1-14 0c0-3 2-5 4-7 0 3 1 4 2 4 2-2 2-5 2-8Z",
  upload: "M12 16V3 M7 8l5-5 5 5 M4 14v6h16v-6",
  download: "M12 3v13 M7 11l5 5 5-5 M4 16v5h16v-5",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M19 5l-2 2 M7 17l-2 2",
  leaf: "M20 3C9 3 3 8 5 16c8 5 15-2 15-13Z M4 21 15 9",
  target:
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
  plus: "M12 4v16 M4 12h16",
  refresh: "M20 7v5h-5 M20 12a8 8 0 1 0-2 6",
  lock: "M6 10h12v11H6z M8 10V6a4 4 0 0 1 8 0v4",
  spark: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z",
  back: "M19 12H5 M11 6l-6 6 6 6",
  trash: "M4 6h16 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 11v6 M12 7h.01",
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
};
function icon(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] ?? paths.book}"/></svg>`;
}
function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
const attr = esc;
function button(label, action, extra = "", className = "btn") {
  return `<button type="button" class="${className}" data-action="${action}" ${extra}>${label}</button>`;
}
function route() {
  const [path, query = ""] = (location.hash.slice(1) || "/").split("?");
  return {
    parts: path.split("/").filter(Boolean),
    query: new URLSearchParams(query),
    page: path === "/" ? "dashboard" : path.split("/")[1],
  };
}
function go(path) {
  dialog.close();
  mobileOpen = false;
  if (location.hash === `#${path}`) render();
  else location.hash = path;
}
function subject(id) {
  return bank.subjects.find((s) => s.id === id);
}
function chapter(q) {
  return (
    subject(q.subjectId)?.chapters.find((c) => c.id === q.chapterId)?.name ??
    q.chapterId
  );
}
function qById(id) {
  return bank.questions.find((q) => q.id === id);
}
function shortDate(at) {
  return new Date(at).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function toast(message) {
  clearTimeout(toastTimer);
  const el = document.querySelector("#toast");
  el.textContent = message;
  el.classList.add("show");
  toastTimer = setTimeout(() => el.classList.remove("show"), 3500);
}
function persist() {
  if (!storageReady)
    return Promise.reject(new Error("当前浏览器无法保存学习数据"));
  saving = saveStorage(bank, state);
  saving.catch(() => toast("保存失败，请检查浏览器可用空间，并导出备份"));
  return saving;
}
function head(title, description, action = "") {
  return `<header class="page-head"><div><div class="eyebrow">LOCAL-NEUMATHE · 本地学习空间</div><h1>${title}</h1>${description ? `<p class="subtitle">${description}</p>` : ""}</div>${action}</header>`;
}

function empty(
  title,
  description,
  action = `${button(`${icon("upload", 15)} 导入原题`, "choose-file", "", "btn primary")}`,
) {
  return `<div class="empty"><div class="empty-symbol">${icon("book", 27)}</div><h2>${title}</h2><p>${description}</p><div class="flex">${action}</div></div>`;
}
function bankNotice() {
  return !bank.questions.length
    ? `<div class="notice">${icon("info", 17)}<div><strong>题库准备中，学习空间已就绪</strong><p>导入 NeuMathe 原题后，题目、答案与解析将按原始数据展示。</p></div><a class="btn small" href="#/library">去导入 ${icon("arrow", 12)}</a></div>`
    : "";
}
function heatmap() {
  const counts = new Map();
  for (const a of state.attempts)
    counts.set(dayKey(a.at), (counts.get(dayKey(a.at)) ?? 0) + 1);
  const end = new Date();
  end.setDate(end.getDate() + ((7 - end.getDay()) % 7));
  let cells = "";
  for (let i = 104; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const count = counts.get(dayKey(d)) ?? 0;
    const future = d.getTime() > Date.now() + 86400000;
    const level =
      count >= 20 ? 4 : count >= 10 ? 3 : count >= 3 ? 2 : count ? 1 : 0;
    cells += `<span class="heat-cell ${level ? "l" + level : ""}" title="${dayKey(d)} · ${count} 题" ${future ? 'style="opacity:.25"' : ""}></span>`;
  }
  return `<div class="heatmap" role="img" aria-label="近十五周学习记录">${cells}</div><div class="heat-footer"><span>每一小格，都算数</span><span class="legend">少 <i></i><i></i><i></i> 多</span></div>`;
}
function dashboard() {
  const s = stats(state);
  const parents = bank.subjects.flatMap((s) =>
    s.chapters.filter((c) => !c.parentId),
  );
  const activeSubject = subject(getFilters().subjectId) ?? bank.subjects[0];
  return `<section class="local-hero"><div class="hero-copy"><span class="pill blue">${icon("spark", 14)} Local-NEUMathe</span><h1>学数学，<br><span>从每一道题开始。</span></h1><p>跟着章节梳理知识，在练习中找到思路。<br>${esc(bank.subjects.map((s) => s.name).join("、"))}题库，已经准备就绪。</p><div class="flex"><a class="btn primary" href="#/practice">开始刷题 ${icon("arrow", 16)}</a>${state.practice ? button("继续上次练习", "resume-practice", "", "btn") : `<a class="btn" href="#/exams">模拟考试</a>`}</div><div class="hero-source"><span class="status-dot"></span>本地运行 · 无需登录 · 自动保存进度</div></div><div class="math-visual" aria-hidden="true"><div class="math-orbit orbit-one"></div><div class="math-orbit orbit-two"></div><div class="math-grid"></div><div class="math-equation">∫<sub>a</sub><sup>b</sup> f(x) dx</div><div class="math-caption">把知识连成线，让思路更清晰</div><div class="float-formula formula-a">e<sup>iπ</sup> + 1 = 0</div><div class="float-formula formula-b">lim<sub>x→0</sub> sin x / x = 1</div></div></section><section class="card local-stat-strip">${[
    ["book", bank.questions.length.toLocaleString(), "原版题目"],
    ["folder", parents.length, "已接入章节"],
    ["target", s.today, "今日完成"],
    ["chart", s.total ? s.accuracy + "%" : "—", "累计正确率"],
  ]
    .map(
      ([i, v, l]) =>
        `<div>${icon(i, 22)}<span><b>${v}</b><small>${l}</small></span></div>`,
    )
    .join(
      "",
    )}</section><div class="course-tabs" role="navigation" aria-label="选择学习科目">${bank.subjects.map((s) => `<a href="#/?subject=${encodeURIComponent(s.id)}" class="course-tab ${s.id === activeSubject?.id ? "active" : ""}" ${s.id === activeSubject?.id ? 'aria-current="true"' : ""}><span class="course-symbol">${s.id === "linear" ? "A" : "∫"}</span><span><b>${esc(s.name)}</b><small>${bank.questions.filter((q) => q.subjectId === s.id).length.toLocaleString()} 题 · ${s.chapters.filter((c) => !c.parentId).length} 章</small></span>${icon("arrow", 16)}</a>`).join("")}</div><div class="section-head"><h2>${esc(activeSubject?.name ?? "章节")} <small>选择章节，开始练习</small></h2><a href="#/practice?subject=${encodeURIComponent(activeSubject?.id ?? "")}" class="text-btn">全部章节 ${icon("arrow", 15)}</a></div>${chapterCards(false, activeSubject?.id)}<div class="grid-2 local-shortcuts"><a class="card" href="#/review"><span class="shortcut-icon pink">${icon("mistake", 23)}</span><div><h3>错题回顾</h3><p>查漏补缺，把薄弱知识点逐个巩固</p></div>${icon("arrow", 18)}</a><a class="card" href="#/favorites"><span class="shortcut-icon purple">${icon("star", 23)}</span><div><h3>我的收藏</h3><p>留下值得再练的题目，随时复习</p></div>${icon("arrow", 18)}</a></div>`;
}
function chapterCards(expanded = true, subjectId = "") {
  const filters = getFilters();
  return `<div class="chapter-grid">${bank.subjects
    .filter((s) => !subjectId || s.id === subjectId)
    .flatMap((s) =>
      s.chapters
        .filter((c) => !c.parentId)
        .map((c, i) => {
          const questions = filterQuestions(bank, {
            subjectId: s.id,
            chapterId: c.id,
          });
          const practiced = new Set(state.attempts.map((a) => a.questionId));
          const done = questions.filter((q) => practiced.has(q.id)).length;
          const children = s.chapters.filter((ch) => ch.parentId === c.id);
          const href = `#/practice?subject=${encodeURIComponent(s.id)}&chapter=${encodeURIComponent(c.id)}`;
          return `<section class="card chapter-card chapter-color-${i % 4}"><div class="chapter-card-head"><span class="chapter-glyph">${(s.id === "linear" ? ["|A|", "A", "r", "λ", "Q"] : ["ƒ", "∂", "f′", "∫", "∑", "→", "∇"])[i % (s.id === "linear" ? 5 : 7)]}</span><span class="pill">${questions.length} 题</span></div><a href="${href}" class="chapter-title"><span>CHAPTER ${String(i + 1).padStart(2, "0")}</span><h3>${esc(c.name.replace(/^第\d+章\s*/, ""))}</h3></a><p class="chapter-description">${children.length} 个小节 · 已练 ${done} 题</p><div class="progress-bar"><span style="width:${questions.length ? (done / questions.length) * 100 : 0}%"></span></div>${expanded ? `<details ${filters.chapterId === c.id || children.some((ch) => ch.id === filters.chapterId) ? "open" : ""}><summary>查看章节目录 ${icon("chevron", 13)}</summary><div class="section-list">${children.map((ch) => `<a href="#/practice?subject=${encodeURIComponent(s.id)}&chapter=${encodeURIComponent(ch.id)}" class="${filters.chapterId === ch.id ? "active" : ""}"><span>${esc(ch.name)}</span><small>${filterQuestions(bank, { chapterId: ch.id, subjectId: s.id }).length}题</small></a>`).join("")}</div></details>` : `<a class="chapter-link" href="${href}">进入章节 ${icon("arrow", 15)}</a>`}</section>`;
        }),
    )
    .join("")}</div>`;
}

function getFilters() {
  const { query } = route();
  return {
    subjectId: query.get("subject") ?? "",
    chapterId: query.get("chapter") ?? "",
    type: query.get("type") ?? "",
    search: query.get("q") ?? "",
  };
}
function filtersHTML(filters, search = true) {
  const selectedSubjects = bank.subjects.filter(
    (s) => !filters.subjectId || s.id === filters.subjectId,
  );
  return `<div class="card filter-bar"><div class="field"><label for="subject-filter">科目</label><select id="subject-filter" data-filter="subject"><option value="">全部科目</option>${bank.subjects.map((s) => `<option value="${attr(s.id)}" ${s.id === filters.subjectId ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></div><div class="field"><label for="chapter-filter">章节</label><select id="chapter-filter" data-filter="chapter"><option value="">全部章节</option>${selectedSubjects.map((s) => `<optgroup label="${attr(s.name)}">${s.chapters.map((c) => `<option value="${attr(c.id)}" ${c.id === filters.chapterId ? "selected" : ""}>${c.parentId ? "　↳ " : ""}${esc(c.name)}</option>`).join("")}</optgroup>`).join("")}</select></div><div class="field"><label for="type-filter">题型</label><select id="type-filter" data-filter="type"><option value="">全部题型</option>${Object.entries(
    names,
  )
    .map(
      ([k, v]) =>
        `<option value="${k}" ${filters.type === k ? "selected" : ""}>${v}</option>`,
    )
    .join(
      "",
    )}</select></div>${search ? `<div class="field"><label for="question-search">关键词</label><input class="input" id="question-search" type="search" data-filter="q" value="${attr(filters.search)}" placeholder="搜索题干或标签"></div>` : ""}</div>`;
}
function practicePage() {
  if (route().query.has("session") && state.practice) return practiceSession();
  const filters = getFilters();
  const questions = filterQuestions(bank, filters, state);
  return `${head("章节练习", "选择章节与知识点，按自己的节奏练习。", state.practice ? button(`继续上次练习 ${icon("arrow", 14)}`, "resume-practice", "", "btn soft") : "")}${filtersHTML(filters)}<section class="card practice-start"><div><span class="pill blue">${esc(subject(filters.subjectId)?.name ?? "全部科目")}</span><h2>${filters.chapterId ? esc(bank.subjects.flatMap((s) => s.chapters).find((c) => c.id === filters.chapterId)?.name ?? "当前章节") : "全部题目"}</h2><p>当前范围共 <strong>${questions.length}</strong> 道题 · 题目、答案来自你提供的 PDF</p></div><div class="flex">${button(`${icon("book", 17)} 顺序练习`, "start-practice", 'data-mode="sequential"', "btn primary")}${button(`${icon("refresh", 17)} 随机 ${DEFAULT_QUESTION_COUNT} 题`, "start-practice", 'data-mode="random"', "btn")}</div></section><div class="section-head"><h2>章节目录 <small>展开查看小节</small></h2><span class="muted">${bank.subjects.filter((s) => !filters.subjectId || s.id === filters.subjectId).flatMap((s) => s.chapters.filter((c) => !c.parentId)).length} 章 · ${bank.subjects.filter((s) => !filters.subjectId || s.id === filters.subjectId).flatMap((s) => s.chapters.filter((c) => c.parentId)).length} 个小节</span></div>${bank.subjects
    .filter((s) => !filters.subjectId || s.id === filters.subjectId)
    .map(
      (s) =>
        `<section class="subject-chapters"><h3 class="subject-label">${esc(s.name)}</h3>${chapterCards(true, s.id)}</section>`,
    )
    .join("")}${
    questions.length
      ? `<div class="section-head"><h2>题目列表 <small>前 ${Math.min(20, questions.length)} 题，顺序练习可访问全部</small></h2></div><section class="card">${questions
          .slice(0, 20)
          .map((q, i) => collectionRow(q, i, "preview"))
          .join("")}</section>`
      : empty(
          "没有符合条件的题目",
          "请切换章节或清除关键词。",
          `<a class="btn" href="#/practice">查看全部</a>`,
        )
  }`;
}

function optionHTML(q, response, graded = false, correct = null) {
  const selected = Array.isArray(response) ? response : [response];
  const answers = Array.isArray(q.answer) ? q.answer : [q.answer];
  return `<div class="options">${q.options
    .map((o) => {
      let style = selected.includes(o.id) ? "selected" : "";
      if (graded) {
        if (answers.includes(o.id)) style = "correct";
        else if (selected.includes(o.id) && correct === false) style = "wrong";
      }
      return `<button class="option ${style}" data-action="answer-option" data-value="${attr(o.id)}" ${graded ? "disabled" : ""} aria-pressed="${selected.includes(o.id)}"><span class="option-key">${q.type === "boolean" ? (o.id === "true" ? "√" : "×") : esc(o.id)}</span><span class="rich" data-rich="${attr(o.text)}"></span></button>`;
    })
    .join("")}</div>`;
}
function answerInput(q, response, graded) {
  if (["single", "multiple", "boolean"].includes(q.type))
    return optionHTML(q, response, graded, currentResponse()?.correct);
  return `<label class="field"><span>${q.type === "solution" ? "写下你的解题过程" : "你的答案"}</span><textarea class="input blank-answer" data-answer-text ${graded ? "disabled" : ""} placeholder="${q.type === "solution" ? "先独立思考，再对照参考解析。支持输入 LaTeX。" : "填写答案；多个可接受形式由题库定义。"}">${esc(response ?? "")}</textarea></label>`;
}
function currentExam() {
  const r = route();
  return r.page === "exam"
    ? state.exams.find((e) => e.id === r.parts[1])
    : null;
}
function currentQuestion() {
  const e = currentExam();
  const p = e ?? state.practice;
  if (!p) return null;
  return qById(p.questionIds[p.index ?? 0]);
}
function currentResponse() {
  const q = currentQuestion();
  return q ? state.practice?.responses[q.id] : null;
}
function sourceInfo(q) {
  if (!q.source?.documentId) return "";
  return `<div class="source-info"><span>${esc(q.sourceLabel)}</span><a href="/source-pdf/${encodeURIComponent(q.source.documentId)}.pdf#page=${Number(q.source.page) || 1}" target="_blank" rel="noopener">查看原 PDF · 第 ${Number(q.source.page) || 1} 页 ${icon("arrow", 12)}</a></div>`;
}
function resultBox(q, r) {
  const isManual = q.type === "solution";
  return `<section class="result-box ${r.correct === false ? "wrong" : ""}"><div class="result-label">${icon(r.correct === false ? "mistake" : r.correct === null ? "info" : "check", 16)} ${r.correct === null ? "对照参考答案，自评掌握情况" : r.correct ? "这道题，掌握了" : "没关系，把思路再理一遍"}</div><div class="answer-line">参考答案：<span class="rich" data-rich="${attr(Array.isArray(q.answer) ? q.answer.join(q.type === "multiple" ? "、" : " / ") : q.answer)}"></span></div><div class="analysis"><b>思路与解析</b><div class="rich" data-rich="${attr(q.analysis || "这道题的原 PDF 未附解析，请查看原 PDF 核对。")}"></div></div>${isManual && r.correct === null ? `<div class="flex" style="margin-top:18px">${button("我掌握了", "self-grade", 'data-correct="true"', "btn small")}${button("还需练习", "self-grade", 'data-correct="false"', "btn small soft")}</div>` : ""}${state.mistakes[q.id] && !state.mistakes[q.id].resolved ? `<div style="margin-top:14px">${button(`${icon("check", 12)} 标记已掌握`, "resolve-mistake", `data-id="${attr(q.id)}"`, "text-btn")}</div>` : ""}</section>`;
}
function questionNavigation(p, exam = false) {
  const completed = exam
    ? Object.keys(p.answers).filter((id) =>
        hasResponse(qById(id), p.answers[id]),
      ).length
    : Object.values(p.responses).filter((r) => r.graded).length;
  const navStart = Math.floor(p.index / 40) * 40;
  return `<aside class="card question-nav"><div class="card-head"><h3>题目导航</h3><span class="muted" style="font-size:10px">${completed}/${p.questionIds.length}</span></div><div class="progress-bar"><span style="width:${(completed / p.questionIds.length) * 100}%"></span></div><div class="question-index">${p.questionIds
    .slice(navStart, navStart + 40)
    .map((id, localIndex) => {
      const i = navStart + localIndex;
      const r = exam ? null : p.responses[id];
      const cls = exam
        ? hasResponse(qById(id), p.answers[id])
          ? "answered"
          : ""
        : r?.graded
          ? r.correct === true
            ? "correct"
            : r.correct === false
              ? "wrong"
              : "answered"
          : "";
      return button(
        i + 1,
        "navigate-question",
        `data-index="${i}" aria-label="第 ${i + 1} 题"`,
        "index-btn " + cls + (i === p.index ? " current" : ""),
      );
    })
    .join(
      "",
    )}</div>${p.questionIds.length > 40 ? `<div class="flex nav-pages">${button("上一组", "navigate-question", `data-index="${Math.max(0, navStart - 40)}" ${navStart === 0 ? "disabled" : ""}`, "btn small")}${button("下一组", "navigate-question", `data-index="${navStart + 40}" ${navStart + 40 >= p.questionIds.length ? "disabled" : ""}`, "btn small")}</div><small class="muted">${navStart + 1}–${Math.min(navStart + 40, p.questionIds.length)} / ${p.questionIds.length}</small>` : ""}<p class="navigator-note">${exam ? "答案会自动保存在当前浏览器。交卷后查看结果与解析。" : "答完一题，再前进一步。练习进度会自动保存。"}</p>${exam ? `<div style="border-top:1px solid var(--line);padding-top:17px;margin-top:19px"><p class="muted" style="font-size:10px">剩余时间</p><div class="timer" data-timer="${attr(p.id)}">${timeRemaining(p)}</div><div style="margin-top:15px">${button("提交试卷", "submit-exam", "", "btn coral")}</div></div>` : ""}</aside>`;
}
function practiceSession() {
  const p = state.practice;
  const q = currentQuestion();
  if (!q)
    return `<section class="card">${empty("这组练习已不可用", "题库可能发生了变化，请重新选择练习。", button("选择练习", "exit-practice", "", "btn primary"))}</section>`;
  const r = p.responses[q.id] ?? {
    answer: q.type === "multiple" ? [] : "",
    graded: false,
  };
  return `${head(p.mode === "random" ? "随机练习" : p.mode === "review" ? "错题回顾" : p.mode === "favorites" ? "收藏练习" : "章节练习", `${esc(subject(q.subjectId)?.name ?? "")} · ${esc(chapter(q))}`, button(`${icon("back", 13)} 选择练习`, "exit-practice", "", "btn"))}<div class="question-layout"><section class="card question-main"><div class="question-top"><div class="flex"><span class="pill green">${names[q.type]}</span><span class="pill">${q.source ? "PDF 原题" : difficultyNames[q.difficulty]}</span></div>${button(icon("star", 18), "toggle-favorite", `data-id="${attr(q.id)}" aria-label="${state.favorites.includes(q.id) ? "取消收藏" : "收藏题目"}" style="color:${state.favorites.includes(q.id) ? "var(--accent)" : "var(--muted)"}"`, "icon-btn")}</div><p class="eyebrow">QUESTION ${String(p.index + 1).padStart(2, "0")} <span class="muted">/ ${p.questionIds.length}</span></p>${sourceInfo(q)}<div class="question-title rich" data-rich="${attr(q.stem)}"></div>${q.source ? `<p class="pdf-reading-note">长公式可左右滑动查看</p>` : ""}${answerInput(q, r.answer, r.graded)}${r.graded ? resultBox(q, r) : ""}<div class="question-actions">${button(`${icon("back", 13)} 上一题`, "navigate-question", `data-index="${p.index - 1}" ${p.index === 0 ? "disabled" : ""}`, "btn")}<span class="grow"></span>${!r.graded ? button(q.type === "solution" ? "查看参考答案" : "确认答案", "submit-answer", "", "btn primary") : ""}${button(`${p.index === p.questionIds.length - 1 ? "完成本组" : "下一题"} ${icon("arrow", 13)}`, "next-question", "", "btn " + (r.graded ? "primary" : ""))}</div></section>${questionNavigation(p)}</div><p class="shortcut-hint">${q.type === "fill" ? "填空题按题库答案及可接受答案匹配；等价数学表达式请以原题配置为准。" : "先思考，再确认。答题记录只保存在当前浏览器。"}</p>`;
}
function collectionRow(q, i, mode) {
  const m = state.mistakes[q.id];
  return `<article class="collection-item"><span class="collection-number">${String(i + 1).padStart(2, "0")}</span><div class="grow"><div class="collection-stem">${esc(q.sourceLabel || textOnly(q.stem))}</div><div class="collection-meta"><span>${esc(subject(q.subjectId)?.name)}</span><span>${esc(chapter(q))}</span><span>${names[q.type]}</span>${mode === "review" ? `<span>错过 ${m?.wrongCount ?? 0} 次</span>` : ""}</div></div>${button("练一练", "practice-one", `data-id="${attr(q.id)}"`, "btn small")}${mode === "favorites" ? button(icon("star", 15), "toggle-favorite", `data-id="${attr(q.id)}" aria-label="取消收藏"`, "icon-btn") : mode === "review" ? button(icon("check", 15), "resolve-mistake", `data-id="${attr(q.id)}" aria-label="标记已掌握"`, "icon-btn") : ""}</article>`;
}
function collectionPage(mode) {
  const isWrong = mode === "review";
  const filters = getFilters();
  const questions = filterQuestions(
    bank,
    { ...filters, mistakes: isWrong, favorites: !isWrong },
    state,
  );
  return `${head(isWrong ? "回头看，是为了走得更远。" : "好题，值得再见。", isWrong ? "把不熟悉的知识点，慢慢练成自己的底气。" : "标记有启发的题目，给下一次复习留一个入口。", questions.length ? button(`${icon("refresh", 14)} ${isWrong ? "开始复习" : "练习收藏题"}`, "start-collection", `data-mode="${mode}"`, "btn primary") : "")}${filtersHTML(filters)}<section class="card">${questions.length ? `<div class="collection-item"><span class="muted" style="font-size:11px">共 ${questions.length} 道${isWrong ? "待复习错题" : "收藏题目"}</span></div>${questions.map((q, i) => collectionRow(q, i, mode)).join("")}` : empty(isWrong ? "错题本，等待你的第一道题" : "把好题，留在这里", isWrong ? "答错的题会自动记录。复习后，你可以手动标记为已掌握。" : "在练习页点亮星标，题目就会出现在这里。", `<a class="btn primary" href="#/practice">去练习 ${icon("arrow", 14)}</a>`)}</section>`;
}
function examsPage() {
  const active = state.exams.find((e) => e.status === "active");
  return `${head("在正式考试前，先遇见自己。", "用一次限时练习，找到节奏，也找到还需要补上的一块。", button(`${icon("plus", 15)} 新建模拟考试`, "create-exam", "", "btn primary"))}${bankNotice()}${active ? `<div class="notice">${icon("clock", 18)}<div><strong>有一场考试正在进行</strong><p>答案已保存，计时会继续。</p></div><a href="#/exam/${encodeURIComponent(active.id)}" class="btn small">继续考试 ${icon("arrow", 13)}</a></div>` : ""}<div class="section-head"><h2>考试记录</h2><span class="muted" style="font-size:11px">${state.exams.length} 场</span></div>${
    state.exams.length
      ? `<div class="stack">${[...state.exams]
          .reverse()
          .map(
            (e, i) =>
              `<article class="card exam-card"><div class="exam-score ${e.status === "active" ? "active" : ""}">${e.status === "active" ? icon("clock", 28) : e.score}<small>${e.status === "active" ? "进行中" : "得分 / 100"}</small></div><div class="grow"><h3 style="font-size:13px">${esc(subject(e.subjectId)?.name ?? "综合")}模拟考试</h3><p class="subtitle" style="font-size:10px">${shortDate(e.startedAt)} · ${e.questionIds.length} 题 · ${e.minutes} 分钟</p></div><a class="btn small" href="#/exam/${encodeURIComponent(e.id)}">${e.status === "active" ? "继续考试" : "查看报告"} ${icon("arrow", 12)}</a></article>`,
          )
          .join("")}</div>`
      : `<section class="card">${empty("第一场模拟考试，从这里开始", "选择科目、题量和时长。系统会从已导入题库中抽题，交卷后生成报告。", button(`${icon("plus", 14)} 创建考试`, "create-exam", "", "btn primary"))}</section>`
  }`;
}
function timeRemaining(e) {
  const total = Math.max(0, Math.ceil((e.endsAt - Date.now()) / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
function examPage() {
  const e = currentExam();
  if (!e)
    return `<section class="card">${empty("没有找到这场考试", "可以返回考试记录查看其他试卷。", `<a class="btn primary" href="#/exams">考试记录</a>`)}</section>`;
  if (e.status === "submitted") return examReport(e);
  const q = currentQuestion();
  if (!q) return empty("题目不可用", "请恢复考试对应的题库。");
  return `${head("模拟考试", `${esc(subject(e.subjectId)?.name ?? "综合练习")} · ${e.questionIds.length} 题 · ${e.minutes} 分钟`, `<a href="#/exams" class="btn">${icon("back", 13)} 考试记录</a>`)}<div class="question-layout"><section class="card question-main"><div class="question-top"><span class="pill blue">${names[q.type]}</span><span class="muted" style="font-size:11px">第 ${e.index + 1} / ${e.questionIds.length} 题</span></div>${sourceInfo(q)}<div class="question-title rich" data-rich="${attr(q.stem)}"></div>${q.source ? `<p class="pdf-reading-note">长公式可左右滑动查看</p>` : ""}${answerInput(q, e.answers[q.id] ?? (q.type === "multiple" ? [] : ""), false)}<div class="question-actions">${button(`${icon("back", 13)} 上一题`, "navigate-question", `data-index="${e.index - 1}" ${e.index === 0 ? "disabled" : ""}`, "btn")}<span class="grow"></span>${e.index < e.questionIds.length - 1 ? button(`下一题 ${icon("arrow", 13)}`, "navigate-question", `data-index="${e.index + 1}"`, "btn primary") : button("提交试卷", "submit-exam", "", "btn coral")}</div></section>${questionNavigation(e, true)}</div>`;
}
function examReport(e) {
  const wrong = e.questionIds
    .filter((id) => e.results[id] === false)
    .map(qById)
    .filter(Boolean);
  return `${head("每一次检验，都带来新的方向。", "把分数放在一边，也看看自己真正学会了什么。", `<a href="#/exams" class="btn">${icon("back", 13)} 考试记录</a>`)}<section class="card score-hero"><span class="pill green">${e.timedOut ? "时间到，已自动交卷" : "本次考试已完成"}</span><div class="score">${e.score}<span style="font-size:19px"> 分</span></div><p>${esc(subject(e.subjectId)?.name ?? "综合")}模拟考试</p><div class="score-meta"><span><b>${e.correct}/${e.questionIds.length}</b>答对题目</span><span><b>${Math.min(e.minutes, Math.max(1, Math.ceil((e.submittedAt - e.startedAt) / 60000)))}</b>用时 / 分钟</span><span><b>${wrong.length}</b>待巩固题目</span></div></section><div class="section-head"><h2>逐题回顾</h2><span class="muted" style="font-size:10px">本次错题已进入错题本</span></div><div class="stack">${e.questionIds
    .map((id, i) => {
      const q = qById(id);
      if (!q) return "";
      return `<section class="card question-main"><div class="question-top"><span class="pill ${e.results[id] ? "green" : "coral"}">第 ${i + 1} 题 · ${e.results[id] ? "正确" : "待巩固"}</span>${button(icon("star", 16), "toggle-favorite", `data-id="${attr(id)}" aria-label="收藏题目"`, "icon-btn")}</div>${sourceInfo(q)}<div class="question-title rich" data-rich="${attr(q.stem)}"></div>${q.source ? `<p class="pdf-reading-note">长公式可左右滑动查看</p>` : ""}<p class="answer-line">你的答案：${esc(Array.isArray(e.answers[id]) ? e.answers[id].join("、") : (e.answers[id] ?? "未作答"))}</p>${resultBox(q, { correct: e.results[id], graded: true })}</section>`;
    })
    .join("")}</div>`;
}
function statsPage() {
  const s = stats(state);
  const daily = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    daily.push({
      date: dayKey(d),
      count: state.attempts.filter((a) => dayKey(a.at) === dayKey(d)).length,
      label: i === 0 ? "今天" : `${d.getMonth() + 1}/${d.getDate()}`,
    });
  }
  const max = Math.max(5, ...daily.map((d) => d.count));
  return `${head("让积累，看得见。", "和昨天的自己比，就已经是一种进步。")}<div class="stat-cards">${[
    ["累计做题", s.total],
    ["综合正确率", s.total ? s.accuracy + "%" : "—"],
    ["连续学习", s.streak + " 天"],
    ["活跃天数", s.activeDays + " 天"],
  ]
    .map(([l, v]) => `<div class="card big-stat"><p>${l}</p><b>${v}</b></div>`)
    .join(
      "",
    )}</div><div class="grid-2"><section class="card activity-card"><div class="card-head"><h2>近七天练习</h2><span class="muted" style="font-size:10px">单位：题次</span></div><div class="chart" role="img" aria-label="近七天练习数量">${daily.map((d) => `<div class="bar-column"><span class="bar-value">${d.count}</span><div class="bar" style="height:${Math.max(2, (d.count / max) * 100)}%"></div><span>${d.label}</span></div>`).join("")}</div></section><section class="card activity-card"><div class="card-head"><h2>学习足迹</h2><span class="pill">近十五周</span></div>${heatmap()}</section></div><div class="section-head"><h2>科目掌握情况</h2><span class="muted" style="font-size:10px">按实际答题记录计算</span></div><section class="card" style="padding:12px 24px">${bank.subjects
    .map((sub) => {
      const a = state.attempts.filter(
        (a) => a.subjectId === sub.id && typeof a.correct === "boolean",
      );
      const pct = a.length
        ? Math.round((a.filter((a) => a.correct).length / a.length) * 100)
        : 0;
      return `<div class="chapter-row"><span class="grow">${esc(sub.name)}</span><span class="muted">${a.length} 次练习</span><div class="progress-bar"><span style="width:${pct}%"></span></div><span style="width:35px;text-align:right">${a.length ? pct + "%" : "—"}</span></div>`;
    })
    .join("")}</section>`;
}
function libraryPage() {
  return `${head("让原题，回到你的学习节奏。", "保留原题内容、标准答案和解析，再用自己的方式练习。", bank.questions.length ? button(`${icon("download", 14)} 导出题库`, "export-bank", "", "btn") : "")}<section class="card library-hero"><div class="empty-symbol">${icon(bank.questions.length ? "check" : "folder", 29)}</div><div class="grow"><span class="pill ${bank.questions.length ? "green" : "coral"}">${bank.questions.length ? "题库已就绪" : "等待原题数据"}</span><h2 style="margin-top:10px">${bank.questions.length ? `${bank.questions.length.toLocaleString()} 道原题，已加入学习空间` : "网站已就绪，题库由你补充"}</h2><p class="subtitle">${bank.questions.length ? `${esc(bank.source.name || "已导入题库")} · ${bank.subjects.length} 个科目 · 导入于 ${shortDate(bank.importedAt)}` : "目前没有填入示例题。导入后，科目、章节、题干、答案与解析均以原始数据为准。"}</p></div></section><div class="grid-2"><section class="card library-card"><div class="card-head"><h2>导入原题库</h2>${icon("upload", 18)}</div><div class="upload-zone" id="drop-zone" tabindex="0" role="button" aria-label="选择或拖入 JSON 题库">${icon("upload", 29)}<h3>把题库带到这里</h3><p>拖入 JSON 文件，或点击选择。导入前会检查题型、答案、选项和章节关联。</p>${button("选择题库文件", "choose-file", "", "btn primary")}<div class="muted" style="font-size:9px;margin-top:12px">JSON 格式 · 最大 50 MB · 最多 100,000 题</div></div><div class="flex" style="justify-content:space-between">${button(`${icon("download", 13)} 下载空白模板`, "download-template", "", "text-btn")}${button("查看格式说明", "import-help", "", "text-btn")}</div><p class="format-note" style="margin-top:18px">支持单选、多选、判断、填空和解答题。公式支持 LaTeX，题干与解析可保留常见 HTML 排版。解答题使用对照自评；填空题可配置多个可接受答案。</p></section><div class="stack"><section class="card library-card"><div class="card-head"><h2>学习数据，留在自己手里</h2>${icon("lock", 16)}</div><div class="data-actions"><button class="data-action" data-action="export-backup"><b>${icon("download", 15)} 导出完整备份</b><p>题库、作答记录、错题、收藏与考试记录。</p></button><button class="data-action" data-action="restore-backup"><b>${icon("refresh", 15)} 恢复学习数据</b><p>选择之前导出的Local-NEUMathe备份，继续上次的进度。</p></button></div><p class="format-note" style="margin-top:14px">学习数据保存在当前浏览器。更换设备或清理浏览器前，请先导出备份。</p></section><section class="card library-card"><div class="card-head"><h2>当前题库</h2><span class="pill">${bank.questions.length} 题</span></div>${bank.subjects.map((s) => `<div class="chapter-row"><span class="grow">${esc(s.name)}</span><span class="muted">${bank.questions.filter((q) => q.subjectId === s.id).length} 题</span></div>`).join("")}<div style="margin-top:17px">${button(`${icon("trash", 12)} 清空学习记录`, "reset-data", "", "text-btn")}</div></section></div></div>`;
}

function renderRich() {
  for (const el of document.querySelectorAll("[data-rich]")) {
    const content = el.dataset.rich;
    el.removeAttribute("data-rich");
    el.replaceChildren(safeContent(content));
    if (window.renderMathInElement) {
      try {
        window.renderMathInElement(el, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "\\[", right: "\\]", display: true },
            { left: "$", right: "$", display: false },
            { left: "\\(", right: "\\)", display: false },
          ],
          throwOnError: false,
          trust: false,
          strict: "ignore",
          maxExpand: 500,
          maxSize: 10,
        });
      } catch {}
    }
  }
}
function safeContent(value) {
  const fragment = document.createDocumentFragment();
  const raw = String(value ?? "");
  if (!/<\/?[a-z][\s\S]*>/i.test(raw)) {
    raw.split(/\n/).forEach((line, i) => {
      if (i) fragment.append(document.createElement("br"));
      fragment.append(document.createTextNode(line));
    });
    return fragment;
  }
  const doc = new DOMParser().parseFromString(raw, "text/html");
  const allowed = new Set([
    "P",
    "DIV",
    "SPAN",
    "BR",
    "STRONG",
    "B",
    "EM",
    "I",
    "U",
    "S",
    "SUP",
    "SUB",
    "UL",
    "OL",
    "LI",
    "TABLE",
    "THEAD",
    "TBODY",
    "TR",
    "TD",
    "TH",
    "PRE",
    "CODE",
    "BLOCKQUOTE",
    "H2",
    "H3",
    "H4",
    "IMG",
  ]);
  const drop = new Set([
    "SCRIPT",
    "STYLE",
    "IFRAME",
    "OBJECT",
    "EMBED",
    "FORM",
    "INPUT",
    "BUTTON",
    "SVG",
    "MATH",
    "TEMPLATE",
  ]);
  function append(parent, node) {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.append(document.createTextNode(node.textContent));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE || drop.has(node.tagName)) return;
    if (!allowed.has(node.tagName)) {
      for (const child of node.childNodes) append(parent, child);
      return;
    }
    const target = document.createElement(node.tagName.toLowerCase());
    if (node.tagName === "IMG") {
      try {
        const url = new URL(node.getAttribute("src"), location.href);
        if (url.protocol !== "https:" && url.protocol !== "http:") return;
        target.src = url.href;
        target.alt = node.getAttribute("alt") ?? "题目图片";
        target.loading = "eager";
        if (
          url.origin === location.origin &&
          url.pathname.startsWith("/api/question-image/")
        ) {
          target.className = "original-pdf-image";
          target.addEventListener("load", () => {
            target.style.width = `${(target.naturalWidth / 2.5) * 1.5}px`;
          });
          target.addEventListener("error", () => {
            target.alt = "原题图片加载失败，请检查本地服务器或打开原 PDF";
            target.classList.add("image-error");
          });
        }
        target.referrerPolicy = "no-referrer";
      } catch {
        return;
      }
    }
    for (const child of node.childNodes) append(target, child);
    parent.append(target);
  }
  for (const node of doc.body.childNodes) append(fragment, node);
  return fragment;
}
let renderPending = false;
function render() {
  if (renderPending) return;
  renderPending = true;
  queueMicrotask(() => {
    renderPending = false;
    draw();
  });
}
function draw() {
  clearInterval(timerInterval);
  document.body.classList.toggle("dark", state.theme === "dark");
  const r = route();
  const page = routes[r.page] ? r.page : "dashboard";
  const navItems = [
    ["dashboard", "home", "学习概览", "/"],
    ["practice", "book", "题库练习", "/practice"],
    ["exams", "exam", "模拟考试", "/exams"],
    ["review", "mistake", "错题本", "/review"],
    ["favorites", "star", "我的收藏", "/favorites"],
    ["stats", "chart", "学习统计", "/stats"],
  ];
  const countWrong = Object.values(state.mistakes).filter(
    (m) => !m.resolved,
  ).length;
  app.innerHTML = `<div class="local-shell"><header class="local-header"><div class="local-navbar"><a class="local-brand" href="#/" aria-label="Local-NEUMathe 首页"><img src="./assets/neumathe-logo.png" alt=""><strong>Local-NEUMathe</strong><span>本地版</span></a><nav class="local-nav ${mobileOpen ? "open" : ""}" aria-label="主要导航">${[...navItems, ["library", "folder", "题库管理", "/library"]].map(([key, i, label, path]) => `<a href="#${path}" class="${page === key || (page === "exam" && key === "exams") ? "active" : ""}" ${page === key ? 'aria-current="page"' : ""}>${icon(i, 16)}${label}${key === "review" && countWrong ? `<small>${countWrong}</small>` : ""}</a>`).join("")}</nav><div class="local-header-actions">${button(icon("search", 19), "search", 'aria-label="搜索题目"', "icon-btn")}${button(icon(state.theme === "dark" ? "sun" : "moon", 19), "toggle-theme", 'aria-label="切换明暗主题"', "icon-btn")}${button(icon("menu", 20), "toggle-menu", `aria-label="打开导航" aria-expanded="${mobileOpen}"`, "icon-btn local-menu")}<span class="local-avatar">学</span></div></div></header><main id="main" class="local-main" tabindex="-1">${page === "dashboard" ? dashboard() : page === "practice" ? practicePage() : page === "review" || page === "favorites" ? collectionPage(page) : page === "exams" ? examsPage() : page === "exam" ? examPage() : page === "stats" ? statsPage() : libraryPage()}<footer class="footer"><span>Local-NEUMathe · 数学练习</span><span>题目取自本地 PDF · 学习记录保存在当前浏览器</span></footer></main></div>`;
  document.title = `${routes[page]} · Local-NEUMathe`;
  renderRich();
  attachDropZone();
  if (state.exams.some((e) => e.status === "active")) {
    tickExam();
    timerInterval = setInterval(tickExam, 1000);
  }
}
function openDialog(title, body, actions = "") {
  dialog.innerHTML = `<header class="dialog-head"><h2 id="dialog-title">${title}</h2>${button(icon("close", 18), "close-dialog", 'aria-label="关闭"', "icon-btn")}</header><div class="dialog-body">${body}</div>${actions ? `<div class="dialog-actions">${actions}</div>` : ""}`;
  dialog.showModal();
  renderRich();
}
function confirmDialog(title, body, onConfirm, label = "确认") {
  openDialog(
    title,
    `<p>${body}</p>`,
    `${button("取消", "close-dialog")}${button(label, "confirm-dialog", "", "btn coral")}`,
  );
  dialog._confirm = onConfirm;
}
function download(name, value) {
  const blob = new Blob(
    [typeof value === "string" ? value : JSON.stringify(value, null, 2)],
    {
      type:
        typeof value === "string"
          ? "text/plain;charset=utf-8"
          : "application/json",
    },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function selectFile(mode = "bank") {
  fileMode = mode;
  const el = document.querySelector("#file-input");
  el.value = "";
  el.click();
}
function examOptions() {
  if (!bank.questions.length) {
    toast("请先导入原题库");
    go("/library");
    return;
  }
  const active = state.exams.find((e) => e.status === "active");
  if (active) {
    go("/exam/" + active.id);
    return;
  }
  openDialog(
    "给自己一场小小的检验",
    `<p style="margin-bottom:20px">从已导入题库中随机抽题。选择、判断与填空题自动判分，解答题保留在章节练习中自评。</p><div class="field"><label for="exam-subject">考试科目</label><select id="exam-subject"><option value="">综合练习</option>${bank.subjects.map((s) => `<option value="${attr(s.id)}">${esc(s.name)}</option>`).join("")}</select></div><div class="flex"><div class="field"><label for="exam-count">题量</label><input class="input" id="exam-count" type="number" min="1" max="100" value="${Math.min(DEFAULT_QUESTION_COUNT, bank.questions.filter((q) => q.type !== "solution").length) || 1}"></div><div class="field"><label for="exam-minutes">时长 / 分钟</label><input class="input" id="exam-minutes" type="number" min="1" max="240" value="30"></div></div><p id="exam-error" role="alert"></p>`,
    `${button("先不考", "close-dialog")}${button(`开始考试 ${icon("arrow", 13)}`, "begin-exam", "", "btn primary")}`,
  );
}
async function startPractice(ids, mode) {
  if (!ids.length) {
    toast(bank.questions.length ? "当前筛选下没有题目" : "请先导入原题库");
    if (!bank.questions.length) go("/library");
    return;
  }
  state.practice = createPractice(ids, mode);
  await persist();
  go("/practice?session=1");
}
async function submitPractice(manual) {
  const p = state.practice,
    q = currentQuestion();
  if (!p || !q) return;
  const r = p.responses[q.id] ?? { answer: q.type === "multiple" ? [] : "" };
  if (r.graded && (manual === undefined || typeof r.correct === "boolean"))
    return;
  if (!hasResponse(q, r.answer) && q.type !== "solution") {
    toast("先选择或填写你的答案");
    return;
  }
  if (q.type === "solution" && manual === undefined) {
    p.responses[q.id] = { ...r, graded: true, correct: null };
    await persist();
    render();
    return;
  }
  const correct = manual ?? judge(q, r.answer);
  p.responses[q.id] = { ...r, correct, graded: true };
  recordAttempt(state, q, r.answer, correct, {
    id: `practice:${p.id}:${q.id}`,
    mode: p.mode,
    durationMs: Date.now() - p.questionStartedAt,
    manual: q.type === "solution",
  });
  await persist();
  render();
}
async function finishCurrentExam(force = false) {
  const e = currentExam();
  if (!e || e.status !== "active") return;
  const complete = () => {
    finishExam(state, bank, e);
    return persist().then(() => {
      dialog.close();
      render();
      window.scrollTo(0, 0);
    });
  };
  if (force) return complete();
  const pending = e.questionIds.filter(
    (id) => !hasResponse(qById(id), e.answers[id]),
  ).length;
  confirmDialog(
    "确认提交试卷？",
    pending
      ? `还有 ${pending} 道题未作答，未作答将按错误计入。交卷后可查看答案和解析。`
      : "所有题目都已填写，交卷后可查看成绩、答案和解析。",
    complete,
    "提交试卷",
  );
}
async function tickExam() {
  const e = currentExam();
  if (e?.status === "active")
    for (const el of document.querySelectorAll("[data-timer]")) {
      el.textContent = timeRemaining(e);
      el.classList.toggle("urgent", e.endsAt - Date.now() < 60000);
    }
  const expired = state.exams.filter(
    (x) => x.status === "active" && Date.now() >= x.endsAt,
  );
  if (expired.length && !autoSubmitting) {
    autoSubmitting = true;
    try {
      for (const x of expired) finishExam(state, bank, x);
      await persist();
      if (e && expired.some((x) => x.id === e.id)) dialog.close();
      render();
      toast("考试时间已到，已自动交卷");
    } catch (err) {
      toast(err.message);
    } finally {
      autoSubmitting = false;
    }
  }
}
function attachDropZone() {
  const z = document.querySelector("#drop-zone");
  if (!z) return;
  z.addEventListener("dragover", (e) => {
    e.preventDefault();
    z.classList.add("drag");
  });
  z.addEventListener("dragleave", () => z.classList.remove("drag"));
  z.addEventListener("drop", (e) => {
    e.preventDefault();
    z.classList.remove("drag");
    fileMode = "bank";
    if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]);
  });
  z.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectFile();
    }
  });
}
async function readFile(file) {
  if (file.size > 50 * 1024 * 1024) {
    toast("文件超过 50 MB，请拆分题库");
    return;
  }
  try {
    const parsed = JSON.parse((await file.text()).replace(/^\uFEFF/, ""));
    if (fileMode === "backup") {
      const restored = validateBackup(parsed);
      confirmDialog(
        "恢复这份学习备份？",
        `将恢复 ${restored.bank.questions.length} 道题、${restored.state.attempts.length} 条作答记录，并替换当前学习空间。`,
        async () => {
          const prevBank = bank,
            prevState = state;
          bank = restored.bank;
          state = restored.state;
          try {
            await persist();
            dialog.close();
            go("/");
            render();
            toast("学习数据已恢复");
          } catch (e) {
            bank = prevBank;
            state = prevState;
            throw e;
          }
        },
        "恢复备份",
      );
      return;
    }
    pendingImport = normalizeBank(parsed);
    pendingImport.managedBundle = false;
    const n = pendingImport;
    openDialog(
      "原题已检查，准备导入",
      `<p>共 ${n.subjects.length} 个科目、${n.questions.length.toLocaleString()} 道题。题干、答案和解析保留导入内容。</p><div class="import-details">${n.subjects.map((s) => `${esc(s.name)}：${s.chapters.length} 个章节，${n.questions.filter((q) => q.subjectId === s.id).length} 题`).join("<br>")}</div>${bank.questions.length ? "<p>导入会替换当前题库并重置答题记录、收藏、错题和考试。请先导出完整备份。</p>" : "<p>确认后即可开始练习。后续可在题库管理中导出完整备份。</p>"}`,
      `${bank.questions.length ? button("先导出备份", "export-backup") : button("取消", "close-dialog")}${button("确认导入", "confirm-import", "", "btn primary")}`,
    );
  } catch (err) {
    toast(`导入失败：${err.message}`);
  }
}
function showSearch() {
  openDialog(
    "找一道题，或一个知识点",
    `<label class="sr-only" for="global-search">搜索题干、标签</label><input class="input" id="global-search" type="search" placeholder="搜索题干或标签…" autocomplete="off"><div class="search-results" id="search-results"><p style="padding:16px 8px">${bank.questions.length ? "输入关键词，在已导入的题库中查找。" : "题库尚未导入，先把原题带到这里。"}</p></div>`,
  );
  setTimeout(() => document.querySelector("#global-search")?.focus(), 50);
}
async function handleAction(action, el) {
  switch (action) {
    case "toggle-menu":
      mobileOpen = !mobileOpen;
      render();
      break;
    case "close-menu":
      mobileOpen = false;
      render();
      break;
    case "toggle-theme":
      state.theme = state.theme === "dark" ? "light" : "dark";
      await persist();
      render();
      break;
    case "close-dialog":
      dialog.close();
      pendingImport = null;
      break;
    case "confirm-dialog":
      await dialog._confirm?.();
      dialog.close();
      break;
    case "search":
      showSearch();
      break;
    case "goal":
      openDialog(
        "给今天，设一个小目标",
        `<p style="margin-bottom:18px">适合自己的节奏，才容易坚持。每天 1–200 题。</p><div class="field"><label for="daily-goal">每日题量</label><input id="daily-goal" class="input" type="number" min="1" max="200" value="${state.dailyGoal}"></div>`,
        `${button("取消", "close-dialog")}${button("保存目标", "save-goal", "", "btn primary")}`,
      );
      break;
    case "save-goal": {
      const n = Number(document.querySelector("#daily-goal").value);
      if (!Number.isInteger(n) || n < 1 || n > 200) {
        toast("请输入 1–200 的整数");
        return;
      }
      state.dailyGoal = n;
      await persist();
      dialog.close();
      render();
      toast("今日目标已更新");
      break;
    }
    case "choose-file":
      selectFile();
      break;
    case "restore-backup":
      selectFile("backup");
      break;
    case "confirm-import": {
      if (!pendingImport) return;
      const oldBank = bank,
        oldState = state;
      const theme = state.theme;
      bank = pendingImport;
      state = { ...emptyState(), theme };
      try {
        await persist();
        pendingImport = null;
        dialog.close();
        go("/");
        render();
        toast(`已导入 ${bank.questions.length} 道题`);
      } catch (err) {
        bank = oldBank;
        state = oldState;
        throw err;
      }
      break;
    }
    case "download-template":
      download("Local-NEUMathe-原题导入模板.json", {
        format: BANK_FORMAT,
        source: { name: "NeuMathe", note: "填入实际导出的原题内容" },
        subjects: bank.subjects,
        questions: [],
      });
      toast("空白模板已下载，题目字段可在格式说明中查看");
      break;
    case "import-help":
      openDialog(
        "题库导入格式",
        `<p>顶层使用 <code>subjects</code> 和 <code>questions</code>。科目包含 id、name、chapters；章节包含 id 和 name。题目需提供：</p><div class="import-details"><b>id</b>：唯一题目 ID<br><b>subjectId / chapterId</b>：对应的科目与章节 ID<br><b>type</b>：single、multiple、boolean、fill、solution<br><b>stem</b>：原题题干，支持 HTML 与 LaTeX<br><b>options</b>：[{"id":"A","text":"选项原文"}, …]<br><b>answer</b>：选项 ID、ID 数组或原题答案<br><b>analysis</b>：原题解析<br><b>acceptedAnswers</b>：填空题的其他可接受答案（可选）</div><p>也接受 subject_id、chapter_id、title、choices、explanation 等常见字段。数字题型编码需先明确映射，避免错误判题。内容会安全排版；导入前请核对数据来源。</p>`,
        button("下载格式说明", "download-guide", "", "btn primary"),
      );
      break;
    case "download-guide":
      download("Local-NEUMathe-导入格式说明.txt", IMPORT_GUIDE);
      break;
    case "export-bank":
      download(`Local-NEUMathe-题库-${dayKey()}.json`, bank);
      toast("题库已导出");
      break;
    case "export-backup":
      download(`Local-NEUMathe-完整备份-${dayKey()}.json`, {
        format: BACKUP_FORMAT,
        exportedAt: Date.now(),
        bank,
        state,
      });
      toast("完整备份已导出");
      break;
    case "reset-data":
      confirmDialog(
        "清空当前学习记录？",
        "答题记录、收藏、错题和考试都会删除，当前题库保留。此操作无法撤销，建议先导出备份。",
        async () => {
          state = emptyState();
          await persist();
          go("/");
          render();
          toast("学习记录已清空");
        },
        "确认清空",
      );
      break;
    case "start-practice": {
      const list = filterQuestions(bank, getFilters(), state);
      const ids = (
        el.dataset.mode === "random" ? shuffle(list).slice(0, DEFAULT_QUESTION_COUNT) : list
      ).map((q) => q.id);
      await startPractice(ids, el.dataset.mode);
      break;
    }
    case "start-collection": {
      const mode = el.dataset.mode;
      const list = filterQuestions(
        bank,
        {
          ...getFilters(),
          mistakes: mode === "review",
          favorites: mode === "favorites",
        },
        state,
      );
      await startPractice(
        list.slice(0, 30).map((q) => q.id),
        mode,
      );
      break;
    }
    case "practice-one":
      await startPractice([el.dataset.id], "sequential");
      break;
    case "resume-practice":
      go("/practice?session=1");
      break;
    case "exit-practice":
      go("/practice");
      break;
    case "answer-option": {
      const q = currentQuestion(),
        exam = currentExam();
      if (!q) return;
      if (exam && (exam.status !== "active" || Date.now() >= exam.endsAt)) {
        await tickExam();
        return;
      }
      const target = exam
        ? exam.answers
        : (state.practice.responses[q.id] ??= {
            answer: q.type === "multiple" ? [] : "",
            graded: false,
          });
      if (!exam && target.graded) return;
      const value = el.dataset.value;
      const old = exam ? target[q.id] : target.answer;
      const answer =
        q.type === "multiple"
          ? Array.isArray(old) && old.includes(value)
            ? old.filter((v) => v !== value)
            : [...(Array.isArray(old) ? old : []), value]
          : value;
      if (exam) target[q.id] = answer;
      else target.answer = answer;
      await persist();
      render();
      break;
    }
    case "submit-answer":
      await submitPractice();
      break;
    case "self-grade":
      await submitPractice(el.dataset.correct === "true");
      break;
    case "navigate-question": {
      const target = currentExam() ?? state.practice;
      if (!target) return;
      const i = Number(el.dataset.index);
      if (i < 0 || i >= target.questionIds.length) return;
      target.index = i;
      if (!currentExam()) target.questionStartedAt = Date.now();
      await persist();
      render();
      break;
    }
    case "next-question": {
      const p = state.practice;
      if (p.index < p.questionIds.length - 1) {
        p.index++;
        p.questionStartedAt = Date.now();
        await persist();
        render();
      } else {
        const done = Object.values(p.responses).filter(
          (r) => r.graded && r.correct !== null,
        ).length;
        openDialog(
          "又向前，走了一小步。",
          `<p>本组 ${p.questionIds.length} 道题，已完成 ${done} 道。${done < p.questionIds.length ? "你可以返回补完，也可以稍作休息。" : "给自己一点肯定，再开始下一段。"}</p>`,
          `${button("继续查看", "close-dialog")}${button("回到学习台", "finish-practice", "", "btn primary")}`,
        );
      }
      break;
    }
    case "finish-practice":
      go("/");
      break;
    case "toggle-favorite": {
      const id = el.dataset.id;
      const has = state.favorites.includes(id);
      state.favorites = has
        ? state.favorites.filter((i) => i !== id)
        : [...state.favorites, id];
      await persist();
      render();
      toast(has ? "已取消收藏" : "好题已收藏");
      break;
    }
    case "resolve-mistake": {
      if (state.mistakes[el.dataset.id])
        state.mistakes[el.dataset.id].resolved = true;
      await persist();
      render();
      toast("已标记掌握，继续加油");
      break;
    }
    case "create-exam":
      examOptions();
      break;
    case "begin-exam": {
      const sid = document.querySelector("#exam-subject").value,
        count = Number(document.querySelector("#exam-count").value),
        minutes = Number(document.querySelector("#exam-minutes").value);
      const list = bank.questions.filter(
        (q) => (!sid || q.subjectId === sid) && q.type !== "solution",
      );
      if (
        !Number.isInteger(count) ||
        count < 1 ||
        count > 100 ||
        count > list.length ||
        !Number.isInteger(minutes) ||
        minutes < 1 ||
        minutes > 240
      ) {
        const e = document.querySelector("#exam-error");
        e.className = "inline-error";
        e.textContent = `当前可用 ${list.length} 道自动判分题；题量为 1–100，时长为 1–240 分钟。`;
        return;
      }
      const exam = createExam(
        shuffle(list)
          .slice(0, count)
          .map((q) => q.id),
        minutes,
        sid,
      );
      state.exams.push(exam);
      await persist();
      go("/exam/" + exam.id);
      break;
    }
    case "submit-exam":
      await finishCurrentExam();
      break;
  }
}
const IMPORT_GUIDE = `Local-NEUMathe题库导入说明\n\n题目、答案与解析请使用实际原始数据。本说明不包含 NeuMathe 原题。\n\nJSON 结构：\n{\n "format":"local-neumathe.bank.v1",\n "source":{"name":"题库来源"},\n "subjects":[{"id":"math","name":"科目名称","chapters":[{"id":"chapter-1","name":"章节名称"}]}],\n "questions":[{\n  "id":"全局唯一ID", "subjectId":"math", "chapterId":"chapter-1",\n  "type":"single", "stem":"原题题干",\n  "options":[{"id":"A","text":"原选项A"},{"id":"B","text":"原选项B"}],\n  "answer":"A", "analysis":"原题解析", "difficulty":"medium", "tags":[]\n }]\n}\n\n题型：single 单选，multiple 多选，boolean 判断，fill 填空，solution 解答。\n多选 answer 使用选项 ID 数组，例如 ["A","C"]。\n判断题默认选项 ID 为 true / false（字符串），也可提供自定义选项。\n填空 answer 为字符串或可接受答案数组；acceptedAnswers 可补充其他写法。\n填空只比较规范化文本，不提供符号代数等价判定。\n解答题保留原答案并由学习者对照自评。\n题干与解析支持常见 HTML 排版和 $…$、$$…$$、\\(…\\)、\\[…\\] LaTeX 公式。\n不执行 HTML 中的脚本、事件或其他主动内容。\n导入会替换题库并重置现有学习数据；导入前请先导出完整备份。\n学习数据只保存在本浏览器，完整备份可用于换设备。\n`;
document.addEventListener("click", (event) => {
  const el = event.target.closest("[data-action]");
  if (el) {
    event.preventDefault();
    handleAction(el.dataset.action, el).catch((err) =>
      toast(err.message ?? "操作失败，请重试"),
    );
  } else if (event.target.closest(".nav a,.brand")) {
    mobileOpen = false;
  }
});
document.addEventListener("change", (event) => {
  const f = event.target.dataset.filter;
  if (f) {
    const query = route().query;
    query.delete("session");
    event.target.value ? query.set(f, event.target.value) : query.delete(f);
    if (f === "subject") query.delete("chapter");
    go("/" + route().page + (query.size ? "?" + query : ""));
  }
});
document.addEventListener("input", (event) => {
  if (event.target.matches("[data-answer-text]")) {
    const q = currentQuestion(),
      exam = currentExam();
    if (!q) return;
    if (exam) {
      if (exam.status !== "active" || Date.now() >= exam.endsAt) {
        tickExam();
        return;
      }
      exam.answers[q.id] = event.target.value;
    } else {
      const p = state.practice;
      if (!p) return;
      p.responses[q.id] = {
        ...(p.responses[q.id] ?? { graded: false }),
        answer: event.target.value,
      };
    }
    persist();
  }
  if (event.target.id === "global-search") {
    const query = event.target.value;
    const results = query.trim()
      ? filterQuestions(bank, { search: query }, state).slice(0, 25)
      : [];
    document.querySelector("#search-results").innerHTML = results.length
      ? results
          .map(
            (q) =>
              `<button class="search-item" data-action="practice-one" data-id="${attr(q.id)}">${esc(q.sourceLabel || textOnly(q.stem).slice(0, 120))}<small>${esc(subject(q.subjectId)?.name)} · ${esc(chapter(q))}</small></button>`,
          )
          .join("")
      : `<p style="padding:16px 8px">${query.trim() ? "没有找到相关题目，换个关键词试试。" : "输入关键词，搜索题干或标签。"}</p>`;
  }
});
document.querySelector("#file-input").addEventListener("change", (e) => {
  if (e.target.files[0]) readFile(e.target.files[0]);
});
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      dialog.close();
  }
});
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (dialog.open) dialog.close();
    showSearch();
  }
});
window.addEventListener("hashchange", () => {
  render();
  window.scrollTo(0, 0);
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) tickExam();
});
try {
  const data = await openStorage();
  bank = data.bank;
  state = { ...emptyState(), ...data.state };
  storageReady = true;
  for (const exam of state.exams)
    if (exam.status === "active" && exam.endsAt <= Date.now())
      finishExam(state, bank, exam);
  await persist();
  render();
  if (data.notice) toast(data.notice);
} catch (err) {
  app.innerHTML = `<div class="boot"><span class="boot-mark">∑</span><h1>暂时无法打开学习空间</h1><p>请允许此网站使用浏览器存储，或在普通浏览窗口中重试。</p><p>${esc(err.message)}</p><button class="btn" onclick="location.reload()">重新打开</button></div>`;
}
