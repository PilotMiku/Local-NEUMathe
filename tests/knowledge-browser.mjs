import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { chromium, browserOptions, baseURL } from "./browser-helpers.mjs";
const data = JSON.parse(await readFile("./dist/data/knowledge.json", "utf8"));
const article = data.articles.find((a) => a.title.includes("以人民为中心"));
const browser = await chromium.launch(browserOptions);
const errors = [],
  external = [],
  scenarios = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!r.url().startsWith(baseURL)) external.push(r.url());
  });
  await page.goto(baseURL);
  await page.locator(".knowledge-entry").waitFor();
  assert.match(await page.locator(".knowledge-entry").innerText(), /20 篇笔记/);
  await page.locator(".knowledge-entry").click();
  await page.locator(".knowledge-overview").waitFor();
  assert.equal(await page.locator(".knowledge-card").count(), 22);
  assert.match(
    await page.locator(".knowledge-overview").innerText(),
    /16 份原始 PDF/,
  );
  await page.screenshot({
    path: "artifacts/knowledge-desktop.png",
    fullPage: true,
  });
  await page.locator("[data-knowledge-query]").fill("民心");
  await page.locator("[data-knowledge-query]").press("Enter");
  await page.waitForURL(/q=/);
  await page
    .locator(`.knowledge-title[href="#/knowledge/${article.id}"]`)
    .waitFor();
  await page
    .locator(`.knowledge-title[href="#/knowledge/${article.id}"]`)
    .click();
  await page.locator(".reading-paper h1").waitFor();
  assert.equal(
    await page.locator(".reading-paper h1").innerText(),
    article.title,
  );
  assert.ok((await page.locator(".reading-content strong").count()) > 0);
  assert.ok((await page.locator(".reading-content u").count()) > 0);
  assert.equal(
    await page.locator(".reading-toc button").count(),
    article.headings.length,
  );
  await page.locator(".reading-toc button").last().click();
  const target = article.headings.at(-1).id;
  await page.waitForFunction(
    (id) =>
      document.getElementById(id).getBoundingClientRect().top < innerHeight &&
      window.scrollY > 0,
    target,
  );
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.getByRole("button", { name: "标为已读", exact: false }).click();
  await page.getByRole("button", { name: "收藏知识点", exact: true }).click();
  await page
    .getByRole("button", { name: "取消收藏知识点", exact: true })
    .waitFor();
  await page.reload();
  await page.getByRole("button", { name: "标为未读", exact: false }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "取消收藏知识点", exact: true })
      .count(),
    1,
  );
  await page.screenshot({
    path: "artifacts/knowledge-reading-desktop.png",
    fullPage: true,
  });
  scenarios.push(
    "20 original notes and two PDF collections, full-text search, headings, bold and underline, table-of-contents navigation",
  );
  scenarios.push(
    "independent favorites and read progress persist after reload",
  );
  await page.locator('[data-action="search"]').click();
  await page.locator("#global-search").fill("民心");
  await page
    .locator(`[data-action="open-knowledge"][data-id="${article.id}"]`)
    .click();
  await page.locator(".reading-paper h1").waitFor();
  assert.equal(
    await page.locator(".reading-paper h1").innerText(),
    article.title,
  );
  scenarios.push(
    "global search finds knowledge-note contents and opens the corresponding article",
  );
  const pdf = article.sources.find(
    (ref) => data.sources[ref.id].type === "pdf",
  );
  const md = article.sources.find((ref) => data.sources[ref.id].type === "md");
  const response = await page.request.get(
    `${baseURL}/knowledge-source/${pdf.id}.pdf`,
    { headers: { Range: "bytes=0-99" } },
  );
  assert.equal(response.status(), 206);
  assert.match((await response.body()).toString(), /^%PDF/);
  const originalMD = await page.request.get(
    `${baseURL}/knowledge-source/${md.id}.md`,
  );
  assert.equal(
    await originalMD.text(),
    await readFile(data.sources[md.id].path, "utf8"),
  );
  assert.equal(
    (
      await page.request.get(`${baseURL}/knowledge-source/${pdf.id}.md`)
    ).status(),
    404,
  );
  assert.equal(
    (
      await page.request.get(`${baseURL}/knowledge-source/ks-000000000000.pdf`)
    ).status(),
    404,
  );
  scenarios.push(
    "original Markdown and PDF downloads, PDF partial reads, whitelist rejects unknown and mismatched source IDs",
  );
  await page.goto(baseURL + "/#/knowledge?view=favorites");
  await page.locator(".knowledge-card").first().waitFor();
  assert.equal(await page.locator(".knowledge-card").count(), 1);
  assert.equal(
    await page.locator(".knowledge-progress>b").innerText(),
    "1 / 22",
  );
  await page.goto(
    baseURL + "/#/knowledge?category=" + encodeURIComponent("汇编资料"),
  );
  await page.locator(".knowledge-card").first().waitFor();
  assert.equal(await page.locator(".knowledge-card").count(), 2);
  await page.locator(".knowledge-title").first().click();
  await page.locator(".pdf-reading-card").waitFor();
  await page.locator('.local-nav a[href="#/library"]').click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "导出完整备份", exact: false })
    .click();
  const download = await downloadPromise;
  await download.saveAs("artifacts/qa-knowledge-backup.json");
  const backup = JSON.parse(
    await readFile("artifacts/qa-knowledge-backup.json", "utf8"),
  );
  assert.deepEqual(backup.state.knowledgeRead, [article.id]);
  assert.deepEqual(backup.state.knowledgeFavorites, [article.id]);
  await page
    .getByRole("button", { name: "清空学习记录", exact: false })
    .click();
  await page.locator('#dialog [data-action="confirm-dialog"]').click();
  await page.locator(".local-hero").waitFor();
  await page.locator('.local-nav a[href="#/library"]').click();
  await page
    .getByRole("button", { name: "恢复学习数据", exact: false })
    .click();
  await page
    .locator("#file-input")
    .setInputFiles("artifacts/qa-knowledge-backup.json");
  await page.locator('#dialog [data-action="confirm-dialog"]').click();
  await page.locator(".local-hero").waitFor();
  await page.goto(`${baseURL}/#/knowledge/${article.id}`);
  await page.getByRole("button", { name: "标为未读", exact: false }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "取消收藏知识点", exact: true })
      .count(),
    1,
  );
  scenarios.push(
    "knowledge favorites and reading records survive full-backup export, learning reset and restoration",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: "artifacts/knowledge-reading-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "切换明暗主题" }).click();
  await page.waitForFunction(() => document.body.classList.contains("dark"));
  await page.screenshot({
    path: "artifacts/knowledge-reading-mobile-dark.png",
    fullPage: true,
  });
  await page.goto(baseURL + "/#/knowledge");
  await page.locator(".knowledge-overview").waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  scenarios.push("390px reading layout and knowledge catalog, dark theme");
  const sandbox = await browser.newContext();
  const sp = await sandbox.newPage();
  sp.on("pageerror", (e) => errors.push(e.message));
  const unsafe = structuredClone(data);
  unsafe.articles.find((a) => a.id === article.id).html +=
    '<script>window.__knowledgeInjected=true</script><img src="javascript:alert(1)" onerror="window.__knowledgeInjected=true"><iframe srcdoc="test"></iframe>';
  await sp.route("**/data/knowledge.json", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(unsafe),
    }),
  );
  await sp.goto(`${baseURL}/#/knowledge/${article.id}`);
  await sp.locator(".reading-content").waitFor();
  assert.equal(await sp.evaluate(() => window.__knowledgeInjected), undefined);
  assert.equal(
    await sp
      .locator(
        ".reading-content script,.reading-content iframe,.reading-content [onerror]",
      )
      .count(),
    0,
  );
  await sandbox.close();
  scenarios.push("Markdown HTML is sanitized before display");
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await writeFile(
    "artifacts/knowledge-verification.json",
    JSON.stringify(
      {
        passed: true,
        scenarios,
        pageErrors: errors,
        externalRequests: external,
      },
      null,
      2,
    ),
  );
  console.log(
    "Knowledge browser checks passed:",
    scenarios.length,
    "scenarios",
  );
  await context.close();
} finally {
  await browser.close();
}
