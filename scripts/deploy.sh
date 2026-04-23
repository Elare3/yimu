#!/usr/bin/env bash
# ============================================================
# 一木 YiMu — 生产部署脚本
# 用法：
#   cd /var/www/yimu && bash scripts/deploy.sh
# 可选环境变量：
#   PM2_APP        PM2 应用名（默认 yimu）
#   SKIP_MIGRATE   设为 1 可跳过 prisma migrate deploy
#   SKIP_PULL      设为 1 可跳过 git pull（已手动拉取时）
#
# 首次切换到 PostgreSQL：先跑 scripts/pg-bootstrap.sh 安装 PG17 + 建库，
# 再改 .env 的 DATABASE_URL，然后才跑本脚本。
# ============================================================

set -Eeuo pipefail

# ── 所有相对路径都基于项目根 ──
cd "$(dirname "$0")/.."
PROJECT_ROOT="$(pwd)"

PM2_APP="${PM2_APP:-yimu}"
EXPECTED_PRISMA_MAJOR=5

# ── 颜色 ──
R=$'\033[0;31m'; G=$'\033[0;32m'; Y=$'\033[0;33m'; B=$'\033[0;34m'; N=$'\033[0m'
step() { echo; echo "${B}▶ $*${N}"; }
ok()   { echo "${G}✓ $*${N}"; }
warn() { echo "${Y}! $*${N}"; }
die()  { echo "${R}✗ $*${N}" >&2; exit 1; }

on_error() {
  echo
  die "部署在第 $1 行失败，未改动运行中的进程。检查上方日志后再重试。"
}
trap 'on_error $LINENO' ERR

echo "=========================================="
echo " 一木 YiMu 部署  —  $(date '+%F %T')"
echo " 目录: $PROJECT_ROOT"
echo " PM2: $PM2_APP"
echo "=========================================="

# ── 0. 前置环境检查 ──
step "0. 前置环境检查"
command -v node  >/dev/null || die "Node.js 未安装"
command -v npm   >/dev/null || die "npm 未安装"
command -v pm2   >/dev/null || die "pm2 未安装"
command -v git   >/dev/null || die "git 未安装"

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 18 ]; then
  die "Node.js 版本过低（$(node -v)），需要 >= 18"
fi
ok "node $(node -v), npm $(npm -v), pm2 $(pm2 -v)"

# ── 1. .env 必填项检查（不打印值） ──
step "1. 检查 .env 必填项"
ENV_FILE=".env"
[ -f .env.local ] && ENV_FILE=".env.local"
[ -f "$ENV_FILE" ] || die "未找到 .env 或 .env.local"

require_env() {
  local key="$1"
  grep -q "^${key}=." "$ENV_FILE" || die ".env 缺少必填项：$key"
}
require_env NODE_ENV
require_env NEXTAUTH_URL
require_env NEXTAUTH_SECRET
require_env ENCRYPTION_KEY
require_env DATABASE_URL
require_env DASHSCOPE_API_KEY
require_env PRIMARY_MODEL
require_env LIGHT_MODEL

# ENCRYPTION_KEY 必须是 64 位 hex
ENC_LEN=$(grep '^ENCRYPTION_KEY=' "$ENV_FILE" | sed 's/^ENCRYPTION_KEY=//; s/"//g; s/^ *//; s/ *$//' | wc -c)
# wc -c 会把末尾换行算进去，所以等于 65
if [ "$ENC_LEN" -ne 65 ] && [ "$ENC_LEN" -ne 64 ]; then
  die "ENCRYPTION_KEY 必须是 64 位 hex 字符（当前 $((ENC_LEN-1)) 字符）。生成：openssl rand -hex 32"
fi

# 测试阶段：短信验证码功能未启用，允许 ENABLE_TEST_CODE=true
# TODO: 短信验证码上线后恢复此检查
# if grep -q '^NODE_ENV=production' "$ENV_FILE" && grep -q '^ENABLE_TEST_CODE=true' "$ENV_FILE"; then
#   die "生产环境检测到 ENABLE_TEST_CODE=true，这是测试后门，请删除该行"
# fi

