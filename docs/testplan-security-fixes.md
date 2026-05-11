# Testplan — Security fixes & verdienmodel (14 april 2026)

## Gewijzigde bestanden en wat te testen

---

### 1. Authenticatie & rate limiting
**Bestanden:** `app/api/auth/register/route.ts`, `check-email/route.ts`, `forgot-password/route.ts`, `resend-verification/route.ts`

- [ ] **Registreren** — maak een nieuw account aan, verifieer email, log in
- [ ] **Inloggen** — log in met bestaand account, check sessie
- [ ] **Wachtwoord vergeten** — stuur reset-email, reset wachtwoord, log in
- [ ] **Rate limiting** — klik 11x snel op inloggen → moet "Te veel verzoeken" geven
- [ ] **Rate limiting register** — probeer 6x snel te registreren → moet blokkeren

---

### 2. Contactformulier
**Bestanden:** `app/api/contact/route.ts`, `lib/server/email.ts`

- [ ] **Contactformulier** — verstuur een bericht via /contact, check dat het aankomt
- [ ] **XSS test** — typ `<script>alert('xss')</script>` in het bericht-veld, verstuur, check de ontvangen email → moet geëscaped zijn (zichtbare tags, geen uitvoering)
- [ ] **Lange tekst** — verstuur een bericht met >5000 tekens → moet foutmelding geven
- [ ] **Rate limiting** — verstuur 4x snel → moet blokkeren na 3e

---

### 3. Betaalflow (Mollie)
**Bestanden:** `app/api/payments/create/route.ts`, `webhook/route.ts`, `status/route.ts`, `validate-coupon/route.ts`, `coupons-active/route.ts`

- [ ] **Pro Event kopen** — volledige betaalflow via Mollie test, check dat plan geactiveerd wordt
- [ ] **Pro Jaar kopen** — zelfde flow, check 365 dagen
- [ ] **Coupon toepassen** — maak coupon aan in admin, gebruik op /upgrade, check korting op beide plannen
- [ ] **100% coupon** — maak coupon aan voor €9,95, gebruik bij Pro Event → moet direct activeren zonder Mollie
- [ ] **Upgrade Pro Event → Pro Jaar** — koop Pro Event, ga naar /upgrade, koop Pro Jaar → check verrekening in bedrag
- [ ] **Betaling geannuleerd** — annuleer betaling bij Mollie → check dat return-pagina "geannuleerd" toont
- [ ] **Rate limiting payment** — klik 6x snel op "Pro Event kopen" → moet blokkeren

---

### 4. Plan-gating (server-side)
**Bestanden:** `app/api/planner/configs/route.ts`, `plans/route.ts`, `configs/[id]/route.ts`, `plans/[id]/route.ts`

- [ ] **Free account: opslaan geblokkeerd** — zet account op free+verlopen, probeer config op te slaan via DevTools/curl → moet 403 geven
- [ ] **Free account: verwijderen geblokkeerd** — zelfde, maar DELETE request → 403
- [ ] **Pro account: opslaan werkt** — upgrade naar Pro Event, sla config op → success
- [ ] **Advies-systeem geblokkeerd** — free account, roep `/api/advisor/analyze` aan → 403
- [ ] **Sjabloon opslaan geblokkeerd** — free of Pro Event account, POST naar `/api/org/templates` → 403

---

### 5. Sessie & expiratie
**Bestanden:** `lib/server/auth.ts`, `app/(app)/layout.tsx`

- [ ] **Trial verlopen** — zet trial_expires_at op gisteren, ververs pagina → TrialExpiredOverlay moet verschijnen
- [ ] **Overlay op /upgrade** — klik "Bekijk prijzen" in overlay → /upgrade moet laden ZONDER overlay
- [ ] **Frozen plan** — zet plan_expires_at op gisteren (pro_event), ververs → FrozenBanner verschijnt
- [ ] **Frozen op /upgrade** — banner mag NIET op /upgrade staan
- [ ] **Sessie verversing na betaling** — koop Pro Event → /upgrade moet direct het actieve plan tonen
- [ ] **JWT expiry** — na 24 uur inactiviteit moet de sessie verlopen (moeilijk te testen, maar check configuratie)

