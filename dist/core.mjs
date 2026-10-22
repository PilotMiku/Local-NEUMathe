export const VERSION = 1;
export const BANK_FORMAT = "local-neumathe.bank.v1";
export const BACKUP_FORMAT = "local-neumathe.backup.v1";
const chapterSets = [
  [
    "calculus",
    "高等数学",
    "函数、变化与空间",
    [
      "函数与极限",
      "导数与微分",
      "微分中值定理",
      "不定积分",
      "定积分及其应用",
      "微分方程",
      "空间解析几何",
      "多元函数微分学",
      "重积分",
      "曲线积分与曲面积分",
      "无穷级数",
    ],
  ],
  [
    "linear",
    "线性代数",
    "从向量到线性空间",
    [
      "行列式",
      "矩阵",
      "向量与线性相关",
      "线性方程组",
      "特征值与特征向量",
      "二次型",
    ],
  ],
  [
    "probability",
    "概率论与数理统计",
    "在不确定中寻找规律",
    [
      "随机事件与概率",
      "随机变量及其分布",
      "多维随机变量",
      "随机变量的数字特征",
      "大数定律与中心极限定理",
      "样本与抽样分布",
      "参数估计",
      "假设检验",
    ],
  ],
];
export const DEFAULT_SUBJECTS = chapterSets.map(
  ([id, name, description, chapters]) => ({
    id,
    name,
    description,
    chapters: chapters.map((name, i) => ({ id: `${id}-${i + 1}`, name })),
  }),
);
export function emptyBank() {
  return {
    format: BANK_FORMAT,
    subjects: structuredClone(DEFAULT_SUBJECTS),
    questions: [],
    source: { name: "", note: "" },
    importedAt: null,
  };
}
export function emptyState() {
  return {
    version: VERSION,
    attempts: [],
    favorites: [],
    mistakes: {},
    exams: [],
    practice: null,
    theme: "light",
    dailyGoal: 20,
  };
}
export const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function textOnly(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function string(value) {
  return String(value ?? "").trim();
}
function requireText(value, label) {
  const result = string(value);
  if (!result) throw new Error(`缺少${label}`);
  return result;
}
const typeAliases = {
  single: "single",
  single_choice: "single",
  单选题: "single",
  单选: "single",
  multiple: "multiple",
  multiple_choice: "multiple",
  多选题: "multiple",
  多选: "multiple",
  boolean: "boolean",
  true_false: "boolean",
  判断题: "boolean",
  fill: "fill",
  fill_blank: "fill",
  填空题: "fill",
  solution: "solution",
  essay: "solution",
  解答题: "solution",
  计算题: "solution",
};
export function normalizeBank(input, { allowEmpty = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("题库必须是包含 subjects 和 questions 的 JSON 对象");
  if (!Array.isArray(input.subjects) || !input.subjects.length)
    throw new Error("题库缺少 subjects（科目与章节）");
  if (
    !Array.isArray(input.questions) ||
    (!input.questions.length && !allowEmpty)
  )
    throw new Error("questions 为空，请加入原题后再导入");
  if (input.questions.length > 100000)
    throw new Error("单次最多导入 100,000 题");
  const subjectIds = new Set();
  const chapterKeys = new Set();
  const subjects = input.subjects.map((s, i) => {
    const id = requireText(s.id ?? s.subject_id, `第 ${i + 1} 个科目 ID`);
    if (subjectIds.has(id)) throw new Error(`科目 ID 重复：${id}`);
    subjectIds.add(id);
    if (!Array.isArray(s.chapters))
      throw new Error(`科目「${s.name ?? id}」缺少 chapters`);
    const chapters = [];
    function flatten(items, parentId = null) {
      for (const c of items) {
        const cid = requireText(c.id ?? c.chapter_id ?? c.key, "章节 ID");
        const key = `${id}:${cid}`;
        if (chapterKeys.has(key)) throw new Error(`章节 ID 重复：${cid}`);
        chapterKeys.add(key);
        chapters.push({
          id: cid,
          name: requireText(c.name ?? c.chapter_name ?? c.title, "章节名称"),
          parentId: c.parentId ?? parentId,
          questionCount: c.questionCount,
          documentId: c.documentId,
        });
        if (Array.isArray(c.children)) flatten(c.children, cid);
      }
    }
    flatten(s.chapters);
    return {
      id,
      name: requireText(s.name ?? s.subject_name, "科目名称"),
      description: string(s.description),
      chapters,
    };
  });
  const ids = new Set();
  const questions = input.questions.map((item, i) => {
    const q =
      item.question && typeof item.question === "object" ? item.question : item;
    const at = `第 ${i + 1} 题`;
    const id = requireText(q.id ?? q.question_id, `${at} ID`);
    if (ids.has(id))
      throw new Error(`题目 ID 重复：${id}。不同科目的题目也需要唯一 ID`);
    ids.add(id);
    const subjectId = requireText(q.subjectId ?? q.subject_id, `${at}科目 ID`);
    const chapterId = requireText(q.chapterId ?? q.chapter_id, `${at}章节 ID`);
    if (
      !subjectIds.has(subjectId) ||
      !chapterKeys.has(`${subjectId}:${chapterId}`)
    )
      throw new Error(`${at}引用了不存在的科目或章节`);
    const type = typeAliases[q.type ?? q.question_type];
    if (!type)
      throw new Error(
        `${at}题型不明确，请使用 single / multiple / boolean / fill / solution`,
      );
    const stem = requireText(q.stem ?? q.title ?? q.content, `${at}题干`);
    const analysis = String(q.analysis ?? q.explanation ?? q.solution ?? "");
    let options = q.options ?? q.choices ?? [];
    if (!Array.isArray(options) && typeof options === "object")
      options = Object.entries(options).map(([id, text]) => ({ id, text }));
    if (!Array.isArray(options)) throw new Error(`${at}选项格式错误`);
    options = options.map((o, j) =>
      typeof o === "string"
        ? { id: String.fromCharCode(65 + j), text: o }
        : {
            id: string(o.id ?? o.key ?? String.fromCharCode(65 + j)),
            text: String(o.text ?? o.content ?? o.label ?? ""),
          },
    );
    if (type === "boolean" && !options.length)
      options = [
        { id: "true", text: "正确" },
        { id: "false", text: "错误" },
      ];
    if (["single", "multiple", "boolean"].includes(type) && options.length < 2)
      throw new Error(`${at}至少需要两个选项`);
    if (
      new Set(options.map((o) => o.id)).size !== options.length ||
      options.some((o) => !o.id || !o.text.trim())
    )
      throw new Error(`${at}选项 ID 重复或选项内容为空`);
    let answer = q.answer ?? q.correct_answer;
    if (answer === undefined || answer === null || answer === "")
      throw new Error(`${at}缺少答案`);
    if (type === "boolean" && typeof answer === "boolean")
      answer = String(answer);
    if (type === "multiple" && !Array.isArray(answer)) {
      try {
        const parsed = JSON.parse(answer);
        answer = Array.isArray(parsed)
          ? parsed
          : string(answer).split(/[,，;；\s]+/);
      } catch {
        answer = string(answer).split(/[,，;；\s]+/);
      }
    }
    if (["single", "multiple", "boolean"].includes(type)) {
      const values = (Array.isArray(answer) ? answer : [answer]).map(string);
      if (
        !values.length ||
        values.some((a) => !options.some((o) => o.id === a)) ||
        new Set(values).size !== values.length
      )
        throw new Error(`${at}答案与选项 ID 不匹配`);
      if (type !== "multiple" && values.length !== 1)
        throw new Error(`${at}应只有一个正确选项`);
      answer = type === "multiple" ? values : values[0];
    } else answer = Array.isArray(answer) ? answer.map(String) : String(answer);
    return {
      id,
      subjectId,
      chapterId,
      type,
      stem,
      options,
      answer,
      analysis,
      acceptedAnswers: Array.isArray(q.acceptedAnswers)
        ? q.acceptedAnswers.map(String)
        : [],
      difficulty: ["easy", "medium", "hard"].includes(q.difficulty)
        ? q.difficulty
        : "medium",
      tags: Array.isArray(q.tags) ? q.tags.map(String) : [],
      source: q.source,
      sourceLabel: string(q.sourceLabel),
      searchText: string(q.searchText),
      answerVerified: q.answerVerified,
      analysisMissing: q.analysisMissing,
      original: q.original ?? q,
    };
  });
  return {
    format: BANK_FORMAT,
    subjects,
    questions,
    source: {
      name: string(input.source?.name ?? input.sourceName),
      note: string(input.source?.note),
    },
    importedAt: Date.now(),
    revision: input.revision,
    sections: input.sections,
    managedBundle: input.managedBundle,
  };
}
// Upgrading an installed PDF bundle never replaces an explicitly imported custom bank,
// and never drops old question IDs that may be referenced by learning records.
export function upgradeBundledBank(previous, candidate) {
  if (
    previous.questions.length &&
    (previous.managedBundle === false || !previous.revision?.startsWith("pdf-"))
  )
    return previous;
  if (previous.questions.length && previous.revision === candidate.revision)
    return previous;
  const next = normalizeBank(candidate);
  const ids = new Set(next.questions.map((q) => q.id));
  if (previous.questions.some((q) => !ids.has(q.id)))
    throw new Error(
      "新版题库移除了已有题目，已保留旧题库和学习记录，请先导出备份",
    );
  next.managedBundle = true;
  return next;
}
function normalizeFill(a) {
  return String(a).normalize("NFKC").replace(/\s+/g, "").replace(/[−–]/g, "-");
}
export function judge(question, response) {
  if (question.type === "solution") return null;
  if (question.type === "multiple") {
    const a = Array.isArray(response)
      ? [...new Set(response.map(String))].sort()
      : [];
    return (
      JSON.stringify(a) ===
      JSON.stringify([...question.answer].map(String).sort())
    );
  }
  if (question.type === "fill") {
    const accepted = [
      ...(Array.isArray(question.answer) ? question.answer : [question.answer]),
      ...question.acceptedAnswers,
    ];
    return accepted.some((a) => normalizeFill(a) === normalizeFill(response));
  }
  return String(response ?? "") === String(question.answer);
}
export function hasResponse(q, response) {
  return q.type === "multiple"
    ? Array.isArray(response) && response.length > 0
    : response !== undefined &&
        response !== null &&
        String(response).trim() !== "";
}
export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function filterQuestions(bank, filter = {}, state = emptyState()) {
  const needle = string(filter.search).toLowerCase();
  const chapterIds = new Set(filter.chapterIds ?? []);
  const selected = new Set(filter.chapterId ? [filter.chapterId] : []);
  if (selected.size) {
    const chapters = bank.subjects
      .filter((s) => !filter.subjectId || s.id === filter.subjectId)
      .flatMap((s) => s.chapters);
    for (let size = -1; size !== selected.size; ) {
      size = selected.size;
      for (const c of chapters)
        if (selected.has(c.parentId)) selected.add(c.id);
    }
  }
  return bank.questions.filter(
    (q) =>
      (!filter.subjectId || q.subjectId === filter.subjectId) &&
      (!selected.size || selected.has(q.chapterId)) &&
      (!chapterIds.size || chapterIds.has(q.chapterId)) &&
      (!filter.type || q.type === filter.type) &&
      (!filter.difficulty || q.difficulty === filter.difficulty) &&
      (!needle ||
        `${q.searchText ?? ""} ${q.sourceLabel ?? ""} ${textOnly(q.stem)} ${q.tags.join(" ")}`
          .toLowerCase()
          .includes(needle)) &&
      (!filter.favorites || state.favorites.includes(q.id)) &&
      (!filter.mistakes ||
        (state.mistakes[q.id] && !state.mistakes[q.id].resolved)),
  );
}
export function recordAttempt(state, q, answer, correct, options = {}) {
  const id = options.id ?? uid();
  if (state.attempts.some((a) => a.id === id)) return false;
  const at = options.at ?? Date.now();
  state.attempts.push({
    id,
    questionId: q.id,
    subjectId: q.subjectId,
    chapterId: q.chapterId,
    answer: structuredClone(answer ?? ""),
    correct,
    at,
    mode: options.mode ?? "practice",
    durationMs: Math.max(0, options.durationMs ?? 0),
    examId: options.examId ?? null,
    manual: !!options.manual,
  });
  if (correct === false)
    state.mistakes[q.id] = {
      firstAt: state.mistakes[q.id]?.firstAt ?? at,
      lastAt: at,
      wrongCount: (state.mistakes[q.id]?.wrongCount ?? 0) + 1,
      resolved: false,
    };
  return true;
}
export function createPractice(ids, mode = "sequential") {
  return {
    id: uid(),
    questionIds: [...ids],
    index: 0,
    mode,
    responses: {},
    startedAt: Date.now(),
    questionStartedAt: Date.now(),
  };
}
export function createExam(ids, minutes, subjectId = "", now = Date.now()) {
  if (!ids.length) throw new Error("没有可用于考试的题目");
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 240)
    throw new Error("考试时长应为 1–240 分钟");
  return {
    id: uid(),
    subjectId,
    questionIds: [...ids],
    minutes,
    startedAt: now,
    endsAt: now + minutes * 60000,
    answers: {},
    status: "active",
    index: 0,
  };
}
export function finishExam(state, bank, exam, now = Date.now()) {
  if (exam.status === "submitted") return exam;
  const questions = new Map(bank.questions.map((q) => [q.id, q]));
  if (exam.questionIds.some((id) => !questions.has(id)))
    throw new Error("考试题目已不在当前题库中，请恢复原题库");
  let correct = 0;
  const results = {};
  for (const id of exam.questionIds) {
    const q = questions.get(id);
    const answer = exam.answers[id] ?? (q.type === "multiple" ? [] : "");
    const result = judge(q, answer);
    results[id] = result;
    if (result === true) correct++;
    recordAttempt(state, q, answer, result, {
      id: `exam:${exam.id}:${id}`,
      examId: exam.id,
      mode: "exam",
      at: Math.min(now, exam.endsAt),
      durationMs: 0,
    });
  }
  Object.assign(exam, {
    status: "submitted",
    submittedAt: now,
    timedOut: now >= exam.endsAt,
    score: Math.round((correct / exam.questionIds.length) * 100),
    correct,
    results,
  });
  return exam;
}
export function dayKey(at = Date.now()) {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function stats(state, now = Date.now()) {
  const answered = state.attempts.filter((a) => typeof a.correct === "boolean");
  const right = answered.filter((a) => a.correct).length;
  const today = answered.filter((a) => dayKey(a.at) === dayKey(now));
  const days = new Set(answered.map((a) => dayKey(a.at)));
  let streak = 0;
  const cursor = new Date(now);
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return {
    total: answered.length,
    correct: right,
    accuracy: answered.length ? Math.round((right / answered.length) * 100) : 0,
    today: today.length,
    todayCorrect: today.filter((a) => a.correct).length,
    streak,
    minutes: Math.floor(
      answered.reduce((sum, a) => sum + a.durationMs, 0) / 60000,
    ),
    activeDays: days.size,
  };
}
export function validateBackup(input) {
  if (![BACKUP_FORMAT, "shijie.backup.v1"].includes(input?.format))
    throw new Error("这不是 Local-NEUMathe 备份文件");
  const bank = normalizeBank(input.bank, { allowEmpty: true });
  const data = input.state;
  if (
    !data ||
    !Array.isArray(data.attempts) ||
    !Array.isArray(data.exams) ||
    !Array.isArray(data.favorites) ||
    !data.mistakes ||
    typeof data.mistakes !== "object" ||
    Array.isArray(data.mistakes)
  )
    throw new Error("备份中的学习数据格式错误");
  const ids = new Set(bank.questions.map((q) => q.id));
  if (
    data.attempts.some(
      (a) =>
        !a ||
        !ids.has(a.questionId) ||
        !Number.isFinite(a.at) ||
        ![true, false, null].includes(a.correct),
    ) ||
    data.favorites.some((id) => !ids.has(id)) ||
    Object.keys(data.mistakes).some((id) => !ids.has(id))
  )
    throw new Error("备份中的题目关联或答题记录不完整");
  if (
    data.exams.some(
      (e) =>
        !e ||
        !Array.isArray(e.questionIds) ||
        e.questionIds.some((id) => !ids.has(id)) ||
        !["active", "submitted"].includes(e.status) ||
        !Number.isFinite(e.endsAt) ||
        !e.answers ||
        typeof e.answers !== "object",
    )
  )
    throw new Error("备份中的考试记录不完整");
  const state = { ...emptyState(), ...data, version: VERSION };
  state.dailyGoal = Math.min(200, Math.max(1, Number(data.dailyGoal) || 20));
  state.theme = data.theme === "dark" ? "dark" : "light";
  if (
    state.practice &&
    (!Array.isArray(state.practice.questionIds) ||
      state.practice.questionIds.some((id) => !ids.has(id)))
  )
    state.practice = null;
  return { bank, state };
}
