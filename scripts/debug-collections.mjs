import PocketBase from 'pocketbase';

const pb = new PocketBase('http://127.0.0.1:8090');

async function main() {
  await pb.collection('_superusers').authWithPassword('admin@wlai.com', 'admin123456');
  
  // Try creating a minimal collection
  try {
    const result = await pb.collections.create({
      name: 'debug_test',
      type: 'base',
      schema: [
        { name: 'test_field', type: 'text' }
      ],
    });
    console.log('Success:', result.id);
    console.log('Fields:', result.fields.map(f => f.name));
  } catch (e) {
    console.log('Error:', e.message);
    if (e.response) console.log('Response:', JSON.stringify(e.response, null, 2));
    // Check if it's a data error
    if (e.data) console.log('Data:', JSON.stringify(e.data, null, 2));
  }
}

main();
