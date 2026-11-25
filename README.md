# VU Retry

Retries failed requests on `vu.edu.pk` and every subdomain so a 503 becomes a two-second wait instead of a manual refresh.

Unofficial. Not affiliated with Virtual University.

## Install

1. Download `vu-retry-<version>.zip` from [Releases](../../releases/latest)
2. Open `chrome://extensions`
3. Turn on **Developer mode** (top right)
4. Drag the zip onto the page

Chrome unpacks it into your profile and installs it. The zip is not needed afterwards.

Pin the extension; the badge shows `OK`, `503`, `ERR`, `CERT`, or `STOP`.

Requires Chrome 120+.

## What it fixes

| Failure | Handled by |
|---|---|
| `503 The service is unavailable.` | page detects it, shows a countdown, reloads with backoff |
| `ERR_EMPTY_RESPONSE`, resets, timeouts | background re-navigates the tab |
| TLS / certificate errors | one fresh handshake, optional toggle |
| `5xx` on in-page `fetch()` | retries GET/HEAD invisibly |
| failed `<script>` / `<link>` load | page reloads with backoff, on the same 5-reload budget; skipped while a form field holds unsubmitted input; at most one reload per page load |

Budgets stop it looping: 5 page reloads, 4 navigations per tab per minute, 3 fetch retries. All configurable.

## Settings

Click the icon.

| Setting | Default |
|---|---|
| auto-reload | on |
| retry certificate errors | on |
| page reloads | 5 |
| fetch retries | 3 |
| navigation retries (per 60 s) | 4 |
| base / max delay | 400 / 8000 ms |
| probe timeout | 25000 ms |

## Privacy

No telemetry, no remote code, no requests to any origin except `vu.edu.pk` and its subdomains. Retry counters live in memory (`chrome.storage.session`); settings stay on your machine. The health probe runs only while a tab on the site is open, and sends no cookies.

## Limits

- A POST that died in transit is replayed as a GET — no extension API can resend a form body. The retry still lands you on a working page.
- `XMLHttpRequest` is not patched; retrying it cannot be hidden from the page's own handlers.
- A failed `<script>` or `<link>` is recovered by reloading the whole page, not by re-fetching that one asset. Neither XHR nor POST is retried.

## License

MIT
