// 统计视图：完成率、连续打卡、科目时长分布
import { store, subjectById } from '../storage.js';
import { todayStr, addDays, mondayOf, weekDates } from '../util.js';

export default {
  computed: {
    tasks() { return store.tasks; },
    today() { return todayStr(); },
    weekDateSet() { return new Set(weekDates(mondayOf(this.today))); },
    weekTasks() { return this.tasks.filter(t => this.weekDateSet.has(t.date)); },
    rateOf() {
      return (ts) => ts.length ? Math.round(ts.filter(t => t.done).length / ts.length * 100) : null;
    },
    weekRate() { return this.rateOf(this.weekTasks); },
    totalRate() { return this.rateOf(this.tasks); },
    // 连续打卡：从今天（或昨天）往前，每天有完成任务就算
    streak() {
      let n = 0;
      let d = this.today;
      // 今天还没完成任何任务时，从昨天算起（不中断）
      const doneOn = (date) => this.tasks.some(t => t.date === date && t.done);
      if (!doneOn(d)) d = addDays(d, -1);
      while (doneOn(d)) { n++; d = addDays(d, -1); }
      return n;
    },
    // 近 7 天各科已投入时长
    subjectMinutes() {
      const map = {};
      for (let i = 0; i < 7; i++) {
        const d = addDays(this.today, -i);
        this.tasks.filter(t => t.date === d && t.done).forEach(t => {
          const s = subjectById(t.subjectId);
          map[s.name] = map[s.name] || { name: s.name, color: s.color, core: !!s.core, minutes: 0 };
          map[s.name].minutes += t.estMinutes || 0;
        });
      }
      const arr = Object.values(map).sort((a, b) => b.minutes - a.minutes);
      const max = arr.length ? arr[0].minutes : 1;
      arr.forEach(a => a.pct = Math.max(4, Math.round(a.minutes / max * 100)));
      return arr;
    },
    // 三大重点科目（数/英/物）投入占比
    coreShare() {
      const total = this.subjectMinutes.reduce((sum, x) => sum + x.minutes, 0);
      if (!total) return null;
      const core = this.subjectMinutes.filter(x => x.core).reduce((sum, x) => sum + x.minutes, 0);
      return { minutes: core, total, pct: Math.round(core / total * 100) };
    },
    weekDoneCount() { return this.weekTasks.filter(t => t.done).length; },
    totalDoneCount() { return this.tasks.filter(t => t.done).length; },
  },
  template: `
  <div class="page">
    <header class="page-header"><div class="page-title">数据中心</div></header>

    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-num">{{ weekRate === null ? '—' : weekRate + '%' }}</div>
        <div class="stat-label">本周完成率（{{ weekDoneCount }}/{{ weekTasks.length }}）</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">{{ totalRate === null ? '—' : totalRate + '%' }}</div>
        <div class="stat-label">累计完成率（{{ totalDoneCount }}/{{ tasks.length }}）</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">{{ streak }}<span style="font-size:15px;color:var(--text-2)"> 天</span></div>
        <div class="stat-label">连续打卡天数</div>
      </div>
    </div>

    <section class="card">
      <div class="card-title row-between">
        <span>近 7 天各科投入时长（已完成任务）</span>
        <span v-if="coreShare" class="day-summary">三大科 {{ coreShare.minutes }} 分钟 · 占比 {{ coreShare.pct }}%</span>
      </div>
      <div v-if="!subjectMinutes.length" class="empty"><span class="empty-icon">▦</span>还没有已完成的任务</div>
      <div v-for="s in subjectMinutes" :key="s.name" class="bar-row">
        <span class="bar-label"><span v-if="s.core" class="core-star" style="color: var(--accent)">★</span>{{ s.name }}</span>
        <div class="bar-track"><div class="bar-fill" :style="{ width: s.pct + '%', background: s.color }"></div></div>
        <span class="bar-val">{{ s.minutes }}分</span>
      </div>
    </section>
  </div>
  `,
};
