// foro — api rest sobre cloudflare workers (vanilla, sin dependencias)
// preguntas del admin + respuestas anónimas con moderación.

import CONFIG from "../public/config.json";
import { login, logout, isAdmin, getVoter } from "./auth.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

const IMAGE_TYPES = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
};

// nombre de tabla con prefijo configurable (db compartida estilo shop/tatara)
const t = (env, name) => `${env.TABLE_PREFIX || "foro_"}${name}`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) return await api(request, env, url);
      if (url.pathname.startsWith("/r2/")) return await serveMedia(env, url.pathname.slice(4));
      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error(err.stack || err);
      return json({ error: "error intern" }, 500);
    }
  },

  // cron semanal (patrón arxiu): vuelca las tablas foro_* a r2 y, si hay
  // GITHUB_TOKEN + BACKUP_REPO, también al repo github.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(backup(env));
  },
};

async function api(request, env, url) {
  const path = url.pathname.slice(4); // sin "/api"
  const { method } = request;

  // csrf ligero: todo POST exige un header propio (no lo manda un <form> cross-site)
  if (method === "POST" && !request.headers.get("x-foro-csrf")) {
    return json({ error: "falta header csrf" }, 403);
  }

  if (method === "POST" && path === "/login") return login(request, env);
  if (method === "POST" && path === "/logout") return logout(request);
  if (method === "GET" && path === "/me") return json({ admin: await isAdmin(request, env) });

  if (path === "/questions" && method === "GET") return listQuestions(env);
  if (path === "/questions" && method === "POST") return withAdmin(request, env, createQuestion);

  let m;
  if ((m = path.match(/^\/questions\/([\w-]+)$/)) && method === "GET") {
    return getQuestion(request, env, m[1]);
  }
  if ((m = path.match(/^\/questions\/([\w-]+)\/replies$/)) && method === "POST") {
    return createReply(request, env, m[1]);
  }
  if ((m = path.match(/^\/questions\/([\w-]+)\/vote$/)) && method === "POST") {
    return vote(request, env, m[1]);
  }
  if ((m = path.match(/^\/questions\/([\w-]+)\/update$/)) && method === "POST") {
    const id = m[1];
    return withAdmin(request, env, (req, e) => updateQuestion(req, e, id));
  }

  if (path === "/moderation" && method === "GET") return withAdmin(request, env, moderationList);
  if (path === "/moderate" && method === "POST") return withAdmin(request, env, moderate);
  if (path === "/replies" && method === "GET") return withAdmin(request, env, latestReplies);
  if (path === "/export" && method === "GET") return withAdmin(request, env, exportAll);

  return json({ error: "no existeix" }, 404);
}

async function withAdmin(request, env, handler) {
  if (!(await isAdmin(request, env))) return json({ error: "no autoritzat" }, 401);
  return handler(request, env);
}

// ── preguntas ────────────────────────────────────────────────────────────────

async function listQuestions(env) {
  const { results } = await env.DB.prepare(
    `SELECT q.id, q.title, q.body, q.color, q.pinned, q.created_at, q.closed_at,
            (SELECT COUNT(*) FROM ${t(env, "replies")} r
              WHERE r.question_id = q.id AND r.status = 'ok') AS reply_count
       FROM ${t(env, "questions")} q
      ORDER BY q.pinned DESC, q.created_at DESC`
  ).all();
  return json({ questions: results });
}

async function createQuestion(request, env) {
  const { title = "", body = "", color = 0, options = [] } = await request.json().catch(() => ({}));
  if (!title.trim()) return json({ error: "falta títol" }, 422);

  const opts = (Array.isArray(options) ? options : [])
    .map((o) => String(o).trim().slice(0, 120))
    .filter(Boolean);
  if (opts.length === 1 || opts.length > 10) return json({ error: "enquesta: entre 2 i 10 opcions" }, 422);

  const id = crypto.randomUUID().slice(0, 8);
  await env.DB.prepare(
    `INSERT INTO ${t(env, "questions")} (id, title, body, color) VALUES (?, ?, ?, ?)`
  ).bind(id, title.trim().slice(0, 200), String(body).trim().slice(0, 4000), Number(color) || 0).run();

  for (let i = 0; i < opts.length; i++) {
    await env.DB.prepare(
      `INSERT INTO ${t(env, "poll_options")} (question_id, idx, text) VALUES (?, ?, ?)`
    ).bind(id, i, opts[i]).run();
  }
  return json({ id }, 201);
}

