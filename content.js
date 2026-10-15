// Inject the network watcher into the page.
const s = document.createElement("script");
s.src = chrome.runtime.getURL("injected.js");
(document.head || document.documentElement).appendChild(s);
s.onload = () => s.remove();

const seen = new Set();

function getCookie(name) {
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : "";
}

const QUERY = `
query submissionDetails($submissionId: Int!) {
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

async function fetchSubmission(id) {
  const res = await fetch("https://leetcode.com/graphql/", {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      "x-csrftoken": getCookie("csrftoken"),
    },
    body: JSON.stringify({
      query: QUERY,
      variables: { submissionId: Number(id) },
      operationName: "submissionDetails",
    }),
  });
  const json = await res.json();
  return json && json.data && json.data.submissionDetails;
}

function toast(msg, ok = true) {
  const el = document.createElement("div");
  el.textContent = (ok ? "[ OK ] " : "[FAIL] ") + msg;
  Object.assign(el.style, {
    position: "fixed", bottom: "24px", right: "24px", zIndex: 999999, maxWidth: "360px",
    padding: "10px 14px", borderRadius: "0", color: ok ? "#8bd17c" : "#ff8a7a",
    font: "13px/1.4 ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace",
    background: "#1d1b16", border: "2px solid #f4efdc", boxShadow: "4px 4px 0 #1d1b16",
  });
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

window.addEventListener("message", async (ev) => {
  if (ev.source !== window || !ev.data || ev.data.source !== "leetsync") return;
  const id = ev.data.submissionId;
  if (seen.has(id)) return;
  seen.add(id);
  try {
    const d = await fetchSubmission(id);
    if (!d) throw new Error("Could not read submission details from LeetCode");
    d.question.topicTags = await fetchTags(d.question.titleSlug);
    const resp = await chrome.runtime.sendMessage({ type: "push", submissionId: id, details: d });
    if (resp && resp.ok) toast("LeetSync: " + resp.message);
    else toast("LeetSync failed: " + (resp && resp.error), false);
  } catch (e) {
    seen.delete(id);
    toast("LeetSync error: " + e.message, false);
  }
});
