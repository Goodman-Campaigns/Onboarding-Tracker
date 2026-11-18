# Change log

Newest first. Every push to `main` should add a dated entry here (what changed and why it matters, plus any manual step such as a
setting, a secret or a sheet change), and the README should be updated whenever behavior, files or setup change. `git log` has the
exact code changes; this file is the readable version. Entries before 2026-11-18 were written afterwards from the commit history
(the numbers in brackets are pull requests).

## 2026-11-16
- Added "Added to combined mapping sheet" to Pre-start for all clients.

## 2026-11-12
- Tag and client names are escaped in the page; the leftover Zapier constant was renamed (#1).

## 2026-11-04
- The Text Expander email is sent through Apps Script instead of Zapier.

## 2026-08-07
- Page updates.

## 2026-08-05
- Trimmed URL parameters and improved error handling; added `confirm.html` for onboarding task confirmation; Text Expander notification takes Zapier parameters.

## 2026-08-04
- Start date input placeholder and parsing changed; visible clients sorted by start date; `START_WARNING_DAYS` added; client card shows blockers; task list shows owner counts.

## 2026-07-21
- Google sign-in and an auth gate.

## 2026-06-18 to 2026-06-26
- First version: the onboarding tracker page (`index.html`) and its first updates.
