import { API_BASE_URL } from '../constants';
import { getAccessToken } from '../auth/auth';

type ApiRequestOptions = RequestInit & {
  authenticated?: boolean;
};

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { authenticated = true, headers, ...requestOptions } = options;

  const requestHeaders = new Headers(headers);

  requestHeaders.set('Content-Type', 'application/json');

  if (authenticated) {
    const accessToken = getAccessToken();

    if (accessToken) {
      requestHeaders.set(
        'Authorization',
        `Bearer ${accessToken}`,
      );
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...requestOptions,
    headers: requestHeaders,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}