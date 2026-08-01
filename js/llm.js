// 大模型 API 封装（OpenAI 兼容协议，支持 DeepSeek / Moonshot 等）+ 三个 AI 能力
import { store, subjectByName } from './storage.js';
import { fmtDate, parseDate, weekdayName } from './util.js';

function apiUrl() {
  const base = (store.settings.baseUrl || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
  return base + '/chat/completions';
}

function isDeepSeek() {
  return (store.settings.baseUrl || '').includes('deepseek');
}

export async function chat(messages, { maxTokens = 2000, temperature = 0.6, noThink = false } = {}) {
  const key = store.settings.apiKey;
  if (!key) throw new Error('尚未配置 API Key，请先到「设置」页填写。');
  // DeepSeek v4 是推理模型，结构化输出/短对话不需要思考过程，
  // 否则会烧光 token 额度导致正文为空（周计划生成失败的根因）
  const body = {
    model: store.settings.model || 'deepseek-v4-flash',
    messages,
    max_tokens: maxTokens,
    temperature,
  };
  if (noThink && isDeepSeek()) body.thinking = { type: 'disabled' };
  let resp;
  try {
    resp = await fetch(apiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error('网络请求失败，请检查网络连接。');
  }
  if (!resp.ok) {
    let msg = 'HTTP ' + resp.status;
    try {
      const err = await resp.json();
      if (err && err.error && err.error.message) msg = err.error.message;
    } catch (_) {}
    if (resp.status === 401) msg = 'API Key 无效，请到「设置」页检查。';
    if (resp.status === 429) msg = '请求太频繁或余额不足，请稍后再试。';
    throw new Error(msg);
  }
  const data = await resp.json();
  const msg = data.choices && data.choices[0] && data.choices[0].message;
  const text = msg && msg.content;
  if (!text) {
    // 推理模型可能把 token 额度花在思考上导致正文为空
    throw new Error(msg && msg.reasoning_content
      ? '模型思考过长、正文未生成，请重试一次。'
      : 'AI 返回内容为空，请重试。');
  }
  return text;
}

// 测试连通性：只验证 Key 有效、模型可用（HTTP 200 即通过），
// 不要求返回正文——推理模型的思考过程可能占满小额度导致正文为空
export async function testConnection() {
  const key = store.settings.apiKey;
  if (!key) throw new Error('尚未填写 API Key。');
  let resp;
  try {
    resp = await fetch(apiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify(Object.assign({
        model: store.settings.model || 'deepseek-v4-flash',
        messages: [{ role: 'user', content: '你好' }],
        max_tokens: 128,
      }, isDeepSeek() ? { thinking: { type: 'disabled' } } : {})),
    });
  } catch (e) {
    throw new Error('网络请求失败，请检查网络连接。');
  }
  if (!resp.ok) {
    let msg = 'HTTP ' + resp.status;
    try {
      const err = await resp.json();
      if (err && err.error && err.error.message) msg = err.error.message;
    } catch (_) {}
    if (resp.status === 401) msg = 'API Key 无效，请检查是否复制完整。';
    if (resp.status === 402) msg = '账户余额不足，请充值。';
    if (resp.status === 404) msg = '模型名称不正确，请检查「模型」一栏。';
    if (resp.status === 429) msg = '请求太频繁，请稍后再试。';
    throw new Error(msg);
  }
  return true;
}

const SYSTEM = '你是一位经验丰富的初中学习规划师，熟悉初中各科学习方法和假期自学安排。回答使用简体中文，语气亲切、务实，像一个了解孩子的家教老师。';

function studentProfile() {
  const s = store.settings;
  return `学生情况：${s.grade || '初二'}学生（初一升初二暑假），比较自律，假期以自学为主。` +
    (s.vacationEnd ? `假期结束日期：${s.vacationEnd}。` : '') +
    `每天可用于学习的时间约 ${Math.round((s.dailyMinutes || 240) / 60 * 10) / 10} 小时。` +
    `科目列表：${store.subjects.map(x => x.name).join('、')}。` +
    `重点科目：数学、英语、物理——初二初三最关键的三科，规划中必须重点保障（每天优先安排，时长占比建议不低于 60%）。`;
}

// AI 参谋对话：带学生档案的多轮聊天
export async function advisorReply(history) {
  const sys = [SYSTEM, '', studentProfile(), '',
    '你正在以「AI 参谋」的身份和这名学生直接语音对话式的聊天。',
    '要求：语气像亲切的大哥哥兼家教，回答简短口语化，每次不超过 150 字；',
    '多给具体可执行的建议，少讲道理；可以反问以了解情况；聊学习规划时优先保障数学、英语、物理。'
  ].join('\n');
  const messages = [{ role: 'system', content: sys }]
    .concat(history.slice(-12).map(m => ({ role: m.role, content: m.content })));
  return chat(messages, { maxTokens: 700, temperature: 0.7, noThink: true });
}

// 汇总最近 N 天完成情况，给 AI 做上下文
export function recentSummary(days = 7) {
  const today = new Date();
  const lines = [];
  let total = 0, done = 0;
  const bySubject = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const ds = fmtDate(d);
    const ts = store.tasks.filter(t => t.date === ds);
    if (!ts.length) continue;
    const dn = ts.filter(t => t.done).length;
    total += ts.length; done += dn;
    ts.forEach(t => {
      const name = subjectByName && t.subjectId ? (store.subjects.find(s => s.id === t.subjectId) || {}).name || '未知' : '未知';
      bySubject[name] = bySubject[name] || { total: 0, done: 0, minutes: 0 };
      bySubject[name].total++;
      if (t.done) { bySubject[name].done++; bySubject[name].minutes += t.estMinutes || 0; }
    });
    lines.push(`${ds}（${weekdayName(ds)}）：计划 ${ts.length} 项，完成 ${dn} 项`);
  }
  const subj = Object.entries(bySubject).map(([n, v]) => `${n}：${v.done}/${v.total} 项，已投入 ${v.minutes} 分钟`).join('；');
  const rate = total ? Math.round(done / total * 100) : 0;
  return { text: `最近${days}天共计划 ${total} 项任务，完成 ${done} 项，完成率 ${rate}%。\n每日明细：\n${lines.join('\n') || '（无记录）'}\n分科情况：${subj || '（无记录）'}`, total, done, rate };
}