# HTTPS / IP 模式检查
NEXTAUTH_URL=$(grep '^NEXTAUTH_URL=' "$ENV_FILE" | sed 's/^NEXTAUTH_URL=//' | tr -d '"')
if grep -q '^ENABLE_HTTPS=true' "$ENV_FILE"; then
  if [[ ! "$NEXTAUTH_URL" =~ ^https:// ]]; then
    die "ENABLE_HTTPS=true 但 NEXTAUTH_URL 不是 https 开头：$NEXTAUTH_URL"
  fi
  ok "HTTPS 模式（$NEXTAUTH_URL）"
else
  ok "HTTP/IP 模式（$NEXTAUTH_URL）"
fi

ok "$ENV_FILE 检查通过"

# ── 2. 拉取最新代码 ──
step "2. 拉取最新代码"
if [ "${SKIP_PULL:-0}" = "1" ]; then
  warn "SKIP_PULL=1，跳过 git pull"
else
  if ! git diff --quiet || ! git diff --cached --quiet; then
    die "工作区有未提交改动，请先处理（git status 查看）"
  fi
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  git fetch --quiet origin "$BRANCH"
  BEFORE=$(git rev-parse HEAD)
  git reset --hard "origin/$BRANCH"
  AFTER=$(git rev-parse HEAD)
  if [ "$BEFORE" = "$AFTER" ]; then
    ok "已是最新 ($BEFORE)"
  else
    ok "$BEFORE → $AFTER"
    git --no-pager log --oneline "$BEFORE..$AFTER" | head -20
  fi
fi

# ── 3. 严格按 lockfile 安装依赖（lockfile 无变化则跳过） ──
step "3. npm ci（严格按 lockfile）"
LOCK_HASH_FILE="node_modules/.lockfile-hash"
LOCK_HASH_NOW=$(sha256sum package-lock.json | cut -d' ' -f1)
LOCK_HASH_OLD=""
[ -f "$LOCK_HASH_FILE" ] && LOCK_HASH_OLD=$(cat "$LOCK_HASH_FILE")

if [ "$LOCK_HASH_NOW" = "$LOCK_HASH_OLD" ] && [ -d node_modules ]; then
  ok "package-lock.json 无变化，跳过 npm ci"
else
  npm ci
  echo "$LOCK_HASH_NOW" > "$LOCK_HASH_FILE"
  ok "依赖安装完成"
fi

# ── 4. 校验 prisma 版本一致 ──
step "4. 校验 Prisma 版本一致（避免 npx 拉到 7.x）"
PRISMA_CLI_VER=$(./node_modules/.bin/prisma -v 2>/dev/null | awk -F': *' '/^prisma[[:space:]]*:/ {print $2; exit}')
PRISMA_RT_VER=$(node -p "require('./node_modules/@prisma/client/package.json').version")

echo "  prisma CLI       : $PRISMA_CLI_VER"
echo "  @prisma/client   : $PRISMA_RT_VER"

CLI_MAJOR=$(echo "$PRISMA_CLI_VER" | cut -d. -f1)
RT_MAJOR=$(echo "$PRISMA_RT_VER"  | cut -d. -f1)
if [ "$CLI_MAJOR" != "$RT_MAJOR" ]; then
  die "prisma CLI 与 @prisma/client 主版本不一致（$CLI_MAJOR vs $RT_MAJOR）"
fi
if [ "$CLI_MAJOR" != "$EXPECTED_PRISMA_MAJOR" ]; then
  die "prisma 主版本应为 $EXPECTED_PRISMA_MAJOR，当前为 $CLI_MAJOR。检查 package.json 与 package-lock.json"
fi

if command -v prisma >/dev/null 2>&1; then
  GLOBAL_PRISMA=$(command -v prisma)
  case "$GLOBAL_PRISMA" in
    "$PROJECT_ROOT/node_modules/.bin/prisma") : ;;
    *) warn "检测到全局 prisma：$GLOBAL_PRISMA — 后续步骤统一走 ./node_modules/.bin/prisma 绕开它" ;;
  esac
