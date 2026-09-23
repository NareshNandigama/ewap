const ACCESS_TOKEN_KEY = 'ewap_access_token';

type JwtPayload = {
  sub: string;
  email: string;
  organizationId: string;
  role: string;
  iat?: number;
  exp?: number;
};

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
}

export function getCurrentUser(): JwtPayload | null {
  const token = getAccessToken();

  if (!token) {
    return null;
  }

  try {
    const [, payload] = token.split('.');

    if (!payload) {
      return null;
    }

    const base64 = payload
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const decodedPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(
          (character) =>
            `%${character
              .charCodeAt(0)
              .toString(16)
              .padStart(2, '0')}`,
        )
        .join(''),
    );

    return JSON.parse(decodedPayload) as JwtPayload;
  } catch {
    return null;
  }
}

export function getOrganizationId(): string | null {
  return getCurrentUser()?.organizationId ?? null;
}