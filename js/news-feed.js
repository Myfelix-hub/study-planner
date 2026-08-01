// 实时新闻源：经 CORS 代理抓取公开 RSS（科技类），单个源失败不影响其他源
// 结果缓存到 localStorage，与内置精选新闻合并展示
const FEEDS = [
  { url: 'https://www.guokr.com/rss/', source: '果壳网' },
  { url: 'https://www.solidot.org/index.rss', source: 'Solidot' },
  { url: 'https://36kr.com/feed', source: '36氪' },
];
const PROXY = 'https://api.allorigins.win/raw?url=';
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

function textOf(node, selectors) {
  for (const sel of selectors) {
    const el = node.querySelector(sel);
    if (el && el.textContent.trim()) return el.textContent.trim();
  }
  return '';
}

function linkOf(node) {
  // RSS: <link>url</link>；Atom: <link href="url" />
  const links = node.querySelectorAll('link');
  for (const l of links) {
    if (l.textContent.trim()) return l.textContent.trim();
    if (l.getAttribute('href')) return l.getAttribute('href');
  }
  return '';
}

export async function fetchLatestNews() {
  const items = [];
  await Promise.all(FEEDS.map(async (f) => {
    try {
      const resp = await fetch(PROXY + encodeURIComponent(f.url));
      if (!resp.ok) return;
      const xml = new DOMParser().parseFromString(await resp.text(), 'text/xml');
      const nodes = [...xml.querySelectorAll('item, entry')].slice(0, 6);
      for (const n of nodes) {
        const title = stripHtml(textOf(n, ['title']));
        const link = linkOf(n);
        if (!title || !link) continue;
        const desc = stripHtml(textOf(n, ['description', 'summary', 'content', 'content\\:encoded'])).slice(0, 120);
        const dateRaw = textOf(n, ['pubDate', 'published', 'updated', 'dc\\:date', 'date']);
        const d = new Date(dateRaw);
        items.push({
          id: 'feed-' + btoa(unescape(encodeURIComponent(link))).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24),
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
  // 按日期倒序 + 按链接去重
  const seen = new Set();
  const out = [];
  for (const it of items.sort((a, b) => (a.date < b.date ? 1 : -1))) {
    if (seen.has(it.url)) continue;
    seen.add(it.url);
    out.push(it);
  }
  const data = { updatedAt: new Date().toISOString(), items: out.slice(0, 20) };
  saveCache(data);
  return data;
}
