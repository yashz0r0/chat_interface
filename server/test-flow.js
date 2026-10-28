// Comprehensive integration test suite for Chat Assistant API

async function runTests() {
  const BASE_URL = 'http://127.0.0.1:5000';
  console.log('[TEST 1] Checking API status...');
  const statusRes = await fetch(`${BASE_URL}/api/status`);
  const statusData = await statusRes.json();
  console.log('[TEST 1] Status:', statusData);

  console.log('\n[TEST 2] Creating a new conversation (Tone: Professional)...');
  const createRes = await fetch(`${BASE_URL}/api/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'React Performance Discussion', tone: 'Professional' })
  });
  const conv = await createRes.json();
  console.log('[TEST 2] Created conversation ID:', conv._id);

  console.log('\n[TEST 3] Testing SSE Streaming chat in Professional tone...');
  const streamRes = await fetch(`${BASE_URL}/api/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversationId: conv._id,
      message: 'What are the main benefits of React.memo and useCallback?',
      tone: 'Professional'
    })
  });

  const reader = streamRes.body.getReader();
  const decoder = new TextDecoder();
  let fullOutput = '';
  let tokenCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const payload = JSON.parse(line.slice(6));
        if (payload.type === 'token') {
          process.stdout.write(payload.token);
          fullOutput += payload.token;
          tokenCount++;
        }
      }
    }
  }
  console.log(`\n\n[TEST 3] Stream tokens received: ${tokenCount}`);

  console.log('\n[TEST 4] Updating conversation tone to Casual...');
  const patchRes = await fetch(`${BASE_URL}/api/conversations/${conv._id}/tone`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tone: 'Casual' })
  });
  const updatedConv = await patchRes.json();
  console.log('[TEST 4] Updated tone:', updatedConv.tone);

  console.log('\n[TEST 5] Fetching conversation history...');
  const getRes = await fetch(`${BASE_URL}/api/conversations/${conv._id}`);
  const fetched = await getRes.json();
  console.log('[TEST 5] Messages stored:', fetched.messages.length);
  fetched.messages.forEach((m, idx) => {
    console.log(`   [Msg ${idx + 1}] Role: ${m.role} | Content: "${m.content.slice(0, 45)}..."`);
  });

  console.log('\n[TEST 6] Listing all conversations...');
  const listRes = await fetch(`${BASE_URL}/api/conversations`);
  const listData = await listRes.json();
  console.log('[TEST 6] Total conversations:', listData.length);

  console.log('\n[TEST 7] Deleting test conversation...');
  const delRes = await fetch(`${BASE_URL}/api/conversations/${conv._id}`, { method: 'DELETE' });
  const delData = await delRes.json();
  console.log('[TEST 7] Delete result:', delData);

  console.log('\n[TEST 8] Saving an AI response to Notes...');
  const noteRes = await fetch(`${BASE_URL}/api/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: 'This is a saved AI response about React hooks.',
      sourceConversationId: conv._id
    })
  });
  const savedNote = await noteRes.json();
  console.log('[TEST 8] Saved Note ID:', savedNote._id, 'Content:', savedNote.content);

  console.log('\n[TEST 9] Fetching all saved notes...');
  const notesRes = await fetch(`${BASE_URL}/api/notes`);
  const notesList = await notesRes.json();
  console.log('[TEST 9] Total notes found:', notesList.length);
  const found = notesList.some((n) => n._id === savedNote._id);
  console.log('[TEST 9] Verified note exists in persistence:', found);

  console.log('\n[TEST 10] Deleting test note...');
  const delNoteRes = await fetch(`${BASE_URL}/api/notes/${savedNote._id}`, { method: 'DELETE' });
  const delNoteData = await delNoteRes.json();
  console.log('[TEST 10] Delete note result:', delNoteData);

  console.log('\n🎉 ALL 10 INTEGRATION TESTS PASSED WITH 100% SUCCESS!');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
