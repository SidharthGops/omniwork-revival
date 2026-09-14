import mongoose from "mongoose";

// Used for both the AI companion chat log and the cafeteria/lounge rooms.
// `room` is either a room slug ("cafeteria", "lounge") or `companion:<userId>`.
const messageSchema = new mongoose.Schema(
  {
    room: { type: String, required: true, index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    authorLabel: { type: String, default: "" }, // "AI companion" when author is null
    text: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model("Message", messageSchema);
