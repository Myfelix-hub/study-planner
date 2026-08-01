// AI 参谋视图：聊天 / 周计划（生成+修改）/ 假期规划 / 复盘建议
import { store, addTask, updateTask, deleteTask, subjectById, addChatMessage, clearChat } from '../storage.js';
import { todayStr, mondayOf, weekDates, addDays, weekdayName } from '../util.js';
import * as llm from '../llm.js';
import { MicBtn } from '../voice.js';

// diff 行排序权重：保留 → 调整 → 新增 → 删除
const KIND_ORDER = { keep: 0, adjust: 1, add: 2, del: 3 };
const KIND_LABEL = { keep: '保留', adjust: '调整', del: '删除', add: '新增' };

export default {
  components: { MicBtn },
  data() {
    return {
      tab: 'chat', // chat | week | vacation | review
      // 聊天
      chatInput: '',
      chatLoading: false,
      quickPrompts: [
        '今天有点学不进去，怎么办？',
        '数学几何证明总是丢分，怎么补？',
        '帮我安排一下今天下午的学习',
        '英语单词背了就忘，有啥好办法？',
        '初二物理要怎么预习？',
      ],
      // 假期规划
      goal: '',
      weakness: '',
      vacationResult: '',
      // 生成周计划
      weekTarget: 'next', // current | next
      weekGoal: '',
      planPreview: [],
      imported: false,
      // 修改周计划
      modifyTarget: 'next', // next | this
      modifyInstruction: '',
      modifyAiList: null,   // AI 返回的修改后列表（解析后）
      modifyApplied: false,
      // 复盘
      reviewResult: '',
      loading: false,
      error: '',
      // 清空聊天记录确认弹窗
      confirmClear: false,
    };
  },
  computed: {
    hasKey() { return !!store.settings.apiKey; },
    messages() { return store.chat; },
    // ---- 生成周计划范围 ----
    targetDates() {
      const thisMonday = mondayOf(todayStr());
      if (this.weekTarget === 'next') return weekDates(addDays(thisMonday, 7));
      return weekDates(thisMonday).filter(d => d >= todayStr());
    },
    targetLabel() {
      const ds = this.targetDates;
      return `${ds[0]}（${weekdayName(ds[0])}）~ ${ds[ds.length - 1]}（${weekdayName(ds[ds.length - 1])}）`;
    },
    planByDay() {
      const map = {};
      this.planPreview.forEach(t => { (map[t.date] = map[t.date] || []).push(t); });
      return Object.keys(map).sort().map(d => ({ date: d, tasks: map[d] }));
    },
    // 复盘页左侧数据概览
    reviewSummary() { return llm.recentSummary(7); },
    totalPlanMinutes() {
      return this.planPreview.reduce((s, t) => s + t.estMinutes, 0);
    },
    // ---- 修改周计划范围 ----
    modifyDates() {
      const thisMonday = mondayOf(todayStr());
      if (this.modifyTarget === 'next') return weekDates(addDays(thisMonday, 7));
      return weekDates(thisMonday);
    },
    modifyRangeLabel() {
      const ds = this.modifyDates;
      const tag = this.modifyTarget === 'next' ? '下周' : '本周';
      return `${tag}（${ds[0]}（${weekdayName(ds[0])}）~ ${ds[ds.length - 1]}（${weekdayName(ds[ds.length - 1])}））`;
    },
    // 该范围内未完成任务（修改的操作对象）
    existingTasks() {
      const set = new Set(this.modifyDates);
      return store.tasks.filter(t => set.has(t.date) && !t.done)
        .map(t => ({ id: t.id, date: t.date, subjectId: t.subjectId, subjectName: subjectById(t.subjectId).name, title: t.title, estMinutes: t.estMinutes }));
    },
    // 现有计划 vs AI 返回 → 增/删/改/保留 对照（优先按 id 匹配，标题匹配兜底）
    modifyDiff() {
      const ai = this.modifyAiList || [];
      const orig = this.existingTasks;
      const norm = (s) => (s || '').replace(/\s+/g, '');
      const origById = {};
      orig.forEach(o => { origById[o.id] = o; });
      const origByKey = {};
      orig.forEach(o => {
        const k = o.date + '|' + norm(o.title);
        (origByKey[k] = origByKey[k] || []).push(o);
      });
      const consumed = new Set();
      const rows = [];
      ai.forEach(a => {
        let match = null;
        if (a.id && origById[a.id] && !consumed.has(a.id)) match = origById[a.id];
        if (!match) {
          const bucket = origByKey[a.date + '|' + norm(a.title)];
          match = bucket && bucket.find(o => !consumed.has(o.id));
        }
        if (match) {
          consumed.add(match.id);
          const adjusted = match.subjectId !== a.subjectId || match.estMinutes !== a.estMinutes || norm(match.title) !== norm(a.title);
          rows.push({
            kind: adjusted ? 'adjust' : 'keep', date: a.date, id: match.id,
            subjectId: a.subjectId, title: a.title, estMinutes: a.estMinutes,
            oldSubjectId: match.subjectId, oldTitle: match.title, oldEst: match.estMinutes,
          });
        } else {
          rows.push({ kind: 'add', date: a.date, subjectId: a.subjectId, title: a.title, estMinutes: a.estMinutes });
        }
      });
      orig.forEach(o => {
        if (!consumed.has(o.id)) rows.push({ kind: 'del', date: o.date, id: o.id, subjectId: o.subjectId, title: o.title, estMinutes: o.estMinutes });
      });
      rows.sort((x, y) => x.date < y.date ? -1 : x.date > y.date ? 1 : (KIND_ORDER[x.kind] - KIND_ORDER[y.kind]));
      const byDay = [];
      rows.forEach(r => {
        const last = byDay[byDay.length - 1];
        if (!last || last.date !== r.date) byDay.push({ date: r.date, rows: [r] });
        else last.rows.push(r);
      });
      const counts = { keep: 0, adjust: 0, del: 0, add: 0 };
      rows.forEach(r => counts[r.kind]++);
      return { byDay, counts };
    },
  },
  methods: {
    weekdayName,
    kindLabel(k) { return KIND_LABEL[k]; },
    subjectOf(t) { return subjectById(t.subjectId); },
    switchTab(tab) {
      this.tab = tab;
      this.error = '';
    },
    // ---------- 聊天 ----------
    async sendChat(text) {
      const content = (text || this.chatInput).trim();
      if (!content || this.chatLoading) return;
      if (!this.hasKey) { this.error = '请先到「设置」页填写 API Key。'; return; }
      this.error = '';
      this.chatInput = '';
      addChatMessage('user', content);
      this.chatLoading = true;
      this.scrollChat();
      try {
        const reply = await llm.advisorReply(store.chat);
        addChatMessage('assistant', reply);
      } catch (e) {
        addChatMessage('error', e.message || String(e));
      } finally {
        this.chatLoading = false;
        this.scrollChat();
      }
    },
    onClearChat() {
      if (!store.chat.length) return;
      this.confirmClear = true;
    },
    doClearChat() {
      clearChat();
      this.confirmClear = false;
    },
    scrollChat() {
      this.$nextTick(() => {
        const el = this.$refs.chatScroll;
        if (el) el.scrollTop = el.scrollHeight;
      });
    },
    async run(fn) {
      if (!this.hasKey) { this.error = '请先到「设置」页填写 API Key。'; return; }
      this.loading = true;
      this.error = '';
      try {
        await fn();
      } catch (e) {
        this.error = e.message || String(e);
        this.$nextTick(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      } finally {
        this.loading = false;
      }
    },
    // ---------- 生成周计划 ----------
    genVacation() {
      this.run(async () => {
        this.vacationResult = await llm.vacationPlan({ goal: this.goal, weakness: this.weakness });
      });
    },
    genWeek() {
      this.run(async () => {
        this.imported = false;
        this.planPreview = await llm.weeklyPlan({ dates: this.targetDates, goal: this.weekGoal });
      });
    },
    importPlan() {
      this.planPreview.forEach(t => addTask({ date: t.date, subjectId: t.subjectId, title: t.title, estMinutes: t.estMinutes, source: 'ai' }));
      this.imported = true;
    },
    removePreview(i) { this.planPreview.splice(i, 1); },
    // ---------- 修改周计划 ----------
    genModify() {
      if (!this.modifyInstruction.trim()) { this.error = '请填写修改要求，例如「删除下周所有英语计划」。'; return; }
      if (!this.existingTasks.length) {
        const monday = mondayOf(todayStr());
        const otherDates = this.modifyTarget === 'next' ? weekDates(monday) : weekDates(addDays(monday, 7));
        const otherLabel = this.modifyTarget === 'next' ? '本周' : '下周';
        const otherCount = store.tasks.filter(t => otherDates.includes(t.date) && !t.done).length;
        this.error = otherCount
          ? `所选范围暂无未完成的计划。${otherLabel}还有 ${otherCount} 项未完成任务，把「修改范围」切换到「${otherLabel}」即可修改。`
          : '本周和下周都没有未完成的计划，无法修改。可先用上方「生成周计划」。';
        return;
      }
      this.run(async () => {
        this.modifyApplied = false;
        this.modifyAiList = await llm.modifyPlan({
          dates: this.modifyDates,
          existing: this.existingTasks,
          instruction: this.modifyInstruction,
          rangeLabel: this.modifyRangeLabel,
        });
      });
    },
    applyModify() {
      const rows = this.modifyDiff.byDay.flatMap(d => d.rows);
      rows.forEach(r => {
        if (r.kind === 'del') deleteTask(r.id);
        else if (r.kind === 'adjust') updateTask(r.id, { subjectId: r.subjectId, title: r.title, estMinutes: r.estMinutes });
        else if (r.kind === 'add') addTask({ date: r.date, subjectId: r.subjectId, title: r.title, estMinutes: r.estMinutes, source: 'ai' });
      });
      this.modifyApplied = true;
      this.modifyAiList = null; // 清预览，existingTasks 已反映新状态
    },
    resetModify() { this.modifyAiList = null; this.modifyApplied = false; },
    // ---------- 复盘 ----------
    genReview() {
      this.run(async () => {
        this.reviewResult = await llm.reviewAdvice();
      });
    },
  },
  template: `
  <div class="page">
    <header class="page-header"><div class="page-title">AI 参谋</div></header>

    <div v-if="!hasKey" class="card warn-card">
      还没有配置 API Key。请到「设置」页填写后再使用 AI 功能。
    </div>

    <div class="seg">
      <button :class="{ on: tab === 'chat' }" @click="switchTab('chat')">聊天</button>
      <button :class="{ on: tab === 'week' }" @click="switchTab('week')">周计划</button>
      <button :class="{ on: tab === 'vacation' }" @click="switchTab('vacation')">假期规划</button>
      <button :class="{ on: tab === 'review' }" @click="switchTab('review')">复盘建议</button>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>

    <!-- 聊天 -->
    <section v-if="tab === 'chat'" class="card">
      <div class="chat-head">
        <div class="card-title" style="margin:0"><span class="tick"></span>和参谋聊聊</div>
        <button class="btn small ghost" @click="onClearChat">清空记录</button>
      </div>
      <div class="chat-box">
        <div class="chat-scroll" ref="chatScroll">
          <div v-if="!messages.length" class="chat-empty">
            学习计划、弱科提升、时间安排……都可以问我<br>
            也可以点下面的快捷问题，或点输入框旁的麦克风语音输入
          </div>
          <div v-for="(m, i) in messages" :key="i" class="msg" :class="m.role">
            <div class="msg-bubble">{{ m.content }}</div>
          </div>
          <div v-if="chatLoading" class="msg assistant">
            <div class="msg-bubble"><span class="typing"><i></i><i></i><i></i></span></div>
          </div>
        </div>
        <div v-if="!messages.length" class="quick-prompts">
          <button v-for="q in quickPrompts" :key="q" class="quick-prompt" @click="sendChat(q)">{{ q }}</button>
        </div>
        <div class="chat-input-row">
          <input v-model="chatInput" placeholder="输入问题，或点麦克风说话…" @keyup.enter="sendChat()" :disabled="chatLoading" ref="chatInputEl">
          <MicBtn :get-el="() => $refs.chatInputEl" :big="true" />
          <button class="btn primary" @click="sendChat()" :disabled="chatLoading || !chatInput.trim()">发送</button>
        </div>
      </div>
    </section>

    <!-- 生成周计划 -->
    <section v-if="tab === 'week'" class="card">
      <div class="card-title">生成一周学习计划</div>
      <label class="field">
        <span>计划范围</span>
        <select v-model="weekTarget" :disabled="loading">
          <option value="next">下周（{{ targetLabel }}）</option>
          <option value="current">本周剩余（{{ targetLabel }}）</option>
        </select>
      </label>
      <label class="field">
        <span>本周目标（可选，支持语音输入）</span>
        <div class="input-mic-row">
          <textarea v-model="weekGoal" rows="2" placeholder="例如：数学预习完前两章；英语每天背 20 个单词" :disabled="loading" ref="weekGoalEl"></textarea>
          <MicBtn :get-el="() => $refs.weekGoalEl" />
        </div>
      </label>
      <button class="btn primary block" :disabled="loading" @click="genWeek">
        {{ loading ? '参谋正在制定计划…' : '生成周计划' }}
      </button>
      <div v-if="loading">
        <div class="skeleton skel-title"></div>
        <div class="skeleton skel-row"></div>
        <div class="skeleton skel-row"></div>
        <div class="skeleton skel-row"></div>
      </div>

      <div v-if="planPreview.length" class="plan-preview">
        <div class="card-title row-between">
          <span>计划预览（共 {{ planPreview.length }} 项 · {{ totalPlanMinutes }} 分钟）</span>
        </div>
        <div v-for="day in planByDay" :key="day.date" class="preview-day">
          <div class="preview-date">{{ day.date.slice(5).replace('-', '/') }} {{ weekdayName(day.date) }}</div>
          <div v-for="(t, i) in day.tasks" :key="i" class="task-row">
            <div class="task-main">
              <span class="chip" :style="{ background: subjectOf(t).color }"><span v-if="subjectOf(t).core" class="core-star">★</span>{{ subjectOf(t).name }}</span>
              <span class="task-title">{{ t.title }}</span>
              <span class="task-meta">{{ t.estMinutes }}分钟</span>
            </div>
            <button class="icon-btn" @click="planPreview.splice(planPreview.indexOf(t), 1)" title="移除">×</button>
          </div>
        </div>
        <button v-if="!imported" class="btn primary block" @click="importPlan">一键导入计划板</button>
        <div v-else class="ok-box">已导入计划板</div>
      </div>
    </section>

    <!-- 修改现有计划 -->
    <section v-if="tab === 'week'" class="card">
      <div class="card-title"><span class="tick"></span>用一句话修改计划</div>
      <p class="hint">告诉参谋怎么改，例如「删除下周所有英语计划」「把周三数学挪到周四」「下周每天加 20 分钟物理」。AI 先给出增删改对照，确认后才应用。</p>
      <label class="field">
        <span>修改范围</span>
        <select v-model="modifyTarget" :disabled="loading || !!modifyAiList">
          <option value="next">下周</option>
          <option value="this">本周</option>
        </select>
      </label>
      <div class="hint" style="margin:-6px 0 10px">该范围现有未完成计划 {{ existingTasks.length }} 项</div>
      <label class="field">
        <span>修改要求（支持语音输入）</span>
        <div class="input-mic-row">
          <textarea v-model="modifyInstruction" rows="2" placeholder="例如：删除下周所有的英语计划" :disabled="loading || !!modifyAiList" ref="modifyInstrEl"></textarea>
          <MicBtn :get-el="() => $refs.modifyInstrEl" />
        </div>
      </label>
      <button class="btn primary block" :disabled="loading" @click="genModify">
        {{ loading ? '参谋正在修改…' : '让 AI 修改' }}
      </button>
      <div v-if="loading">
        <div class="skeleton skel-title"></div>
        <div class="skeleton skel-row"></div>
        <div class="skeleton skel-row"></div>
      </div>

      <div v-if="modifyAiList" class="plan-preview">
        <div class="card-title row-between">
          <span>修改对照</span>
          <button class="btn small ghost" @click="resetModify">重新修改</button>
        </div>
        <div class="diff-legend">
          <span class="diff-tag add">新增 {{ modifyDiff.counts.add }}</span>
          <span class="diff-tag adjust">调整 {{ modifyDiff.counts.adjust }}</span>
          <span class="diff-tag del">删除 {{ modifyDiff.counts.del }}</span>
          <span class="diff-tag keep">保留 {{ modifyDiff.counts.keep }}</span>
        </div>
        <div v-for="day in modifyDiff.byDay" :key="day.date" class="preview-day">
          <div class="preview-date">{{ day.date.slice(5).replace('-', '/') }} {{ weekdayName(day.date) }}</div>
          <div v-for="(r, i) in day.rows" :key="i" class="task-row diff-row" :class="r.kind">
            <span class="diff-tag" :class="r.kind">{{ kindLabel(r.kind) }}</span>
            <div class="task-main">
              <span class="chip" :style="{ background: subjectOf(r).color }"><span v-if="subjectOf(r).core" class="core-star">★</span>{{ subjectOf(r).name }}</span>
              <span class="task-title">{{ r.title }}</span>
              <span class="task-meta">{{ r.estMinutes }}分钟</span>
            </div>
          </div>
        </div>
        <div v-if="!modifyDiff.byDay.length" class="empty">AI 返回的列表为空，请检查修改要求后重试。</div>
        <button v-if="!modifyApplied && modifyDiff.byDay.length" class="btn primary block" @click="applyModify">确认应用修改</button>
      </div>
      <div v-if="modifyApplied" class="ok-box">修改已应用到计划板</div>
    </section>

    <!-- 假期整体规划 -->
    <section v-if="tab === 'vacation'" class="card">
      <div class="card-title">假期整体学习规划</div>
      <label class="field">
        <span>假期目标（支持语音输入）</span>
        <div class="input-mic-row">
          <textarea v-model="goal" rows="2" placeholder="例如：巩固初一下数学和英语，预习初二上数学、物理" :disabled="loading" ref="goalEl"></textarea>
          <MicBtn :get-el="() => $refs.goalEl" />
        </div>
      </label>
      <label class="field">
        <span>各科薄弱点（可选）</span>
        <div class="input-mic-row">
          <textarea v-model="weakness" rows="2" placeholder="例如：数学几何证明较弱；英语词汇量不足" :disabled="loading" ref="weaknessEl"></textarea>
          <MicBtn :get-el="() => $refs.weaknessEl" />
        </div>
      </label>
      <button class="btn primary block" :disabled="loading" @click="genVacation">
        {{ loading ? '参谋正在制定规划…' : '生成假期规划' }}
      </button>
      <div v-if="loading">
        <div class="skeleton skel-title"></div>
        <div class="skeleton skel-row"></div>
        <div class="skeleton skel-row"></div>
      </div>
      <div v-if="vacationResult" class="ai-text">{{ vacationResult }}</div>
    </section>

    <!-- 复盘建议 -->
    <section v-if="tab === 'review'" class="card">
      <div class="card-title">每周复盘与调整建议</div>
      <div class="review-grid">
        <div class="review-side">
          <p class="hint" style="margin-top:0">AI 会读取最近 7 天的任务完成数据和遗留任务，给出分析与下周调整建议。</p>
          <div class="review-mini-stats">
            <div class="review-mini"><b>{{ reviewSummary.total }}</b><span>计划任务</span></div>
            <div class="review-mini"><b>{{ reviewSummary.done }}</b><span>已完成</span></div>
            <div class="review-mini"><b>{{ reviewSummary.rate }}%</b><span>完成率</span></div>
          </div>
          <button class="btn primary block" :disabled="loading" @click="genReview">
            {{ loading ? '参谋正在分析数据…' : '开始复盘' }}
          </button>
          <div v-if="loading">
            <div class="skeleton skel-title"></div>
            <div class="skeleton skel-row"></div>
            <div class="skeleton skel-row"></div>
          </div>
        </div>
        <div class="review-main">
          <div v-if="reviewResult" class="ai-text review-text">{{ reviewResult }}</div>
          <div v-if="reviewResult" class="btn-row end" style="margin-top:10px">
            <button class="btn ghost" @click="reviewResult = ''">关闭</button>
          </div>
          <div v-if="!reviewResult && !loading" class="review-placeholder">点击「开始复盘」，这里会生成本周的分析报告</div>
        </div>
      </div>
    </section>

    <!-- 清空聊天记录确认弹窗 -->
    <teleport to="body">
    <div v-if="confirmClear" class="modal-mask" @click.self="confirmClear = false">
      <div class="modal" v-swipe-close="() => confirmClear = false">
        <button class="icon-btn modal-close" title="关闭" @click="confirmClear = false">×</button>
        <div class="modal-title">清空聊天记录</div>
        <p class="confirm-text">确定要清空和 AI 参谋的全部聊天记录吗？共 {{ messages.length }} 条，清空后不可恢复。</p>
        <div class="btn-row end">
          <button class="btn ghost" @click="confirmClear = false">取消</button>
          <button class="btn danger" @click="doClearChat">确认清空</button>
        </div>
      </div>
    </div>
    </teleport>
  </div>
  `,
};
