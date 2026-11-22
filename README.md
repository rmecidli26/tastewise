# Tastewise — Find Your Perfect Dish

AFA Restaurant üçün şəxsi yemək tapma platforması. İstifadəçi inqrediyent, büdcə, pəhriz və zövqünə görə menyudan uyğun yeməyi tapır, rəy yazır, sevimlilərini saxlayır və masa rezervasiyası göndərir.

- **Frontend:** HTML, CSS, vanilla JavaScript (`frontend/`)
- **Backend:** Node.js 20+, Express, PostgreSQL (`backend/`)
- **Hesablar:** qeydiyyat, 6 rəqəmli email təsdiq kodu, login, şifrə bərpası (JWT `httpOnly` cookie)
- **3 dil:** Azərbaycan (əsas), English, Русский — interfeys, menyu, xəta mesajları və emaillər

## İşə salmaq (lokal)

Lazım olanlar: **Node.js 20+** və **PostgreSQL 14+** (və ya Docker).

```bash
# 1. PostgreSQL-i qaldır
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env        # JWT_SECRET-i dəyiş
npm install
npm run migrate             # cədvəlləri yaradır
npm run seed                # AFA-nın real menyusu: 9 pizza + 8 dönər
npm run dev                 # http://localhost:4000
```

Brauzerdə **http://localhost:4000** açın — backend frontend fayllarını da özü paylaşır.

### Email təsdiq kodu (development)

`.env`-də `SMTP_HOST` boşdursa, email göndərilmir: kod **server konsoluna** yazılır və API cavabında `devCode` kimi qaytarılır (saytda bildiriş kimi görünür). Bu yalnız development-də işləyir, production-da heç vaxt.

Real email üçün `.env`-də SMTP məlumatlarını doldurun (Gmail App Password, Brevo, Mailgun, Resend və s.):

```
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
MAIL_FROM="Tastewise by AFA <no-reply@your-domain.az>"
```

### Admin hesabı

Saytda qeydiyyatdan keçin, sonra:

```bash
npm run make-admin -- you@example.com
```

Admin `admin.html` səhifəsində rezervasiyaları təsdiqləyir / rədd edir; qonağa avtomatik email gedir.

## Menyunu dəyişmək

Menyu `backend/seeds/menu.json` faylındadır (restoran, kateqoriyalar, yeməklər, inqrediyentlər, allergenlər). Faylı dəyişib `npm run seed` işlədin. Seed təkrar işə salına bilər: yeməklər `slug` ilə yenilənir, rəylər və sevimlilər silinmir. Fayldan çıxarılan yemək silinmir, sadəcə gizlədilir.

Yemək şəkli `frontend/images/dishes/<slug>.jpg`-dədir (`"image"` sahəsi). Şəkil yoxdursa, kartda ikon göstərilir.

Ölçü və ya seçim olan yeməklər üçün `variants` siyahısı yazılır (məs. pizza: 18 / 30 / 35 sm; dönər: toyuq / ət). Kartda ən aşağı qiymət "…-dan" kimi göstərilir, yemək səhifəsində seçim düyməsi qiyməti dəyişir. `"best_seller": true` kartda "Ən çox satılan" lentini göstərir.

Köhnə versiyadan keçəndə: `npm run migrate` (003 miqrasiyası) və `npm run seed`. Köhnə nümunə yeməklər gizlənir, rəylər və hesablar qalır.

## Dillər (AZ / EN / RU)

- Dil header-dəki **AZ · EN · RU** düymələri ilə dəyişir və brauzerdə yadda qalır. İlk girişdə brauzerin dili yoxlanılır, uyğun gəlmirsə Azərbaycan dili açılır.
- **Interfeys mətnləri:** `frontend/js/i18n.js` — hər açar üç dildə. HTML-də `data-i18n="açar"` atributları var.
- **Menyu:** `backend/seeds/menu.json`-da hər yeməyin `i18n` sahəsi (az/ru ad və təsvir), kateqoriyaların `i18n`-i və `ingredient_names` (inqrediyent tərcümələri). İngilis dili əsas sahələrdədir (`name`, `description`).
- **Server mesajları və emaillər:** `backend/src/i18n.js`. Brauzer hər sorğuda `X-Lang` başlığını göndərir; emaillər istifadəçinin son istifadə etdiyi dildə gedir (`users.locale`).
- Axtarış və filtrlər üç dildə işləyir: "qoz", "орехи", "nuts" eyni nəticəni verir. Qruplar: süd məhsulları / молочное / dairy, qlüten / глютен / gluten, ət / мясо / meat, dəniz məhsulları / морепродукты / seafood.

Yeni yemək əlavə edəndə `i18n` sahəsini də doldurun, yoxsa həmin yemək AZ/RU-da ingiliscə görünəcək.

## Struktur

