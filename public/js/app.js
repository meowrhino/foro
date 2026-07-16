// foro — vista pública: listado de preguntas + hilo con composer anónimo

import { api, post, postForm } from "./api.js";
import { compressImage } from "./compress.js";

const app = document.getElementById("app");
let CFG, TXT;

init();

async function init() {
  CFG = await (await fetch("/config.json")).json();
  TXT = CFG.texts;
  document.getElementById("site-name").textContent = CFG.name;
  document.getElementById("tagline").textContent = TXT.tagline;
  document.title = `${CFG.name} · ${CFG.client}`;
  addEventListener("hashchange", route);
  route();
}

const color = (i) => CFG.palette[(Number(i) || 0) % CFG.palette.length];
const pad = (n) => String(n).padStart(3, "0");
const fecha = (iso) =>
  new Date(iso.replace(" ", "T") + "Z").toLocaleDateString(CFG.lang, {
    day: "2-digit", month: "2-digit", year: "numeric",
  });

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

// escapa html, linkifica citas >>N y respeta saltos de línea
function fmtBody(s) {
  return esc(s)
    .replace(/&gt;&gt;(\d+)/g, (_, n) => `<a class="quote" href="#r${Number(n)}">&gt;&gt;${pad(n)}</a>`)
    .replace(/\n/g, "<br>");
}

function route() {
  const m = location.hash.match(/^#q=([\w-]+)/);
  if (m) renderThread(m[1]);
  else renderList();
}

// ── listado ──────────────────────────────────────────────────────────────────

async function renderList() {
  app.innerHTML = `<p class="meta">${TXT.loading}</p>`;
  const { questions } = await api("/questions");
  if (!questions.length) {
    app.innerHTML = `<p class="meta">${TXT.empty}</p>`;
    return;
  }
  const open = questions.filter((q) => !q.closed_at);
  const closed = questions.filter((q) => q.closed_at);
  const card = (q) => `
    <a class="card${q.closed_at ? " closed" : ""}" href="#q=${q.id}" style="background:${color(q.color)}">
      <span class="meta">${TXT.question} · ${fecha(q.created_at)}${q.pinned ? ` · ${TXT.pinnedBadge}` : ""}${q.closed_at ? ` · ${TXT.closed}` : ""}</span>
      <h2>${esc(q.title)}<sup>${q.reply_count}</sup></h2>
    </a>`;

  app.innerHTML =
    (open.length ? `<div class="grid">${open.map(card).join("")}</div>` : `<p class="meta">${TXT.empty}</p>`) +
    (closed.length
      ? `<h2 class="mono-title">${TXT.archive}<sup>${closed.length}</sup></h2>
         <div class="grid">${closed.map(card).join("")}</div>`
      : "");
  scrollTo(0, 0);
}

// ── hilo ─────────────────────────────────────────────────────────────────────

async function renderThread(id) {
  app.innerHTML = `<p class="meta">${TXT.loading}</p>`;
  let data;
  try {
    data = await api(`/questions/${id}`);
  } catch (err) {
    app.innerHTML = `<p class="meta">${esc(err.message)}</p>`;
    return;
  }
  const { question: q, replies, admin, poll } = data;

  app.innerHTML = `
    <a class="back meta" href="#">← ${TXT.back}</a>
    <header class="question" style="background:${color(q.color)}">
      <span class="meta">${TXT.question} · ${fecha(q.created_at)}${q.pinned ? ` · ${TXT.pinnedBadge}` : ""}${q.closed_at ? ` · ${TXT.closed}` : ""}</span>
      <h1>${esc(q.title)}</h1>
      ${q.body ? `<p>${fmtBody(q.body)}</p>` : ""}
      ${poll ? renderPoll(poll, !!q.closed_at) : ""}
    </header>
    <section class="replies">
      ${replies.map((r) => renderReply(r, admin)).join("") || `<p class="meta">${TXT.noReplies}</p>`}
    </section>
    ${q.closed_at ? "" : composerHtml()}
  `;
  if (poll && !q.closed_at) setupPoll(id);
  if (admin) setupAdminActions(id);
  if (!q.closed_at) setupComposer(id);
  scrollTo(0, 0);
}

function renderReply(r, admin) {
  const pending = r.status === "pending";
  return `<article class="reply${pending ? " pending" : ""}" id="r${r.num}">
    <header class="meta">#${pad(r.num)} · ${esc(r.alias || TXT.anonymous)}${r.trip ? ` <span class="trip">${esc(r.trip)}</span>` : ""} · ${fecha(r.created_at)}${pending ? ` · ${TXT.pendingBadge}` : ""}${admin ? ` · <button class="btn btn-xs" data-del="${r.id}">${TXT.deleteBtn}</button>` : ""}</header>
    ${r.body ? `<p>${fmtBody(r.body)}</p>` : ""}
    ${r.media.length ? `<div class="media">${r.media.map((m) =>
      `<a href="/r2/${m.r2_key}" target="_blank"><img src="/r2/${m.r2_key}" loading="lazy" alt=""></a>`).join("")}</div>` : ""}
  </article>`;
}

function setupAdminActions(questionId) {
  app.querySelectorAll("[data-del]").forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm(`${TXT.deleteBtn}?`)) return;
      btn.disabled = true;
      await post("/moderate", { id: btn.dataset.del, action: "delete" });
      renderThread(questionId);
    };
  });
}

