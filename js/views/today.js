// 工作台首页：指标条 + 遗留警报 + 今日工单
import { store, tasksOn, leftoverTasks, toggleDone, moveTaskToDate, deleteTask, subjectById } from '../storage.js';
import { todayStr, todayLabel, mondayOf, weekDates } from '../util.js';

export default {
  emits: ['edit-task', 'add-task'],
  data() {
    return { confetti: false };
  },
  computed: {
    today() { return todayStr(); },
    dateLabel() { return todayLabel(); },
    name() { return store.settings.studentName || 'Jeffrey'; },
    greeting() {
      const h = new Date().getHours();
      if (h < 6) return '夜深了';
      if (h < 12) return '早上好';
      if (h < 18) return '下午好';
      return '晚上好';
    },
    tasks() { return tasksOn(this.today); },
    leftovers() { return leftoverTasks(); },
    doneCount() { return this.tasks.filter(t => t.done).length; },
    totalMinutes() { return this.tasks.reduce((s, t) => s + (t.estMinutes || 0), 0); },
    doneMinutes() { return this.tasks.filter(t => t.done).reduce((s, t) => s + (t.estMinutes || 0), 0); },
    progress() { return this.tasks.length ? Math.round(this.doneCount / this.tasks.length * 100) : 0; },
    allDone() { return this.tasks.length > 0 && this.doneCount === this.tasks.length; },
    // 连续打卡
    streak() {
      const doneOn = (date) => store.tasks.some(t => t.date === date && t.done);
      const add = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
      let n = 0, d = this.today;
      if (!doneOn(d)) d = add(d, -1);
      while (doneOn(d)) { n++; d = add(d, -1); }
      return n;
    },
    // 本周完成率
    weekRate() {
      const set = new Set(weekDates(mondayOf(this.today)));
      const ts = store.tasks.filter(t => set.has(t.date));
      if (!ts.length) return null;
      return Math.round(ts.filter(t => t.done).length / ts.length * 100);
    },
  },
  watch: {
    allDone(val) {
      if (val) {
        this.confetti = true;
        setTimeout(() => this.confetti = false, 3000);
      }
    },
  },
  methods: {
    subjectOf(t) { return subjectById(t.subjectId); },
    onToggle(t) { toggleDone(t.id); },
    moveToday(t) { moveTaskToDate(t.id, this.today); },
    giveUp(t) {
      if (confirm(`确定放弃工单「${t.title}」吗？`)) deleteTask(t.id);
    },
    overdueLabel(t) {
      const days = Math.round((new Date(this.today) - new Date(t.date)) / 86400000);
      return days <= 1 ? '昨天遗留' : `遗留 ${days} 天`;
    },
  },
  template: `
  <div class="page">
    <header class="page-header">
      <div>
        <div class="page-title">{{ greeting }}，{{ name }}</div>
        <div class="page-sub">{{ dateLabel }} · 今天也要按计划推进</div>
      </div>
      <div class="progress-ring" :style="{ '--p': progress }">
        <span>{{ progress }}%</span>
      </div>
    </header>

    <div class="metric-grid">
      <div class="metric">
        <div class="metric-num">{{ doneCount }}<span class="unit">/ {{ tasks.length }} 单</span></div>
        <div class="metric-label">今日完成</div>
        <div class="metric-bar"><i :style="{ width: progress + '%' }"></i></div>
      </div>
      <div class="metric">
        <div class="metric-num">{{ streak }}<span class="unit">天</span></div>
        <div class="metric-label">连续打卡</div>
        <div class="metric-bar"><i :style="{ width: Math.min(100, streak * 14) + '%' }"></i></div>
      </div>
      <div class="metric">
        <div class="metric-num">{{ weekRate === null ? '—' : weekRate + '%' }}</div>
        <div class="metric-label">本周完成率</div>
        <div class="metric-bar"><i :style="{ width: (weekRate || 0) + '%' }"></i></div>
      </div>
    </div>

    <div v-if="confetti" class="confetti">今日工单全部完成，收工。</div>

    <section v-if="leftovers.length" class="card alert-card">
      <div class="card-title row-between">
        <span><span class="tick" style="background: var(--danger)"></span>遗留警报</span>
        <span class="alert-badge">{{ leftovers.length }} 单待处理</span>
      </div>
      <div v-for="t in leftovers" :key="t.id" class="task-row">
        <div class="task-main">
          <span class="chip" :style="{ background: subjectOf(t).color }"><span v-if="subjectOf(t).core" class="core-star">★</span>{{ subjectOf(t).name }}</span>
          <span class="task-title">{{ t.title }}</span>
          <span class="task-meta">{{ overdueLabel(t) }} · {{ t.estMinutes }}分钟</span>
        </div>
        <div class="task-actions">
          <button class="btn small primary" @click="moveToday(t)">移到今天</button>
          <button class="btn small ghost" @click="giveUp(t)">放弃</button>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-title row-between">
        <span><span class="tick"></span>今日工单</span>
        <span style="display:flex; gap:8px">
          <button class="btn small voice" @click="$emit('add-task', { date: today, voice: true })"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v4M8.5 21h7"/></svg>语音</button>
          <button class="btn small ghost" @click="$emit('add-task', today)">＋ 工单</button>
        </span>
      </div>
      <div v-if="!tasks.length" class="empty">
        <span class="empty-icon">▤</span>
        工作台是空的，安排今天的任务吧
        <br>
        <span style="display:inline-flex; gap:10px; margin-top:14px">
          <button class="btn primary" @click="$emit('add-task', today)">新建第一张工单</button>
          <button class="btn voice" @click="$emit('add-task', { date: today, voice: true })"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v4M8.5 21h7"/></svg>语音录入</button>
        </span>
      </div>
      <div v-for="t in tasks" :key="t.id" class="task-row" :class="{ done: t.done }">
        <button class="check" :class="{ on: t.done }" @click="onToggle(t)">{{ t.done ? '✓' : '' }}</button>
        <div class="task-main" @click="$emit('edit-task', t)">
          <span class="chip" :style="{ background: subjectOf(t).color }"><span v-if="subjectOf(t).core" class="core-star">★</span>{{ subjectOf(t).name }}</span>
          <span class="task-title">{{ t.title }}</span>
          <span class="task-meta">{{ t.estMinutes }}分钟<span v-if="t.source==='ai'"> · AI</span></span>
        </div>
      </div>
      <div v-if="tasks.length" class="foot-note">今日计划 {{ totalMinutes }} 分钟 · 已完成 {{ doneMinutes }} 分钟</div>
    </section>
  </div>
  `,
};
