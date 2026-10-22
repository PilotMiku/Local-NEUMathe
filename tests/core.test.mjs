import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeBank,
  emptyState,
  emptyBank,
  judge,
  recordAttempt,
  filterQuestions,
  createExam,
  finishExam,
  validateBackup,
  stats,
  dayKey,
  shuffle,
} from "../dist/core.mjs";
import { fixture } from "./fixture.mjs";
const make = () => normalizeBank(structuredClone(fixture));
test("import preserves exact stems, explanations and original records; backup round trip is stable", () => {
  const b = make();
  assert.equal(b.questions[0].stem, fixture.questions[0].stem);
  assert.equal(b.questions[0].analysis, fixture.questions[0].analysis);
  assert.deepEqual(b.questions[0].original, fixture.questions[0]);
  const result = validateBackup({
    format: "shijie.backup.v1",
    bank: b,
    state: emptyState(),
  });
  assert.deepEqual(result.bank.questions, b.questions);
  assert.equal(
    validateBackup({
      format: "shijie.backup.v1",
      bank: emptyBank(),
      state: emptyState(),
    }).bank.questions.length,
    0,
  );
});
test("invalid references, duplicate IDs and mismatched answer keys are rejected before replacing a bank", () => {
  for (const mutate of [
    (d) => d.questions.push(d.questions[0]),
    (d) => (d.questions[0].chapterId = "missing"),
    (d) => (d.questions[0].answer = "Z"),
    (d) => (d.questions[0].type = 999),
  ]) {
    const d = structuredClone(fixture);
    mutate(d);
    assert.throws(() => normalizeBank(d));
  }
  assert.throws(() => normalizeBank({ ...fixture, questions: [] }));
});
test("multiple choice requires an exact set; fill supports explicit accepted forms; solutions remain manual", () => {
  const b = make();
  assert.equal(judge(b.questions[0], "B"), true);
  assert.equal(judge(b.questions[0], "A"), false);
  assert.equal(judge(b.questions[1], ["B", "A"]), true);
  assert.equal(judge(b.questions[1], ["A"]), false);
  assert.equal(judge(b.questions[1], ["A", "B", "C"]), false);
  assert.equal(judge(b.questions[2], " １ / ２ "), true);
  assert.equal(judge(b.questions[2], "0.5"), true);
  assert.equal(judge(b.questions[2], "2/4"), false);
  assert.equal(judge(b.questions[3], "true"), true);
  assert.equal(judge(b.questions[4], "anything"), null);
});
test("wrong answers enter the notebook, explicit mastery removes them, and a new error reopens them", () => {
  const b = make(),
    s = emptyState(),
    q = b.questions[0];
  recordAttempt(s, q, "A", false, { id: "a" });
  recordAttempt(s, q, "A", false, { id: "a" });
  assert.equal(s.attempts.length, 1);
  assert.equal(s.mistakes[q.id].wrongCount, 1);
  s.mistakes[q.id].resolved = true;
  assert.equal(filterQuestions(b, { mistakes: true }, s).length, 0);
  recordAttempt(s, q, "A", false, { id: "b" });
  assert.equal(filterQuestions(b, { mistakes: true }, s).length, 1);
  assert.equal(s.mistakes[q.id].wrongCount, 2);
});
test("exam submission grades unanswered questions, remains idempotent and preserves the original deadline", () => {
  const b = make(),
    s = emptyState(),
    e = createExam(
      b.questions.slice(0, 3).map((q) => q.id),
      1,
      "math",
      1000,
    );
  e.answers = { "qa-single": "B", "qa-multi": ["A", "B"] };
  s.exams.push(e);
  finishExam(s, b, e, 61001);
  assert.equal(e.score, 67);
  assert.equal(e.timedOut, true);
  assert.equal(e.endsAt, 61000);
  assert.equal(s.attempts.length, 3);
  assert.equal(e.results["qa-fill"], false);
  finishExam(s, b, e, 100000);
  assert.equal(s.attempts.length, 3);
  assert.equal(e.submittedAt, 61001);
  assert.throws(() => createExam([], 20));
});
test("statistics use local calendar days and exclude pending manual results", () => {
  const b = make(),
    s = emptyState(),
    now = new Date(2026, 9, 22, 12).getTime();
  const yesterday = new Date(2026, 9, 21, 12).getTime();
  recordAttempt(s, b.questions[0], "B", true, { at: yesterday });
  recordAttempt(s, b.questions[1], ["A"], false, { at: now });
  recordAttempt(s, b.questions[4], "", null, { at: now });
  const result = stats(s, now);
  assert.equal(result.total, 2);
  assert.equal(result.today, 1);
  assert.equal(result.accuracy, 50);
  assert.equal(result.streak, 2);
  assert.equal(dayKey(now), "2026-10-22");
});
test("corrupt backups do not accept dangling references or invalid exam records", () => {
  const b = make(),
    s = emptyState();
  s.favorites = ["missing"];
  assert.throws(() =>
    validateBackup({ format: "shijie.backup.v1", bank: b, state: s }),
  );
  s.favorites = [];
  s.exams = [
    { questionIds: ["missing"], endsAt: 1000, status: "active", answers: {} },
  ];
  assert.throws(() =>
    validateBackup({ format: "shijie.backup.v1", bank: b, state: s }),
  );
});
test("shuffling leaves the bank order unchanged and preserves every selected question", () => {
  const a = [1, 2, 3, 4];
  const out = shuffle(a, () => 0);
  assert.deepEqual(a, [1, 2, 3, 4]);
  assert.deepEqual([...out].sort(), a);
  assert.notDeepEqual(out, a);
});

test("bundled PDF bank keeps all 3010 original questions, provenance and nested chapters across backups", async () => {
  const {readFile} = await import('node:fs/promises');
  const raw=JSON.parse(await readFile(new URL('../dist/data/bank.json',import.meta.url),'utf8'));
  const bank=normalizeBank(raw);
  assert.equal(bank.questions.length,3010);
  assert.equal(bank.sections.length,122);
  assert.equal(bank.questions.filter(q=>q.answerVerified).length,3010);
  assert.equal(bank.questions.filter(q=>q.analysisMissing).length,7);
  assert.equal(bank.questions[0].answer,'B');
  assert.equal(bank.questions[1].answer,'B');
  const roots=bank.subjects[0].chapters.filter(c=>!c.parentId);
  assert.equal(roots.length,7);
  assert.equal(roots.reduce((n,c)=>n+filterQuestions(bank,{subjectId:'calculus',chapterId:c.id}).length,0),3010);
  assert.equal(filterQuestions(bank,{chapterId:'chapter-1'}).length,504);
  assert.equal(filterQuestions(bank,{chapterId:bank.sections[0].id}).length,51);
  assert.equal(filterQuestions(bank,{search:'1.1 函数'}).length,51);
  const restored=validateBackup({format:'shijie.backup.v1',bank,state:emptyState()}).bank;
  assert.equal(filterQuestions(restored,{chapterId:'chapter-1'}).length,504);
  assert.deepEqual(restored.questions[0].source,bank.questions[0].source);
  assert.equal(restored.revision,bank.revision);
});
