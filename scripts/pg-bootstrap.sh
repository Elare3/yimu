#!/usr/bin/env bash
# ============================================================
# 一木 YiMu — PostgreSQL 首次初始化（Ubuntu / 生产服务器）
# 用法：
#   sudo bash scripts/pg-bootstrap.sh
# 可配置环境变量：
#   PG_DB        数据库名（默认 yimu_prod）
#   PG_USER      应用账号（默认 yimu_app）
#   PG_PASSWORD  应用账号密码（必填，建议用 openssl rand 生成）
#   PG_VERSION   PostgreSQL 主版本（默认 17）
#
# 幂等：已安装/已建库/已建用户的情况下会跳过对应步骤。
# 结束后会打印一行可直接粘进 .env 的 DATABASE_URL。
# ============================================================

set -Eeuo pipefail

PG_DB="${PG_DB:-yimu_prod}"
PG_USER="${PG_USER:-yimu_app}"
PG_VERSION="${PG_VERSION:-17}"

if [ -z "${PG_PASSWORD:-}" ]; then
  echo "✗ 必须设置 PG_PASSWORD 环境变量。生成方式： openssl rand -base64 24" >&2
  echo "  示例： PG_PASSWORD='xxx' sudo -E bash scripts/pg-bootstrap.sh" >&2
  exit 1
fi

R=$'\033[0;31m'; G=$'\033[0;32m'; Y=$'\033[0;33m'; B=$'\033[0;34m'; N=$'\033[0m'
step() { echo; echo "${B}▶ $*${N}"; }
ok()   { echo "${G}✓ $*${N}"; }
warn() { echo "${Y}! $*${N}"; }

# ── 1. 安装 PostgreSQL ──
step "1. 安装 PostgreSQL ${PG_VERSION}"
if command -v psql >/dev/null 2>&1 && psql --version | grep -qE " ${PG_VERSION}\."; then
  ok "PostgreSQL ${PG_VERSION} 已安装：$(psql --version)"
else
  # PGDG 官方源（Ubuntu 默认源里 pg 版本一般落后）
  if ! grep -qr "apt.postgresql.org" /etc/apt/sources.list.d/ 2>/dev/null; then
    apt-get update -y
    apt-get install -y curl ca-certificates gnupg lsb-release
    install -d /usr/share/postgresql-common/pgdg
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
    echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list
  fi
  apt-get update -y
  apt-get install -y "postgresql-${PG_VERSION}"
  ok "已安装 postgresql-${PG_VERSION}"
fi

systemctl enable --now postgresql
ok "postgresql 服务已启用"

# ── 2. 建用户 ──
step "2. 建应用账号 ${PG_USER}"
USER_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${PG_USER}'")
if [ "$USER_EXISTS" = "1" ]; then
  # 用户已存在：改密码以保证与 .env 一致
  sudo -u postgres psql -c "ALTER USER \"${PG_USER}\" WITH PASSWORD '${PG_PASSWORD}';" >/dev/null
  ok "用户 ${PG_USER} 已存在，已同步密码"
else
  # CREATEDB 权限留给迁移时创建 shadow database（dev 场景用，prod migrate deploy 不需要但加了无害）
  sudo -u postgres psql -c "CREATE USER \"${PG_USER}\" WITH PASSWORD '${PG_PASSWORD}' CREATEDB;" >/dev/null
  ok "已创建 ${PG_USER}"
fi

# ── 3. 建库 ──
step "3. 建库 ${PG_DB}"
DB_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${PG_DB}'")
if [ "$DB_EXISTS" = "1" ]; then
  ok "数据库 ${PG_DB} 已存在"
else
  sudo -u postgres psql -c "CREATE DATABASE \"${PG_DB}\" OWNER \"${PG_USER}\" ENCODING 'UTF8';" >/dev/null
  ok "已创建 ${PG_DB}"
fi

# ── 4. 授权（幂等） ──
step "4. 授权"
sudo -u postgres psql -d "${PG_DB}" >/dev/null <<SQL
GRANT ALL PRIVILEGES ON DATABASE "${PG_DB}" TO "${PG_USER}";
GRANT ALL ON SCHEMA public TO "${PG_USER}";
ALTER SCHEMA public OWNER TO "${PG_USER}";
SQL
ok "已授权"

# ── 5. 输出 DATABASE_URL ──
step "5. 在 .env 里写入 DATABASE_URL"
# 对密码做 URL 编码（密码里有 @ / : 会把连接串解析弄坏）
ENC_PW=$(node -e "process.stdout.write(encodeURIComponent(process.argv[1]))" "$PG_PASSWORD" 2>/dev/null \
        || python3 -c "import urllib.parse,sys; sys.stdout.write(urllib.parse.quote(sys.argv[1], safe=''))" "$PG_PASSWORD")
echo
echo "${G}=========================================="
echo " PostgreSQL 就绪"
echo "==========================================${N}"
echo "把下面这一行贴到生产 .env / .env.local："
echo
echo "DATABASE_URL=\"postgresql://${PG_USER}:${ENC_PW}@localhost:5432/${PG_DB}?schema=public\""
echo
echo "贴完后执行：cd /var/www/yimu && bash scripts/deploy.sh"
