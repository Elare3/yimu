# 一木 YiMu

> 一人成木，独木成林 — OPC（一人公司）创业者的 AI 经营伙伴

一木是面向独立创业者 / 自由职业者的全栈经营管理平台，集成客户管理、项目跟踪、报价生成、收款催付、财务记账和 AI 经营洞察于一体，手机端与桌面端全适配，帮助一个人也能像团队一样高效运转。

## 技术栈

| 层级 | 选型 |
|------|------|
| 框架 | Next.js 14.2 (App Router) + TypeScript 5 |
| UI | React 18 + Tailwind CSS 3.4（奶油拿铁设计系统） |
| 数据库 | MongoDB + Prisma 5 ORM |
| 认证 | NextAuth.js 4（手机号验证码 / 手机号密码） |
| AI 引擎 | 通义千问 Qwen（阿里云百炼 DashScope） |
| 数据请求 | SWR 2（客户端缓存 + 重验证） |
| 状态管理 | Zustand 5 |
| 表单 | React Hook Form + Zod |
| 图表 | Recharts |
| 拖拽 | @dnd-kit（看板视图） |
| PDF | @react-pdf/renderer + html2pdf.js（报价 / 催款函导出） |
| 测试 | Vitest |

## 核心功能

### 客户管理 `/clients`
- 客户档案 CRUD、批量导入
- 客户详情页：概览 / 项目 / 报价 / 财务四个标签页
- 敏感字段（手机、邮箱、微信、地址）AES-256-GCM 透明加密，手机号 HMAC 哈希索引支持查询
- 自动统计项目数、累计收入

### 项目管理 `/projects`
- 项目生命周期：已报价 → 进行中 → 验收中 → 已完成 / 已取消
- 三列看板拖拽视图（@dnd-kit），拖拽即变更状态
- 状态机（`PROJECT_STATE_MACHINE`）校验合法转换并触发副作用：创建收款节点、触发尾款、取消待收款等
- 批量操作：状态变更 / 软删除 / 打标签，逐项走状态机，非法转换自动跳过
- 已完成项目独立归档管理

### 智能报价 `/quotes`
- AI 一键生成报价单（需求描述 → 自动拆分报价项 + 定价参考）
- 规则引擎校验（单价区间、折扣上限、税务合规）
- PDF 导出、报价单复制
- 报价接受后自动创建项目 + 按规则拆分收款节点
- 报价编号生成带并发重试，避免唯一约束冲突

### 收款管理 `/payments`
- 基于项目金额自动拆分收款节点（定金 / 中期 / 尾款，信用等级微调比例）
- 已付金额与项目 `paidAmount`、客户 `totalRevenue` 在数据库事务中同步，避免数据漂移
- 逾期自动标记 + 催款升级（v3.0 规则定级 + AI 写文案 + 合规校验）
- 收款自动记账：生成带"自动记账"标签的收入流水，编辑 / 删除时回滚项目与客户聚合

### 财务记账 `/finance`
- 收支记录 CRUD，手动记账支持关联项目 / 客户（自动归属校验）
- AI 语音 / 文字快速记账（"昨天打车 35 元" → 自动解析金额、分类、日期）
- 三种视图：明细、按项目、按周
- 月度汇总（总收入、本月收入支出、本月利润、记录笔数）
- 自动记账流水字段锁定（类型 / 项目 / 客户 / 标签不可改），保证与收款节点一致

### 经营洞察 `/dashboard`
- 六维健康评分（收入、成本、现金流、客户多元、项目管线、税务效率）
- 规则引擎即时洞察（~200ms，页面加载自动显示）
- AI 深度分析（点击触发，失败自动降级为规则结果）
- 税务预警（增值税 / 个税阈值检测）
- 数据快照（本月 vs 上月环比）

### 个人设置 `/settings`
- 个人资料、经营设置、意见反馈、数据与隐私、账号安全五大面板
- 头像上传按 magic bytes 真实嗅探文件类型，新头像写入后自动清理旧文件
- 注销账号：级联删除 14 张表的用户数据

## 三层护城河架构

```
API Route → 规则引擎(rules.ts) → 事件总线(events.ts) → AI调度器(ai-orchestrator.ts)
```

