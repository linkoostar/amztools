# 亚马逊工具箱 · Code Wiki

> 仓库地址：<https://github.com/linkoostar/amztools>
> 部署目标：Cloudflare Pages + Cloudflare D1
> 文档版本：v1.0（基于仓库当前主分支代码整理）

---

## 一、项目概述

「亚马逊工具箱」是一个面向亚马逊卖家的**纯静态前端 + Cloudflare Pages Functions（Serverless 后端）**的工具集合站点。它把卖家日常运营中常用的小工具聚合到一个统一的侧边栏界面里，既可以首页即开即用一些轻量计算器（标题字符、评分星级、计费重、广告竞价、HS 编码查询、亚马逊联想词等），也可以打开完整的子工具页面（词根分析、利润试算、PDF 标签、AI 标题文案、FBA 仓库地图）。

整体特点：

- **零构建**：纯 HTML/CSS/原生 JavaScript，无任何前端构建工具（无 webpack/vite/npm 依赖）。
- **Serverless 后端**：通过 Cloudflare Pages Functions 暴露 `/api/*` 接口，使用 D1（SQLite）持久化数据。
- **AI 文案**：内置一套针对亚马逊 2026 新规的预置系统提示词，支持 OpenAI 兼容协议（OpenAI / DeepSeek / Qwen / Gemini / Anthropic 兼容端点均可接入）。
- **多账号体系**：首个注册用户自动成为管理员，可创建子账号；管理员可共享 API 配置，子账号无需重复填写密钥。
- **本地化**：界面、注释、提示词全部中文，面向中国亚马逊卖家。

---

