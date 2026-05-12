# Tesla Daily Sync Plan

## Goal

Automatically fill the Daily KPI page with Tesla data once per day:

- start odometer
- end odometer
- daily miles
- home charging kWh
- Supercharger kWh
- estimated energy per mile
- electricity cost

## Recommended Architecture

The static PWA cannot safely connect directly to Tesla because OAuth tokens must be stored securely and scheduled sync needs a server.

Use:

- Frontend: current PWA or later React/Next app
- Backend: serverless functions or small Node API
- Database: Supabase or Firebase
- Scheduler: daily cron job
- Auth: Tesla Fleet API OAuth

## Daily Job

1. Get yesterday/today odometer snapshots.
2. Compute daily miles:

```text
daily miles = end odometer - start odometer
```

3. Pull charging history for the day.
4. Split sessions into home charging and Supercharging when source/location is available.
5. Compute:

```text
total kWh = home kWh + Supercharger kWh
electricity cost = home kWh * home rate + Supercharger kWh * Supercharger rate
kWh per mile = total kWh / daily miles
```

## Important Accuracy Note

Charging kWh is energy added, not always exactly energy consumed during the same driving day. For daily/weekly profitability, it is still useful. For exact shift-level energy, the app should store odometer and battery/energy snapshots at shift start/end or use Tesla Fleet Telemetry.

## First Product Step

The Daily page now supports the same fields the Tesla sync will fill:

- start odometer
- end odometer
- home charging kWh
- Supercharger kWh

That means we can use manual entry today and later replace it with automatic Tesla sync without changing the KPI model.