// 能力一：假期整体规划（返回文本）
export async function vacationPlan({ goal, weakness }) {
  const prompt = `${studentProfile()}
假期目标：${goal || '（未填写，请按巩固初一+预习初二给出通用方案）'}
各科薄弱点/说明：${weakness || '（未填写）'}

请为这个孩子制定一份暑假整体学习规划，要求：
1. 按阶段划分（例如：复习巩固阶段、预习新知阶段、收心调整阶段），给出每个阶段的时间范围、重点任务和目标；
2. 各科分别给出具体建议：用什么方法、做什么内容、大致时间分配比例；
3. 给出每日作息时间表建议（含休息和运动）；
4. 给家长 2-3 条陪伴与监督建议。
条理清晰，用 markdown 小标题和列表组织，控制在 800 字以内。`;
  return chat([{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }], { maxTokens: 5000 });
}

// 能力二：生成周计划（返回结构化任务数组）
export async function weeklyPlan({ dates, goal }) {
  const summary = recentSummary(7);
  const dateList = dates.map(d => `${d}（${weekdayName(d)}）`).join('、');
  const dailyHours = Math.round((store.settings.dailyMinutes || 240) / 60 * 10) / 10;
  const prompt = `${studentProfile()}
上周执行情况：${summary.text}
本周目标：${goal || '（未特别指定，请根据上周情况合理推进）'}

请为以下日期安排每日学习任务：${dateList}。
要求：
1. 每天 3-5 个任务，任务要具体可执行（写明科目+内容+范围，例如"数学：预习八上第一章《三角形》第1节并做课后练习"）；
2. 数学、英语、物理是三大重点科目：每天都要安排其中至少两科的任务，三科合计时长占当天学习时长的 60% 以上；
3. 文理搭配，同一科目不要连续多天高强度；每天安排 10-30 分钟体育或阅读；
4. 单日总学习时长不超过 ${dailyHours} 小时；
5. 科目名必须从这里面选：${store.subjects.map(x => x.name).join('、')}；
6. 只输出 JSON 数组，不要输出任何其他文字、解释或 markdown 代码块标记。
格式示例：[{"date":"${dates[0]}","subject":"数学","title":"预习八上第一章第1节并做课后练习","estMinutes":40}]`;
  const text = await chat([{ role: 'system', content: SYSTEM },{ role: 'user', content: prompt }], { maxTokens: 8000, temperature: 0.5, noThink: true });
  return parsePlanJson(text, dates);
}

