// 应用主入口：工作台骨架（左侧导航轨 / 窄屏底部栏）+ 任务编辑弹窗
import { initStore, store, addTask, updateTask } from './storage.js';
import { todayStr } from './util.js';
import TodayView from './views/today.js';
import PlanView from './views/plan.js';
import StatsView from './views/stats.js';
import NewsView from './views/news.js';
import AiView from './views/ai.js';
import SettingsView from './views/settings.js';
import { MicBtn, startVoice } from './voice.js';

initStore();

const ICONS = {
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  plan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 9h18"/></svg>',
  stats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  news: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h13v14a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2V5z"/><path d="M17 8h3v11a2 2 0 0 1-2 2"/><path d="M7 9h6M7 13h6M7 17h4"/></svg>',
  ai: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h.01a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/></svg>',
};

const TaskEditor = {
  components: { MicBtn },
  props: ['task', 'defaultDate', 'autoVoice'], // task 为 null 时是新建
  emits: ['close'],
  data() {
    const t = this.task;
    return {
      date: t ? t.date : (this.defaultDate || todayStr()),
      subjectId: t ? t.subjectId : (store.subjects[0] && store.subjects[0].id),
      title: t ? t.title : '',
      estMinutes: t ? t.estMinutes : 30,
    };
  },
  computed: {
    subjects() { return store.subjects; },
    isEdit() { return !!this.task; },
  },
  methods: {
    close() { this.$emit('close'); },
    save() {
      if (!this.title.trim()) { this.$refs.titleInput.focus(); return; }
      if (!this.date) return;
      if (this.isEdit) {
        updateTask(this.task.id, { date: this.date, subjectId: this.subjectId, title: this.title, estMinutes: this.estMinutes });
      } else {
        addTask({ date: this.date, subjectId: this.subjectId, title: this.title, estMinutes: this.estMinutes });
      }
      this.$emit('close');
    },
  },
  template: `
  <div class="modal-mask" @click.self="$emit('close')">
    <div class="modal" v-swipe-close="close">
      <button class="icon-btn modal-close" title="关闭" @click="$emit('close')">×</button>
      <div class="modal-title">{{ isEdit ? '编辑工单' : '新建工单' }}</div>
      <label class="field">
        <span>日期</span>
        <input type="date" v-model="date">
      </label>
      <label class="field">
        <span>科目</span>
        <select v-model="subjectId">
          <option v-for="s in subjects" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </label>
      <label class="field">
        <span>任务内容（可点麦克风语音录入）</span>
        <div class="input-mic-row">
          <input v-model="title" placeholder="例如：预习八上数学第一章第1节" @keyup.enter="save" ref="titleInput">
          <MicBtn :get-el="() => $refs.titleInput" :big="true" />
        </div>
      </label>
      <label class="field">
        <span>预计时长（分钟）</span>
        <input type="number" v-model.number="estMinutes" min="5" max="240" step="5">
      </label>
      <div class="btn-row end">
        <button class="btn ghost" @click="$emit('close')">取消</button>
        <button class="btn primary" @click="save">保存</button>
      </div>
    </div>
  </div>
  `,
  mounted() {
    if (this.$refs.titleInput) {
      this.$refs.titleInput.focus();
      if (this.autoVoice) startVoice(this.$refs.titleInput); // 语音开工单：打开即听写
    }
  },
};

