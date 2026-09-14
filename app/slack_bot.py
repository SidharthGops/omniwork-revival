"""Real Slack integration, scoped to what's actually demoable: outbound posts to a
channel using slack_sdk's WebClient. No-ops cleanly if SLACK_BOT_TOKEN isn't set, so
the rest of the app works with or without Slack configured.

To wire this to a real workspace:
1. Create a Slack app at https://api.slack.com/apps, add the `chat:write` bot scope.
2. Install it to your workspace, invite the bot to a channel.
3. Set SLACK_BOT_TOKEN (starts with xoxb-) and SLACK_CHANNEL (e.g. #omniwork-status).

Inbound messages (e.g. checking in via Slack DM instead of the web UI) would need
Socket Mode and slack_bolt, which is the natural next step but out of scope for
getting the core loop working first.
"""
import os

CHANNEL = os.environ.get("SLACK_CHANNEL", "#omniwork-status")
_client = None
_checked = False


def _get_client():
    global _client, _checked
    if _checked:
        return _client
    _checked = True
    token = os.environ.get("SLACK_BOT_TOKEN")
    if not token:
        return None
    try:
        from slack_sdk import WebClient
        _client = WebClient(token=token)
    except Exception:
        _client = None
    return _client


def post_message(text: str) -> bool:
    """Returns True if a message was actually sent, False if Slack isn't configured
    or the call failed. Callers should treat this as best-effort."""
    client = _get_client()
    if not client:
        return False
    try:
        client.chat_postMessage(channel=CHANNEL, text=text)
        return True
    except Exception:
        return False
