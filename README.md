# AdriaTMS ERP — kompletna Netlify + Neon TMS/ERP aplikacija

Ovo je standalone web aplikacija za transportne tvrtke, napravljena za Netlify i Neon PostgreSQL. Frontend je React/Vite, backend su Netlify Functions, baza je Neon PostgreSQL. Nema vanjskih SaaS servisa osim Neon baze.

## Implementirani moduli

- Dashboard
- Registracija i prijava tvrtke
- Administracija korisnika i rola: admin, dispatcher, accountant, driver, viewer
- Kamioni
- Vozači
- Prikolice
- Kupci
- Dobavljači
- Dispečing / prijevozi
- Rute
- Izračun udaljenosti, trajanja, goriva i cestarine
- RH/EU pauze prema pravilu 4h30 vožnje + 45 min pauze
- Preporučena mjesta odmora na internoj karti
- GPS live pozicije vozila
- Tahograf evidencije s automatskim upozorenjima
- Servisi
- Gorivo
- Troškovi vozača
- Plaće
- Dokumenti
- CMR
- Fakture
- Ponude
- PDF / print centar
- Excel / CSV export
- Notifikacije
- Analitika
- Backup / JSON export
- Postavke
- Audit log
- 150 poslovnih funkcijskih modula s CRUD-om, validacijama, dozvolama, audit logom, izvještajima i UI-em

## Lokalno pokretanje

```bash
npm install
cp .env.example .env
npm run dev
```

U `.env` postaviti:

```bash
DATABASE_URL=postgresql://...
JWT_SECRET=dugi-random-string
```

Prvo pokretanje baze:

```bash
curl -X POST http://localhost:8888/api/setup
```

ili kliknite u aplikaciji **Prvi put? Inicijaliziraj Neon bazu**.

## Netlify deploy

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`
- Environment variables:
  - `DATABASE_URL`
  - `JWT_SECRET`

## Sigurnost

Neon connection string se ne smije držati u frontend kodu ni commitu. Držite ga samo u Netlify environment variables. Ako je connection string već javno poslan, rotirajte lozinku u Neon konzoli.
