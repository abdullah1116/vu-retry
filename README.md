# VU Retry — Chrome extension

Absorbs the failure classes measured on `https://datesheet.vu.edu.pk` without a proxy.

## What it handles, and at which layer

| Failure | Where it surfaces | Handled by |
|---|---|---|
| `503 The service is unavailable.` | HTML page with a body | content script detects the body, shows a countdown, reloads with backoff |
| `net::ERR_EMPTY_RESPONSE`, `ERR_CONNECTION_RESET`, timeouts | browser error page (no body, no content script) | `webNavigation.onErrorOccurred` → background re-navigates the tab |
| `net::ERR_CERT_AUTHORITY_INVALID`, `ERR_SSL_PROTOCOL_ERROR` | TLS handshake | same navigation retry — a new handshake may land on the healthy backend |
| `5xx` on `fetch()` / `XMLHttpRequest` | inside the page | MAIN-world patch retries GET/HEAD up to 3× with backoff |
| `net::ERR_ABORTED` | browser cancelled | **not retried** — retrying a cancellation loops |

Counters live in `sessionStorage` (per tab) and `chrome.storage.session`, so a retry loop cannot
survive a tab close, and a hard cap stops the loop when upstream is genuinely down.

## Install

The Flatpak Chrome cannot see `/home/d/tmp-dev`. Grant it read-only access to this folder:

```bash
flatpak override --user --filesystem=/home/d/tmp-dev/vu-retry-ext:ro com.google.Chrome
```

Verify the sandbox can see it:

```bash
flatpak run --command=ls com.google.Chrome /home/d/tmp-dev/vu-retry-ext
```

Then in Chrome:

1. `chrome://extensions`
2. enable **Developer mode**
3. **Load unpacked** → `/home/d/tmp-dev/vu-retry-ext`
4. Pin **VU Retry**; the badge shows `OK` / `503` / `ERR` / `STOP`

## Verify it is alive

- Open `https://datesheet.vu.edu.pk/` — badge turns `OK` within 30 s.
- Click the icon → live probe status, reload count, absorbed count.
- Change a number, press Save, reload the page — settings persist in `chrome.storage.local`.

## Tuning

| Setting | Default | Raise it when |
|---|---|---|
| auto-reload | on | never — turn off to inspect a real 500 |
| page reloads on 503 | 5 | upstream stays down for minutes and you want a patient tab |
| fetch/XHR retries | 3 | the page's own Ajax postbacks keep dying |
| nav retries / 60 s | 4 | error pages persist but a manual refresh works |
| base delay | 400 ms | many tabs retry at once |
| max delay | 8000 ms | you want a slow, patient loop |
| probe timeout | 25000 ms | badge shows `ERR timeout` while pages still load |

## Uninstall / revert

```bash
flatpak override --user --reset com.google.Chrome
```

and remove the extension from `chrome://extensions`.

## Limits worth knowing

- A **503 returned to a top-level navigation** gives the content script a page to work with; a
  navigation that dies at the socket level does **not**, which is why the `webNavigation` path
  exists as a second, independent mechanism.
- The extension cannot see the proxy's `ERR_EMPTY_RESPONSE` at 10 s if you still run the local
  proxy — pick one. Both at once means two retry loops and double load.
- POST requests are **not** retried by the fetch patch: a 500 may mean the server already acted.
  `502/503/504` are retried for GET/HEAD only.
