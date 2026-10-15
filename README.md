# LeetSync Personal

A small Chrome extension that pushes your accepted LeetCode submissions to your own GitHub repo. You sign in with an **Authorize with GitHub** button, through an OAuth app that you create yourself, so no third-party app ever gets access to your account.

## What it does

When a submission on leetcode.com comes back Accepted, the extension reads it through LeetCode's GraphQL API and commits it to your repo, filed by topic:

```
two-pointers/
  ThreeSum.java
dynamic-programming/
  ClimbingStairs.java
graph/
  NumberOfIslands.java
arrays/
  MajorityElementII.java
```

- Folder = topic, picked from the problem's LeetCode tags (first match in the `TOPICS` list in `background.js` wins; no match goes to `misc`). Folder names are lowercase with dashes. Edit that list to rename or reorder folders.
- File name = problem title in PascalCase, plus the language extension.
- Each file starts with a two-line comment: problem number, title, difficulty, and the LeetCode link.
- Commit message looks like `leetcode 169. Majority Element`. Re-submitting identical code does nothing.
- If the repo doesn't exist yet, it is created for you (private).

## Setup

### One time: make your own OAuth app

1. Go to https://github.com/settings/developers, choose OAuth Apps, then New OAuth App.
2. Application name: `LeetSync Personal`. Homepage URL and Authorization callback URL: `https://github.com` (they are not used).
3. Register the app, then tick **Enable Device Flow** and update it.
4. Copy the **Client ID**. It is not a secret. Do not generate a client secret.

### Install and sign in

1. Open `chrome://extensions`, turn on Developer mode, click **Load unpacked**, and select this folder.
2. Put the Client ID in the `CLIENT_ID` constant at the top of `background.js` and reload the extension. Then the popup shows only the **Authorize with GitHub** button. (If you leave it empty, the popup asks you to paste the Client ID instead.) Click the extension icon and press **Authorize with GitHub**.
3. The popup shows a code and copies it to your clipboard. A GitHub page opens: paste the code and approve.
4. The popup switches to "connected as ...". Check the repository name (default `leetcode-solutions`) and press **Save**.
5. Submit a problem on LeetCode. A toast in the bottom-right corner confirms the push.

## Files

| File | Role |
| --- | --- |
| `manifest.json` | Extension manifest and permissions |
| `injected.js` | Runs in the page, watches LeetCode's submission-check responses |
| `content.js` | Fetches submission details via GraphQL and shows the toast |
| `background.js` | GitHub sign-in (device flow) and the GitHub contents API |
| `options.html` / `options.js` | Settings popup |

## Privacy

- The sign-in goes through your own OAuth app. Nobody else's app is involved.
- The permission requested is `repo` (set by `SCOPE` in `background.js`), which lets the extension read and write your repositories. Change it to `public_repo` if your solutions repo is public.
- The access token is stored in `chrome.storage.local`: this browser profile only, never synced. **Disconnect** in the popup removes it. You can also revoke it any time at https://github.com/settings/applications.
- The extension only talks to `leetcode.com`, `github.com` and `api.github.com`.

## Troubleshooting

- **"Enable Device Flow" error:** open your OAuth app's settings on GitHub and tick that box.
- **Nothing happens after Accepted:** LeetCode changes its internal API now and then. Check the GraphQL query in `content.js` and the check-URL pattern in `injected.js`. Reload the LeetCode page once after installing.
- **GitHub 401:** the sign-in was revoked. Press Disconnect, then Authorize again.
