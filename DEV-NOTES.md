# 工作台开发经验沉淀

来自「Jeffrey 学习工作台」PWA 的实际开发过程，按主题整理。每条都是踩过坑或验证过的做法。

## 1. 架构：纯静态 PWA 是家庭/个人工具的甜点位

- 无后端 = 无部署成本、无运维、无多人冲突。数据全在 localStorage，**每个浏览器天然是独立工作区**——多人共用一个网址互不干扰，API Key 也各存各的。
- 代价：设备间不同步。用「导出/导入 JSON 备份」做手动迁移即可，别为此过早引入后端。
- 数据层模式：单一 `Vue.reactive` store + `watch deep` 防抖 150ms 落盘 + `pagehide`/`visibilitychange` 立即落盘（防防抖窗口丢数据）。
- 状态结构带 `version` 字段，读取时校验，便于以后迁移。

## 2. Service Worker 缓存

- 预缓存清单 + **缓存名版本号**（如 `study-planner-v19`）：每次改动 JS/CSS 必须 bump，否则用户端永远拿旧文件。
- `skipWaiting` + `clients.claim` + 页面监听 `controllerchange` 自动刷新一次，用户无感升级。
- fetch 策略：同源 GET 走"缓存优先、网络兜底并回写"，跨域 API 请求直接放行。

## 3. AI（LLM）集成

- **推理模型必须可关思考**：DeepSeek v4 这类推理模型，结构化输出/短对话不关 `thinking` 会把 token 烧在思考上导致正文为空——这是"周计划生成失败"的真实根因。
- **解析模型输出要三级容错**：markdown 围栏提取 → 首括号到尾括号切片 → `{"tasks":[...]}` 对象包裹兜底。真实模型的返回格式远比想象花哨。
- 解析失败时在 `console.warn` 留原文前 300 字，否则线上问题无从排查。
- **空状态不要只禁用按钮**：「让 AI 修改」在范围内无任务时曾直接变灰，用户完全不知道怎么办。改为可点击，点击后给出可操作提示（"下周还有 2 项，切换范围即可"）。
- LLM **不能**产生"真实最新新闻"（知识截止 + 幻觉），真实信息必须来自真实数据源；LLM 适合做点评、改写、规划这类加工型工作。
- **加工型流水线**：真实数据（RSS）抓取成功后立即自动触发 LLM 加工（如改写为中学生读本），并发 3 条、单条失败静默兜底原始内容；产物写回 localStorage 缓存，下次打开直接用，不重复烧 token。
- **一次请求拿多个产物**：详情读本和思辨问题放在同一个 JSON 里返回，别拆成两次调用——省一半 token，也避免"详情是新的、问题还是默认的"这种不一致。
- AI 产出的结构化数据**复用内置数据的既有结构**（如 ARTICLES 的 sections/stats/box），前端零改动即可同时渲染内置内容和 AI 内容。

## 4. 实时数据（RSS）

- 公开 RSS 源会悄无声息地死掉（果壳 404），CORS 公共代理极不稳定（allorigins 超时、codetabs 521、corsproxy 403）。
- **必须真实网络实测**，mock 测试通过不代表线上能用。实测后改用了 rss2json（CORS 开放的 JSON API）。
- 多个源并行抓取 + 单源失败静默跳过 + 结果缓存 localStorage，失败时保留旧内容，用户永远有东西看。
- **不要用编码前缀做条目 id**：同站点 URL 共享长前缀，base64/编码后截取前 N 位会大量撞车（实测 36 氪所有新闻 id 相同），按 id 查找详情时张冠李戴。用完整 URL 哈希（如 cyrb53），并同时按 URL 和 id 双重去重。

## 5. 触屏与弹窗

- `@media (pointer: coarse)` 是区分手指/鼠标的正确开关：粗指针下加大热区（勾选钮 30px、关闭按钮 44×44、图标钮 40px），桌面端完全不受影响。
- `touch-action: manipulation` 去点按延迟；输入框字号 ≥16px 防 iOS 聚焦放大；`overscroll-behavior` 禁页面橡皮筋。
- 手势用 **Pointer Events** 统一鼠标和触摸（拖拽排序、下滑关闭都是一套代码）；拖拽加 8px 激活阈值防误触。
- **`position: fixed` 会被带 transform 动画的祖先劫持**（弹窗定位到页面底部而不是视口）——用 Vue `<teleport to="body">` 把弹窗移出 `.page`。
- 弹窗底部操作条用 `position: sticky; bottom: 0`，按钮（尤其"关闭"）永远钉在可视区底部。

## 6. 内容类产品（面向儿童）

- 给孩子看的内容坚持**人工精选 + 联网核实事实与日期**再写入数据文件，不做全自动抓取；实时区（RSS）与精选区用徽标明确区分。
- 每条新闻配"思辨问题"比单纯展示信息更有教育价值；详情页是改写的中学生读本而非原文链接。

## 7. 自动化测试（Playwright）

- mock AI 接口（route 拦截 `/chat/completions`）可以端到端验证完整链路，包括从请求 prompt 里提取 id 再回传的高级玩法。
- 坑一：`add_init_script` 在**每次页面加载**都执行，会覆盖 localStorage——测试持久化时脚本里要加 `if (!localStorage.getItem(...))` 守卫。
- 坑二：`wait_for_selector` 默认等"第一个匹配且可见"，多匹配时先命中隐藏元素会超时——精确选择器。
- 坑三：元素在视口外时 `bounding_box` 坐标无效，先 `scroll_into_view_if_needed`。
- 截图要在入场动画（~0.4s）之后，否则抓到半透明残影。
- 资源级报错（如故意 mock 的 500）会进 console error 监听，断言"无 JS 错误"时过滤 `Failed to load resource`。

## 8. 部署（GitHub Pages）

- 全部相对路径（manifest 的 `start_url: ./index.html`、`scope: ./`、SW 注册路径）→ 项目页子路径（`/repo/`）直接可用。
- 免费 Pages 要求 **Public** 仓库；push 不会自动开 Pages，要在 Settings → Pages 手动开一次。
- 华为平板"桌面打开"= PWA 添加到桌面：HTTPS + `display: standalone` + 图标齐全即可，首次语音会弹麦克风授权。