fi
ok "Prisma 版本一致：$PRISMA_CLI_VER"

# ── 5. 生成 Prisma Client ──
step "5. prisma generate"
./node_modules/.bin/prisma generate
ok "Prisma Client 已生成"

# ── 6. 应用数据库迁移（幂等） ──
# 首次部署会建全部表；后续只会补上新迁移。无新迁移时秒回。
step "6. prisma migrate deploy（应用数据库迁移）"
if [ "${SKIP_MIGRATE:-0}" = "1" ]; then
  warn "SKIP_MIGRATE=1，跳过迁移"
else
  ./node_modules/.bin/prisma migrate deploy
  ok "迁移已应用"
fi

# ── 7. 确保上传目录存在 ──
step "7. 检查上传目录"
mkdir -p public/uploads/avatars
ok "uploads 目录就绪"

# ── 8. 构建 ──
step "8. next build（完整 TS + ESLint 检查）"
npm run build
ok "构建完成"

# ── 9. 重载 pm2 ──
step "9. 重载 PM2 ($PM2_APP)"
if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  pm2 delete "$PM2_APP"
fi
pm2 start npm --name "$PM2_APP" -- start
pm2 save
ok "pm2 $PM2_APP 已启动"

# ── 10. 自动配置 Nginx ──
step "10. 配置 Nginx"
NGINX_CONF="/etc/nginx/sites-enabled/yimu"
if [ -f "$NGINX_CONF" ]; then
  if grep -q '^ENABLE_HTTPS=true' "$ENV_FILE"; then
    # HTTPS 域名模式
    DOMAIN=$(echo "$NEXTAUTH_URL" | sed 's|https://||')
    ok "HTTPS 模式，请确认 Nginx 已配置域名 $DOMAIN 的 SSL"
  else
    # HTTP/IP 模式：自动写入 IP 配置
    SERVER_IP=$(echo "$NEXTAUTH_URL" | sed 's|http://||' | sed 's|:.*||')
    sudo tee "$NGINX_CONF" > /dev/null << NGINXEOF
server {
    listen 80;
    server_name $SERVER_IP;

    client_max_body_size 10M;

    location /uploads/ {
        alias /var/www/yimu/public/uploads/;
        expires 30d;
        access_log off;
    }

    location / {
        proxy_pass http://127.0.0.1:${PORT:-3000};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 120s;
    }
}
NGINXEOF
    sudo nginx -t && sudo systemctl reload nginx
    ok "Nginx 已配置为 IP 模式（$SERVER_IP）"
  fi
else
  warn "未找到 $NGINX_CONF，跳过 Nginx 配置"
fi

# ── 11. 健康检查 ──
step "11. 健康检查"
PORT=$(grep '^PORT=' "$ENV_FILE" | sed 's/^PORT=//' | tr -d '"' || true)
PORT="${PORT:-3000}"

RETRIES=0
MAX_RETRIES=5
until curl -sf "http://127.0.0.1:${PORT}/api/health" -o /dev/null || [ "$RETRIES" -ge "$MAX_RETRIES" ]; do
  RETRIES=$((RETRIES + 1))
  echo "  等待 Next.js 启动... ($RETRIES/$MAX_RETRIES)"
  sleep 3
done

if curl -sf "http://127.0.0.1:${PORT}/api/health" -o /dev/null; then
  ok "健康检查通过（:${PORT}/api/health）"
  # 外部访问检查
  if curl -sf "${NEXTAUTH_URL}/api/health" -o /dev/null 2>/dev/null; then
    ok "外部访问正常（${NEXTAUTH_URL}）"
  else
    warn "内网健康但外部访问失败，检查 Nginx 配置和防火墙"
  fi
else
  warn "健康检查未通过，请查看 pm2 logs $PM2_APP"
fi

echo
echo "${G}=========================================="
echo " 部署完成  —  $(date '+%F %T')"
echo "==========================================${N}"
pm2 list
