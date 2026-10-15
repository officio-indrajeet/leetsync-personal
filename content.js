// injected.js watches the network from inside the page (see manifest "world": "MAIN").
// This script receives its "accepted" message, reads the submission and sends it to GitHub.

const seen = new Set();

function getCookie(name) {
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : "";
}

const queryFor = (type) => `
query submissionDetails($submissionId: ${type}) {
  submissionDetails(submissionId: $submissionId) {
    code
    lang { name verboseName }
    question { questionId title titleSlug difficulty }
  }
}`;

const TAGS_QUERY = `
query questionTags($titleSlug: String!) {
  question(titleSlug: $titleSlug) { topicTags { slug } }
}`;

async function fetchTags(titleSlug) {
  try {
    const res = await fetch("https://leetcode.com/graphql/", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", "x-csrftoken": getCookie("csrftoken") },
      body: JSON.stringify({ query: TAGS_QUERY, variables: { titleSlug } }),
    });
    const json = await res.json();
    return (json && json.data && json.data.question && json.data.question.topicTags) || [];
  } catch (_) {
    return [];
  }
}

// Submission ids passed 2^31 (about 2.1 billion), so a 32-bit Int! variable can overflow.
// LeetCode's schema type for this argument can differ, so try the likely ones in turn
// and remember whichever works.
const ID_TYPES = ["Int!", "Long!", "ID!", "String!"];
let goodType = null;

async function fetchSubmission(id) {
  const types = goodType ? [goodType] : ID_TYPES;
  let lastError = "";
  for (const type of types) {
    const asText = type === "ID!" || type === "String!";
    const res = await fetch("https://leetcode.com/graphql/", {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "x-csrftoken": getCookie("csrftoken"),
      },
      body: JSON.stringify({
        query: queryFor(type),
        variables: { submissionId: asText ? String(id) : Number(id) },
        operationName: "submissionDetails",
      }),
    });
    let json = null;
    try { json = await res.json(); } catch (_) {}
    const d = json && json.data && json.data.submissionDetails;
    if (d) {
      goodType = type;
      return d;
    }
    lastError = (json && json.errors && json.errors[0] && json.errors[0].message) || `HTTP ${res.status}`;
    console.debug("[LeetSync] submissionDetails with", type, "failed:", lastError);
  }
  throw new Error("LeetCode would not return the submission: " + lastError.slice(0, 120));
}

// One notification card, updated in place (syncing, then the result).
// It lives in a shadow root so LeetCode's own styles can't touch it.
const UI = (() => {
  const ICONS = {
    loading:
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke-width="3" stroke-linecap="round"><circle cx="12" cy="12" r="9" stroke="#30363d"/><path d="M21 12a9 9 0 0 0-9-9" stroke="#4493f8"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/></path></svg>',
    success:
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><circle cx="12" cy="12" r="10" fill="#238636"/><path d="M7.5 12.5l3 3 6-6.5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    info:
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><circle cx="12" cy="12" r="10" fill="#6e7681"/><path d="M12 11v6M12 7.3v.2" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
    error:
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><circle cx="12" cy="12" r="10" fill="#da3633"/><path d="M12 7v6.5M12 16.8v.2" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
  };

  const CSS = `
    :host { all: initial; }
    .card { position: fixed; right: 20px; bottom: 20px; z-index: 2147483647; width: 330px; box-sizing: border-box;
      display: flex; gap: 12px; align-items: flex-start; padding: 12px 12px 12px 14px;
      background: #1f2328; color: #f0f3f6; border: 1px solid #3d444d; border-radius: 10px;
      box-shadow: 0 8px 24px rgba(1, 4, 9, .45);
      font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      opacity: 0; transform: translateY(8px); transition: opacity .18s ease, transform .18s ease; }
    .card.in { opacity: 1; transform: none; }
    .ico { flex: none; width: 18px; height: 18px; margin-top: 15px; }
    .body { flex: 1; min-width: 0; }
    .brand { font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: #9198a1; }
    .t { margin-top: 2px; font-size: 14px; font-weight: 600; }
    .d, .r { margin-top: 2px; font-size: 12px; color: #c9d1d9; word-break: break-word; }
    .r { color: #9198a1; }
    .d:empty, .r:empty { display: none; }
    .x { flex: none; border: 0; background: none; color: #9198a1; font-size: 18px; line-height: 1; cursor: pointer; padding: 0 2px; }
    .x:hover { color: #f0f3f6; }
  `;

  let host, root, timer;

  function build() {
    host = document.createElement("div");
    root = host.attachShadow({ mode: "closed" });
    root.innerHTML =
      `<style>${CSS}</style>` +
      '<div class="card" role="status" aria-live="polite">' +
      '<div class="ico"></div>' +
      '<div class="body"><div class="brand">LeetSync</div><div class="t"></div><div class="d"></div><div class="r"></div></div>' +
      '<button class="x" aria-label="Dismiss">&times;</button>' +
      "</div>";
    root.querySelector(".x").addEventListener("click", hide);
  }

  function hide() {
    clearTimeout(timer);
    const card = root && root.querySelector(".card");
    if (!card) return;
    card.classList.remove("in");
    setTimeout(() => host && !card.classList.contains("in") && host.remove(), 220);
  }

  function show(kind, title, detail, repo, autoHideMs) {
    if (!host) build();
    if (!host.isConnected) (document.body || document.documentElement).appendChild(host);
    const q = (s) => root.querySelector(s);
    q(".ico").innerHTML = ICONS[kind];
    q(".t").textContent = title;
    q(".d").textContent = detail || "";
    q(".r").textContent = repo || "";
    clearTimeout(timer);
    requestAnimationFrame(() => q(".card").classList.add("in"));
    if (autoHideMs) timer = setTimeout(hide, autoHideMs);
  }

  return {
    loading: (title, detail) => show("loading", title, detail, "", 0),
    success: (title, detail, repo) => show("success", title, detail, repo, 6000),
    info: (title, detail, repo) => show("info", title, detail, repo, 5000),
    error: (title, detail) => show("error", title, detail, "", 9000),
  };
})();

