# car-reminder-api — B2B Fleet & Expense API

Backend Express + TypeScript + Prisma + PostgreSQL pentru management flotă și decont cheltuieli B2B.

## Funcționalități

- **Multi-companie** — izolare completă prin `companyId` la nivel de query
- **Roluri** — ADMIN / MANAGER / ACCOUNTANT / EMPLOYEE cu permisiuni granulare
- **Delegații (Trips)** — workflow complet: ACTIVE → CLOSED → SUBMITTED → APPROVED/REJECTED
- **Cheltuieli** — cu upload bon, OCR automat (Claude Haiku), confirmare manuală
- **Rapoarte PDF** — per delegație sau lunare, cu imagini bonuri atașate
- **Email** — trimitere raport la contabil via SMTP
- **Flotă** — reminder expirare documente (ITP, RCA, ROVINIETA), digest email la 30/14/7/1 zile
- **Export CSV** — cheltuieli filtrate, UTF-8 cu BOM (compatibil Excel RO)

---

## Roluri

| Rol | Acces |
|-----|-------|
| `ADMIN` | Orice acțiune în companie + setări company |
| `MANAGER` | Vede tot, aprobă/respinge deconturi |
| `ACCOUNTANT` | Read-only + generare rapoarte |
| `EMPLOYEE` | Doar propriile trips/cheltuieli |

---

## Setup

### 1. Cerințe

- Node.js 20+
- PostgreSQL 15+

### 2. Instalare

```bash
npm install
cp .env.example .env
# Editează .env cu valorile tale
```

### 3. Baza de date

```bash
npx prisma migrate dev --name init
npm run seed
```

Seed-ul creează:
- Companie: **Demo SRL** (CIF: RO12345678)
- 4 useri (parolă: `Demo1234!`):
  - `admin@demo.local` — ADMIN
  - `manager@demo.local` — MANAGER
  - `accountant@demo.local` — ACCOUNTANT
  - `employee@demo.local` — EMPLOYEE
- 2 mașini + remindere exemplu

### 4. Pornire

```bash
npm run dev      # development (tsx watch)
npm run build && npm start  # production
```

---

## Variabile de mediu

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname

JWT_ACCESS_SECRET=<min 32 chars>
JWT_REFRESH_SECRET=<min 32 chars>
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN_DAYS=30

PUBLIC_URL=https://yourdomain.com/car-reminder   # folosit pt. URL imagini
CLIENT_URL=https://yourfrontend.com

# OCR bonuri (opțional)
ANTHROPIC_API_KEY=sk-ant-...

# Email rapoarte (opțional)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASS=yourpassword
SMTP_FROM="Demo SRL <noreply@example.com>"

# Push notificații (opțional)
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@example.com
```

---

## Flux complet decont (exemple curl)

### 1. Înregistrare companie + login

```bash
# Register — creează company + admin
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@firma.ro","password":"Parola123!","companyName":"Firma SRL","firstName":"Ion","lastName":"Popescu"}'

# Login
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@firma.ro","password":"Parola123!"}'
# → { accessToken, refreshToken, user }

TOKEN="<accessToken din răspuns>"
```

### 2. Invită un angajat

```bash
curl -X POST http://localhost:4000/api/users/invite \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"angajat@firma.ro","firstName":"Maria","lastName":"Ion","role":"EMPLOYEE"}'
# → { user, temporaryPassword }
```

### 3. Pornește o delegație

```bash
curl -X POST http://localhost:4000/api/trips \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"destination":"Cluj-Napoca","purpose":"Intalnire client","startDate":"2026-06-15","budget":800}'
# → { id: "trip-uuid", status: "ACTIVE", ... }

TRIP_ID="<id din răspuns>"
```

### 4. Upload bon + OCR

```bash
# Upload imagine bon
curl -X POST http://localhost:4000/api/expenses/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@bon.jpg"
# → { imageUrl: "https://.../uploads/receipts/bon-resized.jpg" }

IMAGE_URL="<imageUrl din răspuns>"

