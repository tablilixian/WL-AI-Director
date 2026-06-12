#!/usr/bin/env bash
set -e

# ============================================================
#  WL AI Director — 一键部署脚本
#  构建前端 + 启动 PocketBase + 创建管理员 + 创建集合
#  用法: chmod +x setup.sh && ./setup.sh
# ============================================================

cd "$(dirname "$0")"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}    WL AI Director — 一键部署${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# ---------- 1. 创建 .env ----------
if [ ! -f .env ]; then
  echo ">>> 创建 .env 配置文件..."
  cat > .env << EOF
VITE_POCKETBASE_URL=http://127.0.0.1:8090
PB_ADMIN_EMAIL=admin@wlai.com
PB_ADMIN_PASSWORD=admin123456
EOF
  echo -e "${GREEN}  ✔ .env 已创建${NC}"
else
  echo "  .env 已存在，跳过"
fi

# ---------- 2. 确保必要目录 ----------
mkdir -p pb_data pb_migrations

# ---------- 3. 构建并启动全部服务 ----------
echo ""
echo ">>> 构建并启动服务..."
docker compose up -d --build

# ---------- 4. 等待 PocketBase 就绪 ----------
echo ""
echo ">>> 等待 PocketBase 就绪..."
PB_READY=false
for i in $(seq 1 30); do
  if wget -q -O- http://127.0.0.1:8090/api/health 2>/dev/null | grep -q '"code":200\|"message"'; then
    echo -e "${GREEN}  ✔ PocketBase 已就绪${NC}"
    PB_READY=true
    break
  fi
  sleep 1
done

if [ "$PB_READY" != "true" ]; then
  echo "  ⚠ PocketBase 未在预期时间内启动"
  exit 1
fi

# ---------- 5. 创建集合 ----------
echo ""
echo ">>> 创建数据库集合..."

PB_EMAIL="${PB_ADMIN_EMAIL:-admin@wlai.com}"
PB_PASSWORD="${PB_ADMIN_PASSWORD:-admin123456}"

# 登录获取管理员 token
TOKEN=$(curl -s -X POST http://127.0.0.1:8090/api/collections/_superusers/auth-with-password \
  -H "Content-Type: application/json" \
  -d "{\"identity\":\"${PB_EMAIL}\",\"password\":\"${PB_PASSWORD}\"}" | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")

if [ -z "$TOKEN" ]; then
  echo "  ⚠ 管理员登录失败，跳过集合创建"
  echo "  可稍后手动运行: curl -X POST http://127.0.0.1:8090/api/collections ..."
else
  AUTH="Authorization: Bearer $TOKEN"
  CT="Content-Type: application/json"
  BASE="http://127.0.0.1:8090/api/collections"

  create_collection() {
    local name="$1"
    local exists=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/$name" -H "$AUTH" 2>/dev/null)
    if [ "$exists" = "200" ]; then
      echo "  - $name 已存在，跳过"
    else
      local status=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE" -H "$AUTH" -H "$CT" -d "$2" 2>/dev/null)
      if [ "$status" = "200" ]; then
        echo -e "  ${GREEN}✔ $name 已创建${NC}"
      else
        echo "  ⚠ $name 创建失败 (HTTP $status)"
      fi
    fi
  }

  # projects
  create_collection "projects" '{
    "name":"projects","type":"base",
    "listRule":"@request.auth.id = user_id.id || @request.auth.collectionName = \"_superusers\"",
    "viewRule":"@request.auth.id = user_id.id || @request.auth.collectionName = \"_superusers\"",
    "createRule":"@request.auth.id = user_id.id || @request.auth.collectionName = \"_superusers\"",
    "updateRule":"@request.auth.id = user_id.id || @request.auth.collectionName = \"_superusers\"",
    "deleteRule":"@request.auth.id = user_id.id || @request.auth.collectionName = \"_superusers\"",
    "fields":[
      {"type":"text","name":"id","system":true,"primaryKey":true,"required":true,"autogeneratePattern":"[a-z0-9]{15}","max":15,"min":15,"pattern":"^[a-z0-9]+$"},
      {"type":"relation","name":"user_id","collectionId":"_pb_users_auth_","cascadeDelete":false,"maxSelect":1,"minSelect":0},
      {"type":"text","name":"title"},{"type":"text","name":"description"},{"type":"text","name":"status"},
      {"type":"json","name":"settings"},{"type":"json","name":"data"},
      {"type":"autodate","name":"created","onCreate":true},
      {"type":"autodate","name":"updated","onCreate":true,"onUpdate":true}
    ]
  }'

  # asset_library
  create_collection "asset_library" '{
    "name":"asset_library","type":"base",
    "listRule":"@request.auth.id = user_id.id || @request.auth.collectionName = \"_superusers\"",
    "viewRule":"@request.auth.id = user_id.id || @request.auth.collectionName = \"_superusers\"",
    "createRule":"@request.auth.id = user_id.id || @request.auth.collectionName = \"_superusers\"",
    "updateRule":"@request.auth.id = user_id.id || @request.auth.collectionName = \"_superusers\"",
    "deleteRule":"@request.auth.id = user_id.id || @request.auth.collectionName = \"_superusers\"",
    "fields":[
      {"type":"text","name":"id","system":true,"primaryKey":true,"required":true,"autogeneratePattern":"[a-z0-9]{15}","max":15,"min":15,"pattern":"^[a-z0-9]+$"},
      {"type":"relation","name":"user_id","collectionId":"_pb_users_auth_","cascadeDelete":false,"maxSelect":0,"minSelect":0},
      {"type":"select","name":"type","values":["character","scene","prop","turnaround"],"maxSelect":0},
      {"type":"text","name":"name"},{"type":"text","name":"project_name"},
      {"type":"json","name":"data"},
      {"type":"autodate","name":"created","onCreate":true},
      {"type":"autodate","name":"updated","onCreate":true,"onUpdate":true},
      {"type":"file","name":"image","mimeTypes":["image/png","image/jpeg","image/webp","image/gif"],"maxSelect":1,"maxSize":20971520,"thumbs":[]}
    ]
  }'

  # canvas_data
  create_collection "canvas_data" '{
    "name":"canvas_data","type":"base",
    "listRule":"@request.auth.id != null",
    "viewRule":"@request.auth.id != null",
    "createRule":"@request.auth.id != null",
    "updateRule":"@request.auth.id != null",
    "deleteRule":"@request.auth.id != null",
    "fields":[
      {"type":"text","name":"id","system":true,"primaryKey":true,"required":true,"autogeneratePattern":"[a-z0-9]{15}","max":15,"min":15,"pattern":"^[a-z0-9]+$"},
      {"type":"text","name":"project_id"},
      {"type":"json","name":"layers"},{"type":"json","name":"canvas_offset"},
      {"type":"number","name":"scale"},{"type":"number","name":"version"},
      {"type":"autodate","name":"created","onCreate":true},
      {"type":"autodate","name":"updated","onCreate":true,"onUpdate":true}
    ]
  }'

  echo -e "${GREEN}  ✔ 集合创建完成${NC}"
fi

# ---------- 6. 完成 ----------
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  部署完成${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "  前端:       http://localhost:3005"
echo "  PocketBase: http://localhost:8090"
echo "  管理后台:   http://localhost:8090/_/"
echo "  管理员:     ${PB_EMAIL} / ${PB_PASSWORD}"
echo ""
echo "  常用命令:"
echo "    查看日志:  docker compose logs -f"
echo "    重启服务:  docker compose restart"
echo "    停止服务:  docker compose down"
echo ""
