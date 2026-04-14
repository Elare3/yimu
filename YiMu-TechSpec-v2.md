# 一木 YiMu — 技术规格文档 v2.0

> **产品定位**：OPC（一人公司）创业者的AI经营伙伴
> **文档版本**：v2.0（架构重设计版）
> **文档日期**：2026-03-19
> **文档用途**：交付给 Claude Code 执行开发
> **重要变更**：前后端合一为 Next.js 全栈，取消 FastAPI，取消 Docker，本地直跑

---

## 一、架构总览

### 1.1 核心设计原则

- **一个项目**：整个应用只有一个 Next.js 项目，前后端代码在同一仓库
- **一个命令**：`npm run dev` 启动，前后端同时运行
- **零配置数据库**：MongoDB 已装好在本地，直接连
- **AI 即 API 调用**：所有 AI 能力通过 HTTP 调用外部模型 API，不需要本地 Python 环境

### 1.2 技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 框架 | Next.js 14 (App Router) + TypeScript | 全栈框架，前后端合一 |
| 样式 | Tailwind CSS | 原子化CSS，快速开发 |
| 数据库 | MongoDB 8.0（本地） + Prisma | ORM，强类型推导+自动补全 |
| 数据请求 | SWR | 客户端数据获取，自带缓存/重验证/loading状态 |
| AI引擎 | 通义千问 Qwen-Max（主力）/ DeepSeek V3（轻量） | 通过阿里云百炼 DashScope API 调用 |
| 认证 | NextAuth.js + 手机号验证码 | 内置认证方案，开箱即用 |
| 文件存储 | 本地文件系统（MVP阶段） | 后续可迁移至OSS |
| PDF生成 | @react-pdf/renderer | 报价单PDF导出 |
| 拖拽 | @dnd-kit | 看板拖拽交互 |
| 图表 | Recharts | 仪表盘数据可视化 |
| 状态管理 | Zustand | 轻量级状态管理 |
| 表单 | React Hook Form + Zod | 表单校验 |

### 1.3 品牌设计 — 奶油拿铁风格

- **名称**：一木 YiMu
- **Slogan**：一人成木，独木成林
- **设计理念**：温暖亲切，像在咖啡馆办公。使用暖色系传递信任感和人情味，适合OPC创业者群体。

**色彩系统：**

| 变量名 | 色值 | 用途 |
|--------|------|------|
| bg | #FAF6F0 | 页面背景（奶油白） |
| bgWarm | #F5EFE6 | 次级背景（暖米色） |
| surface | #FFFFFF | 卡片/面板背景 |
| surfaceAlt | #FBF8F4 | 卡片悬停背景 |
| border | #E8E0D4 | 主边框色 |
| borderLight | #F0EAE0 | 浅边框色 |
| sidebar | #2C2420 | 侧边栏背景（深棕） |
| sidebarHover | #3D342E | 侧边栏悬停 |
| primary | #C47D3F | 主色（焦糖棕） |
| primaryLight | #D4956A | 主色浅版 |
| primaryBg | #FDF5ED | 主色背景 |
| green | #5B8C5A | 辅色（橄榄绿，收入/成功） |
| greenLight | #E8F3E8 | 绿色背景 |
| gold | #D4940E | 强调色（琥珀金，待收款/警告） |
| goldBg | #FFFCF0 | 金色背景 |
| red | #C0534F | 危险色（逾期/错误） |
| redLight | #FDF0EF | 红色背景 |
| text | #2C2420 | 主文字色（深棕黑） |
| textSec | #7A6E62 | 次要文字 |
| textMut | #B5AA9E | 弱文字/占位符 |

**项目状态色：**

| 状态 | 圆点色 | 背景色 | 标签色 |
|------|--------|--------|--------|
| 线索 lead | #C4A882 | #F8F0E4 | #B89B78 |
| 已报价 quoted | #C47D3F | #FDF5ED | #C47D3F |
| 进行中 in_progress | #5B8C5A | #EDF5ED | #5B8C5A |
| 验收中 review | #D4940E | #FFF8E8 | #B87F0A |
| 已完成 completed | #8BA88B | #F0F5F0 | #6B8C6B |

**字体系统：**

```
标题/数字字体（衬线，增加质感）：
  font-family: 'Georgia', 'Noto Serif SC', 'PingFang SC', serif;

正文/UI字体（无衬线，清晰易读）：
  font-family: 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif;

使用规则：
  - 页面标题、数据卡片数字、金额 → 衬线字体
  - 按钮、标签、表单、正文 → 无衬线字体
  - 不使用任何外部字体CDN，全部系统字体
```

**Logo设计：**

```
- 侧边栏Logo：36x36px 圆角方块，渐变色 (primary → gold)
- 内容：白色"木"字，衬线字体，16px，font-weight: 800
- Logo旁文字：「一木」衬线字体17px + "YIMU" 字母间距0.2em 9px
```

---

## 二、项目目录结构

