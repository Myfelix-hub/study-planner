// 计划视图：周视图管理任务
import { store, tasksOn, toggleDone, deleteTask, subjectById } from '../storage.js';
import { todayStr, mondayOf, weekDates, addDays, weekdayName, parseDate } from '../util.js';

export default {
  emits: ['edit-task', 'add-task'],
  data() {
    return {
      weekOffset: 0, // 0 = 本周
      filterSubject: '',
    };
  },
  computed: {
    monday() { return addDays(mondayOf(todayStr()), this.weekOffset * 7); },
    dates() { return weekDates(this.monday); },
    today() { return todayStr(); },
    weekLabel() {
      const s = parseDate(this.dates[0]), e = parseDate(this.dates[6]);
      const label = `${s.getMonth() + 1}/${s.getDate()} - ${e.getMonth() + 1}/${e.getDate()}`;
      return this.weekOffset === 0 ? `本周（${label}）` : label;
    },
    subjects() { return store.subjects; },
  },
  methods: {
    weekdayName,
    subjectOf(t) { return subjectById(t.subjectId); },
    dayTasks(d) {
      let ts = tasksOn(d);
      if (this.filterSubject) ts = ts.filter(t => t.subjectId === this.filterSubject);
      return ts;
    },
    daySummary(d) {
      const ts = this.dayTasks(d);
      const done = ts.filter(t => t.done).length;
      const min = ts.reduce((s, t) => s + (t.estMinutes || 0), 0);
      return { count: ts.length, done, min };
    },
    onToggle(t) { toggleDone(t.id); },
    onDelete(t) {
      if (confirm(`删除任务「${t.title}」？`)) deleteTask(t.id);
    },
  },
  template: `
  <div class="page">
    <header class="page-header">
      <button class="btn ghost" @click="weekOffset--">‹ 上一周</button>
      <div class="week-label" @click="weekOffset = 0" title="点击回到本周">{{ weekLabel }}</div>
      <button class="btn ghost" @click="weekOffset++">下一周 ›</button>
    </header>

    <div class="chip-row">
      <button class="chip filter" :class="{ active: !filterSubject }" @click="filterSubject = ''">全部</button>
      <button v-for="s in subjects" :key="s.id" class="chip filter"
        :class="{ active: filterSubject === s.id }"
        :style="filterSubject === s.id ? { background: s.color, borderColor: s.color, color: '#fff' } : { color: s.color, borderColor: s.color }"
        @click="filterSubject = filterSubject === s.id ? '' : s.id">{{ s.name }}</button>
    </div>

    <section v-for="d in dates" :key="d" class="card day-card" :class="{ today: d === today }">
      <div class="card-title row-between">
        <span>{{ d.slice(5).replace('-', '/') }} {{ weekdayName(d) }}<span v-if="d === today" class="today-badge">今天</span></span>
        <span class="day-summary" v-if="daySummary(d).count">
          {{ daySummary(d).done }}/{{ daySummary(d).count }} 项 · {{ daySummary(d).min }}分钟
        </span>
      </div>
      <div v-for="t in dayTasks(d)" :key="t.id" class="task-row" :class="{ done: t.done }">
        <button class="check" :class="{ on: t.done }" @click="onToggle(t)">{{ t.done ? '✓' : '' }}</button>
        <div class="task-main" @click="$emit('edit-task', t)">
          <span class="chip" :style="{ background: subjectOf(t).color }"><span v-if="subjectOf(t).core" class="core-star">★</span>{{ subjectOf(t).name }}</span>
          <span class="task-title">{{ t.title }}</span>
          <span class="task-meta">{{ t.estMinutes }}分钟</span>
        </div>
        <button class="icon-btn" @click="onDelete(t)" title="删除">×</button>
      </div>
      <button class="btn small ghost add-in-day" @click="$emit('add-task', d)">＋ 工单</button>
    </section>
  </div>
  `,
};