// 能力二·改：按自然语言指令修改某一周的现有计划，返回修改后的完整任务数组
export async function modifyPlan({ dates, existing, instruction, rangeLabel }) {
  const listText = existing.length
    ? existing.map(t => `- id=${t.id} | [${t.date}] ${t.subjectName}：${t.title}（${t.estMinutes}分钟）`).join('\n')
    : '（该范围暂无未完成任务）';
  const prompt = `${studentProfile()}
以下是「${rangeLabel}」当前尚未完成的学习计划（每行开头的 id 是该任务的唯一编号）：
${listText}

用户的修改要求：${instruction}

请根据修改要求，输出修改后该范围内**完整的**未完成任务列表（JSON 数组）。严格遵守：
1. 用户没有提及要改动的任务，必须原样保留，并在输出的对象里带上它**原封不动的 id 字段**（例如 "id":"${existing[0] ? existing[0].id : 'x'}"），日期、科目、内容、时长也不要改；
2. 用户要求删除的任务，整条从列表中移除；
3. 用户要求调整的任务，保留它的原 id，只修改需要改的字段；
4. 用户要求新增的任务，按需要加入，**不要写 id 字段**；
5. id 只能从上面列表里原样复制，绝不可编造或改动；
6. 科目名必须从这里面选：${store.subjects.map(x => x.name).join('、')}；
7. 只输出 JSON 数组，不要输出任何其他文字、解释或 markdown 代码块标记。
格式示例：[{"id":"${existing[0] ? existing[0].id : 'x'}","date":"${dates[0]}","subject":"数学","title":"预习八上第一章第1节并做课后练习","estMinutes":40},{"date":"${dates[0]}","subject":"物理","title":"新增的预习任务","estMinutes":30}]`;
  const text = await chat([{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }], { maxTokens: 8000, temperature: 0.2, noThink: true });
  return parsePlanJson(text, dates);
}

// 从模型输出中提取 JSON 数组：优先 markdown 围栏，其次全文括号切片，最后尝试 {"tasks":[...]} 对象包裹
function extractJsonArray(text) {
  const t = String(text || '');
  const candidates = [];
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) candidates.push(fence[1]);
  candidates.push(t);
  for (const c of candidates) {
    const start = c.indexOf('[');
    const end = c.lastIndexOf(']');
    if (start < 0 || end <= start) continue;
    try {
      const arr = JSON.parse(c.slice(start, end + 1));
      if (Array.isArray(arr) && arr.length) return arr;
    } catch (_) {}
  }
  const os = t.indexOf('{'), oe = t.lastIndexOf('}');
  if (os >= 0 && oe > os) {
    try {
      const obj = JSON.parse(t.slice(os, oe + 1));
      if (obj && typeof obj === 'object') {
        for (const k of Object.keys(obj)) {
          if (Array.isArray(obj[k]) && obj[k].length) return obj[k];
        }
      }
    } catch (_) {}
  }
  return null;
}

