# LeetSync Personal

A small Chrome extension that pushes your accepted LeetCode submissions to your own GitHub repo, using a personal access token you create yourself. No third-party OAuth app, so nobody else gets access to your repos.

## What it does

When a submission on leetcode.com comes back Accepted, the extension reads it through LeetCode's GraphQL API and commits it to your repo, filed by topic:

```
TwoPointers/
  ThreeSum.java
DP/
  ClimbingStairs.java
Graph/
  NumberOfIslands.java
HashMap/
  TwoSum.java
```

- Folder = topic, picked from the problem's LeetCode tags (first match in the `TOPICS` list in `background.js` wins; no match goes to `Misc`). Edit that list to rename or reorder folders.
- File name = problem title in PascalCase, plus the language extension.
- Each file starts with a two-line comment: problem number, title, difficulty, and the LeetCode link.
- Commit message is just `Add Two Sum` the first time and `Update Two Sum` after that. Re-submitting identical code does nothing.

## Setup

1. Open `chrome://extensions`, turn on Developer mode, click **Load unpacked**, and select this folder.
2. On GitHub create a **fine-grained personal access token**: Settings, Developer settings, Personal access tokens, Fine-grained tokens.
   - Repository access: only select repositories, choose your LeetCode solutions repo.
   - Permissions: **Contents: Read and write**. Nothing else.
3. Click the extension icon, fill in username, repo, branch and token, then press **Test connection**.
4. Submit a problem on LeetCode. A toast in the bottom-right corner confirms the push.

## Files

| File | Role |
| --- | --- |
| `manifest.json` | Extension manifest and permissions |
| `injected.js` | Runs in the page, watches LeetCode's submission-check responses |
| `content.js` | Fetches submission details via GraphQL and shows the toast |
| `background.js` | Talks to the GitHub contents API |
| `options.html` / `options.js` | Settings popup |

## Privacy

- The token is stored in `chrome.storage.local`: this browser profile only, never synced.
- The extension only talks to `leetcode.com` and `api.github.com`.
- Keep the token out of this repo.

## Troubleshooting

- **Nothing happens after Accepted:** LeetCode changes its internal API now and then. Check the GraphQL query in `content.js` and the check-URL pattern in `injected.js`.
- **GitHub 404:** wrong username, repo or branch, or the token does not cover that repo.
- **GitHub 403 or 401:** the token expired or lacks Contents: Read and write.
