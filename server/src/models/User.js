import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    team: { type: mongoose.Schema.Types.ObjectId, ref: "Team" },
    role: { type: String, enum: ["lead", "member"], default: "member" },
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