// 容错解析 AI 返回的 JSON 任务数组
export function parsePlanJson(text, validDates) {
  const arr = extractJsonArray(text);
  if (!arr) {
    console.warn('AI 返回无法解析，原文片段：', String(text).slice(0, 300));
    throw new Error('AI 没有返回可识别的计划数据，请重试。');
  }
  const dateSet = validDates ? new Set(validDates) : null;
  const tasks = [];
  for (const item of arr) {
    if (!item || typeof item.title !== 'string' || !item.title.trim()) continue;
    let date = String(item.date || '');
    if (dateSet && !dateSet.has(date)) {
      // 日期不在目标范围时，归入范围内最近的一天
      date = pickNearestDate(date, [...dateSet]);
    }
    const subject = subjectByName(String(item.subject || ''));
    tasks.push({
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : null,
      date,
      subjectId: subject.id,
      subjectName: subject.name,
      title: item.title.trim().slice(0, 60),
      estMinutes: Math.min(180, Math.max(5, Number(item.estMinutes) || 30)),
    });
  }
  if (!tasks.length) throw new Error('AI 返回的计划没有有效任务，请重试。');
  return tasks;
}

function pickNearestDate(dateStr, dates) {
  const t = parseDate(dateStr).getTime();
  if (isNaN(t)) return dates[0];
  let best = dates[0], bestDiff = Infinity;
  for (const d of dates) {
    const diff = Math.abs(parseDate(d).getTime() - t);
    if (diff < bestDiff) { bestDiff = diff; best = d; }
  }
  return best;
}

// 能力三：复盘建议（返回文本）
export async function reviewAdvice() {  const summary = recentSummary(7);
  const today = fmtDate(new Date());
  const leftovers = store.tasks.filter(t => !t.done && t.date < today);
  const leftoverText = leftovers.length
    ? `当前遗留任务 ${leftovers.length} 项：${leftovers.slice(0, 10).map(t => `${t.date} ${t.title}`).join('；')}`
    : '当前没有遗留任务。';
  const prompt = `${studentProfile()}
最近 7 天执行数据：
${summary.text}
${leftoverText}

请给出本周学习复盘建议：
1. 先肯定做得好的地方（1-2 句，具体）；
2. 分析完成率背后的可能原因；重点评估数学、英语、物理三大科的投入是否充足（占比、连续性）
3. 针对遗留任务、薄弱科目和三大科权重，给出下周可执行的调整建议（3-5 条，具体）；
4. 给孩子一句鼓励的话。
用 markdown 小标题组织，控制在 500 字以内。`;
  return chat([{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }], { maxTokens: 4000 });
}

// 能力四：少年新闻思辨点评（返回文本）
export async function opinionFeedback({ title, summary, questions, opinion }) {
  const sys = '你是一位「少年新闻思辨课」的导师，擅长引导初中生对时事新闻做批判性思考。' +
    '回答使用简体中文，语气亲切、平等，像耐心的研学导师在和学生面对面讨论。';
  const prompt = `新闻标题：${title}
新闻摘要：${summary}
思辨问题：${(questions || []).map((q, i) => `${i + 1}. ${q}`).join('；') || '（无）'}

这名初二学生发表的个人观点：
${opinion}

请点评他的观点，要求：
1. 先具体肯定观点中思考到位的地方（1-2 句，指出好在哪里，不要空泛夸奖）；
2. 指出可以更深入或更全面的思考角度（1-2 点）；
3. 给一条可操作的思考建议，最后留一个追问，引导他继续想下去；
4. 直接对孩子说话，控制在 250 字以内，不用 markdown 标题。`;
  return chat([{ role: 'system', content: sys }, { role: 'user', content: prompt }], { maxTokens: 1200, temperature: 0.7, noThink: true });
}