---

### 6. Superadmin
**Bestanden:** `lib/server/plan-limits.ts`, `lib/server/auth.ts`, `lib/server/api-auth.ts`

- [ ] **Superadmin geen beperkingen** — log in als superadmin, check dat alle features werken zonder limieten
- [ ] **Superadmin geen overlay** — superadmin ziet nooit TrialExpiredOverlay of FrozenBanner

---

### 7. Admin dashboard
**Bestanden:** `app/(app)/admin/page.tsx`, `orgs/page.tsx`, `payments/page.tsx`, `coupons/page.tsx`, API routes

- [ ] **Dashboard stats** — check dat plan-verdeling, betalingen, omzet kloppen
- [ ] **Organisaties** — plan-kolom zichtbaar, plan wijzigen via detail-paneel
- [ ] **Betalingen** — lijst toont alle betalingen, filteren op status werkt
- [ ] **Coupons** — nieuwe coupon aanmaken, activeren/deactiveren, verwijderen
- [ ] **Coupon veld verborgen** — als er geen actieve coupons zijn, mag het couponveld op /upgrade NIET zichtbaar zijn

---

### 8. Logo upload
**Bestanden:** `app/api/org/logo/route.ts`, `app/(app)/settings/page.tsx`, `lib/export.ts`

- [ ] **Logo uploaden** — upload een PNG/JPG in settings → preview zichtbaar in card en modal
- [ ] **Logo op exports** — exporteer PDF → eigen logo moet rechtsboven staan
- [ ] **Logo verwijderen** — verwijder logo → standaard logo op exports
- [ ] **Ongeldig bestand** — upload een .txt of .svg → foutmelding
- [ ] **Te groot bestand** — upload >500KB → foutmelding

---

### 9. Configurator
**Bestanden:** `app/(app)/configurator/page.tsx`, `lib/planner/store.ts`

- [ ] **Genereer fout: te weinig stations** — maak 12+10 config met 5 stations per veld → specifieke foutmelding + advies-modal
- [ ] **Advies-modal** — modal opent automatisch, toont analyse, "Toepassen" past config aan
- [ ] **Sjablonen limiet** — free account ziet sjablonen >8 groepen als "Pro" met upgrade-modal
- [ ] **Genereer knop loading** — klik "Genereer" → knoptekst wordt "Genereren..."

---

### 10. Planner
**Bestanden:** `app/(app)/planner/page.tsx`

- [ ] **Genereer loading** — klik "Genereer" → knoptekst wordt "Genereren..."
- [ ] **Advies toepassen loading** — klik "Toepassen" bij advies → "Herberekenen..." + blauwe banner
- [ ] **Frozen status** — bevroren account kan niet genereren/opslaan/exporteren

---

### 11. Cron endpoint
**Bestanden:** `app/api/cron/expiration-warnings/route.ts`

- [ ] **Zonder CRON_SECRET** — GET request → 500 fout
- [ ] **Met verkeerde secret** — GET met `Authorization: Bearer wrong` → 401
- [ ] **Met juiste secret** — GET met juiste secret → 200 + emails verstuurd

---

### 12. Publieke website
- [ ] **Alle pagina's bereikbaar** — /, /functies, /hoe-het-werkt, /voor-wie, /prijzen, /faq, /contact
- [ ] **Contact formulier** — verstuur bericht, check bevestiging
- [ ] **Pricing pagina** — 3 kolommen correct, FAQ werkt

---

## Snelle regressietest (happy path)

1. Registreer nieuw account → verifieer email → log in
2. Maak configuratie via wizard (8 groepen, 4 spellen)
3. Genereer planning → bekijk in grid + kaarten
4. Probeer export → upgrade-modal
5. Ga naar /upgrade → koop Pro Event (Mollie test)
6. Na betaling → plan actief op /upgrade en /settings
7. Exporteer PDF → check logo
8. Advies-systeem → toepassen → herberekening
9. Log uit → log weer in → configuratie bewaard
