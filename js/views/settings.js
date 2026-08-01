// 设置视图：API Key、学生信息、科目管理、备份
import { store, addSubject, deleteSubject, subjectInUse, exportData, importData, clearAll, setTheme } from '../storage.js';
import { testConnection } from '../llm.js';
import { MicBtn } from '../voice.js';

export default {
  components: { MicBtn },
  data() {
    return {
      provider: 'deepseek',
      testing: false,
      testMsg: '',
      newSubject: '',
      importMsg: '',
      themes: [
        { key: 'blueprint', name: '蓝图', desc: '深夜图纸 · 台灯琥珀', bg: '#0B1120', panel: '#1B2742', accent: '#E8A33D' },
        { key: 'nebula', name: '星云', desc: '紫调星云 · 极客气质', bg: '#1E1E2E', panel: '#32324A', accent: '#CBA6F7' },
        { key: 'latte', name: '晨光', desc: '清爽浅色 · 白天学习', bg: '#EFF1F5', panel: '#FFFFFF', accent: '#179299' },
      ],
    };
  },
  computed: {
    settings() { return store.settings; },
    subjects() { return store.subjects; },
  },
  methods: {
    setTheme,
    onProviderChange() {
      if (this.provider === 'deepseek') {
        this.settings.baseUrl = 'https://api.deepseek.com/v1';
        this.settings.model = 'deepseek-v4-flash';
      } else if (this.provider === 'moonshot') {
        this.settings.baseUrl = 'https://api.moonshot.cn/v1';
        this.settings.model = 'moonshot-v1-8k';
      }
    },
    async onTest() {
      this.testing = true;
      this.testMsg = '';
      try {
        await testConnection();
        this.testMsg = '连接成功，API Key 可用。';
      } catch (e) {
        this.testMsg = '连接失败：' + (e.message || e);
      } finally {
        this.testing = false;
      }
    },
    onAddSubject() {
      const name = this.newSubject.trim();
      if (!name) return;
      if (this.subjects.some(s => s.name === name)) { alert('科目已存在'); return; }
      addSubject(name);
      this.newSubject = '';
    },
    onDeleteSubject(s) {
      if (subjectInUse(s.id)) { alert(`「${s.name}」下还有任务，不能删除。`); return; }
      if (confirm(`删除科目「${s.name}」？`)) deleteSubject(s.id);
    },
    // ---------- 科目拖拽排序（鼠标/触摸统一用 Pointer Events） ----------
    chipStyle(s) {
      const base = { background: s.color };
      if (this.drag && this.drag.active && this.drag.id === s.id) {
        base.transform = `translate(${this.drag.dx}px, ${this.drag.dy}px) scale(1.06)`;
      }
      return base;
    },
    onChipPointerDown(e, s, i) {
      if (e.target.closest('.chip-del')) return; // 点 × 不进入拖拽
      this.drag = { id: s.id, index: i, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, active: false };
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    },
    onChipPointerMove(e) {
      const d = this.drag;
      if (!d) return;
      d.dx = e.clientX - d.startX;
      d.dy = e.clientY - d.startY;
      if (!d.active && Math.hypot(d.dx, d.dy) > 8) d.active = true; // 超过阈值才算拖拽，避免误触
      if (!d.active) return;
      const from = d.index;
      const chips = Array.from(this.$refs.chipRow.children);
      for (let j = 0; j < chips.length; j++) {
        if (j === from) continue;
        const r = chips[j].getBoundingClientRect();
        const over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (!over) continue;
        const after = e.clientX > r.left + r.width / 2;
        let to = j + (after ? 1 : 0);
        if (to > from) to--; // 去掉自身占位
        if (to !== from) {
          const arr = store.subjects;
          const [moved] = arr.splice(from, 1);
          arr.splice(to, 0, moved);
          d.index = to;
        }
        break;
      }
    },
    onChipPointerUp() { this.drag = null; },
    onExport() {
      const blob = new Blob([exportData()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `学习规划备份_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    },
    onImport(ev) {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          importData(String(reader.result));
          this.importMsg = '导入成功。';
        } catch (e) {
          this.importMsg = '导入失败：' + e.message;
        }
      };
      reader.readAsText(file);
      ev.target.value = '';
    },
    onClear() {
      if (confirm('确定清空所有数据吗？此操作不可恢复，建议先导出备份！')) {
        if (confirm('再确认一次：真的要清空全部计划、任务和设置吗？')) {
          clearAll();
          alert('已清空。');
        }
      }
    },
  },
  template: `
  <div class="page">
    <header class="page-header"><div class="page-title">设置</div></header>

    <section class="card">
      <div class="card-title"><span class="tick"></span>主题外观</div>
      <div class="theme-grid">
        <button v-for="t in themes" :key="t.key" class="theme-card" :class="{ on: settings.theme === t.key }" @click="setTheme(t.key)">
          <span class="theme-swatch" :style="{ background: t.bg }">
            <i :style="{ background: t.panel }"></i>
            <b :style="{ background: t.accent }"></b>
          </span>
          <span class="theme-name">{{ t.name }}</span>
          <span class="theme-desc">{{ t.desc }}</span>
        </button>
      </div>
    </section>

    <section class="card">
      <div class="card-title">AI 服务</div>
      <label class="field">
        <span>服务商</span>
        <select v-model="provider" @change="onProviderChange">
          <option value="deepseek">DeepSeek（深度求索）</option>
          <option value="moonshot">Kimi / Moonshot（月之暗面）</option>
          <option value="custom">自定义（OpenAI 兼容接口）</option>
        </select>
      </label>
      <label class="field">
        <span>API Key</span>
        <input v-model="settings.apiKey" type="password" placeholder="sk-..." autocomplete="off">
      </label>
      <label class="field">
        <span>接口地址</span>
        <input v-model="settings.baseUrl" placeholder="https://api.deepseek.com/v1">
      </label>
      <label class="field">
        <span>模型</span>
        <input v-model="settings.model" list="model-list" placeholder="deepseek-v4-flash">
        <datalist id="model-list">
          <option value="deepseek-v4-flash">deepseek-v4-flash（快速便宜）</option>
          <option value="deepseek-v4-pro">deepseek-v4-pro（更强）</option>
          <option value="moonshot-v1-8k">moonshot-v1-8k</option>
          <option value="kimi-k2-0905-preview">kimi-k2-0905-preview</option>
          <option value="kimi-latest">kimi-latest</option>
        </datalist>
      </label>
      <button class="btn ghost" :disabled="testing || !settings.apiKey" @click="onTest">
        {{ testing ? '测试中…' : '测试连接' }}
      </button>
      <div v-if="testMsg" class="hint">{{ testMsg }}</div>
      <div class="hint">Key 只保存在本平板本地，不会上传到任何服务器。</div>
    </section>

    <section class="card">
      <div class="card-title">学生信息</div>
      <label class="field">
        <span>称呼</span>
        <div class="input-mic-row">
          <input v-model="settings.studentName" placeholder="例如：小明" ref="nameEl">
          <MicBtn :get-el="() => $refs.nameEl" />
        </div>
      </label>
      <label class="field">
        <span>年级</span>
        <input v-model="settings.grade" placeholder="初二">
      </label>
      <label class="field">
        <span>假期结束日期</span>
        <input v-model="settings.vacationEnd" type="date">
      </label>
      <label class="field">
        <span>每天学习时长（分钟）</span>
        <input v-model.number="settings.dailyMinutes" type="number" min="30" max="720" step="10">
      </label>
    </section>

    <section class="card">
      <div class="card-title">科目管理</div>
      <div class="hint" style="margin:-4px 0 10px">按住科目左右拖动可调整顺序（计划板、新建工单同步生效）。带 ★ 的是三大重点科目（数学、英语、物理），在工单排序和 AI 规划中优先保障。</div>
      <div class="chip-row" ref="chipRow">
        <span v-for="(s, i) in subjects" :key="s.id" class="chip with-del drag-chip"
          :class="{ dragging: drag && drag.active && drag.id === s.id }"
          :style="chipStyle(s)"
          @pointerdown="onChipPointerDown($event, s, i)"
          @pointermove="onChipPointerMove"
          @pointerup="onChipPointerUp"
          @pointercancel="onChipPointerUp">
          <span class="chip-grip">⠿</span><span v-if="s.core" class="core-star">★</span>{{ s.name }}<button class="chip-del" @click="onDeleteSubject(s)">×</button>
        </span>
      </div>
      <div class="add-row">
        <input v-model="newSubject" placeholder="新科目名称" @keyup.enter="onAddSubject" ref="subjectEl">
        <MicBtn :get-el="() => $refs.subjectEl" />
        <button class="btn small primary" @click="onAddSubject">添加</button>
      </div>
    </section>

    <section class="card">
      <div class="card-title">数据备份</div>
      <div class="btn-row">
        <button class="btn ghost" @click="onExport">导出备份（JSON）</button>
        <label class="btn ghost file-btn">导入备份
          <input type="file" accept=".json,application/json" @change="onImport" hidden>
        </label>
      </div>
      <div v-if="importMsg" class="hint">{{ importMsg }}</div>
      <div class="hint">数据保存在平板本地。建议每周导出一次备份，防止浏览器清理数据丢失。</div>
    </section>

    <section class="card danger-zone">
      <div class="card-title danger">危险操作</div>
      <button class="btn danger" @click="onClear">清空全部数据</button>
    </section>
  </div>
  `,
};