# OCR extragere date
curl -X POST http://localhost:4000/api/ocr/receipt \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"imageUrl\":\"$IMAGE_URL\"}"
# → { amount: 250.50, currency: "RON", date: "2026-06-15", merchant: "Petrom",
#     cif: "RO1234567", category: "COMBUSTIBIL", confidence: "high" }
```

### 5. Adaugă cheltuiala (se atașează automat la trip ACTIVE)

```bash
curl -X POST http://localhost:4000/api/expenses \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"category\":\"COMBUSTIBIL\",\"amount\":250.50,\"currency\":\"RON\",\"date\":\"2026-06-15\",\"merchant\":\"Petrom\",\"imageUrl\":\"$IMAGE_URL\",\"verified\":true}"
```

### 6. Închide delegația și trimite spre aprobare

```bash
# Închide
curl -X POST http://localhost:4000/api/trips/$TRIP_ID/close \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"kmEnd": 45250}'

# Trimite spre aprobare
curl -X POST http://localhost:4000/api/trips/$TRIP_ID/submit \
  -H "Authorization: Bearer $TOKEN"

# Aprobă (MANAGER/ADMIN)
curl -X POST http://localhost:4000/api/trips/$TRIP_ID/approve \
  -H "Authorization: Bearer $TOKEN"
```

### 7. Generează raport PDF și trimite pe email

```bash
# Generează
curl -X POST http://localhost:4000/api/reports/trip/$TRIP_ID \
  -H "Authorization: Bearer $TOKEN"
# → { id: "report-uuid", pdfPath: "...", ... }

REPORT_ID="<id din răspuns>"

# Descarcă PDF
curl -O -J http://localhost:4000/api/reports/$REPORT_ID/download \
  -H "Authorization: Bearer $TOKEN"

# Trimite la contabil
curl -X POST http://localhost:4000/api/reports/$REPORT_ID/send \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to":"contabil@firma.ro"}'
```

### 8. Export CSV cheltuieli

```bash
curl "http://localhost:4000/api/expenses/export?from=2026-06-01&to=2026-06-30" \
  -H "Authorization: Bearer $TOKEN" \
  -o cheltuieli-iunie.csv
```

### 9. Dashboard mobil

```bash
curl http://localhost:4000/api/stats/summary \
  -H "Authorization: Bearer $TOKEN"
# → { activeTrip, currentMonth: { total, byCategory }, expiringDocuments }
```

---

## Teste

```bash
npm test
```

3 suite-uri (18 teste):
- `report-totals` — calcul subtotaluri/total raport, delta buget
- `company-scoping` — izolare date între companii, restricție EMPLOYEE
- `ocr-parsing` — parsare defensivă răspuns Claude (JSON fences, câmpuri lipsă, valori invalide)

---

## Structură proiect

```
src/
├── app.ts                    # Express app + rute
├── server.ts                 # Pornire server + cron
├── config/env.ts             # Validare env cu Zod
├── lib/
│   ├── prisma.ts             # Prisma client singleton
│   ├── tokens.ts             # JWT sign/verify (include companyId+role)
│   ├── errors.ts             # AppError
│   ├── mailer.ts             # nodemailer SMTP
│   └── pdf.ts                # Generare PDF cu pdfkit
├── middleware/
│   ├── auth.ts               # requireAuth (Bearer token)
│   ├── roles.ts              # requireRole(...roles)
│   ├── validate.ts           # Zod validation middleware
│   └── error.ts              # Error handler centralizat
├── jobs/
│   └── reminder-cron.ts      # Cron zilnic + digest email flotă
└── modules/
    ├── auth/                 # register (company+admin), login, refresh, logout
    ├── users/                # /me, /invite, list
    ├── company/              # GET/PATCH setări companie
    ├── cars/                 # CRUD flotă
    ├── reminders/            # CRUD remindere documente
    ├── costs/                # CRUD costuri per vehicul
    ├── fuel/                 # CRUD alimentări + analytics
    ├── documents/            # Upload documente vehicul
    ├── notifications/        # Push notifications (Web Push + Expo)
    ├── trips/                # CRUD delegații + workflow aprobare
    ├── expenses/             # CRUD cheltuieli + upload + export CSV
    ├── ocr/                  # OCR bonuri cu Claude Haiku
    ├── reports/              # Generare PDF + email
    ├── fleet/                # Overview flotă cu status documente
    └── stats/                # Dashboard summary
```