```
D:\YiMu\
├── start.bat                        # 一键启动脚本
├── package.json
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── .env.local                       # 环境变量（不提交git）
├── .env.example                     # 环境变量模板
│
├── src\
│   ├── app\                         # Next.js App Router
│   │   ├── layout.tsx               # 根布局
│   │   ├── page.tsx                 # 落地页（未登录）
│   │   ├── globals.css              # 全局样式
│   │   │
│   │   ├── (auth)\                  # 认证相关页面（无侧边栏布局）
│   │   │   ├── login\page.tsx
│   │   │   └── layout.tsx
│   │   │
│   │   ├── (dashboard)\             # 主应用页面（带侧边栏布局）
│   │   │   ├── layout.tsx           # 应用布局（侧边栏+顶栏）
│   │   │   ├── dashboard\page.tsx   # 仪表盘首页
│   │   │   ├── clients\
│   │   │   │   ├── page.tsx         # 客户列表
│   │   │   │   ├── new\page.tsx     # 新建客户
│   │   │   │   └── [id]\page.tsx    # 客户详情
│   │   │   ├── projects\
│   │   │   │   ├── page.tsx         # 项目看板
│   │   │   │   ├── new\page.tsx     # 新建项目
│   │   │   │   └── [id]\page.tsx    # 项目详情
│   │   │   ├── quotes\
│   │   │   │   ├── page.tsx         # 报价单列表
│   │   │   │   ├── new\page.tsx     # 新建报价单（手动）
│   │   │   │   ├── ai\page.tsx      # AI生成报价
│   │   │   │   └── [id]\page.tsx    # 报价单详情
│   │   │   ├── finance\
│   │   │   │   ├── page.tsx         # 记账首页
│   │   │   │   └── ai\page.tsx      # AI智能记账
│   │   │   ├── payments\
│   │   │   │   └── page.tsx         # 收款管理
│   │   │   └── settings\
│   │   │       └── page.tsx         # 个人设置
│   │   │
│   │   └── api\                     # API Routes（后端逻辑）
│   │       ├── auth\
│   │       │   └── [...nextauth]\route.ts  # NextAuth认证
│   │       ├── clients\
│   │       │   ├── route.ts         # GET列表 / POST创建
│   │       │   └── [id]\route.ts    # GET详情 / PUT更新 / DELETE删除
│   │       ├── projects\
│   │       │   ├── route.ts
│   │       │   ├── [id]\route.ts
│   │       │   ├── [id]\status\route.ts  # 状态变更
│   │       │   └── kanban\route.ts  # 看板数据
│   │       ├── quotes\
│   │       │   ├── route.ts
│   │       │   ├── [id]\route.ts
│   │       │   ├── ai-generate\route.ts  # AI生成报价
│   │       │   └── [id]\pdf\route.ts     # PDF导出
│   │       ├── transactions\
│   │       │   ├── route.ts
│   │       │   ├── [id]\route.ts
│   │       │   ├── ai-parse\route.ts     # AI解析记账
│   │       │   └── summary\route.ts      # 收支汇总
│   │       ├── payments\
│   │       │   ├── route.ts
│   │       │   ├── [id]\route.ts
│   │       │   ├── [id]\paid\route.ts    # 标记已收款
│   │       │   └── [id]\remind\route.ts  # AI催款
│   │       └── dashboard\
│   │           └── route.ts         # 仪表盘聚合数据
│   │
│   ├── lib\                         # 工具库
│   │   ├── prisma.ts                # Prisma Client 单例
│   │   ├── ai.ts                    # AI API 调用封装
│   │   ├── prompts.ts               # AI Prompt 模板
│   │   ├── auth.ts                  # NextAuth 配置
│   │   └── utils.ts                 # 工具函数
│   │
│   ├── prisma\                      # Prisma 配置
│   │   └── schema.prisma            # 数据模型定义（单文件管理所有模型）
│   │
│   ├── components\                  # React 组件
│   │   ├── ui\                      # 基础UI组件
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Select.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Toast.tsx
│   │   │   └── Loading.tsx
│   │   ├── layout\                  # 布局组件
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   └── MobileNav.tsx
│   │   └── business\                # 业务组件
│   │       ├── KanbanBoard.tsx
│   │       ├── ProjectCard.tsx
│   │       ├── ClientCard.tsx
│   │       ├── QuoteForm.tsx
│   │       ├── TransactionForm.tsx
│   │       ├── PaymentCard.tsx
│   │       └── DashboardWidgets.tsx
│   │
│   ├── hooks\                       # 自定义Hooks（基于SWR）
│   │   ├── useClients.ts
│   │   ├── useProjects.ts
│   │   ├── useQuotes.ts
│   │   └── useTransactions.ts
│   │
│   ├── stores\                      # Zustand状态管理
│   │   └── appStore.ts
│   │
│   └── types\                       # TypeScript类型定义
│       └── index.ts
│
├── public\
│   ├── logo.svg
│   └── icons\
│
└── docs\
    ├── TECH-SPEC.md                 # 本文档
    └── CHANGELOG.md
```

---

## 三、环境变量

### .env.example

```bash
# ===== MongoDB =====
MONGODB_URI=mongodb://localhost:27017/yimu_db

# ===== NextAuth =====
NEXTAUTH_SECRET=your-random-secret-key-here
NEXTAUTH_URL=http://localhost:3000

# ===== AI引擎（阿里云百炼 DashScope）=====
DASHSCOPE_API_KEY=your-dashscope-api-key
PRIMARY_MODEL=qwen-max
LIGHT_MODEL=deepseek-chat

# ===== 备用：DeepSeek直连 =====
DEEPSEEK_API_KEY=your-deepseek-api-key

# ===== 文件上传 =====
UPLOAD_DIR=./uploads
```

