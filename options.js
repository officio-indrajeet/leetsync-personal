const $ = (id) => document.getElementById(id);

const status = (msg, ok = true) => {
  $("status").textContent = msg;
  $("term").classList.toggle("bad", !ok);
};

const show = (name) => {
  for (const id of ["setup", "pending", "connected"]) $(id).hidden = id !== name;
};

function render(s) {
  if (s.token && s.login) {
    show("connected");
    $("login").textContent = s.login;
    if (!$("repo").value) $("repo").value = s.repo || "leetcode-solutions";
    if (!$("branch").value) $("branch").value = s.branch || "main";
  } else if (s.pending && s.pending.expires_at > Date.now()) {
    show("pending");
    $("code").textContent = s.pending.user_code;
  } else {
    show("setup");
    if (!$("cid").value) $("cid").value = s.clientId || "";
  }
  if (s.authError) status(s.authError, false);
}

const load = () =>
  chrome.storage.local.get(["token", "login", "pending", "clientId", "repo", "branch", "authError"], render);

let baked = false;
chrome.runtime.sendMessage({ type: "wake" }).then((r) => {
  baked = !!(r && r.hasClientId);
  $("cidbox").hidden = baked;
  $("help").hidden = baked;
}).catch(() => {});
load();
chrome.storage.onChanged.addListener(() => {
  load();
  chrome.storage.local.get(["token", "login"], (s) => {
    if (s.token && s.login) status("connected. you can close this and solve something.");
  });
});

$("auth").onclick = async () => {
  const clientId = $("cid").value.trim();
  if (!baked && !clientId) return status("paste your oauth client id first", false);
  status("asking github for a code...");
  const r = await chrome.runtime.sendMessage({ type: "auth_start", clientId });
  if (!r.ok) return status(r.error, false);
  try { await navigator.clipboard.writeText(r.user_code); } catch (_) {}
  status("code copied. paste it on the github page");
  chrome.tabs.create({ url: r.verification_uri });
};

$("reopen").onclick = () =>
  chrome.storage.local.get("pending", async ({ pending }) => {
    if (!pending) return;
    try { await navigator.clipboard.writeText(pending.user_code); } catch (_) {}
    chrome.tabs.create({ url: pending.verification_uri });
  });

$("cancel").onclick = async () => {
  await chrome.runtime.sendMessage({ type: "auth_cancel" });
  status("cancelled");
};

$("save").onclick = () =>
  chrome.storage.local.set(
    { repo: $("repo").value.trim() || "leetcode-solutions", branch: $("branch").value.trim() || "main" },
    () => status("saved. you're set.")
  );

$("test").onclick = async () => {
  status("knocking on github...");
  const settings = { repo: $("repo").value.trim(), branch: $("branch").value.trim() };
  await chrome.storage.local.set(settings);
  const r = await chrome.runtime.sendMessage({ type: "test", settings });
  status(r.ok ? r.message : r.error, r.ok);
};

$("out").onclick = async () => {
  await chrome.runtime.sendMessage({ type: "disconnect" });
  $("repo").value = "";
  $("branch").value = "";
  status("disconnected");
};