async function updateQuestion(request, env, id) {
  const { action } = await request.json().catch(() => ({}));
  const sqlByAction = {
    close: `closed_at = datetime('now')`,
    reopen: `closed_at = NULL`,
    pin: `pinned = 1`,
    unpin: `pinned = 0`,
  };
  if (!sqlByAction[action]) return json({ error: "acció desconeguda" }, 422);
  const { meta } = await env.DB.prepare(
    `UPDATE ${t(env, "questions")} SET ${sqlByAction[action]} WHERE id = ?`
  ).bind(id).run();
  if (!meta.changes) return json({ error: "no existeix" }, 404);
  return json({ ok: true });
}

async function getQuestion(request, env, id) {
  const question = await env.DB.prepare(
    `SELECT * FROM ${t(env, "questions")} WHERE id = ?`
  ).bind(id).first();
  if (!question) return json({ error: "no existeix" }, 404);

  const admin = await isAdmin(request, env);
  const statusFilter = admin ? `r.status IN ('ok', 'pending')` : `r.status = 'ok'`;
  const { results: replies } = await env.DB.prepare(
    `SELECT r.id, r.num, r.alias, r.trip, r.body, r.status, r.created_at
       FROM ${t(env, "replies")} r
      WHERE r.question_id = ? AND ${statusFilter}
      ORDER BY r.num ASC`
  ).bind(id).all();

  await attachMedia(env, replies);
  const poll = await getPoll(request, env, id);
  return json({ question, replies, admin, poll });
}

// ── encuestas ────────────────────────────────────────────────────────────────

async function getPoll(request, env, questionId) {
  const { results: options } = await env.DB.prepare(
    `SELECT o.idx, o.text,
            (SELECT COUNT(*) FROM ${t(env, "poll_votes")} v
              WHERE v.question_id = o.question_id AND v.option_idx = o.idx) AS votes
       FROM ${t(env, "poll_options")} o
      WHERE o.question_id = ?
      ORDER BY o.idx ASC`
  ).bind(questionId).all();
  if (!options.length) return null;

  const voter = await getVoter(request, env);
  let myVote = null;
  if (!voter.setCookie) {
    const row = await env.DB.prepare(
      `SELECT option_idx FROM ${t(env, "poll_votes")} WHERE question_id = ? AND voter_id = ?`
    ).bind(questionId, voter.id).first();
    if (row) myVote = row.option_idx;
  }
  return { options, myVote, total: options.reduce((s, o) => s + o.votes, 0) };
}

async function vote(request, env, questionId) {
  const question = await env.DB.prepare(
    `SELECT id, closed_at FROM ${t(env, "questions")} WHERE id = ?`
  ).bind(questionId).first();
  if (!question) return json({ error: "no existeix" }, 404);
  if (question.closed_at) return json({ error: "pregunta tancada" }, 409);

  const { idx } = await request.json().catch(() => ({}));
  const option = await env.DB.prepare(
    `SELECT idx FROM ${t(env, "poll_options")} WHERE question_id = ? AND idx = ?`
  ).bind(questionId, Number(idx)).first();
  if (!option) return json({ error: "opció desconeguda" }, 422);

  const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";
  if (env.WRITE_LIMITER) {
    const { success } = await env.WRITE_LIMITER.limit({ key: ip });
    if (!success) return json({ error: "massa ràpid — espera un moment" }, 429);
  }

  const voter = await getVoter(request, env);
  const { meta } = await env.DB.prepare(
    `INSERT OR IGNORE INTO ${t(env, "poll_votes")} (question_id, voter_id, option_idx) VALUES (?, ?, ?)`
  ).bind(questionId, voter.id, Number(idx)).run();

  const headers = { "content-type": "application/json" };
  if (voter.setCookie) headers["set-cookie"] = voter.setCookie;
  const body = meta.changes ? { ok: true, idx: Number(idx) } : { error: "ja has votat" };
  return new Response(JSON.stringify(body), { status: meta.changes ? 200 : 409, headers });
}

