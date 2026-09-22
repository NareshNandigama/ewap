import { NextRequest } from 'next/server';

const EWAP_API_URL = process.env.EWAP_API_URL;

type RouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

async function proxyRequest(
  request: NextRequest,
  context: RouteContext,
) {
  if (!EWAP_API_URL) {
    return Response.json(
      {
        message: 'EWAP_API_URL is not configured',
      },
      {
        status: 500,
      },
    );
  }

  const { path } = await context.params;

  const backendUrl = new URL(
    `/api/v1/${path.join('/')}`,
    EWAP_API_URL,
  );

  // Preserve query parameters:
  // /api/v1/ai/conversations?workflowRunId=123
  backendUrl.search = request.nextUrl.search;

  const headers = new Headers();

  const contentType =
    request.headers.get('content-type');

  const authorization =
    request.headers.get('authorization');

  if (contentType) {
    headers.set('content-type', contentType);
  }

  if (authorization) {
    headers.set('authorization', authorization);
  }

  const hasBody =
    request.method !== 'GET' &&
    request.method !== 'HEAD';

  const response = await fetch(backendUrl, {
    method: request.method,
    headers,
    body: hasBody
      ? await request.arrayBuffer()
      : undefined,
    cache: 'no-store',
  });

  const responseHeaders = new Headers();

  const responseContentType =
    response.headers.get('content-type');

  if (responseContentType) {
    responseHeaders.set(
      'content-type',
      responseContentType,
    );
  }

  // AI streaming returns the conversation ID
  // through this response header.
  const conversationId =
    response.headers.get('x-conversation-id');

  if (conversationId) {
    responseHeaders.set(
      'x-conversation-id',
      conversationId,
    );
  }

  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;