# AdriaTMS ERP — kompletna Netlify + Neon TMS/ERP aplikacija

Ovo je standalone web aplikacija za transportne tvrtke, napravljena za Netlify i Neon PostgreSQL. Frontend je React/Vite, backend su Netlify Functions, baza je Neon PostgreSQL. Koristi Neon PostgreSQL za bazu. Google Maps je dodan za live karte i Directions rute na zahtjev korisnika.

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
- Google Maps karta ruta
- Google Directions stvarni izračun rute, trajanja i udaljenosti
- Fallback interna karta ako Google API key nije postavljen
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
  - `VITE_GOOGLE_MAPS_API_KEY`

## Sigurnost

Neon connection string se ne smije držati u frontend kodu ni commitu. Držite ga samo u Netlify environment variables. Ako je connection string već javno poslan, rotirajte lozinku u Neon konzoli.


## Google Maps setup

Za stvarnu live kartu i Google Directions rute potrebno je u Netlify dodati environment variable:

```bash
VITE_GOOGLE_MAPS_API_KEY=AIza...
```

U Google Cloud Console uključiti:

- Maps JavaScript API
- Directions API
- Places API, opcionalno za autocomplete/adrese

Preporuka: ograničiti API key na vlastitu Netlify domenu, npr.:

```text
https://tvoja-aplikacija.netlify.app/*
```

Nakon dodavanja variable napraviti Netlify redeploy, jer `VITE_` varijable ulaze u frontend build.


## v4 UX poboljšanja

- Uklonjene emoji ikonice i zamijenjene inline SVG ikonama.
- Redizajnirana navigacija, header, kartice, toolbar i tablice.
- Rute više ne traže samo grad, nego zasebna polja: ulica, broj, poštanski broj, grad i država.
- Dodani prijedlozi adresa preko Google Places Autocomplete kada je postavljen `VITE_GOOGLE_MAPS_API_KEY`.
- Dodan custom GPS kontrolni centar s listom vozila, pretragom, custom markerima i karticom vozila.
- Map UX je originalni profesionalni dispatch/map dizajn inspiriran modernim navigacijskim aplikacijama, ali nije kopija Google Maps UI-a.
