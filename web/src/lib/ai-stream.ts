// Text is provisional until the server reports a persisted COMPLETED state.
export async function readAiStream(
  response: Response,
  onText: (text: string) => void,
  onConversation: (id: string) => void,
) {
  if (!response.body) throw new Error('Response body is not readable');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '',
    answer = '',
    terminal = false;
  try {
    while (true) {
      const result = await reader.read();
      buffer += result.done
        ? decoder.decode()
        : decoder.decode(result.value, { stream: true });
      if (buffer.length > 65536) throw new Error('AI stream frame too large');
      let end: number;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const lines = frame.split('\n');
        const event = lines
          .find((line) => line.startsWith('event: '))
          ?.slice(7);
        const data = JSON.parse(
          lines.find((line) => line.startsWith('data: '))?.slice(6) ?? '{}',
        );
        if (terminal) throw new Error('Unexpected data after terminal state');
        if (event === 'conversation' && typeof data.conversationId === 'string')
          onConversation(data.conversationId);
        if (event === 'delta' && typeof data.text === 'string') {
          answer += data.text;
          onText(answer);
        }
        if (event === 'terminal') {
          if (data.state !== 'COMPLETED')
            throw new Error('AI response did not complete');
          terminal = true;
        }
      }
      if (result.done) break;
    }
    if (!terminal || buffer.trim())
      throw new Error('AI response ended before completion');
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
