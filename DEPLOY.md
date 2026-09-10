# 亚马逊工具箱 · 部署指南

部署到 Cloudflare Pages + D1 数据库。

## 前置条件

- Cloudflare 账号
- 已安装 Node.js (v18+) 和 wrangler CLI

```bash
npm install -g wrangler
wrangler login
```

## 目录结构

```
亚马逊工具箱/
├── index.html              # 首页
├── root-analysis/          # 词根分析（静态）
├── pdf-labels/             # PDF标签（静态）
├── fba-map/                # FBA地图（静态）
├── ai-title/               # AI文案（前端）
├── functions/              # Pages Functions（后端 API）
│   └── api/
│       ├── auth/
│       │   ├── register.js
│       │   └── login.js
│       ├── _utils/
│       │   ├── db.js
│       │   └── auth.js
│       ├── chat.js
│       ├── conversations.js
│       └── settings.js
└── schema.sql              # D1 建表脚本
```

## 步骤 1：创建 D1 数据库

```bash
# 创建数据库
wrangler d1 create fza_toolbox
```

执行后会输出绑定信息，类似：
```
[[d1_databases]]
binding = "DB"
database_name = "fza_toolbox"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

把这段复制下来备用。

## 步骤 2：初始化数据表

```bash
# 本地预览数据库（可选，先本地测试）
wrangler d1 execute fza_toolbox --local --file=./schema.sql

# 生产环境执行
wrangler d1 execute fza_toolbox --file=./schema.sql
```

## 步骤 3：创建 wrangler.toml

在项目根目录（亚马逊工具箱/）下创建 `wrangler.toml`：

```toml
name = "amazon-toolbox"
compatibility_date = "2024-01-01"

# Pages 项目配置（Pages Functions 自动识别 functions/ 目录）
# D1 数据库绑定
[[d1_databases]]
binding = "DB"
database_name = "fza_toolbox"
database_id = "你的database_id"
```

## 步骤 4：部署到 Cloudflare Pages

### 方式 A：Git 连接（推荐）

1. 把代码推到 GitHub
2. Cloudflare Dashboard → Pages → Create project → Connect to Git
3. 选择仓库
4. 构建设置：
   - Build command: 留空（纯静态）
   - Build output directory: 留空（根目录）
5. 创建后，在 Settings → Functions → D1 database bindings
   - Variable name: `DB`
   - D1 database: 选择 `fza_toolbox`
6. 重新部署

### 方式 B：Wrangler CLI

```bash
# 首次部署
wrangler pages deploy . --project-name=amazon-toolbox

# 后续部署
wrangler pages deploy .
```

部署后需要在 Dashboard 里配置 D1 binding：
Settings → Functions → D1 database bindings → 添加 `DB` → 选择数据库

## 步骤 5：验证

访问部署后的域名：

1. 打开首页，确认所有静态工具正常
2. 进入「AI标题文案」
3. 注册一个账号
4. 进入设置，配置 API Base URL、模型、密钥
5. 填写产品信息，生成文案，测试流式输出
6. 刷新页面，确认历史对话还在
7. 进入「ABA 数据」测试（需配置 `SS_COOKIE`，见下）

## 环境变量

在 Cloudflare Pages → Settings → Environment variables 添加：

| 变量 | 必填 | 说明 |
|------|------|------|
| `DB` | ✓ | D1 绑定（按上面步骤配） |
| `TR_API_BASE` | 可选 | AI 翻译兜底 Base URL（如 `https://aiapi.fonken.net`） |
| `TR_API_MODEL` | 可选 | AI 翻译兜底模型名（如 `Spark Lite`） |
| `TR_API_KEY` | 可选 | AI 翻译兜底 API Key |
| `SS_COOKIE` | 可选 | SellerSprite 完整 cookie 字符串（用于 ABA 数据代理）。浏览器登录 SellerSprite 后，从 DevTools 复制 `Cookie` 请求头。 |
| `SS_CACHE` | 可选 | Cloudflare KV 命名空间 binding（启用 ABA 5 分钟缓存）。创建：`wrangler kv:namespace create SS_CACHE`，把输出 ID 填到 wrangler.toml。 |

注意：环境变量修改后需重新部署才能生效。

## API 接口列表

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| POST | `/api/auth/register` | 注册 | - |
| POST | `/api/auth/login` | 登录 | - |
| GET | `/api/settings` | 获取API配置 | ✓ |
| PUT | `/api/settings` | 更新API配置 | ✓ |
| GET | `/api/conversations` | 对话列表 | ✓ |
| GET | `/api/conversations/:id` | 对话详情+消息 | ✓ |
| POST | `/api/conversations` | 新建对话 | ✓ |
| DELETE | `/api/conversations/:id` | 删除对话 | ✓ |
| POST | `/api/chat` | 发送消息（SSE流式） | ✓ |
| POST | `/api/translate` | AI 翻译（环境变量兜底） | - |
| POST | `/api/aba-research` | SellerSprite ABA 数据代理 | - |
| POST | `/api/amz-suggestions` | 亚马逊下拉联想词 | - |
| GET | `/api/prompt` | 读取系统提示词模板 | - |

## 本地开发

```bash
# 启动本地 Pages 预览（含 Functions + D1）
wrangler pages dev . --d1 fza_toolbox

# 初始化本地 D1 数据库
wrangler d1 execute fza_toolbox --local --file=./schema.sql
```

访问 http://localhost:8788

## 常见问题

**Q: 本地 file:// 打开页面，API 请求失败？**
A: 是的，Pages Functions 必须通过 wrangler pages dev 或部署后才能访问。本地开发用 `wrangler pages dev .`

**Q: D1 免费额度够吗？**
A: 免费版：5GB 存储，25M 读/天，5M 写/天，1GB 数据出口。个人使用完全足够。

**Q: API Key 安全吗？**
A: 密钥加密存在 D1 数据库，仅后端 Worker 能读取，前端只返回掩码（••••xxxx）。所有数据按 user_id 隔离。

**Q: 可以支持多个 OpenAI 兼容 API 吗？**
A: 可以，设置里填不同的 base URL 和 model 就行，支持 OpenAI、Anthropic、DeepSeek、Qwen、Gemini 等任何兼容格式。
