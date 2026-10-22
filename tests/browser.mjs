import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { fixture } from "./fixture.mjs";
const require = createRequire(
  "/Users/david/.npm/_npx/af752b90495482d7/node_modules/rea-agents/package.json",
);
const { chromium } = require("playwright-core");
await mkdir("artifacts", { recursive: true });
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const errors = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1060 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:4178/");
  await page.locator(".local-hero").waitFor();
  await page.screenshot({
    path: "artifacts/qa-synthetic-dashboard-desktop.png",
    fullPage: true,
  });
  assert.equal(await page.locator(".local-stat-strip>div:nth-child(3) b").first().innerText(), "0");
  await page.locator('.local-nav a[href="#/library"]').click();
  await page.getByRole("button", { name: "选择题库文件" }).click();
  // File chooser is supplied using the underlying, user-facing file input.
  await page
    .locator("#file-input")
    .setInputFiles({
      name: "synthetic-qa-bank.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(fixture)),
    });
  await page.getByRole("button", { name: "确认导入", exact: true }).click();
  await page.locator(".local-hero").waitFor();
  await page.locator('.local-nav a[href="#/practice"]').click();
  await page.getByRole("button", { name: /顺序练习/ }).click();
  await page.locator(".question-title .katex").first().waitFor();
  await page.locator('[data-action="answer-option"][data-value="A"]').click();
  await page.getByRole("button", { name: "确认答案", exact: true }).click();
  await page.getByText("没关系，把思路再理一遍").waitFor();
  await page.getByRole("button", { name: "收藏题目", exact: true }).click();
  await page.getByRole("button", { name: "下一题", exact: false }).click();
  await page.locator('[data-action="answer-option"][data-value="A"]').click();
  await page.locator('[data-action="answer-option"][data-value="B"]').click();
  await page.getByRole("button", { name: "确认答案", exact: true }).click();
  await page.getByText("这道题，掌握了").waitFor();
  await page.reload();
  await page.getByText("这道题，掌握了").waitFor();
  await page.screenshot({
    path: "artifacts/qa-synthetic-practice-desktop.png",
    fullPage: true,
  });
  await page.locator('.local-nav a[href="#/review"]').click();
  await page
    .getByRole("heading", { name: "回头看，是为了走得更远。" })
    .waitFor();
  assert.equal(await page.locator(".collection-stem").count(), 1);
  await page.locator('.local-nav a[href="#/favorites"]').click();
  await page.getByRole("heading", { name: "好题，值得再见。" }).waitFor();
  assert.equal(await page.locator(".collection-stem").count(), 1);
  await page.locator('.local-nav a[href="#/stats"]').click();
  await page.locator(".big-stat b").first().waitFor();
  assert.equal(await page.locator(".big-stat b").first().innerText(), "2");
  await page.locator('.local-nav a[href="#/exams"]').click();
  await page.getByRole("button", { name: "新建模拟考试" }).click();
  await page.locator("#exam-count").fill("3");
  await page.locator("#exam-minutes").fill("1");
  await page.getByRole("button", { name: "开始考试", exact: false }).click();
  await page.locator("[data-timer]").waitFor();
  await page.reload();
  await page.locator("[data-timer]").waitFor();
  const readExam = () =>
    page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const r = indexedDB.open("shijie-math", 1);
          r.onsuccess = () => {
            const tx = r.result.transaction("kv");
            const get = tx.objectStore("kv").get("state");
            get.onsuccess = () => {
              const exam = get.result.exams.find((e) => e.status === "active");
              resolve({
                id: exam.id,
                questionId: exam.questionIds[exam.index],
                index: exam.index,
              });
            };
            get.onerror = () => reject(get.error);
          };
        }),
    );
  for (let i = 0; i < 3; i++) {
    const e = await readExam();
    const q = fixture.questions.find((q) => q.id === e.questionId);
    if (q.type === "fill")
      await page.locator("[data-answer-text]").fill(q.answer);
    else
      for (const a of Array.isArray(q.answer) ? q.answer : [String(q.answer)])
        await page
          .locator(`[data-action="answer-option"][data-value="${a}"]`)
          .click();
    if (i < 2)
      await page
        .locator(`[data-action="navigate-question"][data-index="${i + 1}"]`)
        .first()
        .click();
  }
  await page
    .getByRole("button", { name: "提交试卷", exact: true })
    .first()
    .click();
  await page.locator('#dialog [data-action="confirm-dialog"]').click();
  await page.locator(".score").waitFor();
  assert.match(await page.locator(".score").innerText(), /100/);
  await page.reload();
  await page.locator(".score").waitFor();
  await page.locator('.local-nav a[href="#/exams"]').click();
  await page.getByRole("button", { name: "新建模拟考试" }).click();
  await page.locator("#exam-count").fill("1");
  await page.locator("#exam-minutes").fill("1");
  await page.getByRole("button", { name: "开始考试", exact: false }).click();
  await page.locator("[data-timer]").waitFor();
  await page.locator('.local-nav a[href="#/"]').click();
  await page.locator(".local-hero").waitFor();
  await page.clock.install();
  await page.clock.fastForward(61000);
  await page.getByText("考试时间已到，已自动交卷").waitFor();
  await page.locator('.local-nav a[href="#/exams"]').click();
  await page.locator(".exam-card a").first().click();
  await page.locator(".score").waitFor();
  assert.match(await page.locator(".score").innerText(), /^0/);
  await page.getByText("时间到，已自动交卷").first().waitFor();
  await page.locator('.local-nav a[href="#/library"]').click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出完整备份" }).click();
  const download = await downloadPromise;
  await download.saveAs("artifacts/qa-backup.json");
  await page.getByRole("button", { name: "清空学习记录" }).click();
  await page.locator('#dialog [data-action="confirm-dialog"]').click();
  await page.locator(".local-hero").waitFor();
  await page.locator('.local-nav a[href="#/library"]').click();
  await page.getByRole("button", { name: "恢复学习数据" }).click();
  await page.locator("#file-input").setInputFiles("artifacts/qa-backup.json");
  await page.locator('#dialog [data-action="confirm-dialog"]').click();
  await page.locator(".local-hero").waitFor();
  assert.equal(await page.locator(".local-stat-strip>div:nth-child(3) b").first().innerText(), "6");
  await page.locator('.local-nav a[href="#/practice"]').click();
  await page.locator("#question-search").fill("安全排版");
  await page.locator("#question-search").dispatchEvent("change");
  await page.waitForURL(/q=/);
  await page.getByRole("button", { name: "练一练", exact: true }).click();
  assert.equal(await page.evaluate(() => window.__injected), undefined);
  assert.equal(
    await page
      .locator(
        ".question-title [onerror],.question-title script,.question-title iframe",
      )
      .count(),
    0,
  );
  await context.close();
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    deviceScaleFactor: 1,
  });
  const mp = await mobile.newPage();
  mp.on("pageerror", (e) => errors.push(e.message));
  await mp.goto("http://127.0.0.1:4178/");
  await mp.locator(".local-hero").waitFor();
  assert.equal(
    await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  await mp.screenshot({
    path: "artifacts/qa-synthetic-dashboard-mobile.png",
    fullPage: true,
  });
  await mp.getByRole("button", { name: "打开导航" }).click();
  await mp.locator('.local-nav a[href="#/library"]').click();
  await mp
    .getByRole("heading", { name: "让原题，回到你的学习节奏。" })
    .waitFor();
  assert.equal(
    await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  await mp.getByRole("button", { name: "切换明暗主题" }).click();
  await mp.waitForFunction(() => document.body.classList.contains("dark"));
  assert.equal(
    await mp.locator("body").evaluate((e) => e.classList.contains("dark")),
    true,
  );
  await mp.screenshot({
    path: "artifacts/library-mobile-dark.png",
    fullPage: true,
  });
  await mobile.close();
  assert.deepEqual(errors, []);
  await writeFile(
    "artifacts/browser-verification.json",
    JSON.stringify(
      {
        passed: true,
        scenarios: [
          "bundled local dashboard",
          "original-content JSON import",
          "LaTeX rendering",
          "single and multiple choice grading",
          "wrong notebook",
          "favorites",
          "statistics",
          "practice reload persistence",
          "timed exam and answer persistence",
          "exam scoring",
          "timeout auto-submission",
          "backup export and restore",
          "imported HTML inertness",
          "mobile layout",
          "mobile navigation",
          "dark theme",
        ],
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "Browser checks passed. Screenshots and verification are in artifacts/.",
  );
} finally {
  await browser.close();
}
