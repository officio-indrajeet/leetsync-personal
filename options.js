const $ = (id) => document.getElementById(id);
const status = (msg, ok = true) => {
  $("status").textContent = msg;
  $("term").classList.toggle("bad", !ok);
};

$("eye").onclick = () => {
  const hidden = $("token").type === "password";
  $("token").type = hidden ? "text" : "password";
  $("eye").textContent = hidden ? "hide" : "show";
};

function read() {
  return {
    owner: $("owner").value.trim(),
    repo: $("repo").value.trim(),
    branch: $("branch").value.trim() || "main",
    token: $("token").value.trim(),
  };
}

// Token is stored in chrome.storage.local: this browser profile only, never synced.
chrome.storage.local.get(["owner", "repo", "branch", "token"], (s) => {
  $("owner").value = s.owner || "";
  $("repo").value = s.repo || "";
  $("branch").value = s.branch || "main";
  $("token").value = s.token || "";
});

$("save").onclick = () => chrome.storage.local.set(read(), () => status("saved. you're set."));

$("test").onclick = async () => {
  status("knocking on github...");
  const resp = await chrome.runtime.sendMessage({ type: "test", settings: read() });
  status(resp.ok ? resp.message : resp.error, resp.ok);
};
