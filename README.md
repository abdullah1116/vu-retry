# VU Retry

Retries failed requests on `datesheet.vu.edu.pk` so a 503 becomes a two-second wait instead of a manual refresh.

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

No telemetry, no remote code, no requests to any origin except `datesheet.vu.edu.pk`. Retry counters live in memory (`chrome.storage.session`); settings stay on your machine. The health probe runs only while a tab on the site is open, and sends no cookies.

## Limits

- A POST that died in transit is replayed as a GET — no extension API can resend a form body. The retry still lands you on a working page.
- `XMLHttpRequest` is not patched; retrying it cannot be hidden from the page's own handlers.

## License

MIT
