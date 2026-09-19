/**
 * Robust, timeout-protected API request helper for Better Ajo frontend.
 * Ensures no async request can hang in an endless loading state.
 */
export async function apiRequest<T = any>(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 10000
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });

    clearTimeout(timeoutId);

    const contentType = res.headers.get('content-type');
    let data: any;
    if (contentType && contentType.includes('application/json')) {
      data = await res.json();
    } else {
      const text = await res.text();
      data = { message: text };
    }

    if (!res.ok) {
      const errorMsg = data?.error || data?.message || `Request failed with status ${res.status}`;
      const err: any = new Error(errorMsg);
      err.status = res.status;
      err.data = data;
      err.retryable = Boolean(data?.retryable);
      err.paymentVerified = Boolean(data?.paymentVerified);
      err.syncPending = Boolean(data?.syncPending);
      throw err;
    }

    return data as T;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Connection timed out. Please check your network connection and retry.');
    }
    throw err;
  }
}
