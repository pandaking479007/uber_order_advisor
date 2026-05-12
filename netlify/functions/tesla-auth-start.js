const crypto = require("crypto");

const scopes = ["openid", "offline_access", "vehicle_device_data"];

exports.handler = async (event) => {
  const clientId = process.env.TESLA_CLIENT_ID;
  const stateSecret = process.env.TESLA_STATE_SECRET;
  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || "";

  if (!clientId || !stateSecret || !siteUrl) {
    return html(500, "Tesla OAuth is not configured. Set TESLA_CLIENT_ID, TESLA_STATE_SECRET, and URL in Netlify.");
  }

  const userId = event.queryStringParameters?.user || "local";
  const redirectUri = `${siteUrl}/.netlify/functions/tesla-auth-callback`;
  const state = signState({ userId, ts: Date.now() }, stateSecret);
  const authUrl = new URL("https://auth.tesla.com/oauth2/v3/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes.join(" "));
  authUrl.searchParams.set("state", state);

  return {
    statusCode: 302,
    headers: { Location: authUrl.toString() },
    body: "",
  };
};

function signState(payload, secret) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

function html(statusCode, message) {
  return {
    statusCode,
    headers: { "Content-Type": "text/html; charset=utf-8" },
    body: `<h1>Tesla Connect</h1><p>${escapeHtml(message)}</p>`,
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
