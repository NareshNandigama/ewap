'use client';

import { useRef, useState } from 'react';

type AiAssistantProps = {
  runId: string;
};

type AiMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

export default function AiAssistant({
  runId,
}: AiAssistantProps) {
  const [aiQuestion, setAiQuestion] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [messages, setMessages] = useState<AiMessage[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);

  const askAi = async () => {
    const question = aiQuestion.trim();

    if (!question || isAiLoading) {
      return;
    }

    setIsAiLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const userMessageId = crypto.randomUUID();
    const assistantMessageId = crypto.randomUUID();

    // Add user message and empty assistant message together.
    setMessages((current) => [
      ...current,
      {
        id: userMessageId,
        role: 'user',
        content: question,
      },
      {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
      },
    ]);

    setAiQuestion('');

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/v1/ai/ask/stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            question: `${question}\n\nWorkflow Run ${runId}`,
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new Error('AI request failed');
      }

      if (!response.body) {
        throw new Error('Response body is not readable');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let assistantAnswer = '';

      while (true) {
        const { value, done } = await reader.read();

        if (done) {
          break;
        }

        const chunk = decoder.decode(value, {
          stream: true,
        });

        assistantAnswer += chunk;

        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  content: assistantAnswer,
                }
              : message,
          ),
        );
      }

      // Flush any remaining bytes held by the decoder.
      const remainingChunk = decoder.decode();

      if (remainingChunk) {
        assistantAnswer += remainingChunk;

        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  content: assistantAnswer,
                }
              : message,
          ),
        );
      }
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === 'AbortError'
      ) {
        console.log('🛑 AI generation stopped');
        return;
      }

      console.error('❌ AI request failed:', error);

      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                content: 'Unable to get an AI response.',
              }
            : message,
        ),
      );
    } finally {
      abortControllerRef.current = null;
      setIsAiLoading(false);
    }
  };

  const stopAi = () => {
    abortControllerRef.current?.abort();
  };

  return (
    <div className="mt-6 border-t border-slate-200 pt-6">
      <div className="mb-5">
        <p className="mb-3 text-sm font-medium text-slate-700">
          What would you like to investigate?
        </p>

        <div className="flex flex-wrap gap-2">
          {[
            'Why did this workflow fail?',
            'What was the root cause?',
            'Which step caused the issue?',
            'How can I fix this?',
          ].map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => setAiQuestion(question)}
              disabled={isAiLoading}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {question}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <input
          type="text"
          value={aiQuestion}
          onChange={(event) => setAiQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !isAiLoading) {
              askAi();
            }
          }}
          disabled={isAiLoading}
          placeholder="Why did this workflow fail?"
          className="flex-1 rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500 disabled:bg-slate-100"
        />

        <button
          type="button"
          onClick={isAiLoading ? stopAi : askAi}
          disabled={!isAiLoading && !aiQuestion.trim()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isAiLoading ? 'Stop' : 'Send'}
        </button>
      </div>

      {messages.length > 0 && (
        <div className="mb-5 mt-5 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={
                message.role === 'user'
                  ? 'rounded-lg bg-slate-100 p-4'
                  : 'rounded-lg border border-slate-100 bg-slate-50 p-4'
              }
            >
              <div className="mb-2 text-sm font-semibold text-slate-700">
                {message.role === 'user'
                  ? 'You'
                  : '🤖 AI Engineering Assistant'}
              </div>

              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {message.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}