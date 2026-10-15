// Runs in the page context. Watches LeetCode's submission-check responses
// and tells the content script when a submission is Accepted.
(function () {
  const CHECK_RE = /\/submissions\/detail\/(\d+)\/check\/?/;

  function handle(url, text) {
    const m = CHECK_RE.exec(url || "");
    if (!m) return;
    try {
      const json = JSON.parse(text);
      if (json.state === "SUCCESS" && json.status_msg === "Accepted") {
        window.postMessage({ source: "leetsync", submissionId: m[1] }, "*");
      }
    } catch (_) {}
  }

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      const url = typeof args[0] === "string" ? args[0] : args[0] && args[0].url;
      if (CHECK_RE.test(url || "")) res.clone().text().then((t) => handle(url, t));
    } catch (_) {}
    return res;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.addEventListener("load", () => {
      try { handle(url, this.responseText); } catch (_) {}
    });
    return origOpen.call(this, method, url, ...rest);
  };
})();