| 层 | 文件 | 职责 |
|----|------|------|
| 规则引擎 | `src/lib/rules.ts` | OPC 行业规则：收款拆分、报价校验、项目状态机、税务规则、健康评分、催款升级 |
| 事件总线 | `src/lib/events.ts` | 跨模块联动：报价接受→创建项目、收款到账→税务预警、项目取消→清理未付节点、每日检查→逾期升级 |
| AI 调度器 | `src/lib/ai-orchestrator.ts` | 规则先行 → AI 增强 → 结果校验；意图参数哈希缓存；AI 失败自动降级 |

设计原则：
- 无 AI 时系统仍可运行（规则兜底）
- 规则校验在 AI 之前和之后都执行
- 跨模块副作用通过事件总线解耦
- 写请求保证数据库事务原子性（聚合字段同步更新）

## 安全与合规

- **敏感字段加密**：Prisma 中间件透明加解密 User.phone / Client.phone,email,wechat,address（AES-256-GCM）
- **手机号哈希索引**：HMAC-SHA256 支持密文存储下的精确查询
- **CSRF 双保险**：SameSite=Lax + 中间件校验写请求 Origin/Referer
- **速率限制**（内存桶）：
  - 业务 API — 每用户每分钟 60 次
  - 登录 / 注册 — 每 IP 每 10 分钟 10 次
  - 数据导出 — 每用户每小时 3 次
- **登录爆破防护**：NextAuth credentials callback 强制走登录桶
- **CSP**：`default-src 'self'`，图片允许 self/data/blob，仅白名单 DashScope
- **文件上传**：magic bytes 嗅探，拒绝伪造 Content-Type；路径白名单限制旧文件清理范围

## 项目结构

```
src/
├── app/
│   ├── (auth)/              # 认证页面（登录）
│   ├── (dashboard)/         # 业务页面
│   │   ├── dashboard/       # 经营概览
│   │   ├── clients/         # 客户管理 + 客户详情
│   │   ├── projects/        # 项目看板 + 项目详情
│   │   ├── quotes/          # 报价管理
│   │   ├── payments/        # 收款管理
│   │   ├── finance/         # 财务记账 + AI 记账
│   │   └── settings/        # 个人设置
│   └── api/                 # 49 个 API 路由
│       ├── auth/            # NextAuth（phone / password）
│       ├── clients/         # 客户 CRUD + 批量导入
│       ├── projects/        # 项目 CRUD + 状态机 + 批量
│       ├── quotes/          # 报价 CRUD + AI 生成 + PDF
│       ├── payments/        # 收款 + 标记已付 + 催款
│       ├── transactions/    # 记账 + AI 解析 + 汇总
│       ├── dashboard/       # 汇总 + AI 洞察 + 预警
│       ├── users/           # 资料 / 头像 / 账号注销
│       ├── notifications/   # 通知中心
│       ├── export/          # 数据导出（限流独立桶）
│       ├── activities/      # 操作日志
│       ├── business-memory/ # 经营记忆
│       ├── contracts/       # 合同生成
│       ├── feedback/        # 意见反馈
│       ├── onboarding/      # 新手引导
│       ├── pricing-feedback/# 定价反馈
│       ├── health/          # 健康检查
│       └── seed/            # 种子数据
├── components/
│   ├── business/            # 业务组件（看板、项目卡片、表单、PDF）
│   ├── layout/              # Sidebar（桌面）、MobileNav（移动端）、Header
│   ├── providers/           # Session、SWR
│   └── ui/                  # Button、Input、Modal、Toast、Badge、Select
├── lib/
│   ├── rules.ts             # 规则引擎
│   ├── events.ts            # 事件总线
│   ├── ai-orchestrator.ts   # AI 调度器
│   ├── prompts.ts           # AI 提示词模板
│   ├── semantic-intent.ts   # 意图参数哈希
│   ├── template-cache.ts    # AI 模板缓存
│   ├── knowledge.ts         # 知识文档检索
│   ├── ai.ts                # DashScope 封装
│   ├── security.ts          # 脱敏工具
│   ├── encryption.ts        # AES-GCM + HMAC
│   ├── password.ts          # 密码哈希
│   ├── auth.ts              # NextAuth 配置
│   ├── prisma.ts            # Prisma 客户端 + 加密中间件
│   ├── session.ts           # requireUserId
│   ├── activity.ts          # 操作日志
│   ├── swr-config.ts        # SWR 全局配置
│   ├── route-preload.ts     # 路由预取
│   └── utils.ts             # API 响应、分页、格式化
├── stores/                  # Zustand 状态
├── hooks/                   # 自定义 Hooks
├── types/                   # TypeScript 类型
├── __tests__/               # Vitest 测试
└── middleware.ts            # 鉴权 + CSRF + 速率限制
```

