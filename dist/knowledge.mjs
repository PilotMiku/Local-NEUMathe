export const emptyKnowledge = () => ({
  articles: [],
  sources: {},
  stats: {},
  sourceNotice: "",
  error: "",
});

export function normalizeKnowledgeRecords(state) {
  for (const key of ["knowledgeRead", "knowledgeFavorites"]) {
    state[key] = [
      ...new Set(
        Array.isArray(state[key])
          ? state[key].filter((id) => typeof id === "string")
          : [],
      ),
    ];
  }
  return state;
}

export function filterKnowledge(data, query, state) {
  const needle = (query.get("q") || "").trim().toLocaleLowerCase();
  return data.articles.filter(
    (article) =>
      (!query.get("category") || article.category === query.get("category")) &&
      (query.get("view") !== "favorites" ||
        state.knowledgeFavorites.includes(article.id)) &&
      (!needle ||
        `${article.title} ${article.searchText}`
          .toLocaleLowerCase()
          .includes(needle)),
  );
}

export function knowledgePage(data, state, route, ui) {
  const { esc, attr, icon, button, head } = ui;
  if (data.error)
    return `${head("习概知识点", "阅读章节笔记，整理复习进度。")}
    <section class="card empty"><h2>暂时无法加载知识点</h2><p>${esc(data.error)}</p>${button("重新加载", "reload-knowledge", "", "btn primary")}</section>`;
  const sourceLink = (reference, label) => {
    const source = data.sources[reference.id];
    if (!source) return "";
    return `<a class="btn small" href="./knowledge-source/${encodeURIComponent(source.id)}.${source.type}${source.type === "pdf" ? `#page=${reference.page || 1}` : ""}" target="_blank" rel="noopener">${icon("folder", 14)} ${label || (source.type === "pdf" ? `原 PDF · ${source.pages} 页` : "Markdown 原文")}</a>`;
  };
  const toggleFavorite = (article) =>
    button(
      `${icon("star", 15)} ${state.knowledgeFavorites.includes(article.id) ? "已收藏" : "收藏"}`,
      "knowledge-favorite",
      `data-id="${attr(article.id)}" aria-label="${state.knowledgeFavorites.includes(article.id) ? "取消收藏知识点" : "收藏知识点"}"`,
      "btn small " +
        (state.knowledgeFavorites.includes(article.id) ? "soft" : ""),
    );

  if (route.parts[1]) {
    const article = data.articles.find((a) => a.id === route.parts[1]);
    if (!article)
      return `${head("未找到这份资料", "可以返回目录查看现有知识点。", '<a class="btn" href="#/knowledge">返回目录</a>')}`;
    const read = state.knowledgeRead.includes(article.id);
    const index = data.articles.indexOf(article);
    const previous = data.articles[index - 1],
      next = data.articles[index + 1];
    return `${head("习概知识点", article.category, '<a class="btn" href="#/knowledge">返回知识点目录</a>')}
      <div class="reading-toolbar"><span class="pill ${read ? "green" : "blue"}">${read ? "已读" : "未读"}</span><span class="grow"></span>${toggleFavorite(article)}${button(`${icon("check", 15)} ${read ? "标为未读" : "标为已读"}`, "knowledge-read", `data-id="${attr(article.id)}"`, "btn small " + (read ? "" : "primary"))}</div>
      <div class="reading-layout ${article.headings.length ? "" : "no-toc"}">
        ${article.headings.length ? `<aside class="card reading-toc"><details open><summary>本篇目录 <small>${article.headings.length} 节</small></summary><div>${article.headings.map((h) => `<button data-action="knowledge-scroll" data-target="${attr(h.id)}" style="--level:${Math.min(3, Math.max(0, h.level - 2))}">${esc(h.title)}</button>`).join("")}</div></details></aside>` : ""}
        <article class="card reading-paper"><header><span class="eyebrow">STUDY NOTES · 原文阅读</span><h1>${esc(article.title)}</h1><div class="reading-meta"><span>${article.kind === "note" ? `约 ${article.minutes} 分钟` : "PDF 汇编资料"}</span><span>来自你提供的复习资料</span></div><div class="flex source-links">${article.sources.map((ref) => sourceLink(ref)).join("")}</div></header>
          ${article.kind === "note" ? `<div class="reading-content rich" data-rich="${attr(article.html)}"></div>` : `<div class="pdf-reading-card">${icon("book", 36)}<h2>打开原始 PDF 阅读</h2><p>这份资料是 PDF 汇编，保留原来的页面和排版。</p>${article.sources.map((ref) => sourceLink(ref, "打开 PDF 资料")).join("")}</div>`}
          <nav class="reading-adjacent" aria-label="上一篇和下一篇">${previous ? `<a href="#/knowledge/${previous.id}"><small>上一篇</small><span>${esc(previous.title)}</span></a>` : "<span></span>"}${next ? `<a href="#/knowledge/${next.id}"><small>下一篇</small><span>${esc(next.title)}</span></a>` : ""}</nav>
        </article>
      </div>`;
  }

  const articles = filterKnowledge(data, route.query, state);
  const done = data.articles.filter((a) =>
    state.knowledgeRead.includes(a.id),
  ).length;
  const link = (key, value) => {
    const query = new URLSearchParams(route.query);
    value ? query.set(key, value) : query.delete(key);
    return "#/knowledge" + (query.size ? "?" + query.toString() : "");
  };
  const categories = [...new Set(data.articles.map((a) => a.category))];
  return `${head("习概知识点", "按章节阅读原始笔记，收藏重点，记录复习进度。")}
    <section class="card knowledge-overview"><div><span class="pill blue">习概 · 知识复习</span><h2>读懂知识点，再梳理一遍。</h2><p>${data.stats.notes || 0} 篇知识笔记 · ${data.stats.pdfFiles || 0} 份原始 PDF · ${data.stats.sections || 0} 个阅读小节</p></div><div class="knowledge-progress"><b>${done}<small> / ${data.articles.length}</small></b><span>已读资料</span><div class="progress-bar"><span style="width:${data.articles.length ? (done / data.articles.length) * 100 : 0}%"></span></div></div></section>
    <div class="card knowledge-filters"><label class="knowledge-search"><span class="sr-only">搜索知识点全文</span>${icon("search", 18)}<input class="input" data-knowledge-query type="search" value="${attr(route.query.get("q") || "")}" placeholder="搜索标题或知识点全文，回车确认"></label><a class="btn small ${route.query.get("view") === "favorites" ? "soft" : ""}" href="${link("view", route.query.get("view") === "favorites" ? "" : "favorites")}">${icon("star", 14)} ${route.query.get("view") === "favorites" ? "查看全部" : "只看收藏"}</a></div>
    <nav class="knowledge-categories" aria-label="资料分类"><a class="${!route.query.get("category") ? "active" : ""}" href="${link("category", "")}">全部资料</a>${categories.map((category) => `<a href="${link("category", category)}" class="${route.query.get("category") === category ? "active" : ""}">${esc(category)}</a>`).join("")}<span class="grow"></span><small>共 ${articles.length} 份</small></nav>
    <div class="knowledge-grid">${articles.map((article) => `<article class="card knowledge-card"><div class="knowledge-card-top"><span class="pill ${article.kind === "pdf" ? "" : "blue"}">${esc(article.category)}</span>${state.knowledgeRead.includes(article.id) ? '<span class="knowledge-read-badge">已读</span>' : ""}</div><a href="#/knowledge/${article.id}" class="knowledge-title"><h2>${esc(article.title)}</h2></a><p>${esc(article.excerpt)}</p><div class="knowledge-card-bottom"><a class="text-btn" href="#/knowledge/${article.id}">${article.kind === "pdf" ? "打开资料" : "阅读笔记"} ${icon("arrow", 13)}</a><span class="grow"></span>${toggleFavorite(article)}</div></article>`).join("")}</div>
    ${!articles.length ? '<section class="card empty"><h2>没有找到相关资料</h2><p>试试其他关键词，或切换资料分类。</p><a class="btn primary" href="#/knowledge">查看全部知识点</a></section>' : ""}
    <details class="card knowledge-source-notice"><summary>原资料说明</summary><div class="rich reading-content" data-rich="${attr(data.sourceNotice)}"></div></details>`;
}
