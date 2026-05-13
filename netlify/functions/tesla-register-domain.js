const FLEET_API_BASE = "https://fleet-api.prd.na.vn.cloud.tesla.com";
const FLEET_AUTH_BASE = "https://fleet-auth.prd.vn.cloud.tesla.com";

exports.handler = async () => {
  const clientId = process.env.TESLA_CLIENT_ID?.trim();
  const clientSecret = process.env.TESLA_CLIENT_SECRET?.trim();
  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || "";
  const domain = new URL(siteUrl).hostname;

  if (!clientId || !clientSecret || !domain) {
    return json(500, {
      error: "missing_env",
      message: "TESLA_CLIENT_ID, TESLA_CLIENT_SECRET, and URL must be configured.",
    });
  }

  try {
    const token = await getPartnerToken(clientId, clientSecret);
    const registerResponse = await fetch(`${FLEET_API_BASE}/api/1/partner_accounts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ domain }),
    });
    const registerBody = await registerResponse.json().catch(() => ({}));

    if (!registerResponse.ok) {
      return json(registerResponse.status, {
        error: "registration_failed",
        message: "Tesla partner account registration failed.",
        domain,
        details: registerBody,
      });
    }

    return json(200, {
      ok: true,
      domain,
      publicKeyUrl: `https://${domain}/.well-known/appspecific/com.tesla.3p.public-key.pem`,
      details: registerBody,
    });
  } catch (error) {
    return json(500, {
      error: "registration_error",
      message: error.message,
    });
  }
};

async function getPartnerToken(clientId, clientSecret) {
  const response = await fetch(`${FLEET_AUTH_BASE}/oauth2/v3/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      audience: FLEET_API_BASE,
      scope: "openid vehicle_device_data vehicle_charging_cmds",
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Partner token request failed: ${JSON.stringify(body)}`);
  }
  return body;
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
