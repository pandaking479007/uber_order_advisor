const FLEET_API_BASE = "https://fleet-api.prd.na.vn.cloud.tesla.com";
const FLEET_AUTH_BASE = "https://fleet-auth.prd.vn.cloud.tesla.com";

exports.handler = async (event) => {
  const userId = event.queryStringParameters?.user || "local";
  const date = event.queryStringParameters?.date || new Date().toISOString().slice(0, 10);

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { error: "missing_supabase_env", message: "Supabase token storage is not configured." });
  }

  try {
    const storedToken = await getStoredTeslaToken(userId);
    if (!storedToken) {
      return json(404, { error: "not_connected", message: "No Tesla token found. Connect Tesla first." });
    }

    const token = await refreshTeslaToken(userId, storedToken.refresh_token);
    const vehicles = await teslaGet("/api/1/vehicles", token.access_token);
    const vehicle = pickVehicle(vehicles);
    if (!vehicle) {
      return json(404, { error: "no_vehicle", message: "No Tesla vehicle found for this account.", raw: vehicles });
    }

    const vin = vehicle.vin || vehicle.vehicle_id || vehicle.id_s || vehicle.id;
    const vehicleData = await teslaGet(`/api/1/vehicles/${encodeURIComponent(vin)}/vehicle_data`, token.access_token);
    const odometer = extractOdometer(vehicleData);
    const charging = await getChargingForDate(token.access_token, date);
    const previous = await getPreviousDailyKpi(userId, date);
    const existing = await getDailyKpi(userId, date);
    const startOdometer = Number(existing?.start_odometer || previous?.end_odometer || odometer || 0);
    const endOdometer = Number(odometer || existing?.end_odometer || startOdometer || 0);
    const totalMiles = endOdometer > startOdometer ? endOdometer - startOdometer : Number(existing?.total_miles || 0);

    const row = {
      user_id: userId,
      date,
      platform: existing?.platform || "Both",
      start_odometer: startOdometer || null,
      end_odometer: endOdometer || null,
      total_miles: totalMiles || null,
      home_charge_kwh: charging.homeKwh || null,
      supercharge_kwh: charging.superchargerKwh || null,
    };

    await upsertDailyKpi(row);

    return json(200, {
      ok: true,
      date,
      vehicle: {
        id: vehicle.id,
        vin,
        displayName: vehicle.display_name || vehicleData?.response?.vehicle_state?.vehicle_name || "Tesla",
        state: vehicle.state,
      },
      startOdometer,
      endOdometer,
      totalMiles,
      homeChargeKwh: charging.homeKwh,
      superchargeKwh: charging.superchargerKwh,
      chargingRawCount: charging.rawCount,
      note: odometer ? "Tesla daily sync completed." : "Vehicle data returned without odometer. The vehicle may be asleep or the response shape changed.",
    });
  } catch (error) {
    return json(error.statusCode || 500, {
      error: error.code || "tesla_sync_failed",
      message: error.message,
      details: error.details,
    });
  }
};

async function getStoredTeslaToken(userId) {
  const data = await supabaseGet(`/rest/v1/tesla_tokens?user_id=eq.${encodeURIComponent(userId)}&select=*`);
  return Array.isArray(data) ? data[0] : null;
}

async function refreshTeslaToken(userId, refreshToken) {
  const clientId = process.env.TESLA_CLIENT_ID?.trim();
  const clientSecret = process.env.TESLA_CLIENT_SECRET?.trim();
  const response = await fetch(`${FLEET_AUTH_BASE}/oauth2/v3/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      audience: `${FLEET_API_BASE}/`,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error("Tesla token refresh failed."), {
      statusCode: response.status,
      code: "token_refresh_failed",
      details: body,
    });
  }

  await saveTeslaToken(userId, body);
  return body;
}

async function saveTeslaToken(userId, tokenBody) {
  await supabasePost("/rest/v1/tesla_tokens?on_conflict=user_id", {
    user_id: userId,
    access_token: tokenBody.access_token,
    refresh_token: tokenBody.refresh_token,
    expires_in: tokenBody.expires_in,
    token_type: tokenBody.token_type,
    updated_at: new Date().toISOString(),
  }, "resolution=merge-duplicates");
}

async function teslaGet(path, accessToken) {
  const response = await fetch(`${FLEET_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(`Tesla API request failed: ${path}: ${JSON.stringify(body)}`), {
      statusCode: response.status,
      code: "tesla_api_failed",
      details: body,
    });
  }
  return body;
}

function pickVehicle(vehiclesBody) {
  const vehicles = vehiclesBody?.response || vehiclesBody?.data || vehiclesBody?.vehicles || [];
  return Array.isArray(vehicles) ? vehicles[0] : null;
}

function extractOdometer(vehicleData) {
  return Number(
    vehicleData?.response?.vehicle_state?.odometer ||
    vehicleData?.vehicle_state?.odometer ||
    vehicleData?.response?.odometer ||
    0
  );
}

async function getChargingForDate(accessToken, date) {
  try {
    const body = await teslaGet(`/api/1/dx/charging/history?start_date=${date}&end_date=${date}`, accessToken);
    const rows = body?.response?.data || body?.response || body?.data || [];
    const list = Array.isArray(rows) ? rows : [];
    let homeKwh = 0;
    let superchargerKwh = 0;

    for (const row of list) {
      const kwh = Number(row.energy_added || row.charge_energy_added || row.kwh || row.energy_kwh || 0);
      const typeText = JSON.stringify(row).toLowerCase();
      if (typeText.includes("supercharger") || typeText.includes("supercharging")) {
        superchargerKwh += kwh;
      } else {
        homeKwh += kwh;
      }
    }

    return { homeKwh, superchargerKwh, rawCount: list.length };
  } catch (error) {
    return { homeKwh: 0, superchargerKwh: 0, rawCount: 0, error: error.message };
  }
}

async function getDailyKpi(userId, date) {
  const data = await supabaseGet(`/rest/v1/daily_kpi?user_id=eq.${encodeURIComponent(userId)}&date=eq.${date}&select=*`);
  return Array.isArray(data) ? data[0] : null;
}

async function getPreviousDailyKpi(userId, date) {
  const data = await supabaseGet(`/rest/v1/daily_kpi?user_id=eq.${encodeURIComponent(userId)}&date=lt.${date}&select=*&order=date.desc&limit=1`);
  return Array.isArray(data) ? data[0] : null;
}

async function upsertDailyKpi(row) {
  await supabasePost("/rest/v1/daily_kpi?on_conflict=user_id,date", row, "resolution=merge-duplicates");
}

async function supabaseGet(path) {
  const response = await fetch(`${process.env.SUPABASE_URL}${path}`, {
    headers: supabaseHeaders(),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Supabase GET failed: ${JSON.stringify(body)}`);
  return body;
}

async function supabasePost(path, body, prefer = "") {
  const response = await fetch(`${process.env.SUPABASE_URL}${path}`, {
    method: "POST",
    headers: {
      ...supabaseHeaders(),
      "Content-Type": "application/json",
      Prefer: prefer ? `${prefer},return=minimal` : "return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Supabase POST failed: ${await response.text()}`);
}

function supabaseHeaders() {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