```
tastewise/
├─ frontend/
│  ├─ index.html      Ana səhifə: inqrediyent + büdcə axtarışı, populyar yeməklər
│  ├─ explore.html    Kəşf et: filtrlər (qiymət, kateqoriya, pəhriz, reytinq), sıralama
│  ├─ dish.html       yemək, ölçü/seçim, inqrediyentlər, rəylər
│  ├─ favorites.html  sevimlilər
│  ├─ about.html      haqqımızda
│  ├─ visit.html      AFA-ya gəlin: restoran, qalereya, xəritə
│  ├─ reserve.html    masa sifarişi
│  ├─ account.html    hesabım: profil, fəaliyyət, rezervasiyalar, sevimlilər, tənzimləmələr
│  ├─ login.html  register.html  verify.html  forgot.html  admin.html  404.html
│  ├─ menu.html       köhnə link → explore.html
│  ├─ images/  dishes/  site/
│  ├─ css/style.css
│  └─ js/  i18n.js  api.js  common.js  <səhifə>.js
└─ backend/
   ├─ migrations/001_init.sql  002_i18n.sql  003_menu_variants.sql  004_profile.sql
   ├─ seeds/menu.json
   └─ src/
      ├─ server.js  app.js  config.js  db.js  i18n.js
      ├─ middleware/  auth  validate  rateLimit  errors
      ├─ routes/      auth  me  dishes  reviews  favorites  reservations  restaurant  admin  newsletter
      ├─ services/    codes  email  dishes  ingredients  recommend
      └─ scripts/     migrate  seed  make-admin
```

## API (qısa)

| Metod | Yol | Giriş | Təsvir |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | — | Hesab + email kodu |
| POST | `/api/auth/verify-email` | — | `{ email, code }` → təsdiq + giriş |
| POST | `/api/auth/resend-code` | — | Yeni kod (60 san. gözləmə) |
| POST | `/api/auth/login` · `/logout` | — | Sessiya cookie (`remember: true` → 30 gün, yoxsa brauzer bağlananda bitir) |
| GET | `/api/auth/me` | — | `{ user }` və ya `{ user: null }` |
| POST | `/api/auth/forgot-password` · `/reset-password` | — | Şifrə bərpası kodu |
| GET | `/api/dishes` | — | `q, prefer, category, cuisine, diet, meal, minPrice, maxPrice, maxSpice, minRating, include, exclude, sort (match·popular·price_asc·price_desc·name), page, limit` |
| GET | `/api/dishes/:id` | — | Yemək + inqrediyentlər (allergen) |
| POST | `/api/recommendations` | — | `{ meal, cuisine[], mood, diet[], spice, budget, love, avoid }` |
| GET | `/api/categories` · `/cuisines` · `/ingredients` · `/restaurant` | — | Siyahılar |
| GET / PUT / DELETE | `/api/dishes/:id/reviews` | PUT/DELETE: ✔ | Rəylər (1 istifadəçi = 1 rəy) |
| GET · PATCH | `/api/me/profile` | ✔ | Profil (ad, telefon, şəhər) + fəaliyyət sayları |
| POST | `/api/me/password` | ✔ | Şifrəni dəyiş (digər cihazlarda çıxış edilir) |
| GET · PUT · DELETE | `/api/me/favorites[/:dishId]` | ✔ | Sevimlilər |
| POST | `/api/reservations` | ✔ | Rezervasiya sorğusu |
| GET · POST | `/api/me/reservations` · `/:id/cancel` | ✔ | Öz rezervasiyaları |
| GET · PATCH | `/api/admin/reservations[/:id]` | admin | Təsdiq / rədd |
| POST | `/api/newsletter` | — | `{ email }` — xəbər abunəsi |

Xəta formatı: `{ "error": { "code": "INVALID_CODE", "message": "...", "details": ... } }`

## Təhlükəsizlik qeydləri

- Şifrələr `bcrypt` (12 raund), təsdiq kodları peppered SHA-256 kimi saxlanır.
- Kod 10 dəqiqə keçərlidir, 5 səhv cəhddən sonra bloklanır, yeni kod 60 saniyədən tez istənilmir.
- Sessiya: JWT `httpOnly`, `SameSite=Lax`, production-da `Secure` cookie; şifrə dəyişəndə köhnə sessiyalar etibarsız olur.
- Auth endpoint-lərinə IP üzrə limit (15 dəq / 30 sorğu), `helmet` başlıqları, parametrli SQL.

## Production

1. İdarə olunan PostgreSQL (Render, Railway, Neon, Supabase…) — `DATABASE_URL`, lazım olsa `DATABASE_SSL=true`.
2. `NODE_ENV=production`, uzun təsadüfi `JWT_SECRET`, `APP_URL=https://your-domain`.
3. SMTP məlumatları.
4. `npm ci && npm run migrate && npm run seed && npm start` (HTTPS arxasında).
