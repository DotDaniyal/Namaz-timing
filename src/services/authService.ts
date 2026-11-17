export const ADMIN_TOKEN_KEY = 'masjid_admin_token';

export interface LoginDiagnosticEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warn' | 'error';
  stage: string;
  message: string;
  meta?: Record<string, string | number | boolean | null | undefined>;
}

export interface AuthUrlInfo {
  baseUrl: string;
  source: 'APP_URL' | 'window.location.origin' | 'relative';
  rawConfiguredUrl: string;
  pageOrigin: string;
  pageProtocol: string;
  mixedContentUpgraded: boolean;
  isSameOrigin: boolean;
}

export interface LoginResult {
  ok: boolean;
  status: number;
  username?: string;
  role?: string;
  token?: string;
  error?: string;
}

export function getStoredAdminToken(): string {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredAdminToken(token: string): boolean {
  try {
    if (token) {
      sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    }
    return true;
  } catch {
    return false;
  }
}

export function getAuthUrlInfo(): AuthUrlInfo {
  const rawConfiguredUrl = (
    import.meta.env.VITE_APP_URL ||
    import.meta.env.APP_URL ||
    ''
  ).trim();
  const pageOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const pageProtocol = typeof window !== 'undefined' ? window.location.protocol : 'https:';

  if (rawConfiguredUrl && rawConfiguredUrl !== 'MY_APP_URL') {
    try {
      const hasProtocol = /^https?:\/\//i.test(rawConfiguredUrl);
      const withProtocol = hasProtocol
        ? rawConfiguredUrl
        : `${pageProtocol === 'http:' && /^(localhost|127\.0\.0\.1)/i.test(rawConfiguredUrl) ? 'http://' : 'https://'}${rawConfiguredUrl}`;
      const parsed = new URL(withProtocol);
      let mixedContentUpgraded = false;

      if (
        pageProtocol === 'https:' &&
        parsed.protocol === 'http:' &&
        parsed.hostname !== 'localhost' &&
        parsed.hostname !== '127.0.0.1'
      ) {
        parsed.protocol = 'https:';
        mixedContentUpgraded = true;
      }

      const cleanPath = parsed.pathname.replace(/\/+$/, '');
      const baseUrl = `${parsed.origin}${cleanPath === '/' ? '' : cleanPath}`;

      return {
        baseUrl,
        source: 'APP_URL',
        rawConfiguredUrl,
        pageOrigin,
        pageProtocol,
        mixedContentUpgraded,
        isSameOrigin: !pageOrigin || parsed.origin === pageOrigin,
      };
    } catch {
      // Fall through to window.location.origin if APP_URL is malformed
    }
  }

  if (pageOrigin) {
    return {
      baseUrl: pageOrigin.replace(/\/+$/, ''),
      source: 'window.location.origin',
      rawConfiguredUrl,
      pageOrigin,
      pageProtocol,
      mixedContentUpgraded: false,
      isSameOrigin: true,
    };
  }

  return {
    baseUrl: '',
    source: 'relative',
    rawConfiguredUrl,
    pageOrigin,
    pageProtocol,
    mixedContentUpgraded: false,
    isSameOrigin: true,
  };
}

export function resolveAuthApiUrl(endpointPath: string): string {
  const normalizedPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  const { baseUrl } = getAuthUrlInfo();
  if (!baseUrl) return normalizedPath;
  return `${baseUrl}${normalizedPath}`;
}

export function createDiagnosticEntry(
  level: LoginDiagnosticEntry['level'],
  stage: string,
  message: string,
  meta?: LoginDiagnosticEntry['meta'],
): LoginDiagnosticEntry {
  const entry: LoginDiagnosticEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    level,
    stage,
    message,
    meta,
  };

  const consolePayload = meta ? { stage, message, ...meta } : { stage, message };
  if (level === 'error') {
    console.error('[AdminAuth]', consolePayload);
  } else if (level === 'warn') {
    console.warn('[AdminAuth]', consolePayload);
  } else {
    console.info('[AdminAuth]', consolePayload);
  }

  return entry;
}

export async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = /^https?:\/\//i.test(path) ? path : resolveAuthApiUrl(path);
  const token = getStoredAdminToken();
  const headers = new Headers(init.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(url, { ...init, headers, credentials: 'include' });
}

export async function checkAdminSession(
  onLog?: (entry: LoginDiagnosticEntry) => void,
): Promise<{ authenticated: boolean; username?: string; role?: string }> {
  const urlInfo = getAuthUrlInfo();
  const targetUrl = resolveAuthApiUrl('/api/admin/session');
  const startMs = typeof performance !== 'undefined' ? performance.now() : Date.now();

  onLog?.(
    createDiagnosticEntry('info', 'SESSION_CHECK', 'Checking existing administrator session', {
      targetUrl,
      urlSource: urlInfo.source,
      pageOrigin: urlInfo.pageOrigin,
      hasStoredToken: Boolean(getStoredAdminToken()),
    }),
  );

  try {
    const res = await adminFetch(targetUrl);
    const durationMs = Math.round(
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startMs,
    );
    const data = await res.json();
    onLog?.(
      createDiagnosticEntry(
        data.authenticated ? 'success' : 'info',
        'SESSION_RESULT',
        data.authenticated
          ? `Active session verified (${data.username || 'admin'})`
          : 'No active administrator session',
        { status: res.status, durationMs, authenticated: Boolean(data.authenticated) },
      ),
    );
    return data;
  } catch (err) {
    const durationMs = Math.round(
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startMs,
    );
    onLog?.(
      createDiagnosticEntry('warn', 'SESSION_ERROR', 'Unable to verify existing session', {
        targetUrl,
        durationMs,
        error: (err as Error).message || 'Unknown error',
        online: typeof navigator !== 'undefined' ? navigator.onLine : true,
      }),
    );
    return { authenticated: false };
  }
}