## 数据模型

14 个模型（MongoDB + Prisma）：

| 模型 | 说明 |
|------|------|
| User | 用户（加密手机号 + HMAC 索引、业务类型、套餐） |
| Client | 客户（加密联系方式、信用等级、项目数、累计收入） |
| Project | 项目（状态机、金额、收款进度、截止日、交付物） |
| Quote | 报价单（报价项、折扣、AI 生成标记、唯一编号） |
| Transaction | 收支记录（分类、标签、关联项目 / 客户） |
| PaymentNode | 收款节点（定金 / 中期 / 尾款、催款升级记录） |
| PricingFeedback | 定价反馈（回流到规则引擎） |
| BusinessMemory | 经营记忆（AI 上下文） |
| KnowledgeDoc | 知识文档（税务 / 合同 / 行业标准） |
| AITemplateCache | AI 模板缓存（意图哈希命中） |
| AICallLog | AI 调用日志（隐私审计） |
| AIAuditLog | AI 内容合规审计 |
| Feedback | 用户反馈 |
| ActivityLog | 操作日志 |

## 移动端适配

- 桌面端侧边栏（`md:` 断点以上显示）
- 移动端底部导航栏：概览 / 项目 / 报价 / 记账 / 我的
- 所有业务页面响应式布局，页脚预留 `pb-20` 避开 MobileNav
- 头像采用原生 `<img>` 渲染，避免 Next Image 优化管道在移动端 / 反向代理下的兼容问题

## 快速开始

### 环境要求

- Node.js 18+（npm 10+）
- MongoDB 6.0+（副本集，用于 Prisma 事务）

### 安装

```bash
git clone <repo-url> && cd yimu
npm install
cp .env.example .env.local   # 填入你的配置
npx prisma generate
npm run dev                  # 端口 3001
```

### 环境变量

```env
# MongoDB（必须为副本集）
DATABASE_URL=mongodb://localhost:27017/yimu_db

# NextAuth
NEXTAUTH_SECRET=your-random-secret-key
NEXTAUTH_URL=http://localhost:3001

# AI 引擎（阿里云百炼 DashScope）
DASHSCOPE_API_KEY=your-dashscope-api-key
PRIMARY_MODEL=qwen3-max            # 复杂推理（报价、催款、洞察）
LIGHT_MODEL=qwen3-turbo            # 结构化解析（记账、分类）

# 敏感字段加密（AES-256-GCM，64 位 hex）
ENCRYPTION_KEY=your-64-char-hex-key

# 手机号哈希盐（HMAC-SHA256）
PHONE_HASH_SECRET=your-hmac-secret

# 开发环境固定验证码 051029
ENABLE_TEST_CODE=true

# 生产启用 HSTS
ENABLE_HTTPS=true
```

> 开发模式下，短信验证码固定为 `051029`，无需真实短信服务。

### 构建部署

```bash
npm run build
npm start
```

生产环境推荐 PM2 + MongoDB 副本集。

## 设计系统

奶油拿铁风格（Cream Latte），传递温暖与信任感：

| 色彩 | 色值 | 用途 |
|------|------|------|
| 奶油白 | `#FAF6F0` | 页面背景 |
| 焦糖棕 | `#C47D3F` | 主色调、品牌色 |
| 橄榄绿 | `#5B8C5A` | 收入 / 成功 |
| 琥珀金 | `#D4940E` | 警告 / 待处理 |
| 珊瑚红 | `#E05A47` | 紧急 / 逾期 |
| 深棕 | `#2C2420` | 侧边栏、标题 |

字体：衬线体用于金额和品牌标题，无衬线体用于正文和 UI 元素。
