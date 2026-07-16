// foro — panel de admin: login, crear preguntas, cola de moderación

import { api, post } from "./api.js";

const root = document.getElementById("admin");
let CFG;

init();

async function init() {
  CFG = await (await fetch("/config.json")).json();
  document.getElementById("site-name").textContent = CFG.name;
  const { admin } = await api("/me");
  admin ? renderPanel() : renderLogin();
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}
const pad = (n) => String(n).padStart(3, "0");

function renderLogin() {
  root.innerHTML = `<form id="login" class="composer" style="max-width:420px">
    <span class="meta">entrar</span>
    <input name="user" placeholder="usuari" autocomplete="username" autofocus>
    <input type="password" name="password" placeholder="contrasenya" autocomplete="current-password">
    <div class="composer-row"><button class="btn">entrar</button></div>
    <p class="meta" id="login-status"></p>
  </form>`;
  document.getElementById("login").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await post("/login", { user: e.target.user.value.trim(), password: e.target.password.value });
      renderPanel();
    } catch (err) {
      document.getElementById("login-status").textContent = err.message;
    }
  };
}

async function renderPanel() {
  const [{ pending }, { questions }] = await Promise.all([api("/moderation"), api("/questions")]);
  root.innerHTML = `
    <section>
      <h2 class="mono-title">nova pregunta</h2>
      <form id="new-q" class="composer" style="border-top:none;margin-top:0;padding-top:0">
        <input name="title" placeholder="títol" maxlength="200" required>
        <textarea name="body" rows="3" placeholder="text (opcional)"></textarea>
        <textarea name="options" rows="3" placeholder="enquesta (opcional): una opció per línia, 2-10"></textarea>
        <div class="swatches">${CFG.palette.map((c, i) =>
          `<label class="swatch" style="background:${c}"><input type="radio" name="color" value="${i}" ${i === 0 ? "checked" : ""}></label>`).join("")}</div>
        <div class="composer-row">
          <button class="btn">publicar pregunta</button>
          <span class="meta" id="new-q-status"></span>
        </div>
      </form>
    </section>
    <section>
      <h2 class="mono-title">cua de moderació<sup>${pending.length}</sup></h2>
      <div id="queue">${pending.map(renderPending).join("") || `<p class="meta">res pendent ✓</p>`}</div>
    </section>
    <section>
      <h2 class="mono-title">preguntes<sup>${questions.length}</sup></h2>
      ${questions.map(renderQuestionRow).join("") || `<p class="meta">cap pregunta</p>`}
    </section>
    <p style="margin-top:3rem" class="composer-row">
      <a class="btn" href="/api/export" download>descarregar backup (json)</a>
      <button id="logout" class="btn">sortir</button>
    </p>
  `;

  document.getElementById("new-q").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const statusEl = document.getElementById("new-q-status");
    try {
      await post("/questions", {
        title: f.title.value,
        body: f.body.value,
        color: Number(new FormData(f).get("color")),
        options: f.options.value.split("\n").map((s) => s.trim()).filter(Boolean),
      });
      statusEl.textContent = "publicada ✓";
      f.reset();
      setTimeout(renderPanel, 600);
    } catch (err) {
      statusEl.textContent = err.message;
    }
  };

  document.getElementById("logout").onclick = async () => {
    await post("/logout", {});
    renderLogin();
  };

  root.querySelectorAll("[data-action]").forEach((btn) => {
    btn.onclick = async () => {
      btn.disabled = true;
      await post("/moderate", { id: btn.dataset.id, action: btn.dataset.action });
      renderPanel();
    };
  });

  root.querySelectorAll("[data-qaction]").forEach((btn) => {
    btn.onclick = async () => {
      btn.disabled = true;
      await post(`/questions/${btn.dataset.qid}/update`, { action: btn.dataset.qaction });
      renderPanel();
    };
  });
}

function renderQuestionRow(q) {
  return `<div class="q-row">
    <span class="meta">${q.pinned ? "★ " : ""}<a href="/#q=${q.id}">${esc(q.title)}</a><sup>${q.reply_count}</sup>${q.closed_at ? " · tancada" : ""}</span>
    <span class="composer-row">
      <button class="btn btn-xs" data-qaction="${q.closed_at ? "reopen" : "close"}" data-qid="${q.id}">${q.closed_at ? "reobrir" : "tancar"}</button>
      <button class="btn btn-xs" data-qaction="${q.pinned ? "unpin" : "pin"}" data-qid="${q.id}">${q.pinned ? "desfixar" : "fixar"}</button>
    </span>
  </div>`;
}

function renderPending(r) {
  return `<article class="reply">
    <header class="meta">${esc(r.question_title)} · #${pad(r.num)} · ${esc(r.alias || "anònim")}${r.trip ? ` <span class="trip">${esc(r.trip)}</span>` : ""} · ${esc(r.created_at)}</header>
    ${r.body ? `<p>${esc(r.body).replace(/\n/g, "<br>")}</p>` : ""}
    ${r.media.length ? `<div class="media">${r.media.map((m) =>
      `<a href="/r2/${m.r2_key}" target="_blank"><img src="/r2/${m.r2_key}" alt=""></a>`).join("")}</div>` : ""}
    <div class="composer-row" style="margin-top:.75rem">
      <button class="btn" data-action="approve" data-id="${r.id}">aprovar</button>
      <button class="btn" data-action="reject" data-id="${r.id}">rebutjar</button>
    </div>
  </article>`;
}
