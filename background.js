const EXT = {
  python: "py", python3: "py", java: "java", cpp: "cpp", c: "c", csharp: "cs",
  javascript: "js", typescript: "ts", golang: "go", rust: "rs", kotlin: "kt",
  swift: "swift", ruby: "rb", scala: "scala", php: "php", dart: "dart",
  racket: "rkt", erlang: "erl", elixir: "ex",
  mysql: "sql", mssql: "sql", oraclesql: "sql", postgresql: "sql", bash: "sh",
};

const HASH_COMMENT = new Set(["py", "rb", "sh"]);
const DASH_COMMENT = new Set(["sql"]);

// GitHub permission asked for at sign-in. "repo" covers private and public repos.
// Use "public_repo" instead if your solutions repo is public.
const SCOPE = "repo";

// Client ID of YOUR OAuth app (github.com/settings/developers). It is public, not a secret.
// Fill it in once and the popup shows only the Authorize button. Leave it empty and the
// popup asks for the Client ID instead.
const CLIENT_ID = "Ov23li1g4bE0QTKqE07p";
const DEFAULT_REPO = "leetcode-solutions";

// Topic folders. The first row that matches one of a problem's LeetCode tags wins,
// so put specific topics above general ones. Edit freely: this is the only place to change.
const TOPICS = [
  ["dynamic-programming", ["dynamic-programming"]],
  ["backtracking", ["backtracking"]],
  ["trees", ["tree", "binary-tree", "binary-search-tree", "trie"]],
  ["linked-list", ["linked-list"]],
  ["graph", ["graph", "union-find", "topological-sort", "shortest-path", "depth-first-search", "breadth-first-search"]],
  ["two-pointers", ["two-pointers"]],
  ["sliding-window", ["sliding-window"]],
  ["binary-search", ["binary-search"]],
  ["stack", ["stack", "monotonic-stack"]],
  ["heap", ["heap-priority-queue"]],
  ["greedy", ["greedy"]],
  ["hash-table", ["hash-table"]],
  ["bit-manipulation", ["bit-manipulation"]],
  ["math", ["math"]],
  ["arrays", ["array"]],
  ["strings", ["string"]],
];

function pickTopic(tags) {
  const slugs = new Set((tags || []).map((t) => t.slug));
  for (const [folder, list] of TOPICS) {
    if (list.some((s) => slugs.has(s))) return folder;
  }
  return "misc";
}

function pascal(title) {
  return title
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("");
}

function b64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function oauthPost(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  return res.json();
}

// ---------- sign-in with GitHub (device flow) ----------

let polling = null;

async function pollForToken(clientId, d) {
  const me = (polling = Symbol());
  let interval = (d.interval || 5) * 1000;
  while (polling === me && Date.now() < d.expires_at) {
    await sleep(interval);
    if (polling !== me) return;
    let r;
    try {
      r = await oauthPost("https://github.com/login/oauth/access_token", {
        client_id: clientId,
        device_code: d.device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      });
    } catch (_) {
      continue;
    }
    if (r.access_token) {
      const u = await fetch("https://api.github.com/user", { headers: authHeaders(r.access_token) }).then((x) => x.json());
      if (!u.login) {
        await chrome.storage.local.set({ authError: "Signed in, but could not read your GitHub username. Try again." });
      } else {
        await chrome.storage.local.set({ token: r.access_token, login: u.login, authError: "" });
      }
      await chrome.storage.local.remove("pending");
      return;
    }
    if (r.error === "slow_down") interval += 5000;
    else if (r.error && r.error !== "authorization_pending") {
      await chrome.storage.local.set({ authError: r.error_description || r.error });
      await chrome.storage.local.remove("pending");
      return;
    }
  }
  if (polling === me) {
    await chrome.storage.local.set({ authError: "That code expired. Press Authorize again." });
    await chrome.storage.local.remove("pending");
  }
}

// If Chrome stopped this worker mid-sign-in, pick the sign-in back up.
chrome.storage.local.get(["pending", "clientId"]).then(({ pending, clientId }) => {
  if (pending && clientId && pending.expires_at > Date.now()) pollForToken(clientId, pending);
});

async function startAuth(typedClientId) {
  const clientId = CLIENT_ID || typedClientId;
  if (!clientId) throw new Error("No Client ID set. See the one-time setup in the README");
  const r = await oauthPost("https://github.com/login/device/code", { client_id: clientId, scope: SCOPE });
  if (!r.device_code) {
    if (r.error === "device_flow_disabled") {
      throw new Error("Tick Enable Device Flow in your OAuth app settings, then try again");
    }
    throw new Error(r.error_description || "GitHub did not accept that Client ID");
  }
  const pending = {
    device_code: r.device_code,
    user_code: r.user_code,
    verification_uri: r.verification_uri,
    interval: r.interval,
    expires_at: Date.now() + r.expires_in * 1000,
  };
  await chrome.storage.local.set({ clientId, pending, authError: "" });
  pollForToken(clientId, pending);
  return { user_code: r.user_code, verification_uri: r.verification_uri };
}

