import { chromium, browserOptions, baseURL } from "./browser-helpers.mjs";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const bank = JSON.parse(
  await readFile(new URL("../dist/data/bank.json", import.meta.url), "utf8"),
);
const origin = baseURL;
const browser = await chromium.launch(browserOptions);
const errors = [],
  external = [],
  scenarios = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!r.url().startsWith(origin)) external.push(r.url());
  });
  const waitImages = () =>
    page.waitForFunction(() =>
      [...document.querySelectorAll(".original-pdf-image")].every(
        (i) => i.complete && i.naturalWidth > 0,
      ),
    );
  await page.goto(origin);
  await page.locator(".local-hero").waitFor();
  assert.equal(await page.locator(".chapter-card").count(), 7);
  assert.equal(
    await page.locator(".local-stat-strip b").first().innerText(),
    "3,501",
  );
  await page.screenshot({
    path: "artifacts/local-home-desktop.png",
    fullPage: true,
  });
  await page.screenshot({
    path: "docs/images/website-preview.png",
    clip: { x: 0, y: 0, width: 1440, height: 1060 },
  });
  assert.match(await page.title(), /Local-NEUMathe/);
  assert.equal(await page.locator(".course-tab").count(), 2);
  await page.locator(".course-tab[href*=linear]").click();
  await page.locator(".course-tab.active[href*=linear]").waitFor();
  assert.equal(await page.locator(".chapter-card").count(), 5);
  await page.locator(".course-tab[href*=calculus]").click();
  await page.locator(".course-tab.active[href*=calculus]").waitFor();
  scenarios.push(
    "3501 real PDF questions are bundled and loaded automatically",
  );
  await page.goto(origin + "/#/practice?subject=calculus&chapter=chapter-1");
  await page.locator(".practice-start").waitFor();
  assert.match(await page.locator(".practice-start").innerText(), /504/);
  await page.locator("#chapter-filter").selectOption(bank.sections[0].id);
  await page.waitForURL(new RegExp(bank.sections[0].id));
  assert.match(await page.locator(".practice-start").innerText(), /51/);
  await page.getByRole("button", { name: "顺序练习", exact: false }).click();
  await page.locator(".question-main").waitFor();
  await waitImages();
  assert.equal(await page.locator(".question-title img").count(), 1);
  assert.equal(await page.locator(".option").count(), 4);
  assert.equal(await page.locator(".analysis").count(), 0);
  assert.equal(await page.locator(".option.correct").count(), 0);
  await page.screenshot({
    path: "artifacts/local-question-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "第 21 题", exact: true }).click();
  await page.getByText("1.1 函数 · 第 21 题", { exact: true }).waitFor();
  await page.getByRole("button", { name: "下一组", exact: true }).click();
  await page.getByText("1.1 函数 · 第 41 题", { exact: true }).waitFor();
  await page.getByRole("button", { name: "上一组", exact: true }).click();
  await page.getByText("1.1 函数 · 第 1 题", { exact: true }).waitFor();
  scenarios.push(
    "parent chapter and section filters; full session navigation beyond question 20 and 40",
  );
  await page.locator('[data-action="answer-option"][data-value="B"]').click();
  await page.getByRole("button", { name: "确认答案", exact: true }).click();
  await page.getByText("这道题，掌握了", { exact: false }).waitFor();
  await waitImages();
  assert.equal(
    await page.locator(".option.correct .option-key").innerText(),
    "B",
  );
  assert.equal(await page.locator(".analysis img").count(), 1);
  await page.screenshot({
    path: "artifacts/local-answer-desktop.png",
    fullPage: true,
  });
  await page.reload();
  await page.locator(".analysis img").waitFor();
  await waitImages();
  assert.equal(
    await page.locator(".option.correct .option-key").innerText(),
    "B",
  );
  scenarios.push(
    "original answer B grades correctly; original explanation renders; progress survives reload",
  );
  await page.getByRole("button", { name: "第 27 题", exact: true }).click();
  await page.locator('[data-action="answer-option"][data-value="C"]').click();
  await page.getByRole("button", { name: "确认答案", exact: true }).click();
  await page
    .getByText("这道题的原 PDF 未附解析，请查看原 PDF 核对。", { exact: true })
    .waitFor();
  assert.equal(
    await page.locator(".option.correct .option-key").innerText(),
    "C",
  );
  scenarios.push(
    "original without explanation is explicitly marked while its verified answer is graded",
  );
  // Representative questions include tall fractions, integral bounds and spatial geometry.
  for (const subject of bank.subjects)
    for (const root of subject.chapters) {
      const section = root.children[Math.floor(root.children.length / 2)];
      await page.goto(
        origin + "/#/practice?subject=" + subject.id + "&chapter=" + section.id,
      );
      await page
        .getByRole("button", { name: "顺序练习", exact: false })
        .click();
      await page.locator(".question-title img").waitFor();
      await waitImages();
      assert.equal(await page.locator(".option").count(), 4);
      const first = bank.questions.find((q) => q.chapterId === section.id);
      await page
        .locator(`[data-action="answer-option"][data-value="${first.answer}"]`)
        .click();
      await page.getByRole("button", { name: "确认答案", exact: true }).click();
      await page.locator(".result-box").waitFor();
      await waitImages();
      await page.screenshot({
        path: `artifacts/local-chapter-${root.id}-answer.png`,
        fullPage: true,
      });
    }
  scenarios.push(
    "original formula and explanation image rendering sampled in all twelve chapters across both subjects",
  );
  // PDF range and invalid paths.
  const sid = bank.sections[0].id;
  const pdf = await page.request.get(origin + "/source-pdf/" + sid + ".pdf", {
    headers: { Range: "bytes=0-99" },
  });
  assert.equal(pdf.status(), 206);
  assert.equal((await pdf.body()).length, 100);
  assert.match((await pdf.body()).toString(), /^%PDF/);
  assert.equal(
    (
      await page.request.get(origin + "/api/question-image/unknown/stem/0.webp")
    ).status(),
    404,
  );
  assert.equal(
    (await page.request.get(origin + "/source-pdf/unknown.pdf")).status(),
    404,
  );
  const health = await (await page.request.get(origin + "/api/health")).json();
  assert.equal(health.questions, 3501);
  scenarios.push(
    "local health, original PDF partial download, unknown resource rejection",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "artifacts/local-answer-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.getByRole("button", { name: "切换明暗主题" }).click();
  await page.waitForFunction(() => document.body.classList.contains("dark"));
  await waitImages();
  await page.screenshot({
    path: "artifacts/local-answer-mobile-dark.png",
    fullPage: true,
  });
  await page.goto(origin + "/#/");
  await page.locator(".local-hero").waitFor();
  await page.getByRole("button", { name: "切换明暗主题" }).click();
  await page.screenshot({
    path: "artifacts/local-home-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.getByRole("button", { name: "打开导航" }).click();
  await page.locator('.local-nav a[href="#/library"]').click();
  await page.locator("#drop-zone").waitFor();
  scenarios.push("390px mobile layout, navigation and dark appearance");
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  // Simulate an existing installation before the linear algebra bundle was added.
  const migration = await browser.newContext();
  const upgradePage = await migration.newPage();
  upgradePage.on("pageerror", (e) => errors.push(e.message));
  await upgradePage.goto(origin);
  await upgradePage.locator(".local-hero").waitFor();
  const oldBank = structuredClone(bank);
  oldBank.questions = oldBank.questions.filter(
    (q) => q.subjectId === "calculus",
  );
  oldBank.subjects = oldBank.subjects.filter((s) => s.id === "calculus");
  oldBank.sections = oldBank.sections.filter((s) => s.subjectId === "calculus");
  oldBank.revision = "pdf-before-linear";
  oldBank.managedBundle = true;
  const oldId = oldBank.questions[0].id;
  await upgradePage.evaluate(
    async ({ oldBank, oldId }) => {
      const { emptyState, createExam, createPractice } = await import(
        "./core.mjs"
      );
      const state = emptyState();
      state.attempts = [
        {
          id: "kept-attempt",
          questionId: oldId,
          subjectId: "calculus",
          chapterId: oldBank.questions[0].chapterId,
          answer: "B",
          correct: true,
          at: Date.now(),
          durationMs: 1000,
        },
      ];
      state.favorites = [oldId];
      state.mistakes = { [oldId]: { resolved: false, wrongCount: 1 } };
      state.practice = createPractice([oldId]);
      state.exams = [createExam([oldId], 30, "calculus")];
      const database = await new Promise((resolve, reject) => {
        const r = indexedDB.open("shijie-math", 1);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      await new Promise((resolve, reject) => {
        const tx = database.transaction("kv", "readwrite");
        tx.objectStore("kv").put(oldBank, "bank");
        tx.objectStore("kv").put(state, "state");
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      database.close();
    },
    { oldBank, oldId },
  );
  await upgradePage.reload();
  await upgradePage.locator(".local-hero").waitFor();
  assert.equal(
    await upgradePage.locator(".local-stat-strip b").first().innerText(),
    "3,501",
  );
  const stored = await upgradePage.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open("shijie-math", 1);
        r.onsuccess = () => {
          const tx = r.result.transaction("kv");
          const b = tx.objectStore("kv").get("bank"),
            s = tx.objectStore("kv").get("state");
          tx.oncomplete = () => {
            resolve({ bank: b.result, state: s.result });
            r.result.close();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  assert.equal(stored.bank.revision, bank.revision);
  assert.equal(stored.state.attempts[0].id, "kept-attempt");
  assert.deepEqual(stored.state.favorites, [oldId]);
  assert.equal(stored.state.mistakes[oldId].wrongCount, 1);
  assert.equal(stored.state.practice.questionIds[0], oldId);
  assert.equal(stored.state.exams[0].questionIds[0], oldId);
  assert.equal(stored.state.exams[0].status, "active");
  await migration.close();
  scenarios.push(
    "existing PDF bundle upgrades automatically without losing attempts, favorites, mistakes, practice or active exams",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "artifacts/local-bank-verification.json",
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
    "Real PDF bank browser verification passed:",
    scenarios.length,
    "scenarios",
  );
  await context.close();
} finally {
  await browser.close();
}
