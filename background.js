const EXT = {
  python: "py", python3: "py", java: "java", cpp: "cpp", c: "c", csharp: "cs",
  javascript: "js", typescript: "ts", golang: "go", rust: "rs", kotlin: "kt",
  swift: "swift", ruby: "rb", scala: "scala", php: "php", dart: "dart",
  racket: "rkt", erlang: "erl", elixir: "ex",
  mysql: "sql", mssql: "sql", oraclesql: "sql", postgresql: "sql", bash: "sh",
};

const HASH_COMMENT = new Set(["py", "rb", "sh"]);
const DASH_COMMENT = new Set(["sql"]);

// Topic folders. The first row that matches one of a problem's LeetCode tags wins,
// so put specific topics above general ones. Edit freely: this is the only place to change.
const TOPICS = [
  ["DP", ["dynamic-programming"]],
  ["Backtracking", ["backtracking"]],
  ["Trees", ["tree", "binary-tree", "binary-search-tree", "trie"]],
  ["LinkedList", ["linked-list"]],
  ["Graph", ["graph", "union-find", "topological-sort", "shortest-path", "depth-first-search", "breadth-first-search"]],
  ["TwoPointers", ["two-pointers"]],
  ["SlidingWindow", ["sliding-window"]],
  ["BinarySearch", ["binary-search"]],
  ["Stack", ["stack", "monotonic-stack"]],
  ["Heap", ["heap-priority-queue"]],
  ["Greedy", ["greedy"]],
  ["HashMap", ["hash-table"]],
  ["BitManipulation", ["bit-manipulation"]],
  ["Math", ["math"]],
  ["Arrays", ["array"]],
  ["Strings", ["string"]],
];

function pickTopic(tags) {
  const slugs = new Set((tags || []).map((t) => t.slug));
  for (const [folder, list] of TOPICS) {
    if (list.some((s) => slugs.has(s))) return folder;
  }
  return "Misc";
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

async function gh(settings, path, opts = {}) {
  const res = await fetch(`https://api.github.com/repos/${settings.owner}/${settings.repo}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${settings.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(opts.headers || {}),
    },
  });
  return res;
}

async function putFile(settings, filePath, content, title) {
  const enc = filePath.split("/").map(encodeURIComponent).join("/");
  const branch = settings.branch || "main";
  let sha;
  const existing = await gh(settings, `/contents/${enc}?ref=${encodeURIComponent(branch)}`);
  if (existing.ok) {
    const j = await existing.json();
    sha = j.sha;
    if (j.content && j.content.replace(/\n/g, "") === b64(content)) return "unchanged";
  } else if (existing.status !== 404) {
    throw new Error(`GitHub ${existing.status}: ${(await existing.text()).slice(0, 200)}`);
  }
  const message = `${sha ? "Update" : "Add"} ${title}`;
  const res = await gh(settings, `/contents/${enc}`, {
    method: "PUT",
    body: JSON.stringify({ message, content: b64(content), branch, ...(sha ? { sha } : {}) }),
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return sha ? "updated" : "created";
}

async function push(details) {
  const settings = await chrome.storage.local.get(["token", "owner", "repo", "branch"]);
  if (!settings.token || !settings.owner || !settings.repo) {
    throw new Error("Open the extension popup and set token / owner / repo first");
  }
  const q = details.question;
  const ext = EXT[details.lang.name] || details.lang.name;
  const c = HASH_COMMENT.has(ext) ? "#" : DASH_COMMENT.has(ext) ? "--" : "//";
  const topic = pickTopic(q.topicTags);
  const filePath = `${topic}/${pascal(q.title)}.${ext}`;

  const header =
    `${c} ${q.questionId}. ${q.title} (${q.difficulty})\n` +
    `${c} https://leetcode.com/problems/${q.titleSlug}/\n\n`;
  const code = header + details.code.replace(/\s+$/, "") + "\n";

  const result = await putFile(settings, filePath, code, q.title);
  return result === "unchanged"
    ? `${q.title}: already up to date`
    : `${q.title}: ${result} in ${topic}/`;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "push") {
    push(msg.details)
      .then((message) => sendResponse({ ok: true, message }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg.type === "test") {
    (async () => {
      const s = msg.settings;
      const res = await gh(s, "");
      if (!res.ok) throw new Error(`GitHub ${res.status}: check token, owner and repo name`);
      const j = await res.json();
      if (!j.permissions || !j.permissions.push) throw new Error("Token can read the repo but has no write access (needs Contents: Read and write)");
      return `Connected to ${j.full_name} with write access`;
    })()
      .then((message) => sendResponse({ ok: true, message }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
});
