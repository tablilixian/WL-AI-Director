import PocketBase from 'pocketbase';

const pb = new PocketBase('http://127.0.0.1:8090');

async function main() {
  await pb.collection('_superusers').authWithPassword('admin@wlai.com', 'admin123456');

  // Clean up
  try {
    const existing = await pb.collections.getList(1,50,{filter:'name="debug_test"'});
    for (const col of existing.items) {
      await pb.collections.delete(col.id);
    }
  } catch(e) {}

  // Create empty collection first
  const col = await pb.collections.create({
    name: 'debug_test',
    type: 'base',
  });
  console.log('Created:', col.id, 'fields:', col.fields.map(f => f.name));

  // Now PATCH to add a field
  try {
    const updated = await pb.collections.update(col.id, {
      schema: [
        // Must include existing fields
        col.fields[0],
        {
          name: 'test_field',
          type: 'text',
          required: false,
        },
      ],
    });
    console.log('Updated fields:', updated.fields.map(f => f.name));
  } catch (e) {
    console.log('PATCH Error:', e.message);
    if (e.response?.data) console.log('Data:', JSON.stringify(e.response.data, null, 2));
  }

  // Try fetching the collection to see current state
  const fresh = await pb.collections.getOne(col.id);
  console.log('Fresh fields:', fresh.fields.map(f => f.name));

  // Clean up
  await pb.collections.delete(col.id);
}

main().catch(console.error);