---

## 四、数据模型（Prisma Schema）

所有模型定义在一个文件中：`prisma/schema.prisma`

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mongodb"
  url      = env("MONGODB_URI")
}

// ── 用户 ──
model User {
  id            String    @id @default(auto()) @map("_id") @db.ObjectId
  phone         String    @unique
  name          String    @default("")
  companyName   String    @default("")
  avatarUrl     String    @default("")
  businessType  String    @default("other")   // design|development|consulting|content|other
  plan          String    @default("free")     // free|pro|premium
  planExpiresAt DateTime?
  settings      UserSettings?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  clients       Client[]
  projects      Project[]
  quotes        Quote[]
  transactions  Transaction[]
  paymentNodes  PaymentNode[]
}

type UserSettings {
  currency             String   @default("CNY")
  taxRate              Float    @default(0)
  paymentReminderDays  Int[]    @default([3, 1, 0])
  defaultPaymentTerms  String   @default("")
}

// ── 客户 ──
model Client {
  id            String    @id @default(auto()) @map("_id") @db.ObjectId
  userId        String    @db.ObjectId
  name          String
  contactPerson String    @default("")
  phone         String    @default("")
  email         String    @default("")
  wechat        String    @default("")
  address       String    @default("")
  tags          String[]  @default([])
  notes         String    @default("")
  source        String    @default("")
  totalRevenue  Float     @default(0)
  projectCount  Int       @default(0)
  status        String    @default("active")   // active|archived
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  user          User      @relation(fields: [userId], references: [id])
  projects      Project[]
  quotes        Quote[]
  transactions  Transaction[]
  paymentNodes  PaymentNode[]

  @@index([userId, status])
  @@index([userId])
}

// ── 项目 ──
model Project {
  id            String    @id @default(auto()) @map("_id") @db.ObjectId
  userId        String    @db.ObjectId
  clientId      String    @db.ObjectId
  name          String
  description   String    @default("")
  status        String    @default("lead")     // lead|quoted|in_progress|review|completed|cancelled
  priority      String    @default("medium")   // low|medium|high
  category      String    @default("")
  totalAmount   Float     @default(0)
  paidAmount    Float     @default(0)
  startDate     DateTime?
  deadline      DateTime?
  completedAt   DateTime?
  deliverables  Deliverable[]
  revisionCount Int       @default(0)
  revisionLimit Int?
  tags          String[]  @default([])
  notes         String    @default("")
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  user          User      @relation(fields: [userId], references: [id])
  client        Client    @relation(fields: [clientId], references: [id])
  quotes        Quote[]
  transactions  Transaction[]
  paymentNodes  PaymentNode[]

  @@index([userId, status])
  @@index([userId, clientId])
  @@index([userId, deadline])
}

type Deliverable {
  name        String
  status      String    @default("pending")   // pending|done
  completedAt DateTime?
}

// ── 报价单 ──
model Quote {
  id            String    @id @default(auto()) @map("_id") @db.ObjectId
  userId        String    @db.ObjectId
  projectId     String?   @db.ObjectId
  clientId      String    @db.ObjectId
  quoteNumber   String
  title         String
  items         QuoteItem[]
  subtotal      Float     @default(0)
  taxRate       Float     @default(0)
  taxAmount     Float     @default(0)
  discount      Float     @default(0)
  total         Float     @default(0)
  paymentTerms  String    @default("")
  validUntil    DateTime?
  notes         String    @default("")
  status        String    @default("draft")    // draft|sent|accepted|rejected|expired
  aiGenerated   Boolean   @default(false)
  aiPrompt      String    @default("")
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  user          User      @relation(fields: [userId], references: [id])
  project       Project?  @relation(fields: [projectId], references: [id])
  client        Client    @relation(fields: [clientId], references: [id])

  @@unique([userId, quoteNumber])
  @@index([userId, status])
}

type QuoteItem {
  name        String
  description String    @default("")
  quantity    Float     @default(1)
  unit        String    @default("项")
  unitPrice   Float
  amount      Float
}

// ── 收支记录 ──
model Transaction {
  id            String    @id @default(auto()) @map("_id") @db.ObjectId
  userId        String    @db.ObjectId
  type          String                          // income|expense
  amount        Float
  category      String
  subcategory   String    @default("")
  description   String    @default("")
  projectId     String?   @db.ObjectId
  clientId      String?   @db.ObjectId
  date          DateTime
  paymentMethod String    @default("other")    // wechat|alipay|bank_transfer|cash|other
  receiptUrl    String?
  tags          String[]  @default([])
  isBusiness    Boolean   @default(true)
  aiClassified  Boolean   @default(false)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  user          User      @relation(fields: [userId], references: [id])
  project       Project?  @relation(fields: [projectId], references: [id])
  client        Client?   @relation(fields: [clientId], references: [id])

  @@index([userId, date])
  @@index([userId, type, category])
  @@index([userId, projectId])
}

