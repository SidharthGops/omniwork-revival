// Slack outbound notifications: AI check-ins and "stuck" alerts get mirrored
// into Slack DMs so the companion reaches people where they already are,
// per the "works alongside Slack, not instead of it" part of the pitch.
//
// Uses the raw Slack Web API over fetch (no SDK dependency, same pattern as
// aiOrchestrator.js's Ollama calls). Requires a Slack app with a Bot Token
// that has the `chat:write` and `im:write` scopes.
//
// Fail-soft by design: if SLACK_BOT_TOKEN isn't set, or a user has no
// slackUserId on file, or the Slack API call fails for any reason, these
// functions quietly no-op instead of throwing. Nothing in the request path
// should ever fail because Slack is unreachable or unconfigured.

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_API = "https://slack.com/api";

async function slackCall(method, body) {
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`slack.${method} failed: ${data.error}`);
  return data;
}

// Open (or reuse) a 1:1 DM channel with a Slack user and post a message.
export async function notifySlackDM(slackUserId, text) {
  if (!SLACK_BOT_TOKEN || !slackUserId) return; // not configured / no identity on file
  try {
    const opened = await slackCall("conversations.open", { users: slackUserId });
    await slackCall("chat.postMessage", { channel: opened.channel.id, text });
  } catch (err) {
    console.warn("[slack] notifySlackDM failed:", err.message);
  }
}

// Post to a channel (e.g. a team's #standup or a lead's alert channel).
export async function notifySlackChannel(channelId, text) {
  if (!SLACK_BOT_TOKEN || !channelId) return;
  try {
    await slackCall("chat.postMessage", { channel: channelId, text });
  } catch (err) {
    console.warn("[slack] notifySlackChannel failed:", err.message);
  }
}

export const isSlackConfigured = () => Boolean(SLACK_BOT_TOKEN);
