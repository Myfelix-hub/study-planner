// 少年新闻视图：精选青少年时事（科技为主）+ 思辨问题 + AI 观点点评 + 中学生读本详情页 + RSS 实时更新
import { NEWS, NEWS_UPDATED } from '../data/news.js';
import { ARTICLES } from '../data/articles.js';
import { fetchLatestNews, loadNewsCache } from '../news-feed.js';
import { opinionFeedback } from '../llm.js';
import { MicBtn } from '../voice.js';

const CATEGORY_COLORS = {
  '航天': '#4F6DF5',
  'AI': '#9B59D0',
  '科技': '#1FA9A0',
  '环境': '#3D9B50',
  '社会': '#D05A8C',
};

// 详情页顶部分类插图（线性图标风格，与导航图标一致）
const BANNER_ICONS = {
  '航天': '<path d="M360 26c14 12 22 30 22 52 0 16-4 30-10 40l10 18h-16l-6 14-6-14h-16l10-18c-6-10-10-24-10-40 0-22 8-40 22-52z"/><circle cx="360" cy="70" r="9"/><path d="M336 122l-14 16M384 122l14 16"/>',
  'AI': '<path d="M360 38l13 33 33 13-33 13-13 33-13-33-33-13 33-13z"/><path d="M416 96l6 16 16 6-16 6-6 16-6-16-16-6 16-6z"/><path d="M310 100l4 11 11 4-11 4-4 11-4-11-11-4 11-4z"/>',
  '科技': '<rect x="330" y="56" width="60" height="48" rx="10"/><path d="M360 56V36M352 36h16"/><circle cx="348" cy="78" r="4"/><circle cx="372" cy="78" r="4"/><path d="M348 92h24"/><path d="M330 72h-12v16h12M390 72h12v16h-12"/><path d="M348 104v14M372 104v14M344 118h8M368 118h8"/>',
  '环境': '<path d="M402 40c-42 2-66 26-66 62 0 12 8 18 17 14 30-15 46-40 49-76z"/><path d="M346 116c12-26 30-46 52-60"/>',
  '社会': '<path d="M360 34l34 12v32c0 26-16 44-34 54-18-10-34-28-34-54V46z"/><path d="M347 82l9 9 19-19"/>',
};

function bannerSvg(cat) {
  const icon = BANNER_ICONS[cat] || BANNER_ICONS['科技'];
  return `<svg viewBox="0 0 720 160" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="360" cy="82" r="60" stroke-dasharray="4 7" opacity="0.45"/>
    <path d="M56 82h44M620 82h44" opacity="0.6"/><circle cx="116" cy="82" r="3.5" opacity="0.6"/><circle cx="604" cy="82" r="3.5" opacity="0.6"/>
    <path d="M170 40l14-14M550 124l14 14M170 124l14 14M550 40l14-14" opacity="0.35"/>
    ${icon}
  </svg>`;
}

