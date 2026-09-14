import mongoose from "mongoose";

// The "team memory" — past problems, solutions, and who solved them.
// `embedding` is a plain number array so the vector store can stay swappable
// (in-memory cosine similarity now, a real vector DB later) without a schema change.
const knowledgeEntrySchema = new mongoose.Schema(
  {
    team: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true },
    title: { type: String, required: true },
    problem: { type: String, required: true },
    solution: { type: String, required: true },
    solvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    embedding: { type: [Number], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model("KnowledgeEntry", knowledgeEntrySchema);
