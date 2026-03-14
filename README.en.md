# Robot Population Atlas

Multilingual docs:
- Chinese: [README.md](./README.md)
- English (this page)

## Overview

This project is a **global robot-per-city visualization platform**.
The product focuses on data display, not exposing crawler operations.

### Internal data pipeline
1. Scheduled jobs fetch feeds/sources daily
2. Normalize and extract facts
3. Deduplicate into canonical events
4. Map reads canonical events only

> Public crawl APIs are disabled by default; updates run via internal scheduler.

## Features

- Zoom-driven map level:
  - world view: country
  - regional view: province/state
  - city view: city
- Always-visible robot hotspots (heat + glow + points)
- Left panel focuses on product filters only:
  - continent
  - city keyword
  - robot type
- Click any region to see robot details

## Local run

### Backend
```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:8080/api/health

## Scheduler env

```env
CRAWL_CRON=0 3 * * *
CRAWL_RUN_ON_STARTUP=true
REQUEST_DELAY_MS=800
```

## Docker deploy

```bash
docker compose build
docker compose up -d
```
