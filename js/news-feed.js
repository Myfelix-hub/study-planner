// 实时新闻源：经 rss2json 公共 API 抓取科技 RSS（36氪 / Solidot），单个源失败不影响其他源
// 结果缓存到 localStorage，与内置精选新闻合并展示
const FEEDS = [
  { url: 'https://36kr.com/feed', source: '36氪' },
  { url: 'https://www.solidot.org/index.rss', source: 'Solidot' },
];
const API = 'https://api.rss2json.com/v1/api.json?rss_url=';
const CACHE_KEY = 'studyPlanner.newsCache.v1';

export function loadNewsCache() {
  try {
    const data = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return data && Array.isArray(data.items) ? data : null;
  } catch (e) {
    return null;
  }
}

function saveCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) {}
}

function categorize(text) {
  if (/火箭|卫星|月球|航天|空间站|嫦娥|天问|火星/.test(text)) return '航天';
  if (/AI|人工智能|大模型|机器人|智能体|算法/.test(text)) return 'AI';
  if (/气候|碳排|环保|新能源|环境|电池/.test(text)) return '环境';
  return '科技';
}

function stripHtml(s) {
  const d = document.createElement('div');
  d.innerHTML = s || '';
  return (d.textContent || '').replace(/\s+/g, ' ').trim();
}

// 用完整链接做哈希生成 id（旧版截取 base64 前缀，同站点链接前缀相同，大量 id 撞车，
// 导致「阅读详情」按 id 查找时命中别的新闻）
function linkHash(s) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}

export async function fetchLatestNews() {
  const items = [];
  await Promise.all(FEEDS.map(async (f) => {
    try {
      const resp = await fetch(API + encodeURIComponent(f.url));
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.status !== 'ok' || !Array.isArray(data.items)) return;
      for (const it of data.items.slice(0, 6)) {
        const title = stripHtml(it.title || '');
        const link = it.link || it.guid || '';
        if (!title || !link) continue;
        const desc = stripHtml(it.description || it.content || '').slice(0, 120);
        const d = new Date(it.pubDate || '');
        items.push({
          id: 'feed-' + linkHash(link),
          title: title.slice(0, 50),
          summary: desc || title,
          source: f.source,
          date: isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10),
          category: categorize(title + desc),
          url: link,
          live: true,
        });
      }
    } catch (e) {
      // 网络或单个源失败：跳过，不影响其他源
    }
  }));
  // 按日期倒序 + 按链接/id 去重
  const seen = new Set();
  const seenIds = new Set();
  const out = [];
  for (const it of items.sort((a, b) => (a.date < b.date ? 1 : -1))) {
    if (seen.has(it.url) || seenIds.has(it.id)) continue;
    seen.add(it.url);
    seenIds.add(it.id);
    out.push(it);
  }
  const data = { updatedAt: new Date().toISOString(), items: out.slice(0, 20) };
  saveCache(data);
  return data;
}

// 把 AI 改写好的中学生读本写回缓存（按 id 找到条目），下次打开直接用
export function saveRewrittenArticle(id, article) {
  const data = loadNewsCache();
  if (!data) return;
  const it = data.items.find(n => n.id === id);
  if (!it) return;
  it.article = article;
  saveCache(data);
}
