const ACCESS_TOKEN_KEY = 'ewap_access_token';

export type JwtPayload = {
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

  const token =
    window.localStorage.getItem(ACCESS_TOKEN_KEY);

  if (!token) {
    return null;
  }

  const payload = decodeAccessToken(token);

  if (!payload) {
    clearAccessToken();
    return null;
  }

  if (
    payload.exp &&
    payload.exp * 1000 <= Date.now()
  ) {
    clearAccessToken();
    return null;
  }

  return token;
}

export function setAccessToken(
  token: string,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    ACCESS_TOKEN_KEY,
    token,
  );
}

export function clearAccessToken(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(
    ACCESS_TOKEN_KEY,
  );
}

export function getCurrentUser(): JwtPayload | null {
  const token = getAccessToken();

  if (!token) {
    return null;
  }

  return decodeAccessToken(token);
}

export function getOrganizationId():
  | string
  | null {
  return (
    getCurrentUser()?.organizationId ?? null
  );
}

export function isAuthenticated(): boolean {
  return getAccessToken() !== null;
}

function decodeAccessToken(
  token: string,
): JwtPayload | null {
  try {
    const [, payload] = token.split('.');

    if (!payload) {
      return null;
    }

    const base64 = payload
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const paddedBase64 = base64.padEnd(
      Math.ceil(base64.length / 4) * 4,
      '=',
    );

    const decodedPayload = decodeURIComponent(
      atob(paddedBase64)
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

    return JSON.parse(
      decodedPayload,
    ) as JwtPayload;
  } catch {
    return null;
  }
}