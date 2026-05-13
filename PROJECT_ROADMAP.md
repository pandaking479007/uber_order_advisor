# Ride Decision Advisor Roadmap

## Project Overview

Ride Decision Advisor is a web app for Uber and Lyft drivers who want to make better driving decisions with real numbers instead of gut feeling.

The app helps a driver answer two questions:

1. Should I accept this trip offer?
2. Was today actually profitable after miles, energy, vehicle cost, and tax reserve?

The first version is designed around a Tesla Model Y driver in Utah, especially the Salt Lake City, Lehi, Draper, Provo, and airport corridor. The same logic can later support other vehicles and cities.

## Why This Helps Uber / Lyft Drivers

Many drivers look only at the offer amount, for example "$18" or "$40". That can be misleading. A trip may look good but become unprofitable after pickup miles, total time, dead miles, destination risk, depreciation, tires, insurance, electricity, and taxes.

This app focuses on the metrics that actually affect profit:

- Gross per online hour
- Gross per total mile
- Pickup distance
- Dead-mile rate
- Destination quality
- Full vehicle cost per mile
- Pretax real profit
- Estimated after-tax profit

For a Model Y driver, electricity is cheap, but the real cost is not just electricity. Tires, depreciation, insurance, maintenance, and dead miles matter a lot. The app makes those costs visible before and after driving.

## Current Features

### Trip Decision Calculator

Drivers can enter:

- Offer amount
- Trip miles
- Pickup miles
- Estimated total time
- Destination type
- Vehicle cost profile

The app calculates:

- Gross per hour
- Gross per total mile
- Estimated vehicle cost
- Pretax net income
- Tax reserve
- Estimated after-tax net

The app then gives a recommendation:

- Accept
- Maybe
- Decline

### Daily KPI Tracker

Drivers can record daily performance:

- Gross earnings
- Online hours
- Total driving miles
- Start odometer
- End odometer
- Booked miles
- Home charging kWh
- Supercharger kWh
- Tips / bonus
- Low-demand area flag

The app calculates:

- Gross per hour
- Gross per total mile
- Dead-mile rate
- Charging energy
- Energy per mile
- Pretax real profit
- Tax reserve
- Estimated after-tax profit

### Cost Breakdown

The app estimates Model Y cost per mile from editable assumptions:

- Home electricity rate
- Supercharger rate
- Home charging percentage
- kWh per mile
- Tire set cost
- Tire replacement mileage
- Maintenance cost
- Maintenance interval
- Monthly insurance increase
- Estimated annual miles
- Depreciation per mile

This creates a more realistic full cost per mile than only using electricity cost.

### Tesla Integration Foundation

The app has started moving toward Tesla daily data sync.

Planned Tesla data:

- Odometer
- Daily miles
- Home charging kWh
- Supercharger kWh
- Energy per mile

The current backend scaffolding includes:

- Tesla OAuth
- Netlify Functions
- Supabase token storage
- Tesla domain registration support
- A first daily sync function

Tesla sync is not fully live yet because the Netlify deployment is currently paused until build credits refresh.

## Technology Stack

### Frontend

- HTML
- CSS
- JavaScript
- Progressive Web App support

The frontend is intentionally simple so it can run on:

- iPhone Safari
- Android browser
- Desktop browser
- Tesla browser, mainly for parked review

The app can be added to the iPhone home screen like a lightweight app.

### Why Start With a PWA

A Progressive Web App is the best first version for this product because the idea needs fast validation before investing in a native app.

Reasons:

- Drivers can open it immediately on iPhone or Android.
- It can be added to the iPhone home screen without App Store review.
- It is cheaper and faster to build than SwiftUI or React Native.
- It works well for calculator, KPI tracking, and dashboard features.
- The same frontend can later become the base for a native wrapper or React/Next rewrite.

This matters because the first product risk is not technical polish. The first product risk is whether drivers will actually use the tool before and after driving.

Native iOS can come later, after the workflow is proven.

### Hosting

- Netlify

Netlify hosts the static frontend and runs serverless backend functions.

### Why Netlify