// ---------- GitHub repo access ----------

async function loadSettings() {
  const s = await chrome.storage.local.get(["token", "login", "repo", "branch"]);
  if (!s.token || !s.login) {
    throw new Error("Not connected. Open the LeetSync popup and press Authorize with GitHub");
  }
  return { token: s.token, owner: s.login, repo: s.repo || DEFAULT_REPO, branch: s.branch || "main" };
}

function gh(settings, path, opts = {}) {
  return fetch(`https://api.github.com/repos/${settings.owner}/${settings.repo}${path}`, {
    ...opts,
    headers: { ...authHeaders(settings.token), ...(opts.headers || {}) },
  });
}

const ensured = new Set();

async function ensureRepo(s) {
  const key = `${s.owner}/${s.repo}`;
  if (ensured.has(key)) return;
  const res = await gh(s, "");
  if (res.ok) {
    ensured.add(key);
    return;
  }
  if (res.status === 404) {
    const c = await fetch("https://api.github.com/user/repos", {
      method: "POST",
      headers: { ...authHeaders(s.token), "Content-Type": "application/json" },
      body: JSON.stringify({
        name: s.repo,
        private: true,
        auto_init: true,
        description: "My LeetCode solutions, synced by LeetSync Personal",
      }),
    });
    if (!c.ok) throw new Error(`Could not create the repo (GitHub ${c.status})`);
    ensured.add(key);
    await sleep(1500);
    return;
  }
  if (res.status === 401) throw new Error("GitHub rejected the login. Press Authorize with GitHub again");
  throw new Error(`GitHub ${res.status} while checking the repo`);
}

async function putFile(settings, filePath, content, message) {
  const enc = filePath.split("/").map(encodeURIComponent).join("/");
  let sha;
  const existing = await gh(settings, `/contents/${enc}?ref=${encodeURIComponent(settings.branch)}`);
  if (existing.ok) {
    const j = await existing.json();
    sha = j.sha;
    if (j.content && j.content.replace(/\n/g, "") === b64(content)) return "unchanged";
  } else if (existing.status !== 404) {
    throw new Error(`GitHub ${existing.status}: ${(await existing.text()).slice(0, 200)}`);
  }
  const res = await gh(settings, `/contents/${enc}`, {
    method: "PUT",
    body: JSON.stringify({ message, content: b64(content), branch: settings.branch, ...(sha ? { sha } : {}) }),
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return sha ? "updated" : "created";
}

async function push(details) {
  const settings = await loadSettings();
  await ensureRepo(settings);

  const q = details.question;
  const ext = EXT[details.lang.name] || details.lang.name;
  const c = HASH_COMMENT.has(ext) ? "#" : DASH_COMMENT.has(ext) ? "--" : "//";
  const topic = pickTopic(q.topicTags);
  const filePath = `${topic}/${pascal(q.title)}.${ext}`;

  const header =
    `${c} ${q.questionId}. ${q.title} (${q.difficulty})\n` +
    `${c} https://leetcode.com/problems/${q.titleSlug}/\n\n`;
  const code = header + details.code.replace(/\s+$/, "") + "\n";

  const result = await putFile(settings, filePath, code, `leetcode ${q.questionId}. ${q.title}`);
  return { status: result, title: q.title, path: filePath, repo: `${settings.owner}/${settings.repo}` };
}

function reply(promise, sendResponse) {
  promise
    .then((data) => sendResponse({ ok: true, ...(typeof data === "object" && data ? data : { message: data }) }))
    .catch((e) => sendResponse({ ok: false, error: e.message }));
  return true;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {
    case "wake":
      sendResponse({ ok: true, hasClientId: !!CLIENT_ID });
      return false;
    case "push":
      return reply(push(msg.details), sendResponse);
    case "auth_start":
      return reply(startAuth(msg.clientId), sendResponse);
    case "auth_cancel":
      polling = null;
      return reply(chrome.storage.local.remove("pending").then(() => ({})), sendResponse);
    case "disconnect":
      polling = null;
      ensured.clear();
      return reply(chrome.storage.local.remove(["token", "login", "pending", "authError"]).then(() => ({})), sendResponse);
    case "test":
      return reply(
        (async () => {
          const s = await loadSettings();
          s.repo = (msg.settings && msg.settings.repo) || s.repo;
          s.branch = (msg.settings && msg.settings.branch) || s.branch;
          await ensureRepo(s);
          const res = await gh(s, "");
          const j = await res.json();
          if (!j.permissions || !j.permissions.push) {
            throw new Error("Signed in, but no write access to that repo. Authorize again");
          }
          return `Connected as ${s.owner}, writing to ${j.full_name}`;
        })(),
        sendResponse
      );
  }
});
