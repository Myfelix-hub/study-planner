// 数据层：localStorage 持久化 + 响应式 store
import { uid, todayStr } from './util.js';

const KEY = 'studyPlanner.v1';

// core: 初二初三三大重点科目（数学、英语、物理），在排序、统计和 AI 规划中加权
const DEFAULT_SUBJECTS = [
  { name: '数学', color: '#4F6DF5', core: true },
  { name: '英语', color: '#9B59D0', core: true },
  { name: '物理', color: '#1FA9A0', core: true },
  { name: '语文', color: '#E8734A' },
  { name: '历史', color: '#B0763B' },
  { name: '地理', color: '#3D9B50' },
  { name: '生物', color: '#6BBF3B' },
  { name: '道法', color: '#D05A8C' },
  { name: '体育', color: '#E0A92E' },
  { name: '其他', color: '#8A94A6' },
];

function defaultState() {
  return {
    version: 1,
    settings: {
      apiKey: '',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-v4-flash',
      theme: 'blueprint',
      studentName: 'Jeffrey',
      grade: '初二',
      vacationEnd: '',
      dailyMinutes: 240,
    },
    subjects: DEFAULT_SUBJECTS.map(s => ({ id: uid(), ...s })),
    // task: { id, date, subjectId, title, estMinutes, done, doneAt, source }
    tasks: [],
    // AI 参谋聊天记录 { role: 'user'|'assistant', content, at }
    chat: [],
  };
}

export const store = Vue.reactive(defaultState());

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return;
    Object.assign(store.settings, data.settings || {});
    if (Array.isArray(data.subjects) && data.subjects.length) store.subjects = data.subjects;
    if (Array.isArray(data.tasks)) store.tasks = data.tasks;
    if (Array.isArray(data.chat)) store.chat = data.chat;
  } catch (e) {
    console.error('读取本地数据失败', e);
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      version: store.version,
      settings: store.settings,
      subjects: store.subjects,
      tasks: store.tasks,
      chat: store.chat,
    }));
  } catch (e) {
    console.error('保存失败', e);
  }
}

let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 150);
}

export function initStore() {
  load();
  applyTheme();
  Vue.watch(store, save, { deep: true });
  // 页面隐藏/关闭时立即落盘，避免防抖窗口内丢数据
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', persist);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') persist();
    });
  }
}

// ---------- 任务操作 ----------
export function addTask({ date, subjectId, title, estMinutes = 30, source = 'manual' }) {
  const t = { id: uid(), date, subjectId, title: title.trim(), estMinutes: Number(estMinutes) || 30, done: false, doneAt: null, source };
  store.tasks.push(t);
  return t;
}

export function updateTask(id, patch) {
  const t = store.tasks.find(t => t.id === id);
  if (t) Object.assign(t, patch);
}

export function toggleDone(id) {
  const t = store.tasks.find(t => t.id === id);
  if (!t) return;
  t.done = !t.done;
  t.doneAt = t.done ? new Date().toISOString() : null;
}

export function deleteTask(id) {
  const i = store.tasks.findIndex(t => t.id === id);
  if (i >= 0) store.tasks.splice(i, 1);
}

export function moveTaskToDate(id, date) {
  const t = store.tasks.find(t => t.id === id);
  if (t) t.date = date;
}

// ---------- 查询 ----------
export function tasksOn(date) {
  return store.tasks.filter(t => t.date === date)
    .sort((a, b) => (a.done - b.done)
      || ((isCoreSubject(b.subjectId) ? 1 : 0) - (isCoreSubject(a.subjectId) ? 1 : 0))
      || (a.subjectId > b.subjectId ? 1 : -1));
}

// 遗留：今天之前且未完成
export function leftoverTasks() {
  const today = todayStr();
  return store.tasks.filter(t => !t.done && t.date < today).sort((a, b) => a.date < b.date ? -1 : 1);
}

export function subjectById(id) {
  return store.subjects.find(s => s.id === id) || { id, name: '未知', color: '#8A94A6' };
}

export function subjectByName(name) {
  const n = (name || '').replace(/\s+/g, '');
  return store.subjects.find(s => s.name === n)
      || store.subjects.find(s => n.includes(s.name) || (n.length >= 2 && s.name.includes(n)))
      || store.subjects.find(s => s.name === '其他')
      || store.subjects[0];
}

// ---------- 科目管理 ----------
export function addSubject(name) {
  const colors = ['#E8734A', '#4F6DF5', '#9B59D0', '#1FA9A0', '#3D9B50', '#D05A8C', '#E0A92E', '#8A94A6'];
  const color = colors[store.subjects.length % colors.length];
  const s = { id: uid(), name: name.trim(), color };
  store.subjects.push(s);
  return s;
}

export function subjectInUse(id) {
  return store.tasks.some(t => t.subjectId === id);
}

export function deleteSubject(id) {
  const i = store.subjects.findIndex(s => s.id === id);
  if (i >= 0) store.subjects.splice(i, 1);
}

// ---------- 备份 ----------
export function exportData() {
  return JSON.stringify({
    version: store.version,
    exportedAt: new Date().toISOString(),
    settings: store.settings,
    subjects: store.subjects,
    tasks: store.tasks,
    chat: store.chat,
  }, null, 2);
}

export function importData(jsonText) {
  const data = JSON.parse(jsonText);
  if (!data || data.version !== 1 || !Array.isArray(data.tasks) || !Array.isArray(data.subjects)) {
    throw new Error('备份文件格式不正确');
  }
  Object.assign(store.settings, data.settings || {});
  store.subjects = data.subjects;
  store.tasks = data.tasks;
  if (Array.isArray(data.chat)) store.chat = data.chat;
  save();
}

export function clearAll() {
  const d = defaultState();
  store.settings = d.settings;
  store.subjects = d.subjects;
  store.tasks = d.tasks;
  store.chat = d.chat;
  save();
}

// ---------- 主题 ----------
export function applyTheme() {
  document.documentElement.dataset.theme = store.settings.theme || 'blueprint';
}

export function setTheme(key) {
  store.settings.theme = key;
  applyTheme();
}

// ---------- AI 聊天 ----------
export function addChatMessage(role, content) {
  store.chat.push({ role, content, at: Date.now() });
  if (store.chat.length > 50) store.chat.splice(0, store.chat.length - 50);
}

export function clearChat() {
  store.chat = [];
}

// ---------- 重点科目 ----------
export function isCoreSubject(subjectId) {
  const s = store.subjects.find(x => x.id === subjectId);
  return !!(s && s.core);
}
