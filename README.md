# Hikmah Online LMS

Learning platform for Hikmah Institute: live, recorded and hybrid courses; free and paid (bank-transfer receipts verified by staff); quizzes, assignments, attendance, recordings and QR-verifiable certificates. Mobile-first.

| Part | Stack | Folder |
|---|---|---|
| API + staff panel + worker | Django 6, DRF, django-allauth (headless + MFA), Unfold admin, django-q2, WeasyPrint | `backend/` |
| Web app | Next.js 16, React 19, Tailwind 4, TanStack Query | `frontend/` |
| Local services | Postgres 16, Mailpit | `docker-compose.yml` |

Product spec: [`docs/Hikmah_Online_PRD_v1.docx`](docs/Hikmah_Online_PRD_v1.docx). Dev accounts: [`docs/DEV_USERS.md`](docs/DEV_USERS.md) (generated).

## Architecture (modular monolith)

- **One Django backend** split into domain apps (`apps/core, accounts, courses, enrollments, payments, learning, live, assessments, certificates, notifications`). Business rules live in each app's `services.py`; the REST API (`/api/v1`) and the staff panel both call those services, so rules are enforced once.
- **One Next.js web app** for students. The browser only talks to this origin; Next proxies `/api`, `/_allauth` and `/media-public` to Django, so the session cookie is first-party and there is no CORS.
- **One worker** (`manage.py qcluster`) for emails, reminders, certificate PDFs, enrollment expiry and backups.
- **Staff** (admins, course managers, instructors) use the Django staff panel at `/<ADMIN_URL_PATH>/` with TOTP 2FA. Instructors are automatically scoped to their own courses.

## What's configurable without code

- **`.env`** (`backend/.env.example`, `frontend/.env.example`): domains, secrets, storage (local/R2), email provider, Google OAuth, login lockout, upload limits, signed-URL lifetime, throttles, 2FA requirement, session timeouts.
- **Staff panel → Site settings**: branding (name, logo, colours, fonts), support contacts, refund policy, review ETA, reminder timings, join window; **Profile fields** (add/remove/require sign-up fields); **Email templates** (subject/body per event, with variable validation); **Certificate templates**; **Feature flags** (Google login, Turnstile, PWA prompt, analytics, self-service deletion…); **Pages** (privacy, terms, FAQ, refund…); **Eligibility rules**; **Bank accounts**; **Categories**.
- **Per course**: type, price + any currency, bank accounts, enrollment mode, capacity, enrollment window, eligibility, access duration, completion rules (lessons / quizzes / assignments / attendance %), certificate template, recording publish policy.

## Run locally

Prerequisites: Docker, [uv](https://docs.astral.sh/uv/), Node 20+. On macOS also `brew install pango` (certificate PDFs).

```bash
docker compose up -d
```

```bash
cd backend && cp .env.example .env && uv sync && uv run python manage.py migrate && uv run python manage.py seed_dev
```

```bash
cd backend && uv run python manage.py runserver 8000
```

```bash
cd frontend && cp .env.example .env.local && npm install && npm run dev
```

- Web app: http://localhost:3000 · Staff panel: http://localhost:8000/staff-panel/ · Emails (Mailpit): http://localhost:8025
- Background jobs run inline in dev (`Q_SYNC=True`). To run the real worker: `uv run python manage.py qcluster`.
- `seed_dev --reset` recreates all demo data. It refuses to run unless `DEBUG=True`.

## Tests

```bash
cd backend && ./scripts/test.sh
```

```bash
cd frontend && npm run typecheck && npm run lint && npm test
```

```bash
cd frontend && npx playwright install chromium && npm run test:e2e
```

- Backend: pytest (service rules, API permission matrix, IDOR, lockout, signed-URL expiry, 2FA gate, admin smoke tests for every role).
- Frontend: Vitest unit tests (dynamic profile form, quiz timer/autosave, receipt uploader…).
- E2E: Playwright on a 375px phone and a 1280px desktop. **It re-seeds the dev database** (`seed_dev --reset`) and needs the API, web app and Mailpit running.

## Security notes

HTTPS + HSTS in production; per-request nonce CSP on the web app; strict CSP on the API (the staff panel alone allows `unsafe-eval`, required by its UI library); session cookies only (HttpOnly, Secure, SameSite=Lax) with CSRF; argon2 passwords, breached-password check, login lockout (django-axes) and rate limits; mandatory TOTP for staff with idle timeout; deny-by-default API permissions with per-user scoping; private file storage served only through 5-minute signed URLs after a permission check; uploads checked by content type and size; admin-editable templates are sandboxed (email variables only; certificate rendering cannot fetch URLs); append-only audit log for payments, access changes, grades, attendance, settings and exports; daily database backups with retention.

## Deploy (Railway + Cloudflare R2 + Resend)

Four Railway services from this repo: `api` (`backend/`, `railway.json`), `worker` (`backend/`, `railway.worker.json`), `web` (`frontend/`, `railway.json`), and the Postgres plugin.

1. Set `api`/`worker` variables from `backend/.env.example` with the production values noted inline (`DEBUG=False`, `SECURE_COOKIES=True`, `SECURE_SSL_REDIRECT=True`, `SECURE_HSTS_SECONDS=31536000`, `STAFF_2FA_REQUIRED=True`, `PWNED_PASSWORD_CHECK=True`, `STORAGE_BACKEND=s3` + R2 keys, `EMAIL_BACKEND=anymail.backends.resend.EmailBackend` + `RESEND_API_KEY`, domains, `DEV_SEED_ALLOWED=False`).
2. Set `web` variables: `API_URL` (the api service's internal or public URL) and `NEXT_PUBLIC_SITE_URL`.
3. The api container runs `migrate` and `bootstrap_defaults` on start. Create the first Super Admin with `python manage.py createsuperuser`, sign in to the staff panel and set up 2FA.
4. Before launch: `python manage.py check --deploy`, restore a backup into a scratch database, run the E2E suite against staging, and scan the security headers.