// ── 收款节点 ──
model PaymentNode {
  id               String    @id @default(auto()) @map("_id") @db.ObjectId
  userId           String    @db.ObjectId
  projectId        String    @db.ObjectId
  clientId         String    @db.ObjectId
  name             String
  amount           Float
  dueDate          DateTime
  status           String    @default("pending")  // pending|reminded|paid|overdue
  paidAt           DateTime?
  paidAmount       Float     @default(0)
  reminderCount    Int       @default(0)
  lastReminderAt   DateTime?
  reminderMessages ReminderMessage[]
  notes            String    @default("")
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  user             User      @relation(fields: [userId], references: [id])
  project          Project   @relation(fields: [projectId], references: [id])
  client           Client    @relation(fields: [clientId], references: [id])

  @@index([userId, status])
  @@index([userId, dueDate])
  @@index([projectId])
}

type ReminderMessage {
  sentAt      DateTime
  channel     String       // wechat|sms|email
  content     String
  aiGenerated Boolean      @default(true)
}
```

**项目状态流转规则（在API层校验）：**

```typescript
// src/lib/utils.ts
export const STATUS_TRANSITIONS: Record<string, string[]> = {
  lead: ['quoted', 'cancelled'],
  quoted: ['in_progress', 'cancelled'],
  in_progress: ['review', 'cancelled'],
  review: ['completed', 'in_progress', 'cancelled'],
  completed: [],
  cancelled: ['lead'],
};
```

---

## 五、Prisma Client + SWR

### 5.1 Prisma Client 单例

```typescript
// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

### 5.2 API Route 中使用 Prisma（示例）

```typescript
// src/app/api/clients/route.ts
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

// GET /api/clients - 客户列表
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') || '';
  const status = searchParams.get('status') || 'active';
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = parseInt(searchParams.get('pageSize') || '20');

  const where = {
    userId: 'current-user-id', // 从session获取
    status,
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' as const } },
        { contactPerson: { contains: search, mode: 'insensitive' as const } },
      ],
    }),
  };

  const [items, total] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.client.count({ where }),
  ]);

  return NextResponse.json({ success: true, data: { items, total, page, pageSize } });
}
```

### 5.3 前端使用 SWR 获取数据（示例）

```typescript
// src/hooks/useClients.ts
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export function useClients(search?: string, status?: string) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (status) params.set('status', status);

  const { data, error, isLoading, mutate } = useSWR(
    `/api/clients?${params.toString()}`,
    fetcher
  );

  return {
    clients: data?.data?.items || [],
    total: data?.data?.total || 0,
    isLoading,
    isError: error,
    mutate, // 调用 mutate() 可手动触发重新获取
  };
}

// 在组件中使用：
// const { clients, isLoading, mutate } = useClients(searchQuery);
// 创建客户后调用 mutate() 自动刷新列表
```

---

## 六、AI 服务封装

```typescript
// src/lib/ai.ts

// 任务→模型映射
const TASK_MODEL_MAP: Record<string, string> = {
  quote_generate: 'qwen-max',       // 报价生成
  transaction_parse: 'qwen-max',    // 记账解析
  reminder_generate: 'qwen-max',    // 催款文案
  transaction_classify: 'deepseek-chat',  // 简单分类（省钱）
};

// 统一AI调用接口
export async function callAI(task: string, prompt: string, systemPrompt?: string) {
  const model = TASK_MODEL_MAP[task] || 'qwen-max';

  // 通过阿里云百炼 DashScope API 调用
  const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    })
  });

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}
```

---

## 七、API Routes 设计

### 7.1 通用响应格式

```typescript
// 成功
{ success: true, data: { ... } }

// 列表
{ success: true, data: { items: [...], total: 100, page: 1, pageSize: 20 } }

// 错误
{ success: false, error: "错误信息" }
```

### 7.2 认证

MVP阶段使用简化认证：手机号 + 固定验证码（123456）登录，自动注册。

```typescript
// src/app/api/auth/[...nextauth]/route.ts
// 使用 NextAuth.js Credentials Provider
// 开发环境：任意手机号 + 123456 即可登录
// 生产环境：对接阿里云SMS发送真实验证码
```

### 7.3 完整接口列表

#### 客户 `/api/clients`

```
GET    /api/clients              → 客户列表（搜索、标签筛选、分页）
POST   /api/clients              → 创建客户
GET    /api/clients/[id]         → 客户详情
PUT    /api/clients/[id]         → 更新客户
DELETE /api/clients/[id]         → 删除客户（软删除）
```

#### 项目 `/api/projects`

```
GET    /api/projects             → 项目列表
POST   /api/projects             → 创建项目
GET    /api/projects/[id]        → 项目详情
PUT    /api/projects/[id]        → 更新项目
PUT    /api/projects/[id]/status → 更新状态（状态机校验）
DELETE /api/projects/[id]        → 删除项目
GET    /api/projects/kanban      → 看板视图数据（按status分组）
```

#### 报价单 `/api/quotes`

```
GET    /api/quotes               → 报价单列表
POST   /api/quotes               → 手动创建报价单
POST   /api/quotes/ai-generate   → AI生成报价单
GET    /api/quotes/[id]          → 报价单详情
PUT    /api/quotes/[id]          → 更新报价单
GET    /api/quotes/[id]/pdf      → 导出PDF
```