const App = {
  components: { TodayView, PlanView, StatsView, NewsView, AiView, SettingsView, TaskEditor },
  data() {
    return {
      tab: 'today',
      editing: null,
      addingDate: null,
      addingVoice: false,
      tabs: [
        { key: 'today', label: '工作台', icon: ICONS.today },
        { key: 'plan', label: '计划板', icon: ICONS.plan },
        { key: 'stats', label: '数据', icon: ICONS.stats },
        { key: 'news', label: '少年新闻', icon: ICONS.news },
        { key: 'ai', label: 'AI 参谋', icon: ICONS.ai },
      ],
      // 设置单独放在左轨底部，不与功能导航混在一起
      settingsTab: { key: 'settings', label: '设置', icon: ICONS.settings },
    };
  },
  computed: {
    currentView() {
      return { today: 'TodayView', plan: 'PlanView', stats: 'StatsView', news: 'NewsView', ai: 'AiView', settings: 'SettingsView' }[this.tab];
    },
    // 窄屏底部栏仍包含设置
    allTabs() { return [...this.tabs, this.settingsTab]; },
    editorVisible() { return this.editing !== null || this.addingDate !== null; },
  },
  methods: {
    openAdd(payload) {
      // payload 可以是日期字符串，或 { date, voice }（语音开工单）
      if (payload && typeof payload === 'object') {
        this.addingDate = payload.date || todayStr();
        this.addingVoice = !!payload.voice;
      } else {
        this.addingDate = payload || todayStr();
        this.addingVoice = false;
      }
    },
    openEdit(task) { this.editing = task; },
    closeEditor() { this.editing = null; this.addingDate = null; this.addingVoice = false; },
  },
  template: `
  <div class="app">
    <aside class="rail">
      <div class="rail-logo">
        <span class="mark">J</span>
        <span>
          <span class="name">Jeffrey</span><br>
          <span class="sub">学习工作台</span>
        </span>
      </div>
      <nav class="rail-nav">
        <button v-for="t in tabs" :key="t.key" class="rail-item" :class="{ on: tab === t.key }" @click="tab = t.key">
          <span v-html="t.icon"></span>{{ t.label }}
        </button>
      </nav>
      <div class="rail-foot">
        <button class="rail-item rail-settings" :class="{ on: tab === 'settings' }" @click="tab = 'settings'">
          <span v-html="settingsTab.icon"></span>{{ settingsTab.label }}
        </button>
        <div class="rail-foot-text">STUDY WORKBENCH</div>
      </div>
    </aside>
    <main class="main">
      <component :is="currentView" @add-task="openAdd" @edit-task="openEdit" />
    </main>
    <nav class="tabbar">
      <button v-for="t in allTabs" :key="t.key" class="tab" :class="{ on: tab === t.key }" @click="tab = t.key">
        <span v-html="t.icon"></span>
        <span class="tab-label">{{ t.label }}</span>
      </button>
    </nav>
    <TaskEditor v-if="editorVisible" :task="editing" :default-date="addingDate" :auto-voice="addingVoice" @close="closeEditor" />
  </div>
  `,
};

const app = Vue.createApp(App);

// 触屏手势：在弹层面板上下滑超过 80px 即关闭（仅当内容已滚动到顶部时触发，拖动时面板跟随手指）
app.directive('swipe-close', {
  mounted(el, binding) {
    let startY = null, dy = 0, atTop = true;
    const onStart = (e) => { startY = e.touches[0].clientY; dy = 0; atTop = el.scrollTop <= 0; };
    const onMove = (e) => {
      if (startY === null) return;
      dy = e.touches[0].clientY - startY;
      if (atTop && dy > 0) el.style.transform = `translateY(${Math.min(dy, 120)}px)`;
    };
    const onEnd = () => {
      if (startY === null) return;
      el.style.transition = 'transform 0.18s ease-out';
      el.style.transform = '';
      setTimeout(() => { el.style.transition = ''; }, 200);
      if (atTop && dy > 80) binding.value();
      startY = null; dy = 0;
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onEnd);
    el.__swipeClose = { onStart, onMove, onEnd };
  },
  unmounted(el) {
    const h = el.__swipeClose;
    if (!h) return;
    el.removeEventListener('touchstart', h.onStart);
    el.removeEventListener('touchmove', h.onMove);
    el.removeEventListener('touchend', h.onEnd);
  },
});

app.mount('#app');
