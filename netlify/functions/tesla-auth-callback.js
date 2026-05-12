const crypto = require("crypto");

exports.handler = async (event) => {
  const code = event.queryStringParameters?.code;
  const state = event.queryStringParameters?.state;
  const error = event.queryStringParameters?.error;

  if (error) return html(400, `Tesla authorization failed: ${error}`);
  if (!code || !state) return html(400, "Missing Tesla authorization code or state.");

  const clientId = process.env.TESLA_CLIENT_ID;
  const clientSecret = process.env.TESLA_CLIENT_SECRET;
  const stateSecret = process.env.TESLA_STATE_SECRET;
  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || "";

  if (!clientId || !clientSecret || !stateSecret || !siteUrl) {
    return html(500, "Tesla OAuth is not configured in Netlify environment variables.");
  }

  const payload = verifyState(state, stateSecret);
  if (!payload) return html(400, "Invalid OAuth state.");

  const redirectUri = `${siteUrl}/.netlify/functions/tesla-auth-callback`;
  const tokenResponse = await fetch("https://auth.tesla.com/oauth2/v3/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  const tokenBody = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok) {
    return html(500, `Token exchange failed: ${JSON.stringify(tokenBody)}`);
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return html(200, "Tesla OAuth succeeded, but token storage is not configured yet. Add Supabase env vars before using daily sync.");
  }

  const saved = await saveToken(payload.userId, tokenBody);
  if (!saved.ok) return html(500, `Could not save Tesla token: ${saved.error}`);

  return html(200, "Tesla connected. You can close this tab and return to Ride Advisor.");
};

function verifyState(state, secret) {
  const [encoded, sig] = state.split(".");
  if (!encoded || !sig) return null;
  const expected = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  if (Date.now() - payload.ts > 10 * 60 * 1000) return null;
  return payload;
}

async function saveToken(userId, tokenBody) {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/tesla_tokens`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({
      user_id: userId,
      access_token: tokenBody.access_token,
      refresh_token: tokenBody.refresh_token,
      expires_in: tokenBody.expires_in,
      token_type: tokenBody.token_type,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) return { ok: false, error: await response.text() };
  return { ok: true };
}

function html(statusCode, message) {
  return {
    statusCode,
    headers: { "Content-Type": "text/html; charset=utf-8" },
    body: `<main style="font-family:system-ui;padding:32px;max-width:680px"><h1>Tesla Connect</h1><p>${escapeHtml(message)}</p></main>`,
  };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}
