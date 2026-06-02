#!/bin/bash
# PocketBase 初始化脚本
# 用法: ./scripts/init-pocketbase.sh <base_url> <admin_email> <admin_password>

BASE_URL="${1:-http://127.0.0.1:8090}"
EMAIL="${2:-admin@wlai.com}"
PASS="${3:-admin123456}"

echo "=== 登录管理员 ==="
TOKEN=$(curl -s -X POST "$BASE_URL/api/collections/_superusers/auth-with-password" \
  -H "Content-Type: application/json" \
  -d "{\"identity\":\"$EMAIL\",\"password\":\"$PASS\"}" | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['token'])" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "❌ 登录失败"
  exit 1
fi
echo "✅ 登录成功"

AUTH="Authorization: Bearer $TOKEN"

# =================================================================
# 1. 扩展内置 users 集合：添加 nickname, api_key 字段
# =================================================================
echo ""
echo "=== 1. 配置 users 集合 ==="
curl -s -X PATCH "$BASE_URL/api/collections/users" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{
    "fields": [
      {"id":"u1","name":"username","type":"text","required":false,"unique":false},
      {"id":"u2","name":"email","type":"email","required":true,"unique":true},
      {"id":"u3","name":"password","type":"text","required":true,"hidden":true},
      {"id":"u4","name":"passwordConfirm","type":"text","required":true,"hidden":true},
      {"id":"u5","name":"oldPassword","type":"text","hidden":true},
      {"id":"u6","name":"verified","type":"bool","required":false},
      {"id":"u7","name":"avatar","type":"file","required":false},
      {"id":"n1","name":"nickname","type":"text","required":false},
      {"id":"n2","name":"api_key","type":"text","required":false,"secret":true}
    ],
    "listRule": "@request.auth.id = id || @request.auth.collectionName = \"admins\"",
    "viewRule": "@request.auth.id = id || @request.auth.collectionName = \"admins\"",
    "createRule": "",
    "updateRule": "@request.auth.id = id || @request.auth.collectionName = \"admins\"",
    "deleteRule": "@request.auth.id = id || @request.auth.collectionName = \"admins\""
  }' | python3 -c "import sys,json; d=json.load(sys.stdin); print('✅' if d.get('id') else '❌', d.get('message',''))" 2>/dev/null

# =================================================================
# 2. 创建 projects 集合
# =================================================================
echo ""
echo "=== 2. 创建 projects 集合 ==="
curl -s -X POST "$BASE_URL/api/collections" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "projects",
    "type": "base",
    "system": false,
    "schema": [
      {"name":"user_id","type":"relation","required":true,"collectionId":"users","maxSelect":1},
      {"name":"title","type":"text","required":true},
      {"name":"description","type":"text","required":false},
      {"name":"status","type":"text","required":false},
      {"name":"settings","type":"json","required":false},
      {"name":"data","type":"json","required":false}
    ],
    "listRule": "@request.auth.id = user_id.id || @request.auth.collectionName = \"admins\"",
    "viewRule": "@request.auth.id = user_id.id || @request.auth.collectionName = \"admins\"",
    "createRule": "@request.auth.id = user_id.id || @request.auth.collectionName = \"admins\"",
    "updateRule": "@request.auth.id = user_id.id || @request.auth.collectionName = \"admins\"",
    "deleteRule": "@request.auth.id = user_id.id || @request.auth.collectionName = \"admins\""
  }' | python3 -c "import sys,json; d=json.load(sys.stdin); print('✅' if d.get('id') else '❌', d.get('message',''))" 2>/dev/null

# =================================================================
# 3. 创建 asset_library 集合
# =================================================================
echo ""
echo "=== 3. 创建 asset_library 集合 ==="
curl -s -X POST "$BASE_URL/api/collections" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "asset_library",
    "type": "base",
    "system": false,
    "schema": [
      {"name":"user_id","type":"relation","required":true,"collectionId":"users","maxSelect":1},
      {"name":"type","type":"select","required":true,"values":["character","scene","prop","turnaround"]},
      {"name":"name","type":"text","required":true},
      {"name":"project_id","type":"relation","required":false,"collectionId":"projects","maxSelect":1},
      {"name":"project_name","type":"text","required":false},
      {"name":"data","type":"json","required":true}
    ],
    "listRule": "@request.auth.id = user_id.id || @request.auth.collectionName = \"admins\"",
    "viewRule": "@request.auth.id = user_id.id || @request.auth.collectionName = \"admins\"",
    "createRule": "@request.auth.id = user_id.id || @request.auth.collectionName = \"admins\"",
    "updateRule": "@request.auth.id = user_id.id || @request.auth.collectionName = \"admins\"",
    "deleteRule": "@request.auth.id = user_id.id || @request.auth.collectionName = \"admins\""
  }' | python3 -c "import sys,json; d=json.load(sys.stdin); print('✅' if d.get('id') else '❌', d.get('message',''))" 2>/dev/null

# =================================================================
# 4. 创建 canvas_data 集合
# =================================================================
echo ""
echo "=== 4. 创建 canvas_data 集合 ==="
curl -s -X POST "$BASE_URL/api/collections" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "canvas_data",
    "type": "base",
    "system": false,
    "schema": [
      {"name":"project_id","type":"relation","required":true,"unique":true,"collectionId":"projects","maxSelect":1},
      {"name":"layers","type":"json","required":true},
      {"name":"canvas_offset","type":"json","required":false},
      {"name":"scale","type":"number","required":false},
      {"name":"version","type":"number","required":false}
    ],
    "listRule": "@request.auth.id != null && @request.auth.id = project_id.user_id.id || @request.auth.collectionName = \"admins\"",
    "viewRule": "@request.auth.id != null && @request.auth.id = project_id.user_id.id || @request.auth.collectionName = \"admins\"",
    "createRule": "@request.auth.id != null && @request.auth.id = project_id.user_id.id || @request.auth.collectionName = \"admins\"",
    "updateRule": "@request.auth.id != null && @request.auth.id = project_id.user_id.id || @request.auth.collectionName = \"admins\"",
    "deleteRule": "@request.auth.id != null && @request.auth.id = project_id.user_id.id || @request.auth.collectionName = \"admins\""
  }' | python3 -c "import sys,json; d=json.load(sys.stdin); print('✅' if d.get('id') else '❌', d.get('message',''))" 2>/dev/null

echo ""
echo "=== 全部完成 ==="
