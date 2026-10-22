import { emptyBank, emptyState, normalizeBank } from "./core.mjs";
let db;
let queue = Promise.resolve();
let savedBank;
export async function openStorage() {
  db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("shijie-math", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("kv");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("请关闭其他本地题库页面后重试"));
  });
  db.onversionchange = () => db.close();
  const result = await new Promise((resolve, reject) => {
    const tx = db.transaction("kv");
    const store = tx.objectStore("kv");
    const bank = store.get("bank"),
      state = store.get("state");
    tx.oncomplete = () =>
      resolve({
        bank: bank.result ?? emptyBank(),
        state: state.result ?? emptyState(),
      });
    tx.onerror = () => reject(tx.error);
  });
  savedBank = result.bank;
  if (!result.bank.questions.length) {
    const response = await fetch("./data/bank.json");
    if (!response.ok) throw new Error("本地题库加载失败，请通过启动网站.command 运行服务器");
    result.bank = normalizeBank(await response.json());
  }
  return result;
}
export function saveStorage(bank, state) {
  const snapshot = {
    bank: bank === savedBank ? null : structuredClone(bank),
    state: structuredClone(state),
  };
  const write = () =>
    new Promise((resolve, reject) => {
      const tx = db.transaction("kv", "readwrite");
      if (snapshot.bank) tx.objectStore("kv").put(snapshot.bank, "bank");
      tx.objectStore("kv").put(snapshot.state, "state");
      tx.oncomplete = () => {
        savedBank = bank;
        resolve();
      };
      tx.onabort = () => reject(tx.error ?? new Error("保存失败"));
      tx.onerror = () => reject(tx.error);
    });
  const pending = queue.catch(() => {}).then(write);
  queue = pending;
  return pending;
}