#### 记账 `/api/transactions`

```
GET    /api/transactions         → 收支列表
POST   /api/transactions         → 手动创建
POST   /api/transactions/ai-parse → AI解析记账
GET    /api/transactions/[id]    → 详情
PUT    /api/transactions/[id]    → 更新
DELETE /api/transactions/[id]    → 删除
GET    /api/transactions/summary → 收支汇总
```

#### 收款 `/api/payments`

```
GET    /api/payments             → 收款节点列表
POST   /api/payments             → 创建收款节点
PUT    /api/payments/[id]        → 更新
PUT    /api/payments/[id]/paid   → 标记已收款
POST   /api/payments/[id]/remind → AI生成催款文案
```

#### 仪表盘 `/api/dashboard`

```
GET    /api/dashboard            → 聚合数据
```

---

## 八、AI Prompt 模板

```typescript
// src/lib/prompts.ts

// AI报价生成
export const QUOTE_GENERATE_PROMPT = (requirement: string, category: string, budgetHint: string, businessType: string) => `
你是一位专业的商务报价助手。请根据以下信息生成一份详细的报价单。

客户需求：${requirement}
服务类别：${category}
预算参考：${budgetHint}
用户业务类型：${businessType}

请以JSON格式返回：
{
  "title": "报价标题",
  "items": [
    {
      "name": "服务项名称",
      "description": "详细描述",
      "quantity": 1,
      "unit": "项|天|小时|页",
      "unitPrice": 金额数字
    }
  ],
  "paymentTerms": "建议的付款方式",
  "notes": "补充说明",
  "estimatedDays": 预估工期天数
}

要求：
1. 报价合理，符合中国市场行情
2. 服务项拆分细致
3. 付款条款要保护服务提供者利益
`;

// AI记账解析
export const TRANSACTION_PARSE_PROMPT = (input: string) => `
你是一位财务记账助手。请解析以下内容并提取收支信息。

用户输入：${input}

请以JSON格式返回：
{
  "type": "income 或 expense",
  "amount": 金额数字（正数）,
  "category": "分类",
  "subcategory": "子分类",
  "description": "简短描述",
  "date": "YYYY-MM-DD",
  "paymentMethod": "wechat|alipay|bank_transfer|cash|other",
  "isBusiness": true或false,
  "confidence": 0.0-1.0
}
`;

// AI催款文案
export const REMINDER_PROMPT = (projectName: string, clientName: string, contactPerson: string, amount: number, dueDate: string, overdueDays: number, reminderCount: number, userName: string) => `
你是一位商务沟通助手。请生成一段催款消息。

项目：${projectName}
客户：${clientName}
联系人：${contactPerson}
金额：¥${amount}
到期日：${dueDate}
逾期天数：${overdueDays}
已催款次数：${reminderCount}
发送者：${userName}

语气要求：${reminderCount === 0 ? '友善提醒' : reminderCount === 1 ? '正式请求' : '严肃催促'}

返回JSON：
{ "content": "催款消息内容" }
`;
```

---

## 九、页面设计规范

### 9.1 布局结构

```
PC端（≥768px）：
┌──────────────────────────────────────────────┐
│  Header: 标题(衬线字体) + 日期问候 | 通知🔔 | ＋新建 │
├─────────┬────────────────────────────────────┤
│ 深棕侧栏  │  主内容区域（奶油白背景#FAF6F0）      │
│ #2C2420  │                                    │
│ (w-[220])│                                    │
│          │                                    │
│ ◉ 概览   │  Header使用渐变淡出效果：             │
│ ◎ 客户   │  background: linear-gradient(       │
│ ▦ 项目   │    180deg, #FAF6F0 60%, transparent) │
│ ◈ 报价   │                                    │
│ ◇ 记账   │  卡片统一圆角: rounded-[20px]         │
│ ◆ 收款   │  卡片边框: 1.5px solid #E8E0D4       │
│          │                                    │
│ [用户卡片]│                                    │
├─────────┴────────────────────────────────────┤
│ 侧边栏使用圆角右侧: rounded-r-[24px]             │
└──────────────────────────────────────────────┘

移动端（<768px）：
┌────────────────────┐
│  简化Header          │
├────────────────────┤
│                    │
│  主内容区域          │
│                    │
├────────────────────┤
│ 概览|项目|➕|记账|我的 │  ← 底部Tab（奶油白底+焦糖棕选中态）
└────────────────────┘
```

**侧边栏设计细节：**
- 背景: #2C2420（深棕），圆角右侧 24px
- Logo: 渐变方块(primary→gold) + 白色衬线"木"字
- 导航项选中态: 渐变背景(primary→primaryLight) + 焦糖棕阴影
- 导航项悬停: #3D342E 背景色
- 底部用户卡片: 半透明背景 + 用量进度条(primary→gold渐变)

**Header设计细节：**
- 标题使用衬线字体(Georgia)，24px，font-weight: 800
- 副标题: 日期 + 温暖问候语（"祝你有一杯好咖啡 ☕"）
- ＋新建按钮: 渐变背景(primary→primaryLight)，悬停上浮+阴影加深

### 9.2 项目看板设计