Netlify was chosen because it is simple for early-stage deployment:

- Static frontend hosting is easy.
- GitHub deployment is straightforward.
- Netlify Functions let the app add backend logic without managing a server.
- Environment variables can safely store API secrets.
- It is fast enough for a small personal tool or MVP.

Netlify is not necessarily the final infrastructure. It is good for moving quickly from static prototype to cloud-backed MVP.

Current limitation:

- Netlify build credits can pause deployment on the free plan.
- More advanced scheduled jobs and long-running backend work may be better on Google Cloud, AWS, or another backend platform later.

### Backend

- Netlify Functions
- Node.js

Backend functions handle:

- Tesla OAuth start
- Tesla OAuth callback
- Tesla token storage
- Tesla domain registration
- Tesla daily sync attempts

### Why Serverless Functions

Serverless functions are a good fit because the backend does not need to run all day.

The app only needs backend work when:

- a user connects Tesla,
- a Tesla token is refreshed,
- a daily sync runs,
- data is saved or loaded.

That usage pattern is small and event-driven. A full server would add cost and maintenance without much benefit at this stage.

### Database

- Supabase
- PostgreSQL

Supabase stores:

- Tesla OAuth tokens
- Daily KPI rows

The frontend does not receive secret keys. Sensitive Tesla tokens are stored through backend functions only.

### Why Supabase

Supabase was chosen because it provides a real PostgreSQL database quickly, with an easy API and clear dashboard.

It is useful for this project because:

- Tesla refresh tokens need secure server-side storage.
- Daily KPI rows need to be stored beyond one browser/device.
- PostgreSQL is a strong fit for structured records like daily driving logs.
- It is easy to inspect and debug tables while building the MVP.
- It can later support authentication, row-level security, and multi-device sync.

The app currently uses Supabase from backend functions only. That keeps sensitive service-role credentials out of the browser.

Future migration option:

- If the project moves to Google Cloud, Supabase can be replaced by Firestore or Cloud SQL.

### External APIs

- Tesla Fleet API
- Tesla OAuth

Tesla integration is used for vehicle data such as odometer and charging-related information.

### Why Tesla Fleet API

Tesla is the most useful integration for this app because it can reduce the most annoying manual entries:

- total miles,
- odometer start/end,
- charging energy,
- charging source,
- energy efficiency.

Uber/Lyft live integration is much harder and riskier because driver apps do not provide a simple public live-offer API, and iOS does not allow another app to inspect Uber Driver screens in the background.

Tesla data is a better automation target because the driver owns the vehicle and can authorize access through Tesla OAuth.

The first Tesla goal is daily sync, not per-trip sync. Daily sync is more realistic, cheaper, and enough to calculate true profitability.

### Deployment Flow

Current deployment flow:

```text
GitHub repo -> Netlify deploy -> Static PWA + Netlify Functions
```

### Why GitHub

GitHub is used as the source of truth for the project.

Benefits:

- Netlify can deploy automatically from the main branch.
- Changes are versioned.
- It is easier to collaborate or roll back.
- The repo can contain both frontend code and backend functions.
- Documentation such as this roadmap can live next to the code.

For this project, GitHub also makes it easier to move to another platform later because the code is not locked into Netlify.

### Why Not Native iOS First

Native iOS would give a more polished app experience, but it is not the best first step.

Reasons:

- App Store review slows iteration.
- Native development takes longer.
- Tesla OAuth/backend still requires cloud infrastructure.
- The key product question is behavior validation, not native UI.
- The app needs frequent formula and KPI changes while learning from real driving.

Once the workflow is proven, a native app can be built with SwiftUI or React Native.

### Why Not Direct Uber Driver Automation

The app does not try to automatically control or scrape the Uber Driver app.

Reasons:

- iOS does not allow one app to read another app's screen or internal data.
- Uber/Lyft do not provide a simple public live-offer API for this use case.
- Automation or scraping may violate platform rules.
- Reliability would be poor, especially during live driving.

The safer roadmap is:

