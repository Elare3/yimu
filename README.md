# 一木 YiMu

> 一人成木，独木成林 — OPC（一人公司）创业者的 AI 经营伙伴

一木是一款面向独立创业者 / 自由职业者的全栈经营管理平台，集成客户管理、项目跟踪、报价生成、收款催付、财务记账和 AI 经营洞察于一体，帮助一个人也能像团队一样高效运转。

## 技术栈

| 层级 | 选型 |
|------|------|
| 框架 | Next.js 14 (App Router) + TypeScript |
| 样式 | Tailwind CSS（奶油拿铁设计系统） |
| 数据库 | MongoDB + Prisma ORM |
| 认证 | NextAuth.js（手机号 + 微信扫码） |
| AI 引擎 | 通义千问 Qwen-Max / DeepSeek V3（DashScope API） |
| 数据请求 | SWR（客户端缓存 + 重验证） |
| 状态管理 | Zustand |
| 表单 | React Hook Form + Zod |
| 图表 | Recharts |
| 拖拽 | @dnd-kit（看板视图） |
| PDF | @react-pdf/renderer（报价单导出） |

## 核心功能

### 客户管理 `/clients`
- 客户档案 CRUD、批量导入
- 点击客户卡片查看详情页（概览 / 项目 / 报价 / 财务四个标签页）
- 自动统计项目数、累计收入

### 项目管理 `/projects`
- 项目生命周期：已报价 → 进行中 → 验收中 → 已完成
- 三列看板拖拽视图（@dnd-kit），拖拽即变更状态
- 已完成项目独立弹窗管理（展示最近 5 个，支持查看详情、重新激活、删除）
- 项目删除支持选择是否同时删除关联报价单
- 状态机驱动的自动副作用（创建收款节点、触发尾款等）

### 智能报价 `/quotes`
- AI 一键生成报价单（描述需求 → 自动拆分报价项 + 定价参考）
- 规则引擎校验（单价区间、折扣上限、税务合规）
- PDF 导出、报价单复制
- 报价接受后自动创建项目 + 收款计划

### 收款管理 `/payments`
- 基于项目金额自动拆分收款节点（定金 / 中期 / 尾款）
- 逾期自动标记 + 催款升级（友善提醒 → 正式催款 → 严肃警告）
- AI 生成催款话术（合规审查）
- 收款后自动记账 + 更新项目进度

### 财务记账 `/finance`
- 收支记录 CRUD，手动记账支持关联项目
- AI 语音 / 文字快速记账（"昨天打车 35 元" → 自动解析）
- 三种视图：明细、按项目、按周（点击展开查看交易明细）
- 月度汇总（总收入、本月收入、本月支出、本月利润、记录笔数）

### 经营洞察 `/dashboard`
- 六维健康评分（收入、成本、现金流、客户多元、项目管线、税务效率）
- 规则引擎即时洞察（~200ms，页面加载自动显示）
- AI 深度分析（点击触发，失败自动降级为规则结果）
- 税务预警（增值税 / 个税阈值检测）
- 数据快照（本月 vs 上月环比）

## 三层护城河架构

```
API Route → 规则引擎(rules.ts) → 事件总线(events.ts) → AI调度器(ai-orchestrator.ts)
```

| 层 | 文件 | 职责 |
|----|------|------|
| 规则引擎 | `src/lib/rules.ts` | OPC 行业规则：收款拆分、报价校验、项目状态机、税务规则、健康评分、催款升级 |
| 事件总线 | `src/lib/events.ts` | 跨模块联动：报价接受→创建项目、收款到账→自动记账、逾期→催款升级 |
| AI 调度器 | `src/lib/ai-orchestrator.ts` | 规则先行 → AI 增强 → 结果校验，AI 失败自动降级 |

所有 API 路由通过这三层调用，不直接调用 AI，确保：
- 无 AI 时系统仍可运行（规则兜底）
- 规则校验在 AI 之前和之后都执行
- 跨模块副作用通过事件总线解耦

## 项目结构

