// Zoom integration — deliberately narrow in scope: the companion only reads
// a user's Zoom presence ("In_Meeting" vs not) to decide whether *not* to
// interrupt them. It never watches a call, records anything, or changes a
// user's self-set OmniWork status — that would violate the no-surveillance
// principle the whole presence system is built on. This is "work alongside
// Zoom", not "replace Zoom", per the pitch.
//
// Uses Zoom's Server-to-Server OAuth app type (account-level credentials,
// no per-user consent flow needed for reading presence within an org).
// Requires ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET and the
// `user:read:user` / presence scopes on the Zoom app.
//
// Fail-soft: any missing config or API error returns null ("unknown"),
// and callers treat null as "don't let this block a check-in".

const { ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET } = process.env;

let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiresAt - 30_000) return cachedToken;

  const basicAuth = Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${ZOOM_ACCOUNT_ID}`,
    { method: "POST", headers: { Authorization: `Basic ${basicAuth}` } }
  );
  if (!res.ok) throw new Error(`Zoom token request failed: ${res.status}`);

  const data = await res.json();
  cachedToken = data.access_token;
  cachedTokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
  return cachedToken;
}

// Returns Zoom's raw presence string — "In_Meeting", "Available", "Away",
// "Do_Not_Disturb", "Presenting", etc — or null if unconfigured/unreachable.
export async function getZoomPresence(zoomEmail) {
  if (!ZOOM_ACCOUNT_ID || !ZOOM_CLIENT_ID || !ZOOM_CLIENT_SECRET || !zoomEmail) return null;

  try {
    const token = await getAccessToken();
    const res = await fetch(
      `https://api.zoom.us/v2/users/${encodeURIComponent(zoomEmail)}/presence_status`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`Zoom presence request failed: ${res.status}`);
    const data = await res.json();
    return data.status || null;
  } catch (err) {
    console.warn("[zoom] getZoomPresence failed:", err.message);
    return null;
  }
}

// Convenience check used by the scheduler.
export async function isInZoomMeeting(zoomEmail) {
  const status = await getZoomPresence(zoomEmail);
  return status === "In_Meeting" || status === "Presenting";
}

export const isZoomConfigured = () =>
  Boolean(ZOOM_ACCOUNT_ID && ZOOM_CLIENT_ID && ZOOM_CLIENT_SECRET);