- manual entry for MVP,
- screenshot OCR later,
- weekly statement import,
- daily KPI tracking,
- Tesla vehicle data sync.

This keeps the product useful without depending on fragile or risky automation.

### Why Google Cloud Is a Future Option

Google Cloud is a strong future option if Netlify limits become a problem.

Possible migration:

```text
Netlify Hosting -> Firebase Hosting
Netlify Functions -> Cloud Run Functions
Supabase -> Firestore or Cloud SQL
Netlify env vars -> Secret Manager
Scheduled daily sync -> Cloud Scheduler
```

Google Cloud has generous free-tier limits for small usage, but it usually requires an active billing account for backend services. For a personal daily-sync app, the cost could still be near zero if usage stays within free-tier limits.

The best strategy is to prove the Tesla sync flow first, then migrate only if Netlify becomes a blocker.

## Product Roadmap

### Phase 1: Manual MVP

Goal: Help drivers make better decisions without integrations.

Completed:

- Trip decision calculator
- Daily KPI tracker
- Local settings
- Local history
- Model Y cost model
- Tax reserve estimate
- Netlify deployment
- iPhone home screen support

### Phase 2: Tesla Daily Sync

Goal: Reduce manual entry for exact miles and energy.

In progress:

- Tesla Developer app
- OAuth login
- Supabase token storage
- Public key hosting
- Partner domain registration
- Daily sync function

Next:

- Complete Tesla domain registration
- Pull odometer successfully
- Pull or estimate charging kWh
- Save synced daily KPI into Supabase
- Show synced data in the Daily page

### Phase 3: Cloud-Synced User Data

Goal: Let the driver use the app across devices.

Planned:

- User login
- Cloud daily KPI records
- Cloud trip history
- Export CSV
- Weekly and monthly summaries

### Phase 4: Uber / Lyft Data Import

Goal: Reduce manual entry for earnings and booked miles.

Planned:

- Upload Uber/Lyft screenshots
- OCR for offer amount, miles, time, and payout
- Weekly statement import
- CSV/PDF parsing where available

Important note: the app should not attempt to automatically control or scrape the Uber Driver app. The safer path is screenshot OCR and statement import.

### Phase 5: Smart Driving Insights

Goal: Help drivers improve strategy over time.

Planned:

- Best time windows
- Best corridors
- Low-demand area warnings
- Airport trip analysis
- Dead-mile trend
- Profit per hour trend
- Profit per mile trend

### Phase 6: Native Mobile App

Goal: Improve mobile experience after the product is validated.

Possible stacks:

- React Native / Expo
- SwiftUI

This should come after the web app proves that drivers use the product regularly.

## Core KPI Standards

Current default targets:

```text
Gross per online hour: $30/hr target
Gross per total mile: $1.35/mi target
Pickup distance: under 3 mi ideal, over 6 mi risky
Dead-mile rate: under 25% target
Home charging share: 80%+ minimum, 90%+ ideal
Pretax real profit: $25/hr target
After-tax profit: $20/hr target
```

These values are editable because each driver, vehicle, city, and tax situation is different.

## Business Value

For drivers, the value is simple:

- Avoid bad offers
- Reduce dead miles
- Understand true Model Y cost
- Track whether driving is actually worth it
- Make better decisions by location and time
- Reduce tax surprises by reserving part of profit

For a product, the value is that it starts as a simple calculator and grows into a personal profitability assistant for gig drivers.

## Important Limitations

- The app does not guarantee profit.
- Tax estimates are planning placeholders, not tax advice.
- Tesla charging kWh may not perfectly match energy used during a specific Uber shift.
- Uber/Lyft live app automation is not part of the product because it may be unreliable, restricted by iOS, and risky from a platform compliance perspective.
- Tesla auto-sync depends on Tesla Fleet API access, domain registration, and deployment availability.

## Long-Term Vision

The long-term goal is to become a decision and profitability dashboard for ride-share drivers.

Instead of asking, "How much did I make today?", the app helps answer:

```text
Was this driving strategy actually profitable after all costs?
```

That is the difference between tracking revenue and running the driving work like a real business.