// ── encuesta ─────────────────────────────────────────────────────────────────

function renderPoll(poll, closed) {
  const max = Math.max(1, ...poll.options.map((o) => o.votes));
  const canVote = !closed && poll.myVote === null;
  return `<div class="poll" id="poll">
    ${poll.options.map((o) => `
      <div class="poll-option${o.idx === poll.myVote ? " mine" : ""}">
        <div class="poll-bar" style="width:${(o.votes / max) * 100}%"></div>
        <span class="poll-text">${esc(o.text)}</span>
        <span class="meta">${o.votes}</span>
        ${canVote ? `<button type="button" class="btn btn-xs" data-vote="${o.idx}">${TXT.vote}</button>` : ""}
      </div>`).join("")}
    <p class="meta">${poll.total} ${TXT.votes}${poll.myVote !== null ? ` · ${TXT.voted}` : ""}</p>
  </div>`;
}

function setupPoll(questionId) {
  app.querySelectorAll("[data-vote]").forEach((btn) => {
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        await post(`/questions/${questionId}/vote`, { idx: Number(btn.dataset.vote) });
      } catch (err) {
        if (err.message !== TXT.alreadyVoted) alert(err.message);
      }
      renderThread(questionId);
    };
  });
}

// ── composer ─────────────────────────────────────────────────────────────────

function composerHtml() {
  return `<form class="composer" id="composer">
    <span class="meta">${TXT.composerTitle}</span>
    <textarea name="body" rows="4" placeholder="${TXT.bodyPlaceholder}"></textarea>
    <div class="previews" id="previews"></div>
    <div class="composer-row">
      <input name="alias" placeholder="${TXT.aliasPlaceholder}" maxlength="40" autocomplete="off">
      ${CFG.media.images ? `<label class="btn">${TXT.attach}<input type="file" id="file-input" accept="image/*" multiple hidden></label>` : ""}
      <button type="submit" class="btn">${TXT.send}</button>
    </div>
    <p class="meta" id="composer-status"></p>
  </form>`;
}

function setupComposer(questionId) {
  const form = document.getElementById("composer");
  const previews = document.getElementById("previews");
  const status = document.getElementById("composer-status");
  const attached = [];

  async function addFiles(files) {
    for (const f of files) {
      if (!f.type.startsWith("image/")) continue;
      if (attached.length >= CFG.media.maxImagesPerReply) break;
      status.textContent = TXT.compressing;
      const small = await compressImage(f);
      attached.push(small);

      const item = document.createElement("div");
      item.className = "preview";
      item.innerHTML = `<img src="${URL.createObjectURL(small)}" alt=""><button type="button">✕</button>`;
      item.querySelector("button").onclick = () => {
        attached.splice(attached.indexOf(small), 1);
        item.remove();
      };
      previews.append(item);
      status.textContent = "";
    }
  }

  const fileInput = document.getElementById("file-input");
  if (fileInput) {
    fileInput.onchange = () => {
      addFiles([...fileInput.files]);
      fileInput.value = "";
    };
  }

  // paste (cmd+v) y drag & drop, patrón twoitter
  form.addEventListener("paste", (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length && CFG.media.images) {
      e.preventDefault();
      addFiles(files);
    }
  });
  form.addEventListener("dragover", (e) => e.preventDefault());
  form.addEventListener("drop", (e) => {
    e.preventDefault();
    if (CFG.media.images) addFiles([...e.dataTransfer.files]);
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const body = form.body.value.trim();
    if (!body && !attached.length) {
      status.textContent = TXT.emptyReply;
      return;
    }
    const fd = new FormData();
    fd.set("alias", form.alias.value);
    fd.set("body", body);
    for (const f of attached) fd.append("files", f);

    const submitBtn = form.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    status.textContent = TXT.sending;
    try {
      const res = await postForm(`/questions/${questionId}/replies`, fd);
      if (res.status === "pending") {
        form.reset();
        previews.innerHTML = "";
        attached.length = 0;
        status.textContent = TXT.pendingMsg;
      } else {
        renderThread(questionId);
      }
    } catch (err) {
      status.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
    }
  };
}