export default {
  components: { MicBtn },
  data() {
    return {
      filter: '',
      open: {},     // id -> 思辨问题是否展开
      opinions: {}, // id -> 用户观点文本
      thinking: {}, // id -> AI 点评加载中
      feedback: {}, // id -> AI 点评结果
      errors: {},   // id -> 点评失败信息
      elRefs: {},   // id -> textarea 元素（供语音按钮定位）
      reading: null, // 正在阅读的新闻 id（打开详情弹窗）
      thinkOpen: false, // 详情页内思辨区是否展开
      // RSS 实时更新
      liveNews: loadNewsCache(), // { updatedAt, items[] } 或 null
      updating: false,
      updateMsg: '',
    };
  },
  computed: {
    updatedLabel() {
      if (this.liveNews) return this.liveNews.updatedAt.slice(0, 16).replace('T', ' ');
      return NEWS_UPDATED + '（精选）';
    },
    // 实时抓取的新闻在前，精选在后
    allItems() {
      return [...(this.liveNews ? this.liveNews.items : []), ...NEWS];
    },
    categories() {
      const set = [];
      for (const n of this.allItems) if (!set.includes(n.category)) set.push(n.category);
      return set;
    },
    items() {
      const list = this.filter ? this.allItems.filter(n => n.category === this.filter) : this.allItems;
      return [...list].sort((a, b) => (a.date < b.date ? 1 : -1));
    },
    readingNews() { return this.allItems.find(n => n.id === this.reading) || null; },
    readingArticle() {
      if (!this.reading || !this.readingNews) return null;
      if (ARTICLES[this.reading]) return ARTICLES[this.reading];
      // 实时新闻没有改写读本，用摘要生成简版详情
      return { readMinutes: 1, stats: [], live: true, sections: [{ h: '新闻详情', ps: [this.readingNews.summary] }] };
    },
  },
  methods: {
    color(cat) { return CATEGORY_COLORS[cat] || '#8A94A6'; },
    banner(cat) { return bannerSvg(cat); },
    toggle(id) { this.open[id] = !this.open[id]; },
    setRef(id, el) { if (el) this.elRefs[id] = el; },
    openArticle(n) {
      this.reading = n.id;
      this.thinkOpen = false;
    },
    closeArticle() { this.reading = null; },
    // 实时新闻没有预设思辨问题，用通用问题代替
    questionsFor(n) {
      return n.questions || [
        '这条新闻和我们的生活有什么关系？',
        '这件事可能带来哪些好处，又可能带来哪些新问题？',
      ];
    },
    // 「更新」按钮：经 CORS 代理抓取科技 RSS，失败时保留现有内容
    async updateNews() {
      if (this.updating) return;
      this.updating = true;
      this.updateMsg = '';
      try {
        const data = await fetchLatestNews();
        if (data.items.length) {
          this.liveNews = data;
          this.updateMsg = `已抓取 ${data.items.length} 条最新科技新闻（来自 36氪 / Solidot）。`;
        } else {
          this.updateMsg = '暂时没抓到新内容，请检查网络后稍后再试。';
        }
      } catch (e) {
        this.updateMsg = '网络更新失败，已保留当前内容。';
      } finally {
        this.updating = false;
      }
    },
    // 详情页底部「思辨」：不关闭详情，直接在页内展开思辨区（观点与卡片互通）
    thinkInArticle() {
      this.thinkOpen = !this.thinkOpen;
      if (this.thinkOpen) {
        this.$nextTick(() => {
          const el = this.$refs.articleThink;
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    },
    async askAI(n) {
      const opinion = (this.opinions[n.id] || '').trim();
      if (!opinion || this.thinking[n.id]) return;
      this.thinking[n.id] = true;
      this.errors[n.id] = '';
      try {
        this.feedback[n.id] = await opinionFeedback({
          title: n.title, summary: n.summary, questions: this.questionsFor(n), opinion,
        });
      } catch (e) {
        this.errors[n.id] = e.message || String(e);
      } finally {
        this.thinking[n.id] = false;
      }
    },
  },
  template: `
  <div class="page">
    <header class="page-header">
      <div>
        <div class="page-title">少年新闻</div>
        <div class="page-sub">科技时事 · 精选给少年的新闻 · 更新于 {{ updatedLabel }}</div>
      </div>
      <button class="btn ghost news-refresh" :disabled="updating" @click="updateNews">
        {{ updating ? '正在更新…' : '⟳ 更新' }}
      </button>
    </header>
    <div v-if="updateMsg" class="hint" style="margin:-10px 0 14px">{{ updateMsg }}</div>

    <div class="chip-row">
      <button class="chip filter" :class="{ active: !filter }" @click="filter = ''">全部</button>
      <button v-for="c in categories" :key="c" class="chip filter"
        :class="{ active: filter === c }"
        :style="filter === c ? { background: color(c), borderColor: color(c), color: '#fff' } : { color: color(c), borderColor: color(c) }"
        @click="filter = filter === c ? '' : c">{{ c }}</button>
    </div>

    <section v-for="n in items" :key="n.id" class="card news-card" :id="'news-' + n.id">
      <div class="news-head">
        <span class="chip" :style="{ background: color(n.category) }">{{ n.category }}</span>
        <span v-if="n.live" class="live-badge">实时</span>
        <span class="news-source">{{ n.source }} · {{ n.date }}</span>
      </div>
      <div class="news-title">{{ n.title }}</div>
      <div class="news-summary">{{ n.summary }}</div>
      <div class="news-actions">
        <button class="btn small primary" @click="openArticle(n)">阅读详情</button>
        <button class="btn small" :class="open[n.id] ? 'primary' : 'ghost'" @click="toggle(n.id)">
          {{ open[n.id] ? '收起思辨' : '思辨一下' }}
        </button>
      </div>
      <div v-if="open[n.id]" class="news-q">
        <div class="news-q-title">想一想，议一议</div>
        <ol>
          <li v-for="(q, i) in questionsFor(n)" :key="i">{{ q }}</li>
        </ol>
        <div class="opinion-box">
          <div class="input-mic-row">
            <textarea v-model="opinions[n.id]" :ref="el => setRef(n.id, el)" rows="3"
              placeholder="写下你的看法…（也可以点右侧麦克风，直接说出来）"></textarea>
            <MicBtn :get-el="() => elRefs[n.id]" />
          </div>
          <div class="btn-row" style="margin-top:10px">
            <button class="btn small primary" :disabled="thinking[n.id] || !(opinions[n.id] || '').trim()" @click="askAI(n)">
              {{ thinking[n.id] ? 'AI 思考中…' : (feedback[n.id] ? '再点评一次' : '请 AI 点评') }}
            </button>
          </div>
          <div v-if="errors[n.id]" class="error-box" style="margin-top:10px">{{ errors[n.id] }}</div>
          <div v-if="feedback[n.id]" class="ai-text opinion-feedback">{{ feedback[n.id] }}</div>
        </div>
      </div>
    </section>

    <div class="foot-note">内容来自权威媒体公开报道，定期人工精选更新 · 适合与家人一起讨论</div>

    <teleport to="body">
    <div v-if="reading && readingArticle" class="modal-mask" @click.self="closeArticle">
      <div class="article-modal" v-swipe-close="closeArticle">
        <button class="icon-btn modal-close" title="关闭" @click="closeArticle">×</button>
        <div class="article-banner" :style="{ color: color(readingNews.category) }" v-html="banner(readingNews.category)"></div>
        <div class="news-head">
          <span class="chip" :style="{ background: color(readingNews.category) }">{{ readingNews.category }}</span>
          <span class="news-source">{{ readingNews.source }} · {{ readingNews.date }} · 约 {{ readingArticle.readMinutes }} 分钟读完</span>
        </div>
        <div class="article-title">{{ readingNews.title }}</div>
        <div v-if="readingArticle.stats.length" class="article-stats">
          <div v-for="(s, i) in readingArticle.stats" :key="i" class="article-stat">
            <div class="article-stat-num">{{ s.num }}</div>
            <div class="article-stat-label">{{ s.label }}</div>
          </div>
        </div>
        <div v-for="(sec, i) in readingArticle.sections" :key="i" class="article-sec">
          <div class="article-sec-h"><span class="tick"></span>{{ sec.h }}</div>
          <p v-for="(p, j) in sec.ps" :key="j">{{ p }}</p>
          <div v-if="sec.box" class="article-box">{{ sec.box }}</div>
        </div>
        <div class="article-foot">
          {{ readingArticle.live ? '以下内容为实时抓取的新闻摘要' : '本文由 AI 工作台编辑根据公开报道改写' }}
          <a v-if="readingNews.url" :href="readingNews.url" target="_blank" rel="noopener">查看原始报道（{{ readingNews.source }}）↗</a>
        </div>
        <div v-if="thinkOpen" class="news-q article-think" ref="articleThink">
          <div class="news-q-title">想一想，议一议</div>
          <ol>
            <li v-for="(q, i) in questionsFor(readingNews)" :key="i">{{ q }}</li>
          </ol>
          <div class="opinion-box">
            <div class="input-mic-row">
              <textarea v-model="opinions[readingNews.id]" :ref="el => setRef(readingNews.id, el)" rows="3"
                placeholder="写下你的看法…（也可以点右侧麦克风，直接说出来）"></textarea>
              <MicBtn :get-el="() => elRefs[readingNews.id]" />
            </div>
            <div class="btn-row" style="margin-top:10px">
              <button class="btn small primary" :disabled="thinking[readingNews.id] || !(opinions[readingNews.id] || '').trim()" @click="askAI(readingNews)">
                {{ thinking[readingNews.id] ? 'AI 思考中…' : (feedback[readingNews.id] ? '再点评一次' : '请 AI 点评') }}
              </button>
            </div>
            <div v-if="errors[readingNews.id]" class="error-box" style="margin-top:10px">{{ errors[readingNews.id] }}</div>
            <div v-if="feedback[readingNews.id]" class="ai-text opinion-feedback">{{ feedback[readingNews.id] }}</div>
          </div>
        </div>
        <div class="btn-row article-actions">
          <button class="btn" :class="thinkOpen ? 'ghost' : 'primary'" @click="thinkInArticle">{{ thinkOpen ? '收起思辨' : '思辨' }}</button>
          <button class="btn ghost" @click="closeArticle">关闭</button>
        </div>
      </div>
    </div>
    </teleport>
  </div>
  `,
};
