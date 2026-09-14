import mongoose from "mongoose";

// Used for both the AI companion chat log and the cafeteria/lounge rooms.
// `room` is either a room slug ("cafeteria", "lounge") or `companion:<userId>`.
const messageSchema = new mongoose.Schema(
  {
    room: { type: String, required: true, index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    authorLabel: { type: String, default: "" }, // "AI companion" when author is null
    text: { type: String, required: true },
    // "chat" = cafeteria message. Companion feed messages use:
    // "checkin" | "stuck" | "reply" | "ack" | "lead-alert"
    kind: { type: String, default: "chat" },
    // Structured context for companion messages: taskId/projectId for
    // check-ins, matches/problem for stuck-assist, etc.
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export default mongoose.model("Message", messageSchema);
