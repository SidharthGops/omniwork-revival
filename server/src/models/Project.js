import mongoose from "mongoose";

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    status: {
      type: String,
      enum: ["todo", "in_progress", "done"],
      default: "todo",
    },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    // Drives the proactive companion scheduler: when it last nudged about
    // this task, and the last thing the assignee told it (used as context
    // for the next check-in instead of just the raw status).
    lastCheckInAt: { type: Date, default: null },
    lastUpdateNote: { type: String, default: "" },
  },
  { _id: true, timestamps: true }
);

const projectSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: "" },
    team: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    tasks: [taskSchema],
  },
  { timestamps: true }
);

export default mongoose.model("Project", projectSchema);
