// sesión de admin: cookie firmada con HMAC (patrón twoitter, simplificado)

const COOKIE = "foro_session";
const MAX_AGE_S = 30 * 24 * 3600;

const enc = new TextEncoder();
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

async function hmacHex(data, secret) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function cookieHeader(value, maxAge, secure) {
  return `${COOKIE}=${value}; HttpOnly;${secure ? " Secure;" : ""} SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export async function login(request, env) {
  if (!env.ADMIN_PASSWORD || !env.AUTH_SECRET) {
    return json({ error: "falten secrets (ADMIN_PASSWORD / AUTH_SECRET)" }, 500);
  }
  const { user, password } = await request.json().catch(() => ({}));
  if (env.ADMIN_USER && user !== env.ADMIN_USER) return json({ error: "credencials incorrectes" }, 401);
  if (password !== env.ADMIN_PASSWORD) return json({ error: "credencials incorrectes" }, 401);

  const ts = String(Date.now());
  const sig = await hmacHex(ts, env.AUTH_SECRET);
  const secure = new URL(request.url).protocol === "https:";
  return json({ ok: true }, 200, { "set-cookie": cookieHeader(`${ts}.${sig}`, MAX_AGE_S, secure) });
}

export function logout(request) {
  const secure = new URL(request.url).protocol === "https:";
  return json({ ok: true }, 200, { "set-cookie": cookieHeader("", 0, secure) });
}

export async function isAdmin(request, env) {
  if (!env.AUTH_SECRET) return false;
  const m = (request.headers.get("cookie") || "").match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [ts, sig] = m[1].split(".");
  if (!ts || !sig) return false;
  if (Date.now() - Number(ts) > MAX_AGE_S * 1000) return false;
  return (await hmacHex(ts, env.AUTH_SECRET)) === sig;
}

// ── votante anónimo (encuestas): cookie firmada con un uuid, patrón twoitter ──

const VOTER_COOKIE = "foro_voter";
const VOTER_AGE_S = 365 * 24 * 3600;

// devuelve { id, setCookie? }: setCookie solo si la cookie es nueva o inválida
export async function getVoter(request, env) {
  const m = (request.headers.get("cookie") || "").match(new RegExp(`${VOTER_COOKIE}=([^;]+)`));
  if (m) {
    const [id, sig] = m[1].split(".");
    if (id && sig && (await hmacHex(id, env.AUTH_SECRET)) === sig) return { id };
  }
  const id = crypto.randomUUID();
  const sig = await hmacHex(id, env.AUTH_SECRET);
  const secure = new URL(request.url).protocol === "https:";
  return {
    id,
    setCookie: `${VOTER_COOKIE}=${id}.${sig}; HttpOnly;${secure ? " Secure;" : ""} SameSite=Lax; Path=/; Max-Age=${VOTER_AGE_S}`,
  };
}
