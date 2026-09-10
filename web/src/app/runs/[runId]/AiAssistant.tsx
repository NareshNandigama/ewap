'use client';

import { useState } from 'react';

type AiAssistantProps = {
  runId: string;
};
type AiMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export default function AiAssistant({
  runId,
}: AiAssistantProps) {
    const [aiQuestion, setAiQuestion] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [messages, setMessages] = useState<AiMessage[]>([]);


    const askAi = async () => {
        const question = aiQuestion.trim();

        if (!question) {
            return;
        }

        setIsAiLoading(true);

        // Add user message
        setMessages((current) => [
            ...current,
            {
            role: 'user',
            content: question,
            },
        ]);

        setAiQuestion('');

        try {
            const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/v1/ai/ask`,
            {
                method: 'POST',
                headers: {
                'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                question: `${question}\n\nWorkflow Run ${runId}`,
                }),
            },
            );

            if (!response.ok) {
            throw new Error('AI request failed');
            }

            const data = await response.json();

            const answer = data.answer ?? data.response ?? '';

            // Add AI message
            setMessages((current) => [
            ...current,
            {
                role: 'assistant',
                content: answer,
            },
            ]);
        } catch (error) {
            console.error('❌ AI request failed:', error);

            setMessages((current) => [
            ...current,
            {
                role: 'assistant',
                content: 'Unable to get an AI response.',
            },
            ]);
        } finally {
            setIsAiLoading(false);
        }
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
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 transition hover:border-slate-400 hover:bg-slate-50"
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
          placeholder="Why did this workflow fail?"
          className="flex-1 rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
        />

        <button
          type="button"
          onClick={askAi}
          disabled={isAiLoading}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {isAiLoading ? 'Thinking...' : 'Send'}
        </button>
      </div>

      {messages.length > 0 && (
        <div className="mb-5 space-y-4">
            {messages.map((message, index) => (
            <div
                key={`${message.role}-${index}`}
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