```
项目卡片：
┌──────────────────────────┐
│ 品牌VI升级           🔴   │  ← 名称 + 紧急红点(带redLight光环)
│ 极氪科技                  │  ← 客户名(textMut色)
│                          │
│ ¥2.8万                   │  ← 金额(衬线字体，20px粗体)
│                          │
│ 收款  ████████░░░  40%   │  ← 进度条(primary渐变填充)
│ ⏤ 04/10   初稿已交付      │  ← 截止日 + 备注(斜体)
└──────────────────────────┘

卡片交互：
- 悬停: translateY(-2px) + 边框变为 primary+30% 透明度 + 阴影加深
- 拖拽中: cursor grab → grabbing
- 金额格式: ≥1万显示"X.X万"，<1万显示千分位

看板列背景色：
- 线索:   #F8F0E4（暖米色）
- 已报价: #FDF5ED（淡橙色）
- 进行中: #EDF5ED（淡绿色）
- 验收中: #FFF8E8（淡金色）
- 已完成: #F0F5F0（浅灰绿）

列头部: 状态圆点(带同色光环) + 粗体标签 + 计数徽章
空列提示: "+" 图标 + "拖拽项目到这里"
```

### 9.3 仪表盘特殊组件

**AI洞察卡片：**
```
背景: #FDF5ED (primaryBg)
边框: 1px dashed primary色30%透明度
标题: "🤖 AI 洞察" primary色加粗
内容: textSec色，行高1.7
```

**一键催款区域：**
```
背景: #FFFCF0 (goldBg)
边框: 1.5px solid gold色20%透明度
待收总额: 衬线字体，24px，gold色
按钮: 渐变背景(gold→primary)，白字
```

### 9.4 Tailwind 组件规范

**在 tailwind.config.ts 中扩展主题色：**

```typescript
// tailwind.config.ts
const config = {
  theme: {
    extend: {
      colors: {
        cream: {
          50: '#FAF6F0',    // bg
          100: '#F5EFE6',   // bgWarm
          200: '#F0EAE0',   // borderLight
          300: '#E8E0D4',   // border
        },
        brown: {
          800: '#2C2420',   // sidebar / text
          700: '#3D342E',   // sidebarHover
          500: '#7A6E62',   // textSec
          300: '#B5AA9E',   // textMut
        },
        caramel: {
          DEFAULT: '#C47D3F', // primary
          light: '#D4956A',
          bg: '#FDF5ED',
        },
        olive: {
          DEFAULT: '#5B8C5A', // green
          light: '#E8F3E8',
        },
        amber: {
          DEFAULT: '#D4940E', // gold
          bg: '#FFFCF0',
        },
      },
      fontFamily: {
        serif: ['Georgia', 'Noto Serif SC', 'PingFang SC', 'serif'],
        sans: ['PingFang SC', 'Microsoft YaHei', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'card': '20px',
        'button': '14px',
        'tag': '20px',
        'sidebar': '24px',
      },
    },
  },
};
```

**组件Tailwind类：**

```
主按钮:
  bg-gradient-to-br from-caramel to-caramel-light text-white rounded-button
  px-6 py-3 font-semibold text-sm shadow-[0_4px_16px_rgba(196,125,63,0.3)]
  hover:translate-y-[-2px] hover:shadow-[0_8px_24px_rgba(196,125,63,0.4)]
  transition-all duration-200

次按钮:
  bg-white border-[1.5px] border-cream-300 text-brown-800 rounded-button
  px-6 py-3 font-medium text-sm
  hover:border-caramel hover:text-caramel transition-all duration-200

危险按钮:
  bg-[#C0534F] text-white rounded-button px-6 py-3

卡片:
  bg-white rounded-card border-[1.5px] border-cream-300 p-6
  hover:translate-y-[-3px] hover:shadow-[0_12px_32px_rgba(44,36,32,0.06)]
  hover:border-caramel/25 transition-all duration-250

输入框:
  w-full px-4 py-3 rounded-[14px] border-[1.5px] border-cream-300
  focus:border-caramel focus:ring-2 focus:ring-caramel/15
  placeholder:text-brown-300 font-sans text-sm

状态标签:
  线索:    bg-[#F8F0E4] text-[#B89B78] rounded-tag px-3 py-1 text-xs font-semibold
  已报价:  bg-[#FDF5ED] text-caramel    rounded-tag px-3 py-1 text-xs font-semibold
  进行中:  bg-[#EDF5ED] text-olive      rounded-tag px-3 py-1 text-xs font-semibold
  验收中:  bg-[#FFF8E8] text-[#B87F0A] rounded-tag px-3 py-1 text-xs font-semibold
  已完成:  bg-[#F0F5F0] text-[#6B8C6B] rounded-tag px-3 py-1 text-xs font-semibold
  已取消:  bg-cream-100 text-brown-300  rounded-tag px-3 py-1 text-xs font-semibold

进度条容器:
  h-1 bg-cream-100 rounded-full overflow-hidden

进度条填充:
  h-full rounded-full bg-gradient-to-r from-caramel to-caramel-light
  transition-[width] duration-800 ease-[cubic-bezier(0.16,1,0.3,1)]

侧边栏导航项-选中:
  bg-gradient-to-br from-caramel to-caramel-light text-white
  rounded-[14px] px-4 py-3 font-semibold shadow-[0_4px_16px_rgba(196,125,63,0.25)]

侧边栏导航项-默认:
  text-[#9A8E82] rounded-[14px] px-4 py-3
  hover:bg-[#3D342E] hover:text-[#E8DDD0] transition-all duration-200
```

