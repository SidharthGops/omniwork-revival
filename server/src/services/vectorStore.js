// The "team memory" vector store — deliberately dumb and swappable (per the
// architecture notes: don't stand up Pinecone/Weaviate under hackathon time
// pressure). Embeddings are a local hashing-trick bag-of-words vector, so
// search works fully offline with zero external calls and zero infra.
//
// To upgrade later: replace `embed()` with a real embeddings API call and
// keep `cosineSimilarity` / `searchKnowledge` as-is — nothing else changes.

const DIMENSIONS = 128;

export function embed(text) {
  const vector = new Array(DIMENSIONS).fill(0);
  const words = text.toLowerCase().match(/[a-z0-9]+/g) || [];
  for (const word of words) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = (hash * 31 + word.charCodeAt(i)) >>> 0;
    }
    vector[hash % DIMENSIONS] += 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map((v) => v / norm);
}

export function cosineSimilarity(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // vectors are already normalized in embed()
}

// entries: array of { _id, title, problem, solution, solvedBy, embedding }
export function searchKnowledge(queryText, entries, topK = 3) {
  const queryVector = embed(queryText);
  return entries
    .map((entry) => ({
      entry,
      score: cosineSimilarity(queryVector, entry.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter((r) => r.score > 0.05); // drop near-zero matches instead of forcing a result
}
