const scopes = ["openid", "offline_access", "vehicle_device_data"];

exports.handler = async (event) => {
  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || "";
  const redirectUri = `${siteUrl}/.netlify/functions/tesla-auth-callback`;
  const hasClientId = Boolean(process.env.TESLA_CLIENT_ID);
  const hasClientSecret = Boolean(process.env.TESLA_CLIENT_SECRET);
  const hasStateSecret = Boolean(process.env.TESLA_STATE_SECRET);
  const hasSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

  return json(200, {
    configured: hasClientId && hasClientSecret && hasStateSecret,
    canStoreTokens: hasSupabase,
    redirectUri,
    scopes,
    missing: {
      TESLA_CLIENT_ID: !hasClientId,
      TESLA_CLIENT_SECRET: !hasClientSecret,
      TESLA_STATE_SECRET: !hasStateSecret,
      SUPABASE_URL: !process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
  });
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
