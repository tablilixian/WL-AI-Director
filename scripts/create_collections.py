#!/usr/bin/env python3
"""PocketBase 集合初始化脚本"""
import json, subprocess, sys

BASE = "http://127.0.0.1:8090"
_TOKEN = None

def api(method, path, data=None):
    global _TOKEN
    cmd = ["curl", "-s", "-X", method, f"{BASE}{path}",
           "-H", f"Authorization: Bearer {_TOKEN}",
           "-H", "Content-Type: application/json"]
    if data:
        cmd.extend(["-d", json.dumps(data)])
    result = subprocess.run(cmd, capture_output=True, text=True)
    return json.loads(result.stdout)

# Login
auth_resp = api("POST", "/api/collections/_superusers/auth-with-password",
                {"identity": sys.argv[1] if len(sys.argv) > 1 else "admin@wlai.com",
                 "password": sys.argv[2] if len(sys.argv) > 2 else "admin123456"})
if "token" not in auth_resp:
    print("❌ 登录失败:", auth_resp.get("message", "unknown"))
    sys.exit(1)
_TOKEN = auth_resp["token"]
print("✅ 管理员登录成功")

RULE_USER = '@request.auth.id = user_id.id || @request.auth.collectionName = "_superusers"'
RULE_CANVAS = 'project_id.user_id.id = @request.auth.id || @request.auth.collectionName = "_superusers"'

collections = [
    {
        "name": "projects",
        "type": "base",
        "schema": [
            {"name":"user_id","type":"relation","required":True,"maxSelect":1,"collectionId":"_pb_users_auth_"},
            {"name":"title","type":"text","required":True},
            {"name":"description","type":"text","required":False},
            {"name":"status","type":"text","required":False},
            {"name":"settings","type":"json","required":False},
            {"name":"data","type":"json","required":False},
        ],
        "listRule": RULE_USER,
        "viewRule": RULE_USER,
        "createRule": RULE_USER,
        "updateRule": RULE_USER,
        "deleteRule": RULE_USER,
    },
    {
        "name": "asset_library",
        "type": "base",
        "schema": [
            {"name":"user_id","type":"relation","required":True,"maxSelect":1,"collectionId":"_pb_users_auth_"},
            {"name":"type","type":"select","required":True,"values":["character","scene","prop","turnaround"]},
            {"name":"name","type":"text","required":True},
            {"name":"project_id","type":"relation","required":False,"maxSelect":1,"collectionId":"projects"},
            {"name":"project_name","type":"text","required":False},
            {"name":"data","type":"json","required":True},
        ],
        "listRule": RULE_USER,
        "viewRule": RULE_USER,
        "createRule": RULE_USER,
        "updateRule": RULE_USER,
        "deleteRule": RULE_USER,
    },
    {
        "name": "canvas_data",
        "type": "base",
        "schema": [
            {"name":"project_id","type":"relation","required":True,"maxSelect":1,"collectionId":"projects","unique":True},
            {"name":"layers","type":"json","required":True,"maxSize":10485760},
            {"name":"canvas_offset","type":"json","required":False},
            {"name":"scale","type":"number","required":False},
            {"name":"version","type":"number","required":False},
        ],
        "listRule": RULE_CANVAS,
        "viewRule": RULE_CANVAS,
        "createRule": RULE_CANVAS,
        "updateRule": RULE_CANVAS,
        "deleteRule": RULE_CANVAS,
    },
]

for col in collections:
    name = col["name"]
    # Check if exists
    existing = api("GET", f"/api/collections?filter=name%3D%22{name}%22")
    items = existing.get("items", [])
    if items:
        print(f"⚠️  {name} 已存在，跳过")
        continue

    result = api("POST", "/api/collections", col)
    if result.get("id"):
        fields = [f["name"] for f in result.get("fields", [])]
        print(f"✅ {name} 创建成功 — 字段: {', '.join(fields)}")
    else:
        print(f"❌ {name} 创建失败: {result.get('message', 'unknown')}")

print("\n🎉 PocketBase 集合初始化完成!")
