// Runs in the page's own world (see manifest "world": "MAIN"), before LeetCode's scripts.
// Reports two things to content.js:
//   "submitted": a solution was just submitted (carries the submission id)
//   "accepted":  LeetCode's own result check came back Accepted
(function () {
  const CHECK_RE = /\/submissions\/detail\/(\d+)\/check\/?/;
  const SUBMIT_RE = /\/problems\/[^/]+\/submit\/?(\?|$)/;

  function toUrl(input) {
    if (!input) return "";
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    return input.url || "";
  }

  function say(kind, submissionId) {
    window.postMessage({ source: "leetsync", kind, submissionId: String(submissionId) }, "*");
  }

  function handle(url, text) {
    try {
      if (SUBMIT_RE.test(url)) {
        const j = JSON.parse(text);
        const id = j.submission_id || j.submissionId;
        console.debug("[LeetSync] submitted", id);
        if (id) say("submitted", id);
        return;
      }
      const m = CHECK_RE.exec(url);
      if (!m) return;
      const json = JSON.parse(text);
      if (json.state === "SUCCESS") {
        console.debug("[LeetSync] result for submission", m[1], "->", json.status_msg);
        if (json.status_msg === "Accepted") say("accepted", m[1]);
      }
    } catch (_) {}
  }

  const wanted = (url) => CHECK_RE.test(url) || SUBMIT_RE.test(url);

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      const url = toUrl(args[0]);
      if (wanted(url)) res.clone().text().then((t) => handle(url, t));
    } catch (_) {}
    return res;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    const u = toUrl(url);
    if (wanted(u)) {
      this.addEventListener("load", () => {
        try { handle(u, this.responseText); } catch (_) {}
      });
    }
    return origOpen.call(this, method, url, ...rest);
  };

  console.debug("[LeetSync] watching submissions");
})();
