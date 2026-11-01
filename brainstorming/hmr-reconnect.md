# Parcel HMR reconnect

**Date:** 2026-11-01  
**Status:** Brainstorming (not implemented)  
**Related:** `src/app/index.js` (`module.hot.dispose` / `accept`), [`app-structure.md`](app-structure.md), planning HMR smoke note in `planning/2026-10-21-01-app-structure-refactor.md`

---

## Problem

Dev tab can go **silently stale**: Parcel rebuilds on disk (`pnpm start` → `:37852`), but the open page keeps the old in-memory module graph.

**Symptom that proved it:** source and served bundle had `console.log('state')` commented out and a new UI icon, while the tab still logged state and showed the old icon. Server was fine; **HMR never replaced the entry module**.

Stock Parcel browser runtime (`@parcel/runtime-browser-hmr` → `lib/loaders/hmr-runtime.js`) on WebSocket `close` only warns:

`[parcel] 🚨 Connection to the HMR server was lost`

— no reconnect. Further saves update `dist/`; the tab hears nothing until a manual full reload.

Unrelated noise: another Parcel app on **`:1234`** (iblokz IDE) — not Grooves. Grooves serve port is **`37852`** (`package.json` `start`). HMR uses the **same** port as serve by default (`--hmr-port` only if overridden).

---

## What we want

**Reconnect the HMR pipe and keep hot-apply** — no `location.reload()` as the recovery strategy.

- Happy path: WS stays up → normal `update` → dispose / accept (existing `index.js` hooks).
- After drop: backoff reconnect → **next** acceptable `update` patches as usual (same runtime path).

`location.reload()` after disconnect is the same as the user refreshing: it works, but it is not HMR. Useful only as an optional stale-guard, not the goal.

---

## Parcel protocol limits

On new WS connection, `HMRServer` only sends an unresolved **error**, not a replay of missed `update`s. So:

| Approach | Resume future HMR without reload? | Reapply edits missed while offline? |
|----------|-----------------------------------|--------------------------------------|
| Reconnect client WS only | Yes (after next save that includes those assets) | **No** — no catch-up |
| Also patch server to resend last `update` on connect | Yes | Yes (custom) |
| ETag poll → `location.reload()` | No (full refresh) | Yes |

Reconnect alone does **not** force reload on the next update; an `update` still goes through accept → dispose → swap → accept. Parcel may still send `type: 'reload'` (or the client may fail accept) for some changes — separate from reconnect.

---

## Where the fix lives

The HMR WebSocket is created inside Parcel’s injected runtime, **not** app code. Grooves cannot resume that socket from `src/`.

**Client reconnect** → `pnpm patch` (or fork) `@parcel/runtime-browser-hmr`: replace one-shot `new WebSocket` + warn-only `onclose` with connect + exponential backoff; on `open` reset attempts; **do not** `location.reload()`.

Patch **`lib/loaders/hmr-runtime.js`** (runtime `readFileSync`s that file into the bundle). Keep `src/loaders/…` aligned if desired.

**True missed-update replay** → also patch `@parcel/reporter-dev-server` `HMRServer` connection handler — out of scope unless we need it.

Serve-only by nature: production `parcel build` does not inject HMR when `hmrOptions` is off.

---

## App-side HMR (already there)

`src/app/index.js` dispose stops services, completes `state$`, saves snapshot; accept restores state via `dispatch`. Heavy teardown can make applies flaky or push Parcel toward full reload — worth hardening later, but it does not explain a tab that **never left** the old `console.log` (entry dispose never ran → update never arrived).

---

## Decision lean

1. Prefer **`pnpm patch` on `@parcel/runtime-browser-hmr`** for reconnect-only (no reload on reconnect/open).
2. Skip app-level reload guards unless we want a louder “you’re stale” affordance.
3. Server catch-up only if reconnect-without-replay is still painful in practice.
4. After reconnect, one more save (or touch) may be needed to sync modules edited while the socket was dead.

---

## Sketch (client)

```js
// lib/loaders/hmr-runtime.js — conceptual
function connectWs() {
  ws = new WebSocket(protocol + '://' + hostname + (port ? ':' + port : '') + '/');
  ws.onmessage = async (event) => handleMessage(JSON.parse(event.data));
  ws.onclose = () => {
    console.warn('[parcel] HMR lost — reconnecting…');
    scheduleReconnect(); // backoff, cap ~15s
  };
  ws.addEventListener('open', () => {
    reconnectAttempts = 0;
    // no location.reload()
  });
}
```

Apply with `pnpm patch @parcel/runtime-browser-hmr@2.16.4` → edit → `pnpm patch-commit`.