export async function loginAdmin(params: {
  username: string;
  password: string;
  onLog?: (entry: LoginDiagnosticEntry) => void;
}): Promise<LoginResult> {
  const { username, password, onLog } = params;
  const cleanUsername = username.trim();
  const urlInfo = getAuthUrlInfo();
  const targetUrl = resolveAuthApiUrl('/api/admin/login');
  const startMs = typeof performance !== 'undefined' ? performance.now() : Date.now();

  onLog?.(
    createDiagnosticEntry('info', 'URL_RESOLVED', 'Resolved absolute authentication endpoint', {
      targetUrl,
      urlSource: urlInfo.source,
      configuredAppUrl: urlInfo.rawConfiguredUrl || '(unset)',
      pageOrigin: urlInfo.pageOrigin,
      isSameOrigin: urlInfo.isSameOrigin,
      mixedContentUpgraded: urlInfo.mixedContentUpgraded,
    }),
  );

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    onLog?.(
      createDiagnosticEntry('error', 'OFFLINE', 'Browser reports device is offline', {
        online: false,
      }),
    );
    return {
      ok: false,
      status: 0,
      error: 'Your device appears to be offline. Please check your internet connection and retry.',
    };
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15000);

  onLog?.(
    createDiagnosticEntry('info', 'REQUEST_START', 'Sending POST login request', {
      method: 'POST',
      targetUrl,
      credentials: 'include',
      username: cleanUsername,
      online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    }),
  );

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      signal: controller.signal,
      body: JSON.stringify({ username: cleanUsername, password }),
    });

    const durationMs = Math.round(
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startMs,
    );
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();

    onLog?.(
      createDiagnosticEntry(
        res.ok ? 'info' : 'warn',
        'RESPONSE_RECEIVED',
        `Received HTTP ${res.status} ${res.statusText || ''}`.trim(),
        {
          status: res.status,
          contentType: contentType || '(none)',
          bodyBytes: text.length,
          durationMs,
        },
      ),
    );

    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      onLog?.(
        createDiagnosticEntry(
          'error',
          'PARSE_ERROR',
          'Response was not valid JSON (possible gateway or proxy HTML page)',
          {
            status: res.status,
            contentType,
            snippet: text.slice(0, 140),
          },
        ),
      );
      return {
        ok: false,
        status: res.status,
        error: `Server returned status ${res.status} (${contentType || 'non-JSON response'}).`,
      };
    }

    if (!res.ok) {
      const serverErr =
        typeof json.error === 'string' && json.error
          ? json.error
          : `Authentication failed (Status ${res.status})`;
      onLog?.(
        createDiagnosticEntry('error', 'AUTH_REJECTED', serverErr, {
          status: res.status,
          durationMs,
        }),
      );
      return {
        ok: false,
        status: res.status,
        error: serverErr,
      };
    }

    const token = typeof json.token === 'string' ? json.token : '';
    const resolvedUsername =
      typeof json.username === 'string' && json.username ? json.username : cleanUsername;
    const role = typeof json.role === 'string' ? json.role : 'admin';

    const tokenStored = token ? setStoredAdminToken(token) : false;

    onLog?.(
      createDiagnosticEntry('success', 'LOGIN_SUCCESS', 'Administrator authenticated successfully', {
        username: resolvedUsername,
        role,
        hasToken: Boolean(token),
        tokenStored,
        durationMs,
      }),
    );

    return {
      ok: true,
      status: res.status,
      username: resolvedUsername,
      role,
      token,
    };
  } catch (err) {
    const durationMs = Math.round(
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startMs,
    );
    const errorObj = err as Error;
    const isAbort = errorObj?.name === 'AbortError';
    const message = isAbort
      ? 'Login request timed out after 15 seconds on current connection'
      : errorObj?.message || 'Fetch network failure';

    onLog?.(
      createDiagnosticEntry('error', isAbort ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR', message, {
        targetUrl,
        errorName: errorObj?.name || 'Error',
        durationMs,
        online: typeof navigator !== 'undefined' ? navigator.onLine : true,
        isSameOrigin: urlInfo.isSameOrigin,
        pageProtocol: urlInfo.pageProtocol,
      }),
    );

    return {
      ok: false,
      status: 0,
      error: isAbort
        ? 'Connection timed out while signing in. Please check your mobile data or Wi-Fi and try again.'
        : `Network error while connecting to ${urlInfo.baseUrl || '/api/admin/login'} (${message}).`,
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function logoutAdmin(): Promise<void> {
  try {
    await adminFetch('/api/admin/logout', { method: 'POST' });
  } finally {
    setStoredAdminToken('');
  }
}
