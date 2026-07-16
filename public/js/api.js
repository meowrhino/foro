// wrapper de fetch: header csrf en todo, errores como { error }

export async function api(path, opts = {}) {
  const res = await fetch("/api" + path, {
    ...opts,
    headers: { "x-foro-csrf": "1", ...(opts.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `error ${res.status}`);
  return data;
}

export const post = (path, body) =>
  api(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

export const postForm = (path, formData) =>
  api(path, { method: "POST", body: formData });