```
src/
├── app/
│   ├── (auth)/              # 认证页面（登录）
│   ├── (dashboard)/         # 业务页面
│   │   ├── dashboard/       # 仪表盘
│   │   ├── clients/         # 客户管理 + 客户详情
│   │   ├── projects/        # 项目看板 + 项目详情
│   │   ├── quotes/          # 报价管理
│   │   ├── payments/        # 收款管理
│   │   ├── finance/         # 财务记账 + AI 记账
│   │   └── settings/        # 个人设置（头像、退出登录）
│   └── api/                 # 49 个 API 路由
│       ├── auth/            # NextAuth + 微信回调
│       ├── clients/         # 客户 CRUD + 批量导入
│       ├── projects/        # 项目 CRUD + 看板 + 状态机
│       ├── quotes/          # 报价 CRUD + AI 生成 + PDF
│       ├── payments/        # 收款 + 标记已付 + 催款
│       ├── transactions/    # 记账 + AI 解析 + 按项目/按周汇总
│       ├── dashboard/       # 汇总 + AI 洞察 + 预警
│       └── ...
├── components/
│   ├── business/            # 业务组件（看板、项目卡片、表单）
│   ├── layout/              # 布局（Header、Sidebar、MobileNav）
│   ├── providers/           # Context（Session、SWR）
│   └── ui/                  # 基础组件（Button、Input、Modal、Toast、Badge）
├── lib/
│   ├── rules.ts             # 规则引擎
│   ├── events.ts            # 事件总线
│   ├── ai-orchestrator.ts   # AI 调度器
│   ├── prompts.ts           # AI 提示词模板
│   ├── ai.ts                # DashScope API 封装
│   ├── security.ts          # 安全工具（加密、脱敏）
│   ├── auth.ts              # NextAuth 配置
│   ├── prisma.ts            # Prisma 客户端
│   ├── session.ts           # 会话工具
│   ├── swr-config.ts        # SWR 全局配置
│   └── utils.ts             # 通用工具（状态机、格式化、API 响应）
├── stores/                  # Zustand 状态（Toast）
├── hooks/                   # 自定义 Hooks（useProjects、useClients、useTransactions）
├── types/                   # TypeScript 类型定义
└── middleware.ts            # 路由鉴权中间件
```

## 数据模型

12 个模型（MongoDB + Prisma）：

| 模型 | 说明 |
|------|------|
| User | 用户（手机号 / 微信登录、业务类型、个性化设置） |
| Client | 客户（联系方式、信用等级、项目数、累计收入） |
| Project | 项目（状态机、金额、收款进度、截止日） |
| Quote | 报价单（报价项、折扣、AI 生成标记） |
| Transaction | 收支记录（分类、标签、关联项目 / 客户） |
| PaymentNode | 收款节点（定金 / 中期 / 尾款、催款记录） |
| PricingFeedback | 定价反馈 |
| BusinessMemory | 经营记忆 |
| KnowledgeDoc | 知识文档 |
| AITemplateCache | AI 模板缓存 |
| AICallLog | AI 调用日志 |
| ActivityLog | 操作日志 |

## 快速开始

### 环境要求

- Node.js 18+
- MongoDB 6.0+

### 安装

```bash
# 克隆项目
git clone <repo-url> && cd yimu

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env.local
# 编辑 .env.local 填入你的配置

# 生成 Prisma Client
npx prisma generate

# 启动开发服务器（端口 3001）
npm run dev
```

### 环境变量

```env
# MongoDB
DATABASE_URL=mongodb://localhost:27017/yimu_db

# NextAuth
NEXTAUTH_SECRET=your-random-secret-key
NEXTAUTH_URL=http://localhost:3001

# AI 引擎（阿里云百炼）
DASHSCOPE_API_KEY=your-dashscope-api-key
PRIMARY_MODEL=qwen-max
LIGHT_MODEL=deepseek-chat

# 备用：DeepSeek 直连
DEEPSEEK_API_KEY=your-deepseek-api-key

# 微信开放平台（扫码登录）
WECHAT_APP_ID=wx_your_app_id
WECHAT_APP_SECRET=your_app_secret

# 敏感字段加密 (AES-256-GCM)
ENCRYPTION_KEY=your-64-char-hex-key
```

> 开发模式下，短信验证码固定为 `123456`，无需真实短信服务。

### 构建部署

```bash
npm run build
npm start
```

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

字体：衬线体用于金额和数字展示，无衬线体用于正文和 UI 元素。