// ── respuestas ───────────────────────────────────────────────────────────────

async function createReply(request, env, questionId) {
  const question = await env.DB.prepare(
    `SELECT id, closed_at FROM ${t(env, "questions")} WHERE id = ?`
  ).bind(questionId).first();
  if (!question) return json({ error: "no existeix" }, 404);
  if (question.closed_at) return json({ error: "pregunta tancada" }, 409);

  const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";
  if (env.WRITE_LIMITER) {
    const { success } = await env.WRITE_LIMITER.limit({ key: ip });
    if (!success) return json({ error: "massa ràpid — espera un moment" }, 429);
  }

  const form = await request.formData();
  let alias = String(form.get("alias") || "").replace(/\s+/g, " ").trim().slice(0, 40) || null;
  const body = String(form.get("body") || "").trim().slice(0, 4000);

  // tripcode: "nom#clau" → alias "nom" + firma !hash reproducible sin cuenta.
  // quien conoce la clau puede firmar igual en cualquier hilo; nadie puede suplantarla.
  let trip = null;
  if (alias && alias.includes("#")) {
    const [name, ...rest] = alias.split("#");
    const secret = rest.join("#").trim();
    alias = name.trim() || null;
    if (secret) trip = "!" + (await sha256Hex(`trip:${secret}:${env.AUTH_SECRET || ""}`)).slice(0, 6);
  }
  const files = form.getAll("files").filter((f) => f instanceof File && f.size > 0);

  const mediaCfg = CONFIG.media || {};
  const maxFiles = mediaCfg.maxImagesPerReply ?? 4;
  const maxBytes = (mediaCfg.maxImageMB ?? 4) * 1024 * 1024;

  if (!body && !files.length) return json({ error: "resposta buida" }, 422);
  if (files.length && !mediaCfg.images) return json({ error: "no s'accepten imatges" }, 422);
  if (files.length > maxFiles) return json({ error: `màxim ${maxFiles} imatges` }, 422);
  for (const f of files) {
    if (!IMAGE_TYPES[f.type]) return json({ error: `tipus no acceptat: ${f.type}` }, 415);
    if (f.size > maxBytes) return json({ error: "imatge massa gran" }, 413);
  }

  const id = crypto.randomUUID().slice(0, 8);
  const status = CONFIG.moderationQueue ? "pending" : "ok";
  const ipHash = (await sha256Hex(ip + (env.AUTH_SECRET || ""))).slice(0, 16);

  const { num } = await env.DB.prepare(
    `SELECT COALESCE(MAX(num), 0) + 1 AS num FROM ${t(env, "replies")} WHERE question_id = ?`
  ).bind(questionId).first();

  await env.DB.prepare(
    `INSERT INTO ${t(env, "replies")} (id, question_id, num, alias, trip, body, status, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, questionId, num, alias, trip, body, status, ipHash).run();

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const key = `m/${id}/${i}.${IMAGE_TYPES[f.type]}`;
    await env.MEDIA.put(key, f.stream(), { httpMetadata: { contentType: f.type } });
    await env.DB.prepare(
      `INSERT INTO ${t(env, "media")} (id, reply_id, r2_key, kind, size, original_name)
       VALUES (?, ?, ?, 'image', ?, ?)`
    ).bind(crypto.randomUUID().slice(0, 8), id, key, f.size, f.name || null).run();
  }

  return json({ id, num, status }, 201);
}

// ── moderación ───────────────────────────────────────────────────────────────

async function moderationList(request, env) {
  const { results } = await env.DB.prepare(
    `SELECT r.id, r.num, r.alias, r.trip, r.body, r.created_at, r.question_id,
            q.title AS question_title
       FROM ${t(env, "replies")} r
       JOIN ${t(env, "questions")} q ON q.id = r.question_id
      WHERE r.status = 'pending'
      ORDER BY r.created_at ASC`
  ).all();
  await attachMedia(env, results);
  return json({ pending: results });
}

async function moderate(request, env) {
  const { id, action } = await request.json().catch(() => ({}));
  const statusByAction = { approve: "ok", reject: "rejected", delete: "deleted" };
  if (!statusByAction[action]) return json({ error: "acció desconeguda" }, 422);

  const reply = await env.DB.prepare(
    `SELECT id FROM ${t(env, "replies")} WHERE id = ?`
  ).bind(id).first();
  if (!reply) return json({ error: "no existeix" }, 404);

  await env.DB.prepare(
    `UPDATE ${t(env, "replies")} SET status = ? WHERE id = ?`
  ).bind(statusByAction[action], id).run();

  // rejected/deleted: fuera del bucket, que no acumule
  if (action === "reject" || action === "delete") {
    const { results } = await env.DB.prepare(
      `SELECT r2_key FROM ${t(env, "media")} WHERE reply_id = ?`
    ).bind(id).all();
    for (const m of results) await env.MEDIA.delete(m.r2_key);
    await env.DB.prepare(`DELETE FROM ${t(env, "media")} WHERE reply_id = ?`).bind(id).run();
  }

  return json({ ok: true });
}

// ── backup ───────────────────────────────────────────────────────────────────

async function dumpTables(env) {
  const dump = {};
  for (const name of ["questions", "replies", "media", "poll_options", "poll_votes"]) {
    const { results } = await env.DB.prepare(`SELECT * FROM ${t(env, name)}`).all();
    dump[name] = results;
  }
  return dump;
}

// backup manual: json completo de las tablas del foro (admin)
async function exportAll(request, env) {
  const dump = await dumpTables(env);
  return new Response(JSON.stringify(dump, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="foro-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}

// cron: vuelca el índice a r2 siempre; si hay GITHUB_TOKEN + BACKUP_REPO
// ("owner/repo"), lo commitea también como data.json (patrón arxiu)
async function backup(env) {
  try {
    const body = JSON.stringify(await dumpTables(env), null, 2);
    const stamp = new Date().toISOString().slice(0, 10);
    await env.MEDIA.put(`backup/foro-${stamp}.json`, body, {
      httpMetadata: { contentType: "application/json" },
    });

    if (!env.GITHUB_TOKEN || !env.BACKUP_REPO) return;
    const apiUrl = `https://api.github.com/repos/${env.BACKUP_REPO}/contents/data.json`;
    const headers = {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "user-agent": "foro-backup",
      accept: "application/vnd.github+json",
    };
    const existing = await fetch(apiUrl, { headers });
    const sha = existing.ok ? (await existing.json()).sha : undefined;
    const res = await fetch(apiUrl, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: `backup ${stamp}`,
        content: btoa(unescape(encodeURIComponent(body))), // base64 utf-8
        ...(sha ? { sha } : {}),
      }),
    });
    if (!res.ok) console.error("backup github:", res.status, await res.text());
  } catch (err) {
    console.error("backup:", err.stack || err);
  }
}

// ── media ────────────────────────────────────────────────────────────────────

async function attachMedia(env, replies) {
  for (const r of replies) r.media = [];
  if (!replies.length) return;
  // troceado por el límite de parámetros de d1 (patrón twoitter)
  for (let i = 0; i < replies.length; i += 50) {
    const chunk = replies.slice(i, i + 50);
    const placeholders = chunk.map(() => "?").join(",");
    const { results } = await env.DB.prepare(
      `SELECT reply_id, r2_key, kind FROM ${t(env, "media")} WHERE reply_id IN (${placeholders})`
    ).bind(...chunk.map((r) => r.id)).all();
    const byId = Object.fromEntries(chunk.map((r) => [r.id, r]));
    for (const m of results) byId[m.reply_id]?.media.push(m);
  }
}

async function serveMedia(env, key) {
  const obj = await env.MEDIA.get(key);
  if (!obj) return new Response("no existeix", { status: 404 });
  return new Response(obj.body, {
    headers: {
      "content-type": obj.httpMetadata?.contentType || "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}

async function sha256Hex(s) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
