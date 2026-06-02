// PocketBase 集合初始化脚本
// 用法: node scripts/init-collections.mjs

import PocketBase from 'pocketbase';

const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@wlai.com';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123456';

const pb = new PocketBase(PB_URL);

async function main() {
  // 登录管理员
  await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASS);
  console.log('✅ 管理员登录成功');

  // users 集合 - 内置的，只需要添加自定义字段
  const usersCol = await pb.collections.getOne('_pb_users_auth_');
  const existingFieldNames = usersCol.fields.map(f => f.name);
  console.log(`📋 users 已有字段: ${existingFieldNames.join(', ')}`);

  // 不需要修改 users 集合，内置的 name + email + avatar 够用
  // 如果需要额外字段可以在这里添加

  // 1. projects 集合
  try {
    await pb.collections.create({
      name: 'projects',
      type: 'base',
      schema: [
        { name: 'user_id', type: 'relation', required: true, collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'title', type: 'text', required: true },
        { name: 'description', type: 'text', required: false },
        { name: 'status', type: 'text', required: false },
        { name: 'settings', type: 'json', required: false },
        { name: 'data', type: 'json', required: false },
      ],
      listRule: '@request.auth.id = user_id.id || @request.auth.collectionName = "_superusers"',
      viewRule: '@request.auth.id = user_id.id || @request.auth.collectionName = "_superusers"',
      createRule: '@request.auth.id = user_id.id || @request.auth.collectionName = "_superusers"',
      updateRule: '@request.auth.id = user_id.id || @request.auth.collectionName = "_superusers"',
      deleteRule: '@request.auth.id = user_id.id || @request.auth.collectionName = "_superusers"',
    });
    console.log('✅ projects 集合已创建');
  } catch (e) { console.log('⚠️  projects:', e.message); }

  // 2. asset_library 集合
  try {
    await pb.collections.create({
      name: 'asset_library',
      type: 'base',
      schema: [
        { name: 'user_id', type: 'relation', required: true, collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'type', type: 'select', required: true, values: ['character', 'scene', 'prop', 'turnaround'] },
        { name: 'name', type: 'text', required: true },
        { name: 'project_id', type: 'relation', required: false, collectionId: null, maxSelect: 1 },
        { name: 'project_name', type: 'text', required: false },
        { name: 'data', type: 'json', required: true },
      ],
      listRule: '@request.auth.id = user_id.id || @request.auth.collectionName = "_superusers"',
      viewRule: '@request.auth.id = user_id.id || @request.auth.collectionName = "_superusers"',
      createRule: '@request.auth.id = user_id.id || @request.auth.collectionName = "_superusers"',
      updateRule: '@request.auth.id = user_id.id || @request.auth.collectionName = "_superusers"',
      deleteRule: '@request.auth.id = user_id.id || @request.auth.collectionName = "_superusers"',
    });
    console.log('✅ asset_library 集合已创建');
  } catch (e) { console.log('⚠️  asset_library:', e.message); }

  // 3. canvas_data 集合
  try {
    await pb.collections.create({
      name: 'canvas_data',
      type: 'base',
      schema: [
        { name: 'project_id', type: 'relation', required: true, collectionId: null, maxSelect: 1 },
        { name: 'layers', type: 'json', required: true },
        { name: 'canvas_offset', type: 'json', required: false },
        { name: 'scale', type: 'number', required: false },
        { name: 'version', type: 'number', required: false },
      ],
      listRule: 'project_id.user_id.id = @request.auth.id || @request.auth.collectionName = "_superusers"',
      viewRule: 'project_id.user_id.id = @request.auth.id || @request.auth.collectionName = "_superusers"',
      createRule: 'project_id.user_id.id = @request.auth.id || @request.auth.collectionName = "_superusers"',
      updateRule: 'project_id.user_id.id = @request.auth.id || @request.auth.collectionName = "_superusers"',
      deleteRule: 'project_id.user_id.id = @request.auth.id || @request.auth.collectionName = "_superusers"',
    });
    console.log('✅ canvas_data 集合已创建');
  } catch (e) { console.log('⚠️  canvas_data:', e.message); }

  console.log('\n🎉 PocketBase 初始化完成！');
  console.log(`📊 Admin UI: ${PB_URL}/_/`);
}

main().catch(console.error);
