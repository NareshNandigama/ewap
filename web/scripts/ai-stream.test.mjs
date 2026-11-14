import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readAiStream } from '../src/lib/ai-stream.ts';
function response(text) {
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream({
      start(controller) {
        // Exercise framing and multi-byte Unicode across arbitrary transport boundaries.
        for (let index = 0; index < bytes.length; index += 3)
          controller.enqueue(bytes.slice(index, index + 3));
        controller.close();
      },
    }),
  );
}
test('reads fragmented SSE and requires explicit completion', async () => {
  let answer, conversation;
  await readAiStream(
    response(
      'event: conversation\ndata: {"conversationId":"c"}\n\nevent: delta\ndata: {"text":"hello 🌏"}\n\nevent: terminal\ndata: {"state":"COMPLETED"}\n\n',
    ),
    (text) => {
      answer = text;
    },
    (id) => {
      conversation = id;
    },
  );
  assert.equal(answer, 'hello 🌏');
  assert.equal(conversation, 'c');
});
test('does not treat clean EOF or failed terminal states as success', async () => {
  await assert.rejects(
    readAiStream(
      response('event: delta\ndata: {"text":"partial"}\n\n'),
      () => {},
      () => {},
    ),
    /before completion/,
  );
  await assert.rejects(
    readAiStream(
      response('event: terminal\ndata: {"state":"FAILED"}\n\n'),
      () => {},
      () => {},
    ),
    /did not complete/,
  );
});
