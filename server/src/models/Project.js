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
