import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    team: { type: mongoose.Schema.Types.ObjectId, ref: "Team" },
    role: { type: String, enum: ["lead", "member"], default: "member" },
    // Optional external identities — if unset, Slack/Zoom features simply
    // no-op for this user instead of erroring (same fail-soft pattern as
    // the Ollama integration).
    slackUserId: { type: String, default: "" }, // Slack member ID, e.g. "U0123ABC"
    zoomEmail: { type: String, default: "" }, // email tied to the user's Zoom account
    presence: {
      status: {
        type: String,
        enum: ["available", "focused", "away", "blocked"],
        default: "available",
      },
      note: { type: String, default: "" },
      updatedAt: { type: Date, default: Date.now },
    },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