**动画规范：**

```css
/* 页面切换淡入上滑 */
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

/* 应用到页面容器 */
.page-enter { animation: fadeUp 0.4s ease; }

/* 滚动条美化 */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #E8E0D4; border-radius: 10px; }
::-webkit-scrollbar-thumb:hover { background: #B5AA9E; }
```

### 9.5 登录页设计规范

**布局：左右分栏**

```
┌─────────────────────┬──────────────────────┐
│                     │                      │
│   品牌展示面板        │    登录表单区域        │
│   (45% 宽度)        │    (55% 宽度)         │
│   深棕底 #2C2420     │    奶油白底 #FAF6F0    │
│   圆角右侧 48px      │                      │
│                     │                      │
│   · Logo(渐变方块)   │    · 标题(衬线字体)    │
│   · 品牌标语(衬线)   │    · 手机号输入框      │
│   · 产品介绍文案     │    · 验证码6格输入     │
│   · 功能标签胶囊     │    · 登录按钮(渐变)    │
│   · 底部引语        │    · 微信登录按钮      │
│                     │    · 用户协议链接      │
│                     │                      │
└─────────────────────┴──────────────────────┘
```

**左侧品牌面板：**
- 背景: #2C2420 + 径向渐变光晕(primary 15% + green 10%)
- 圆角: 右侧 48px (border-radius: 0 48px 48px 0)
- Logo: 52x52 渐变方块(primary→gold) + 白色衬线"木"字24px
- 标语: 衬线字体42px "一人成木，独木成林。" 第二行用渐变色(primary→gold)
- 介绍文案: #8A7E72 色 16px 行高1.8
- 功能胶囊: border 1px primary 20%透明 + background primary 6%透明 + primaryLight文字色
- 底部引语: 斜体衬线字体 + 左侧横线装饰
- 装饰: 右下角半透明年轮图案(opacity 0.04) + 散落圆点(primary 30%透明)

**右侧登录表单：**

手机号输入阶段：
- 标题: "欢迎回来" 衬线字体 30px font-weight 800
- 副标题: "输入手机号，开始你的经营之旅" textSec色 15px
- 输入框: 白色背景 + 2px边框 + 左侧"+86"前缀(竖线分隔)
- 输入框焦点态: 边框变primary色 + 外发光 4px primary 12%透明
- 手机号字体: 衬线字体 17px 字间距0.05em
- 按钮: 手机号不足11位→灰色(bgWarm底+textMut字)；满11位→渐变色(primary→primaryLight) + 阴影

验证码输入阶段：
- 标题: "输入验证码"
- 副标题: 显示脱敏手机号(138****8888) primary色加粗
- 6个独立方格: 60px高 白色底 2px边框 圆角14px
- 方格填入数字后: 背景变primaryBg + 边框变primary + 微放大scale(1.02)
- 当前输入位: 边框为primary色
- 底部: 左"← 更换号码"(textMut色) + 右"重新发送"(倒计时灰色/可点primary色)

登录成功状态：
- 居中渐变打勾图标: 88px圆角方块 + 弹性动画scaleIn
- "欢迎回来！" 衬线字体 28px
- 进度条动画: 200px宽 primary→gold渐变 1.5s填满

其他元素：
- 分隔线: 两侧横线 + 中间"其他方式"文字
- 微信登录按钮: 白底 + 边框 + 微信绿色图标，悬停边框变#07C160 + 浅绿底
- 底部: 用户协议+隐私政策链接(primary色)
- 右下角: "一木 v1.0 · Made with ☕"

**登录页动画时序：**
```
0ms     → 左侧品牌面板淡入上滑 (0.8s)
200ms   → 右侧表单区域淡入上滑 (0.8s)
300ms+  → 功能标签胶囊依次出现 (每个间隔100ms)
```

---

## 十、一键启动脚本

### start.bat

```bat
@echo off
chcp 65001 >nul
echo.
echo  ╔═══════════════════════════════╗
echo  ║   一木 YiMu - 启动中...       ║
echo  ║   一人成木，独木成林           ║
echo  ╚═══════════════════════════════╝
echo.

:: 启动 MongoDB
echo [1/2] 启动 MongoDB...
start "MongoDB" cmd /k ""C:\Program Files\MongoDB\Server\8.0\bin\mongod.exe" --dbpath D:\MongoDB\data"
timeout /t 3 /nobreak >nul

:: 启动 Next.js（前后端一体）
echo [2/2] 启动一木应用...
start "YiMu" cmd /k "cd /d D:\YiMu && npm run dev"

echo.
echo  ✅ 启动完成！
echo  🌐 打开浏览器访问: http://localhost:3000
echo.
pause
```

---

## 十一、开发执行顺序

### Step 1：项目初始化（20分钟）

