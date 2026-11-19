# VU Retry

A Chrome extension that retries failed requests on `https://datesheet.vu.edu.pk`.

Unofficial. Not affiliated with, endorsed by, or supported by Virtual University.

## Why this exists

The datesheet host is a single IIS/ASP.NET farm that intermittently:

- returns `503 The service is unavailable.` while its application pool queue is saturated,
- serves normal `200`s that take 7–30 s,
- fails TLS on one of its two backends, where the served chain is incomplete.

All three are transient and per-request: the same URL usually succeeds a second later. A manual
refresh fixes almost every case, which is exactly the kind of work a browser should do instead of a
person.

## What it does, and at which layer

| Failure | Where it surfaces | Handled by |
|---|---|---|
| `503 The service is unavailable.` | HTML page with a body | content script detects the body, shows a countdown, reloads with backoff |
| `net::ERR_EMPTY_RESPONSE`, `ERR_CONNECTION_RESET`, timeouts | browser error page (no body, no content script) | `webNavigation.onErrorOccurred` → background re-navigates the tab |
| `net::ERR_CERT_AUTHORITY_INVALID`, `ERR_SSL_PROTOCOL_ERROR` | TLS handshake | same navigation retry — a fresh handshake may land on the healthy backend |
| `5xx` on `fetch()` | inside the page | MAIN-world patch retries GET/HEAD up to 3× with backoff |
| `net::ERR_ABORTED` | the client cancelled | **not** retried — retrying a cancellation loops |

Each layer has its own budget, so a retry storm cannot happen by accident:

| Layer | Budget | Default | Delays |
|---|---|---|---|
| Page reload | `pageReloads` | 5 | 0.5 → 1 → 2 → 4 → 8 s |
| Navigation retry | `maxNavRetries` per tab per 60 s | 4 | 0.4 → 0.8 → 1.6 → 3.2 s |
| `fetch` retry | `fetchRetries` per call | 3 | 0.3 → 0.6 → 1.2 s |

Counters live in `sessionStorage` (page) and `chrome.storage.session` (navigation), so they reset
when a tab closes and survive the service worker being torn down.

## Install

**Fastest — drag the zip.** Download `vu-retry-<version>.zip`, open `chrome://extensions`, and drop
the file onto the page. Chrome unpacks it into your profile and installs it; the zip itself is no
longer needed. Verified on Chrome 157 — recent Chrome does the unpacking for you, so there is no
"where do I put it" step and no folder to accidentally delete later.

**Universal — Load unpacked.** Works on every Chrome from 120 up:

1. unzip the archive to a folder you plan to keep (e.g. `~/.local/share/vu-retry`)
2. `chrome://extensions` → enable **Developer mode**
3. **Load unpacked** → pick that folder

Either way, pin **VU Retry** afterwards; the badge reads `OK`, `503`, `ERR`, `CERT`, or `STOP`.

Requires Chrome 120 or newer (the extension uses a 30-second `chrome.alarms` period and
`world: "MAIN"` content scripts).

The release also carries a signed `.crx`. Chrome refuses to install it — `CRX_REQUIRED_PROOF_MISSING`
— because it is not signed by the Web Store. It is useful for its stable extension ID
(`bgmdaaggipcodkokcflgngmfcdgcplid`) and for enterprise policy installs, not for double-clicking.

## Settings

Right-click the icon → **Options**, or click the icon.

| Setting | Default | Meaning |
|---|---|---|
| auto-reload | on | master switch for the 503 page loop |
| retry certificate errors | on | re-attempt a handshake that failed TLS validation |
| page reloads | 5 | reload budget per tab, `0` disables the loop |
| fetch retries | 3 | per-call budget for the in-page `fetch` patch, `0` disables it |
| navigation retries | 4 | per tab, per rolling 60 s |
| base / max delay | 400 / 8000 ms | exponential backoff bounds |
| probe timeout | 25000 ms | how long the badge waits before calling the site unreachable |

Retry counts are read once per page load, so a changed value applies on the next navigation.

## Privacy

- No analytics, no telemetry, no remote code, no `eval`. The extension makes no request to any
  origin other than `datesheet.vu.edu.pk`.
- Nothing is transmitted anywhere. Retry counters are kept in `chrome.storage.session`, which is
  memory-only and cleared when the browser closes.
- The health probe runs at most every 30 s, only while a tab on the site is open, and sends
  **no cookies** (`credentials: "omit"`).
- Settings live in `chrome.storage.local` on your machine.

## Known limits

- **POST navigations cannot be replayed faithfully.** When a form submit (login, ASP.NET postback)
  dies in transit, `chrome.tabs.update({url})` re-issues it as a **GET** — no extension API can
  reconstruct a request body the browser never exposed. Expect to retype the form after such a
  failure; the retry still gets you a working page.
- **`XMLHttpRequest` is not patched.** Retrying an XHR cannot be done invisibly: the page's own
  `onload`/`onreadystatechange` handlers have already seen the failing response by the time a
  retry could be scheduled, so a retry would double-fire postback logic. `fetch` has a clean
  choke point; XHR does not.
- **The in-page budget is armable by the page.** The `fetch` retry count is handed to the MAIN
  world through a `data-` attribute, so the page itself could raise or lower its own budget.
  The blast radius is that tab only.
- The two retry loops (page reload and navigation retry) keep separate counters, so a pathological
  run could navigate a tab roughly 20 times. Both stop on their own budget.

## Development

```bash
# syntax
node --check background.js
node --check content/retry503.js

# package
zip -r -X -9 vu-retry.zip . -x '*.zip' -x 'dist/*'
```

## Releasing

```bash
git tag v1.2.0 && git push origin v1.2.0
```

The `release` workflow validates, builds `dist/vu-retry-<version>.zip` plus a self-signed `.crx`, uploads both as a workflow artifact, and publishes a GitHub Release for the tag. Set `CRX_PRIVATE_KEY` (a PEM RSA key) as a repository secret to keep the extension id stable; without it a throwaway key is generated per run.

A self-signed `.crx` installs only via enterprise policy (`ExtensionSettings` / `ExtensionInstallForcelist`) or a Chromium fork — Chrome rejects it with `CRX_REQUIRED_PROOF_MISSING`, so the `.zip` stays the store artifact.

## License

MIT — see `LICENSE`.