## 二、项目整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                       浏览器（用户）                          │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  index.html  主壳：侧边栏 + 首页计算器 + iframe 容器      │ │
│  │  hs-data.js  HS 编码静态数据库（window.HS_DB）            │ │
│  └─────────────────────────────────────────────────────────┘ │
│  ┌──────────────────── 子工具（iframe 内加载） ─────────────┐ │
│  │ root-analysis/  词根分析（CSV 解析、词根拆分、AI 分析）   │ │
│  │ profit-calc/    利润试算（FBA 费用、汇率、利润反算）     │ │
│  │ pdf-labels/     PDF 标签（JsBarcode + jsPDF）            │ │
│  │ ai-title/       AI 文案（登录、对话、设置、账号管理）     │ │
│  │ fba-map/        FBA 仓库地图（SVG 地图 + 仓库列表）        │ │
│  └─────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS
┌────────────────────────────▼────────────────────────────────┐
│              Cloudflare Pages（边缘节点）                     │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  静态资源：index.html / 子工具目录 / hs-data.js          │ │
│  └─────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Pages Functions（functions/api/**）                     │ │
│  │  - auth/register, auth/login     注册 / 登录             │ │
│  │  - settings                       API 配置读写           │ │
│  │  - conversations, conversations/[id]  对话 CRUD          │ │
│  │  - chat                           AI 调用（非流式）       │ │
│  │  - prompt                         当前生效提示词          │ │
│  │  - admin                          子账号管理              │ │
│  │  - amz-suggestions                亚马逊联想词代理        │ │
│  └───────────────────────┬─────────────────────────────────┘ │
└───────────────────────────┼─────────────────────────────────┘
                            │  绑定 DB
┌───────────────────────────▼─────────────────────────────────┐
│              Cloudflare D1（SQLite）                         │
│  users / user_settings / conversations / messages / sessions │
└────────────────────────────┬────────────────────────────────┘
                             │ fetch /v1/chat/completions
┌────────────────────────────▼────────────────────────────────┐
│        外部 OpenAI 兼容 AI 服务（用户自配置）                 │
│  OpenAI / DeepSeek / Qwen / Gemini / Anthropic 等            │
└─────────────────────────────────────────────────────────────┘
```

**核心架构分层**：

1. **前端层**：主壳 `index.html` 通过 iframe 加载各子工具页面，子工具之间相互隔离，可独立演进。
2. **API 层**：`functions/api/` 下每个文件对应一个路由，遵循 Cloudflare Pages Functions 的文件路由约定（如 `conversations/[id].js` 对应 `/api/conversations/:id`）。
3. **数据层**：D1（SQLite）存储用户、设置、对话、消息、会话；`schema.sql` 为建表脚本，`migrations/` 为增量迁移。
4. **AI 层**：后端 `chat.js` 作为代理调用用户配置的 OpenAI 兼容端点，密钥不暴露给前端。

---

## 三、目录结构

```
amztools/
├── index.html                 # 主壳：侧边栏 + 首页计算器（标题/评分/计费重/广告/HS/联想词）
├── hs-data.js                 # HS 编码静态数据库（window.HS_DB，143 条电子设备类目）
├── schema.sql                 # D1 建表脚本（users/settings/conversations/messages/sessions）
├── DEPLOY.md                  # 部署指南（含 API 列表与常见问题）
├── wrangler.toml.example      # Cloudflare Pages 配置示例
├── .gitignore
│
├── root-analysis/             # 词根分析工具（静态）
│   ├── index.html             # 主页面（CSV 解析、词根拆分、表格、AI 分析）
│   └── about/
│       └── about.html         # 逻辑说明文档（算法、字段映射）
│
├── profit-calc/               # 利润试算工具（静态）
│   └── index.html             # 多站点 FBA 费用、汇率、利润/售价双向反算
│
├── pdf-labels/                # PDF 标签制作工具（静态）
│   └── index.html             # JsBarcode + jsPDF + html2canvas 生成标签
│
├── ai-title/                 # AI 标题文案工具（前端 + 后端）
│   └── index.html             # 登录、产品信息表单、对话视图、设置、账号管理
│
├── fba-map/                  # FBA 仓库地图工具（静态）
│   ├── index.html            # 仓库列表 + SVG 地图定位 + 地址复制
│   └── svg/
│       ├── us.svg / gb.svg / de.svg / jp.svg / ca.svg
│
├── functions/                # Cloudflare Pages Functions（后端 API）
│   └── api/
│       ├── _utils/
│       │   ├── db.js         # D1 工具：getDb / now / uuid / jsonResponse / errorResponse
│       │   ├── auth.js       # 认证：hashPassword / verifyPassword / createSession / getCurrentUser / requireAuth
│       │   └── prompt.js     # 系统预置提示词 DEFAULT_SYSTEM_PROMPT
│       ├── auth/
│       │   ├── register.js   # POST /api/auth/register
│       │   └── login.js      # POST /api/auth/login
│       ├── conversations.js  # GET/POST /api/conversations
│       ├── conversations/
│       │   └── [id].js       # GET/DELETE /api/conversations/:id
│       ├── chat.js           # POST /api/chat（AI 调用，非流式）
│       ├── settings.js       # GET/PUT/DELETE /api/settings
│       ├── prompt.js         # GET /api/prompt（当前生效提示词）
│       ├── admin.js          # GET/POST/DELETE /api/admin（子账号管理）
│       └── amz-suggestions.js # GET /api/amz-suggestions（亚马逊联想词代理）
│
└── migrations/               # 增量迁移脚本
    ├── 001_add_role.sql          # 为 users 表添加 role 字段
    └── 002_add_custom_prompt.sql # 为 user_settings 表添加 custom_prompt 字段
```

---

## 四、主要模块职责

### 4.1 前端主壳 `index.html`

**职责**：站点总入口。负责侧边栏导航、首页即时工具卡片网格、iframe 子工具加载容器、开发中工具的占位弹窗。

**关键全局变量与函数**：

- `TOOLS`：工具元数据数组，每项含 `id / name / icon / path / category / desc / status`。
- `currentView` / `currentTool`：当前视图与当前打开的工具。
- `goHome()`：返回首页视图。
- `openTool(id)`：根据 `TOOLS` 打开工具；`status==='dev'` 时弹出"开发中"弹窗，否则设置 iframe src。
- `renderSidebar()`：按 `category` 分组渲染侧边栏导航。
- `renderSidebarStats()`：渲染工具总数/可用/开发中统计。
- `initSidebarToggle()`：侧边栏折叠状态持久化到 `localStorage.toolbox_collapsed`。
- `renderToolGrid()`：渲染首页"全部工具"卡片网格。
- `initTitleCounter()`：双标题字符计算器（主标题/副标题，字符/字节/词数/进度条/超限提示）。
- `initRatingCalculator()`：评分星级计算器（5→1 星，比例/评价数/回评预期，输出显示评分、差评占比、预期总评价）。
- `initBillingWeight()`：计费重计算器（cm/in/mm 与 kg/lb/oz/g 互转，体积重 5000/6000，计费重取实际重与体积重较大者）。
- `initAdBid()`：广告竞价计算器（基价 + 位置百分比 + 策略倍率，输出实际出价与最大出价）。
- `initHsCategories()` / `searchHsCode()` / `copyHsCode()` / `clearHsCode()`：HS 编码查询（依赖 `window.HS_DB`）。
- `AMZ_SITE_MAP` / `searchAmzSug()` / `renderAmzSugHistory()` 等：亚马逊联想词查询（通过 `/api/amz-suggestions` 代理，避免 CORS；历史存 `localStorage.amz_sug_history`，最多 20 条）。
- `initDragSort()`：首页工具卡片拖拽排序（`draggable="true"`）。
- `init()`：启动入口，依次渲染侧边栏/统计/工具网格，初始化各计算器。

### 4.2 静态子工具

#### 4.2.1 `root-analysis/` 词根分析

**职责**：上传亚马逊广告搜索词报告（CSV，支持自动/手动/商品投放等多种类型与编码），自动拆分词根、聚合指标、筛选否定词、生成词根组合建议，并支持把聚合数据发给用户自配置的 AI 做策略分析。

**关键函数**（节选）：

- `parseCSV(text)`：兼容带引号/换行的 CSV 解析。
- `detectType(headers, sample)`：根据列名自动判断报告类型（auto/manual/product/unknown）。
- `standardize(rows, type)`：把不同报告统一为 `{keyword, impressions, clicks, cost, sales, orders, ...}` 结构。
- `charType(c)` / `splitTokens(text, type, stopwords)`：按字符类型拆分搜索词为词根 token（区分中英文/数字/连字符）。
- `allocate(row, stopwords)`：把一行搜索词的指标按权重分配到每个 token。
- `aggregate(tokens)`：聚合所有 token 的总指标与匹配明细。
- `renderTable(data)` / `renderChips()` / `renderSuggestions(data)`：渲染表格、筛选 chip、组合建议。
- `generateSuggestions()`：基于词根频次与指标生成可组合的长尾词建议。
- `collectAiData()` / `askAi()`：收集当前筛选后的词根数据，调用用户配置的 AI 接口生成 Markdown 分析报告。
- `exportCsv()` / `exportSuggestionsCsv()`：导出词根表与建议表为 CSV。
- `about/about.html`：独立逻辑说明文档，解释字段映射、分配公式、否定词判定规则。

#### 4.2.2 `profit-calc/` 利润试算

**职责**：输入采购成本、尺寸重量、头程运费、平台佣金、广告、退款、VAT、关税等参数，按站点（US/UK/DE/JP/CA）计算 FBA 费用、到岸成本、利润率、ROI，并支持"按售价算利润"与"按目标利润反算售价"双向模式，结果可保存到 `localStorage`。

**关键常量与函数**：

- `COUNTRY_CONFIG`：站点→币种/符号/汇率 key 映射。
- `DEFAULT_RATES`：默认汇率（USD/GBP/EUR/JPY/CAD → CNY）。
- `CATEGORY_RATES`：品类默认佣金率（电子 8%、服装 17%、珠宝 20% 等）。
- `calcSizeTier(lengthCm, widthCm, heightCm, weightKg)`：根据尺寸+实重判定 FBA 尺寸档位（small-standard / large-standard / oversize / extra-large-heavy）与计费重（体积重 vs 实重取大）。
- `calcFbaFee(tier, chargeableWeightLb, salePrice, isPeak)`：美国站 FBA 费用表（按档位+计费重+售价区间+旺季）。
- `calcSmallStandardFee` / `calcLargeStandardFee` / `calcOversizeFee` / `calcExtraLargeHeavyFee`：各档位费用明细。
- `calculateAll(salePrice)`：主计算流程，输出成本明细、利润、利润率、ROI。
- `calcPriceFromMargin(targetMargin)`：按目标利润率反算售价。
- `saveRecord()` / `loadRecord(id)` / `deleteRecord(id)` / `renderRecords()`：本地记录管理（`localStorage.profit_calc_records`）。

#### 4.2.3 `pdf-labels/` PDF 标签制作

**职责**：生成符合亚马逊 FBA 标签规格的 PDF（条码 + 文本），支持批量、自定义尺寸、打印。

**依赖**（CDN）：

- `JsBarcode` 生成条码 SVG/canvas。
- `jsPDF` 生成 PDF 文件。
- `html2canvas` 把 DOM 节点转成图片用于 PDF。

**关键函数**：

- `updateLayout()`：根据输入参数更新标签预览布局。
- `exportCustomSizePDF()`：导出自定义尺寸 PDF。
- `printToPDF()`：调用浏览器打印。

#### 4.2.4 `fba-map/` FBA 仓库地图

**职责**：按站点（US/GB/DE/JP/CA）展示亚马逊 FBA 仓库代码、地址、州/城市、经纬度，左侧列表搜索，右侧 SVG 地图高亮选中仓库所在州，可一键复制地址并在外部地图打开。

**关键数据与函数**：

- `RAW`：内嵌仓库原始字符串（`代码|地址|州|城市|纬度|经度` 多行），各站点分块。
- `parseData(raw)`：把 RAW 解析为仓库对象数组。
- `renderList(filter)`：渲染左侧列表（支持关键字过滤）。
- `getSvgId(site, state)` / `loadSvgMap(site, highlightState)` / `highlightSvg(site, highlightState)`：根据站点+州定位 SVG 元素并高亮。
- `selectWh(code)` / `copyAddr()`：选中仓库、复制地址到剪贴板。
- `switchSite(site)`：切换站点，重新加载 SVG 与列表。

#### 4.2.5 `ai-title/` AI 标题文案（前后端联动）

**职责**：卖家填写产品信息（站点/语言/关键词/产品名/用途/材质/竞品/补充信息/图片），调用后端 `/api/chat` 生成亚马逊全量文案（标题/Item Highlights/五点/详情/Search Terms），支持多轮对话、历史记录、图片输入（vision 模型）。

**前端关键函数**：

- `api(path, options)`：统一 fetch 封装，自动带 `Authorization: Bearer <token>`，解析错误。
- `doLogin()` / `doRegister()`：登录/注册，成功后把 token 存 `localStorage.token`。
- `loadConversations()` / `loadHistory()`：加载侧边栏对话列表与首页历史卡片。
- `startGenerate()`：从产品表单收集信息，切换到聊天视图并发起首条消息。
- `sendChatRequest(params)`：调用 `/api/chat`，渲染 AI 回复。
- `openConversation(id)`：打开历史对话，从 `/api/conversations/:id` 拉消息列表渲染。
- `addMessage(role, content, images)`：在聊天区追加一条消息气泡。
- `renderMarkdown(el, text)`：极简 Markdown 渲染（`=== 标题 ===` → h4，`**bold**` → strong，`• ` → li）。
- `openSettings()` / `saveSettings()` / `useSharedSettings()`：API 配置弹窗，支持"使用管理员共享配置"。
- `viewSystemPrompt()` / `savePrompt()` / `resetPrompt()`：查看/保存/重置自定义系统提示词。
- `openAdmin()` / `loadUsers()` / `createUser()` / `deleteUser(id)`：管理员账号管理弹窗。
- `handleFiles(files)` / `handleFormFiles(files)`：图片选择/粘贴（≤5MB），转 base64 dataUrl 预览。
- `init()`：启动入口，若有 token 则调 `/api/settings` 验证并恢复登录态。

### 4.3 后端 Pages Functions

#### 4.3.1 工具层 `functions/api/_utils/`

##### `db.js`

D1 数据库与响应工具，被几乎所有 API 引用。

- `getDb(context)`：从 `context.env.DB` 取 D1 句柄，并尝试执行 `PRAGMA foreign_keys=ON;`（D1 默认关闭外键）。
- `now()`：返回 Unix 秒（`Math.floor(Date.now()/1000)`）。
- `uuid()`：包装 `crypto.randomUUID()` 生成对话 ID。
- `jsonResponse(data, status=200)`：标准 JSON 响应，带 CORS 头。
- `errorResponse(message, status=400)`：错误 JSON 响应。

##### `auth.js`

认证与会话工具。

- `SESSION_DAYS = 30`、`TOKEN_BYTES = 32`：会话有效期与 token 长度。
- `generateToken()`：用 `crypto.getRandomValues` 生成 32 字节随机 token（字母+数字）。
- `hashPassword(password)`：**PBKDF2 + SHA-256 + 16 字节随机盐 + 10 万次迭代**，返回 `salt$hash`（均 base64）。使用 Web Crypto API，无需任何第三方依赖。
- `verifyPassword(password, stored)`：拆分 salt，重新派生 hash 并比对。
- `createSession(db, userId)`：生成 token 并写入 `sessions` 表，返回 `{ token, expiresAt }`。
- `getCurrentUser(request, context)`：从 `Authorization: Bearer <token>` 或 `Cookie: session=<token>` 提取 token，联表 `sessions + users` 查当前用户；过期则删除该 session。
- `requireAuth(request, context)`：登录校验中间件，返回 `{ user, error }`，未登录时 `error` 为 401 响应。

##### `prompt.js`

- `DEFAULT_SYSTEM_PROMPT`：系统预置的亚马逊文案专家提示词，被 `chat.js` 与 `prompt.js` 同时引用，避免重复维护。内容覆盖 2026 年 7 月新规（标题 ≤75 字符）、Item Highlights、五点、详情描述、Search Terms 的硬性规则与输出格式。

#### 4.3.2 业务接口

##### `auth/register.js` — `POST /api/auth/register`

用户注册。

- 校验 email 格式、密码 ≥6 位。
- **若 users 表已有用户，返回 403 拒绝注册**（首次注册即管理员，注册后关闭公开注册）。
- 邮箱转小写去重。
- 写入 `users`（首个用户 role=`admin`）+ 同步创建空 `user_settings`。
- 自动 `createSession`，返回 `{ success, user, token }` 并设置 `Set-Cookie: session=...; HttpOnly; SameSite=Lax`。

##### `auth/login.js` — `POST /api/auth/login`

用户登录。

- 邮箱转小写查 `users`。
- `verifyPassword` 校验，失败统一返回"邮箱或密码错误"（防枚举）。
- 成功则 `createSession`，结构与 register 一致。

##### `settings.js` — `GET / PUT / DELETE /api/settings`

用户 API 配置（api_base / api_model / api_key / custom_prompt）。

- **GET**：返回当前用户配置。若用户未配置，**回退到管理员共享配置**，并标记 `is_shared: true`。`api_key` 一律返回掩码 `••••xxxx`（仅末 4 位）。
- **PUT**：
  - `custom_prompt`：传 `null` 清除，传字符串保存，不传保留原值。
  - `api_key` 若以 `••••` 开头视为未改，不更新密钥。
  - 仅传 `custom_prompt` 时不会覆盖 API 配置（保存提示词专用路径）。
- **DELETE**：删除当前用户的 `user_settings`，回退到管理员共享配置。

##### `conversations.js` — `GET / POST /api/conversations`

- **GET**：分页（`limit`/`offset`，默认 50/0）查询当前用户对话列表，`LEFT JOIN messages` 统计 assistant 消息数，按 `updated_at DESC` 排序。
- **POST**：新建对话（`title` / `content_type` / `product_info` 必填，id 用 `uuid()`）。

##### `conversations/[id].js` — `GET / DELETE /api/conversations/:id`

- **GET**：返回对话详情 + 全部消息（按 `created_at ASC`）。
- **DELETE**：先删 `messages` 再删 `conversations`（外键 ON DELETE CASCADE 也会兜底）。
- 全程按 `user_id` 隔离，他人对话返回 404。

##### `chat.js` — `POST /api/chat`

AI 文案生成核心。

入参：`{ conversation_id?, message, content_type?, product_info?, images? }`。

流程：

1. `requireAuth` 校验登录。
2. 取用户 `user_settings`；若未配置，回退到管理员共享配置。
3. 解析 `conversation_id`：有则校验归属；无则用 `product_info` 新建对话（标题取 `product_info.product_name`）。
4. 组装 messages：
   - `system`：`custom_prompt || DEFAULT_SYSTEM_PROMPT`。
   - `user`：把 `product_info` 格式化为结构化文本（站点/语言/关键词/产品名/用途/材质/竞品/补充信息）。
   - 续对话时加载历史消息；若历史内容是带图片的 JSON，重构为 OpenAI vision 的 `content` 数组格式。
   - 当前用户消息：有图片时构造 `[{type:'text',...},{type:'image_url',...}]`，存储为 `{text, images}` 的 JSON 字符串。
5. 调用 `{api_base}/v1/chat/completions`（`stream:false`），带 `Authorization: Bearer <api_key>`。
6. 把 AI 回复存入 `messages`（role=assistant），更新对话 `updated_at`。
7. 返回 `{ conversation_id, content }`。

错误：AI 接口非 2xx → 502；网络异常 → 500。

##### `prompt.js` — `GET /api/prompt`

返回当前生效提示词：用户 `custom_prompt` 优先，否则 `DEFAULT_SYSTEM_PROMPT`，并标记 `is_custom`。

##### `admin.js` — `GET / POST / DELETE /api/admin`

子账号管理（仅管理员，首个登录用户在 GET 时若无人是管理员则自动提升）。

- **GET**：无管理员则提升当前用户；有管理员且当前用户非管理员 → 403；否则返回全部用户列表（不含密码）。
- **POST**：创建子账号（role=`user`），同步创建空 `user_settings`。
- **DELETE**：按 `?id=` 删除子账号；禁止删除自己、禁止删除管理员。

##### `amz-suggestions.js` — `GET /api/amz-suggestions`

亚马逊联想词代理（解决前端 CORS）。

- 入参：`prefix` / `mid`（默认美国 `ATVPDKIKX0DER`）/ `limit`（默认 11）。
- 转发到 `https://completion.amazon.com/api/2017/suggestions?...`，带浏览器 UA。
- `cf: { cacheTtl: 60 }` 边缘缓存 60 秒，响应头 `Cache-Control: max-age=60`。

---

## 五、数据库 Schema（D1 / SQLite）

定义于 `schema.sql`，5 张表 + 3 个索引。注意 D1 默认关闭外键，`db.js#getDb()` 每次连接会执行 `PRAGMA foreign_keys=ON;`。

### 5.1 `users` 用户表

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | 主键 |
| email | TEXT UNIQUE NOT NULL | 邮箱（注册/登录时转小写） |
| password_hash | TEXT NOT NULL | `salt$hash`（PBKDF2-SHA256，10 万次） |
| nickname | TEXT | 昵称 |
| role | TEXT NOT NULL DEFAULT 'user' | 角色：`user` / `admin`（由 001 迁移新增） |
| created_at / updated_at | INTEGER | Unix 秒 |

### 5.2 `user_settings` 用户 API 配置

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK | 主键 |
| user_id | INTEGER UNIQUE NOT NULL | 外键 → users.id，ON DELETE CASCADE |
| api_base / api_model / api_key | TEXT | OpenAI 兼容端点配置 |
| custom_prompt | TEXT | 用户自定义系统提示词，NULL 表示用预置（由 002 迁移新增） |
| created_at / updated_at | INTEGER | Unix 秒 |

### 5.3 `conversations` 对话表

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID（crypto.randomUUID） |
| user_id | INTEGER NOT NULL | 外键 → users.id |
| title | TEXT NOT NULL | 默认取产品名 |
| content_type | TEXT NOT NULL | `title / bullets / search_terms / description / all` |
| product_info | TEXT NOT NULL | JSON 字符串 |
| created_at / updated_at | INTEGER | Unix 秒 |

索引：`idx_conv_user(user_id, updated_at DESC)`。

### 5.4 `messages` 消息表

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | 主键 |
| conversation_id | TEXT NOT NULL | 外键 → conversations.id |
| role | TEXT NOT NULL | `system / user / assistant` |
| content | TEXT NOT NULL | 文本；带图片时存 `{text, images}` 的 JSON |
| created_at | INTEGER | Unix 秒 |

索引：`idx_msg_conv(conversation_id, created_at ASC)`。

### 5.5 `sessions` 会话表

| 字段 | 类型 | 说明 |
|---|---|---|
| token | TEXT PK | 32 字节随机 token |
| user_id | INTEGER NOT NULL | 外键 → users.id |
| created_at / expires_at | INTEGER | Unix 秒，有效期 30 天 |

索引：`idx_sess_user(user_id)`、`idx_sess_expires(expires_at)`。

### 5.6 迁移脚本 `migrations/`

- `001_add_role.sql`：旧库补 `users.role`，并把最小 id 用户提升为 admin。
- `002_add_custom_prompt.sql`：旧库补 `user_settings.custom_prompt`。

---

## 六、依赖关系

### 6.1 运行时依赖

项目**无 npm 依赖**（无 `package.json` / `node_modules`），全部依赖均由运行环境或 CDN 提供。

**Cloudflare Pages Functions 运行时**：

- Web Crypto API（`crypto.subtle` PBKDF2、`crypto.getRandomValues`、`crypto.randomUUID`）。
- `fetch`（调用外部 AI、亚马逊联想词）。
- D1 binding（`context.env.DB`）。
- `Request` / `Response` 标准 Web API。

**前端 CDN 依赖**（仅 `pdf-labels/index.html`）：

| 库 | 用途 | 来源 |
|---|---|---|
| JsBarcode 3.11.5 | 条码生成 | jsdelivr |
| jsPDF 2.5.1 | PDF 生成 | cdnjs |
| html2canvas 1.4.1 | DOM 转图片 | cdnjs |

其余页面均为纯原生 HTML/CSS/JS，无任何外部库。

### 6.2 模块间依赖

**后端 API 内部依赖**（`import` 关系）：

```
auth/register.js ─┬─► _utils/db.js
                  └─► _utils/auth.js ──► _utils/db.js

auth/login.js ────┬─► _utils/db.js
                  └─► _utils/auth.js

settings.js ──────┬─► _utils/db.js
                  └─► _utils/auth.js

conversations.js ─┬─► _utils/db.js
                  └─► _utils/auth.js

conversations/[id].js ─┬─► _utils/db.js
                       └─► _utils/auth.js

chat.js ──────────┬─► _utils/db.js
                  ├─► _utils/auth.js
                  └─► _utils/prompt.js   (DEFAULT_SYSTEM_PROMPT)

prompt.js ─────────┬─► _utils/db.js
                   ├─► _utils/auth.js
                   └─► _utils/prompt.js

admin.js ──────────┬─► _utils/db.js
                  └─► _utils/auth.js

amz-suggestions.js ── (无内部依赖，纯 fetch 代理)
```

`_utils/auth.js` 依赖 `_utils/db.js`（`getDb`/`now`/`jsonResponse`/`errorResponse`）。

**前端依赖**：

- `index.html` 依赖 `hs-data.js`（`window.HS_DB`），通过 `<script src>` 同步加载。
- `ai-title/index.html` 依赖后端 `/api/*` 全套接口。
- `root-analysis/index.html` 的 `askAi()` 直接在浏览器内 fetch 用户自配置的 AI 端点（不经过后端）。
- 其余子工具完全自包含。

---

## 七、项目运行方式

### 7.1 前置条件

- Cloudflare 账号（用于部署 + D1）。
- 本地已安装 Node.js v18+ 与 wrangler CLI。

```bash
npm install -g wrangler
wrangler login
```

### 7.2 创建并初始化 D1 数据库

```bash
# 创建
wrangler d1 create fza_toolbox
# 记录输出的 database_id

# 本地预览数据库（可选，先本地测试）
wrangler d1 execute fza_toolbox --local --file=./schema.sql

# 生产环境执行
wrangler d1 execute fza_toolbox --file=./schema.sql
```

### 7.3 配置 `wrangler.toml`

复制 `wrangler.toml.example` 为 `wrangler.toml`，填入自己的 `database_id`：

```toml
name = "amazon-toolbox"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "fza_toolbox"
database_id = "你的-database-id"
```

### 7.4 本地开发

```bash
# 启动本地 Pages 预览（含 Functions + D1）
wrangler pages dev . --d1 fza_toolbox

# 初始化本地 D1（首次或 schema 变更后）
wrangler d1 execute fza_toolbox --local --file=./schema.sql
```

访问 <http://localhost:8788>。

> 注意：不能用 `file://` 直接打开页面，Pages Functions 必须通过 `wrangler pages dev` 或部署后才能访问 `/api/*`。

### 7.5 部署到 Cloudflare Pages

**方式 A：Git 连接（推荐）**

1. 推送到 GitHub。
2. Cloudflare Dashboard → Pages → Create project → Connect to Git → 选仓库。
3. 构建设置：Build command 留空，Build output directory 留空（根目录即输出）。
4. 创建后在 Settings → Functions → D1 database bindings 添加 `DB` → 选 `fza_toolbox`。
5. 重新部署。

**方式 B：Wrangler CLI**

```bash
wrangler pages deploy . --project-name=amazon-toolbox
# 部署后在 Dashboard 配置 D1 binding：Settings → Functions → D1 database bindings → 添加 DB
```

### 7.6 验证步骤

1. 打开首页，确认所有静态工具正常。
2. 进入「AI 标题文案」，注册账号（首个用户自动成为管理员，注册后公开注册关闭）。
3. 进入设置，配置 API Base URL / 模型 / 密钥。
4. 填写产品信息，生成文案，测试输出。
5. 刷新页面，确认历史对话仍在。

### 7.7 旧库升级

若已有旧版 D1，按需执行迁移：

```bash
wrangler d1 execute fza_toolbox --remote --file=./migrations/001_add_role.sql
wrangler d1 execute fza_toolbox --remote --file=./migrations/002_add_custom_prompt.sql
```

---

## 八、API 接口列表

| 方法 | 路径 | 说明 | 鉴权 |
|---|---|---|---|
| POST | `/api/auth/register` | 注册（首个用户=管理员，之后关闭） | - |
| POST | `/api/auth/login` | 登录 | - |
| GET | `/api/settings` | 获取 API 配置（含管理员共享回退） | ✓ |
| PUT | `/api/settings` | 更新 API 配置 / 自定义提示词 | ✓ |
| DELETE | `/api/settings` | 清除个人配置，回退到共享配置 | ✓ |
| GET | `/api/conversations?limit=&offset=` | 对话列表 | ✓ |
| POST | `/api/conversations` | 新建对话 | ✓ |
| GET | `/api/conversations/:id` | 对话详情 + 消息 | ✓ |
| DELETE | `/api/conversations/:id` | 删除对话 | ✓ |
| POST | `/api/chat` | 发送消息（非流式，支持图片） | ✓ |
| GET | `/api/prompt` | 当前生效系统提示词 | ✓ |
| GET | `/api/admin` | 用户列表 / 首次提升管理员 | ✓ |
| POST | `/api/admin` | 创建子账号（仅管理员） | ✓ admin |
| DELETE | `/api/admin?id=` | 删除子账号（仅管理员） | ✓ admin |
| GET | `/api/amz-suggestions?prefix=&mid=&limit=` | 亚马逊联想词代理（CORS 代理 + 边缘缓存 60s） | - |

**鉴权方式**：`Authorization: Bearer <token>` 或 `Cookie: session=<token>`（登录时由后端通过 `Set-Cookie` 写入，30 天有效）。

**CORS**：所有响应统一 `Access-Control-Allow-Origin: *`，每个接口都实现 `onRequestOptions` 处理预检。

---

## 九、安全与设计要点

1. **密码哈希**：PBKDF2-SHA256 + 16 字节随机盐 + 10 万次迭代，使用 Web Crypto，无第三方依赖。
2. **密钥隔离**：`api_key` 仅后端可读，前端接口只返回掩码 `••••xxxx`。
3. **数据隔离**：所有对话/设置查询均按 `user_id` 过滤，跨用户访问返回 404。
4. **注册关闭**：首个用户注册成为管理员后，公开注册立即关闭，后续账号由管理员在 `/api/admin` 创建。
5. **共享配置**：子账号未配置时自动回退到管理员的 API 配置，便于团队共用一份密钥。
6. **外键兜底**：D1 默认关外键，`getDb()` 每次执行 `PRAGMA foreign_keys=ON;`；删除对话时显式先删 `messages` 再删 `conversations`，双保险。
7. **会话清理**：`getCurrentUser` 检测到过期 session 会主动删除，避免 `sessions` 表膨胀。
8. **CORS 代理**：亚马逊联想词接口因目标站点不开放 CORS，由 Pages Functions 代理并加 60 秒边缘缓存。

---

## 十、扩展指引

- **新增静态工具**：在仓库根建新目录放 `index.html`，并在 `index.html` 的 `TOOLS` 数组追加一项（`status:'active'` 或 `'dev'`），侧边栏与首页卡片会自动渲染。
- **新增首页即时计算器**：在 `index.html` 加 HTML 卡片 + `initXxx()` 函数，并在 `init()` 末尾调用。
- **新增后端接口**：在 `functions/api/` 下按 Pages Functions 文件路由约定新建 `.js`（如 `foo/bar.js` → `/api/foo/bar`），按需 `import` `_utils/`。
- **修改系统提示词**：编辑 `_utils/prompt.js` 的 `DEFAULT_SYSTEM_PROMPT`，`chat.js` 与 `prompt.js` 会同时生效。
- **新增 HS 编码**：在 `hs-data.js` 的 `window.HS_DB` 数组追加 `{code,name,en,cat,expired,kw}` 即可，前端无需改动。
- **新增 FBA 仓库**：在 `fba-map/index.html` 对应站点的 `RAW` 字符串追加 `代码|地址|州|城市|纬度|经度` 一行。
