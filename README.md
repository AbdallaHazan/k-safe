# KeySafe

Zero-knowledge password manager: Django REST API + React (Vite) client.
Credential plaintext is encrypted in the browser with AES-256-GCM; the server stores ciphertext only.

## Prerequisites

- Python **3.12 or 3.13** (recommended; avoid 3.14 for this project)
- Node.js 20+

A broken or Python-3.14-only environment can fail on Pillow wheels. Recreate `venv` with 3.12/3.13 if installs fail.

## Backend (run in your terminal)

```powershell
cd "D:\Desktop\personal projects\ksafe"
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt

copy .env.example .env
# edit .env if needed

cd backend
python manage.py makemigrations
python manage.py migrate
python manage.py runserver
```

API base: `http://127.0.0.1:8000/api/`

## Frontend (run in a second terminal)

```powershell
cd "D:\Desktop\personal projects\ksafe\frontend"
npm install
npm run dev
```

App: `http://localhost:5173` (proxies `/api` to Django)

## Features

- Register / login with client-side Argon2id key wrapping
- JWT auth + optional email OTP 2FA (codes sent to your Gmail/account email)
- Forgot master password via email OTP (creates a new empty vault — old data cannot be recovered)
- Encrypted vault CRUD, categories, reveal/copy audit logs
- Dashboard, security score, settings (password change re-wraps DEK)
- Encrypted vault export + import
- **System admin** (staff): user lifecycle status (Pending vs Active), lock/deactivate, security logs

## System admin

Create a dedicated admin identity from the server. Use a different email and
password from every vault account:

```powershell
cd backend
python manage.py create_system_admin admin@example.com --name "System Admin"
```

Then open `http://localhost:5173/admin/login`. Admin login always requires the
admin password plus an email OTP. Admin identities cannot sign in to the user
vault, and normal vault accounts cannot be promoted from the web UI.

**User status meanings:**

| Status | Meaning |
|--------|---------|
| Pending | Account created but biometric not enabled — not a “real” user yet |
| Active | Biometric onboarding done, account usable |
| Locked | Temporary lockout after failed logins |
| Inactive | Disabled by an admin |

Admins never see plaintext passwords (zero-knowledge). Django’s `/admin/` on the API server remains available for deep DB ops.

| Area | Status |
|------|--------|
| Backend API + migrations | Done (Python 3.12) |
| Hardened 2FA / pre-auth | Done |
| Memory-only DEK + idle lock | Done |
| Soft-delete trash + import/export | Done |
| Login history + reused password scan | Done |
| Encrypted website URLs | Done |
| API tests | Done (`manage.py test`) |
| Frontend UI + crypto | Done (run `npm install`) |
| Local `.env` | Done (dev defaults) |
| System admin panel (`/admin`) | Done |
| Browser extension / autofill | Out of scope (separate product) |
| Production deploy (Postgres/HTTPS) | Ops checklist below |

## Production checklist

1. Set a strong `DJANGO_SECRET_KEY` and `DJANGO_DEBUG=False`
2. Use PostgreSQL via `DATABASE_URL`
3. Serve behind HTTPS; keep `CORS_ALLOWED_ORIGINS` tight
4. Set `FRONTEND_URL` to the exact public SPA origin (required for WebAuthn / biometrics)
5. Configure real SMTP (`EMAIL_*`) so login 2FA and admin OTP emails deliver
6. Rotate secrets; never commit `.env`
7. Run from `backend/`: `python manage.py migrate` then `python manage.py test`
8. Build the SPA with `npm run build` and serve `frontend/dist` behind the same origin or a reverse proxy to `/api`

## Demo data

Demo seed data was removed. Create your own account from the Register page.


1. Start backend: `python manage.py migrate` then `runserver`
2. Start frontend: `npm install` then `npm run dev`
3. Register → login → add credential → reveal/copy
4. Enable email 2FA in Settings → logout → login (code arrives in email; vault keys only after 2FA)
5. Optional: Forgot password → email code → new master password (vault wiped)
6. Soft-delete → restore from Trash → export/import
7. Security page shows reused passwords; Settings idle lock after inactivity
8. Run tests: `python manage.py test`
"# k-safe" 
