// The single pipeline every companion message flows through, whether it
// originated from the proactive scheduler, a manual "check in" click, the
// auto-triggered "stuck" flow, or the dashboard assistant chat / ping tool.
// Keeping this in one place means the client only ever has to listen on one
// channel to feel the AI as proactive, regardless of what triggered the
// message server-side.

import Message from "../models/Message.js";
import User from "../models/User.js";

// Persist + live-push an AI-authored message to a single user.
export async function sendCompanionMessage(io, { userId, text, kind = "checkin", meta = {} }) {
  const message = await Message.create({
    room: `companion:${userId}`,
    text,
    authorLabel: "AI companion",
    kind,
    meta,
  });

  io?.of("/companion").to(`user:${userId}`).emit("companion:message", {
    _id: message._id,
    text: message.text,
    authorLabel: message.authorLabel,
    kind: message.kind,
    meta: message.meta,
    createdAt: message.createdAt,
  });

  return message;
}

// Persist + live-push a human user's own outgoing chat message. Distinct
// from sendCompanionMessage so the client can tell the two apart (this one
// sets `author`, so it renders as a "me" bubble) — used by the dashboard
// assistant chat so a user's own message shows up the same way on every
// open tab/device for their account, not just the tab that sent it.
export async function sendUserMessage(io, { userId, text, kind = "chat", meta = {} }) {
  const message = await Message.create({
    room: `companion:${userId}`,
    author: userId,
    text,
    kind,
    meta,
  });

  io?.of("/companion").to(`user:${userId}`).emit("companion:message", {
    _id: message._id,
    text: message.text,
    author: userId,
    kind: message.kind,
    meta: message.meta,
    createdAt: message.createdAt,
  });

  return message;
}

// Persist + live-push a "teammate is blocked" alert to every lead on a team.
export async function notifyLeads(io, teamId, { userId, name, email, problem, aiSuggestion, matches }) {
  const message = await Message.create({
    room: `leads:${teamId}`,
    text: `${name} flagged themselves as blocked: "${problem}"`,
    authorLabel: "AI companion",
    kind: "lead-alert",
    meta: { userId, name, email, problem, aiSuggestion, matches },
  });

  const payload = {
    _id: message._id,
    userId,
    name,
    email,
    problem,
    aiSuggestion,
    matches,
    createdAt: message.createdAt,
  };

  io?.of("/companion").to(`leads:${teamId}`).emit("companion:teammate-blocked", payload);

  return message;
}

// Small helper the scheduler and blocked-trigger both need: leads for a team.
export async function getTeamLeads(teamId) {
  return User.find({ team: teamId, role: "lead" }).select("name email slackUserId");
}
