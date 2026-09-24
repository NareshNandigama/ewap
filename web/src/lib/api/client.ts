import { API_BASE_URL } from '../constants';
import {
  clearAccessToken,
  getAccessToken,
} from '../auth/auth';

type ApiRequestOptions = RequestInit & {
  authenticated?: boolean;
};

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const {
    authenticated = true,
    headers,
    ...requestOptions
  } = options;

  const requestHeaders = new Headers(
    headers,
  );

  requestHeaders.set(
    'Content-Type',
    'application/json',
  );

  if (authenticated) {
    const accessToken = getAccessToken();

    if (!accessToken) {
      redirectToLogin();
      throw new Error(
        'Authentication required',
      );
    }

    requestHeaders.set(
      'Authorization',
      `Bearer ${accessToken}`,
    );
  }

  const response = await fetch(
    `${API_BASE_URL}${path}`,
    {
      ...requestOptions,
      headers: requestHeaders,
    },
  );

  if (
    authenticated &&
    response.status === 401
  ) {
    clearAccessToken();
    redirectToLogin();

    throw new Error(
      'Your session has expired',
    );
  }

  if (!response.ok) {
    throw new Error(
      `API request failed: ${response.status}`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();

  if (!text.trim()) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

function redirectToLogin(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const currentPath = `${window.location.pathname}${window.location.search}`;

  if (
    window.location.pathname === '/login'
  ) {
    return;
  }

  const returnTo =
    encodeURIComponent(currentPath);

  window.location.replace(
    `/login?returnTo=${returnTo}`,
  );
}