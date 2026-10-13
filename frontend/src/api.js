import { useAuth, toast } from './store';

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
  /** First validation message per field, e.g. { title: 'Title is required' }. */
  get fields() {
    return Object.fromEntries(Object.entries(this.details || {}).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  }
}

/**
 * Fetch wrapper: attaches the JWT, serialises query params, parses JSON and throws ApiError.
 * `file` sends a Blob as the raw request body (with its own content type); `as: 'blob'` returns the response as a Blob.
 */
export async function api(path, { method = 'GET', body, params, file, as } = {}) {
  const query = params ? new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString() : '';
  const token = useAuth.getState().token;
  let res;
  try {
    res = await fetch(`/api${path}${query ? `?${query}` : ''}`, {
      method,
      headers: {
        ...(file ? { 'Content-Type': file.type || 'application/octet-stream' } : body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: file || (body ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check that the API is running and try again.");
  }
  if (res.status === 401 && token && !path.startsWith('/auth/password')) {
    useAuth.getState().logout();
    toast('Your session has expired. Sign in again.', 'info');
  }
  if (res.status === 204) return null;
  if (as === 'blob' && res.ok) return res.blob();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || 'Something went wrong. Try again.', data.details);
  return data;
}
