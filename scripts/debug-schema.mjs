import PocketBase from 'pocketbase';

const pb = new PocketBase('http://127.0.0.1:8090');

// Monkey-patch fetch to log payloads
const origFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (opts?.body && typeof opts.body === 'string') {
    const body = JSON.parse(opts.body);
    if (url.toString().includes('/api/collections')) {
      console.log('\n=== Request ===');
      console.log('URL:', url);
      if (body.schema) {
        console.log('Schema fields:', JSON.stringify(body.schema, null, 2));
      }
    }
  }
  return origFetch(url, opts);
};

async function main() {
  await pb.collection('_superusers').authWithPassword('admin@wlai.com', 'admin123456');

  // Clean up previous test
  try {
    const existing = await pb.collections.getList(1,50,{filter:'name="debug_test"'});
    for (const col of existing.items) {
      await pb.collections.delete(col.id);
    }
  } catch(e) {}

  try {
    const result = await pb.collections.create({
      name: 'debug_test',
      type: 'base',
      schema: [{ name: 'test_field', type: 'text' }],
    });
    console.log('Response fields:', result.fields.map(f => f.name));
  } catch (e) {
    console.log('Error:', e.message);
    console.log('Response data:', JSON.stringify(e.response?.data, null, 2));
  }
}

main().catch(console.error);