```
1. 在 D:\YiMu 运行 npx create-next-app@14 . --typescript --tailwind --app --src-dir
2. 安装依赖：
   npm install prisma @prisma/client next-auth zustand swr
   npm install @dnd-kit/core @dnd-kit/sortable
   npm install react-hook-form zod @hookform/resolvers
   npm install recharts @react-pdf/renderer
3. 初始化 Prisma：npx prisma init（会创建 prisma/schema.prisma）
4. 将技术文档中的 Prisma Schema 写入 prisma/schema.prisma
5. 创建 .env.local（填入 MONGODB_URI=mongodb://localhost:27017/yimu_db）
6. 运行 npx prisma generate（生成 Prisma Client 类型）
7. 创建目录结构（lib, components, hooks, stores, types）
8. 创建 start.bat
9. 验证：npm run dev 能启动，访问 localhost:3000 看到默认页面
```

### Step 2：数据库 + Prisma Client（20分钟）

```
1. 创建 src/lib/prisma.ts（Prisma Client 单例，参照文档第五节）
2. 创建 npx prisma db push（将Schema同步到MongoDB）
3. 创建 src/types/index.ts（如需额外类型定义；大部分由Prisma自动生成）
4. 验证：在一个测试API route中调用 prisma.user.findMany()，确认数据库连接正常
```

### Step 3：认证系统（1小时）

```
1. 配置 NextAuth.js（Credentials Provider）
2. 开发环境：手机号 + 123456 登录
3. 创建登录页面 /login
4. 创建 middleware.ts 保护路由
5. 验证：登录后跳转到仪表盘
```

### Step 4：应用布局（1.5小时）

```
1. 创建 (dashboard)/layout.tsx（侧边栏+顶栏+响应式）
2. 基础UI组件（Button, Card, Input, Modal, Badge, Toast）
3. Sidebar组件（PC侧边栏）
4. MobileNav组件（移动端底部Tab）
5. 验证：登录后看到完整布局框架
```

### Step 5：客户管理（2小时）

```
1. 客户API routes（CRUD + 搜索 + 分页）
2. 客户列表页（搜索 + 标签筛选 + 卡片展示）
3. 新建/编辑客户Modal
4. 客户详情页
5. 验证：客户CRUD完整流程
```

### Step 6：项目看板（3小时）⭐ 核心页面

```
1. 项目API routes（CRUD + 看板数据 + 状态机）
2. KanbanBoard组件（@dnd-kit拖拽）
3. ProjectCard组件
4. 新建/编辑项目Modal
5. 项目详情页
6. 列表视图切换
7. 移动端适配
8. 验证：完整的看板交互（创建、拖拽、编辑、详情）
```

### Step 7：AI报价单（2.5小时）

```
1. AI调用封装（src/lib/ai.ts）
2. 报价API routes（CRUD + AI生成 + PDF导出）
3. AI报价页面（输入需求 → AI生成 → 编辑 → 保存）
4. 报价单详情/编辑页
5. PDF导出功能
6. 验证：从需求描述到PDF输出全流程
```

### Step 8：AI记账（2小时）

```
1. 记账API routes（CRUD + AI解析 + 汇总统计）
2. AI记账页面（输入描述 → AI预填 → 确认保存）
3. 收支列表（按月查看、分类统计）
4. 验证：文字记账全流程
```

### Step 9：收款催款（1.5小时）

```
1. 收款API routes（CRUD + 标记收款 + AI催款）
2. 收款管理页（待收/逾期/已收三栏）
3. 催款操作（AI生成文案 → 复制）
4. 验证：创建节点 → 催款 → 标记收款
```

### Step 10：仪表盘（1.5小时）

```
1. Dashboard API（聚合各模块数据）
2. 数据卡片（本月收入/支出/利润/进行中项目/待收款）
3. 收入趋势图（Recharts）
4. 最近项目 + 即将到期收款列表
5. 验证：登录后看到完整经营概览
```

**总计预估：约15小时开发时间**

---

## 十二、安全规范

- 所有API route都通过 NextAuth session 验证登录状态
- 每个数据库查询都加 userId 条件，用户只能访问自己的数据
- AI API Key 存在 .env.local，不提交 git
- 文件上传限制类型（jpg/png/pdf）和大小（≤5MB）
- .gitignore 包含：node_modules, .env.local, uploads/, .next/

---

## 十三、与 v1.0 的主要变更对照

| 项目 | v1.0 | v2.0 |
|------|------|------|
| 架构 | FastAPI + Next.js（前后端分离） | Next.js 全栈（前后端合一） |
| 后端语言 | Python | TypeScript（统一语言） |
| 数据库驱动 | Motor（异步Python） | Prisma（强类型ORM，自动补全） |
| 数据请求 | 手写fetch | SWR（自带缓存/loading/重验证） |
| 认证 | 自建JWT | NextAuth.js |
| 启动方式 | 3个终端（MongoDB+后端+前端） | 1个bat启动2个窗口 |
| Docker | 需要 | 不需要 |
| 微信小程序 | 有 | 取消，仅Web |
| 项目数量 | 3个（backend/web/miniprogram） | 1个（全在Next.js里） |
| 预估开发时间 | ~30小时 | ~15小时 |

---

**文档结束。将此文档交给 Claude Code，说：按照 TECH-SPEC v2.0 的 Step 1 开始执行，每完成一个 Step 跟我确认后继续下一个。**