function describeFailure(message) {
  const m = String(message || "");
  if (/not connected|authorize/i.test(m)) {
    return ["GitHub is not connected", "Open the LeetSync popup and choose Authorize with GitHub."];
  }
  if (/401|rejected the login/i.test(m)) {
    return ["GitHub sign-in expired", "Open the LeetSync popup and authorize again."];
  }
  return ["Sync failed", m || "Something went wrong."];
}

// Fallback that does not depend on hooking LeetCode's own polling: once a submit is seen,
// poll the result ourselves and sync only if it comes back Accepted.
async function watchSubmission(id) {
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    if (seen.has(id)) return;
    try {
      const res = await fetch(`https://leetcode.com/submissions/detail/${id}/check/`, { credentials: "include" });
      const j = await res.json();
      if (j.state === "SUCCESS") {
        console.debug("[LeetSync] result", id, "->", j.status_msg);
        if (j.status_msg === "Accepted") syncSubmission(id);
        return;
      }
    } catch (_) {}
  }
}

window.addEventListener("message", (ev) => {
  if (ev.source !== window || !ev.data || ev.data.source !== "leetsync") return;
  if (ev.data.kind === "submitted") watchSubmission(ev.data.submissionId);
  else syncSubmission(ev.data.submissionId);
});

// Second trigger that needs no network hooking: LeetCode opens .../submissions/<id>/ after a
// submit, and you can open any old accepted submission yourself to sync it.
let lastSeenPage = "";
setInterval(() => {
  const m = location.pathname.match(/\/submissions\/(?:detail\/)?(\d+)/);
  if (m && m[1] !== lastSeenPage) {
    lastSeenPage = m[1];
    console.debug("[LeetSync] submission page", m[1]);
    watchSubmission(m[1]);
  }
}, 1000);

async function syncSubmission(id) {
  if (seen.has(id)) return;
  seen.add(id);
  UI.loading("Syncing to GitHub", "Saving your accepted solution...");
  try {
    const d = await fetchSubmission(id);
    if (!d) throw new Error("Could not read submission details from LeetCode");
    d.question.topicTags = await fetchTags(d.question.titleSlug);
    const resp = await chrome.runtime.sendMessage({ type: "push", submissionId: id, details: d });
    if (!resp || !resp.ok) throw new Error((resp && resp.error) || "No response from the extension");
    if (resp.status === "unchanged") {
      UI.info("Already up to date", resp.path, resp.repo);
    } else {
      UI.success(resp.status === "updated" ? "Solution updated on GitHub" : "Solution added to GitHub", resp.path, resp.repo);
    }
  } catch (e) {
    seen.delete(id);
    const [title, detail] = describeFailure(e.message);
    UI.error(title, detail);
  }
}
