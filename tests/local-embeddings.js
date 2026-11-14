/**
 * tests/local-embeddings.js — LOCAL embedding model adapter (TEST-ONLY).
 *
 * Runs a real multilingual MiniLM model fully offline via
 * @xenova/transformers (ONNX runtime in Node). Production code (src/) still
 * uses Google's free text-embedding-004 API — this adapter exists so the
 * integration harness can validate the similarity pipeline against a real
 * embedding space (EN/PT/ES) without any paid API call.
 *
 * First use downloads the model weights (~120MB, Hugging Face) and caches
 * them locally; subsequent runs are fully offline.
 */
let extractorPromise = null;

function getExtractor(modelId) {
  if (!extractorPromise) {
    const { pipeline } = require('@xenova/transformers');
    extractorPromise = pipeline('feature-extraction', modelId, { quantized: true });
  }
  return extractorPromise;
}

/**
 * embedBatch(texts, modelId) → Promise<number[][]>
 * Mean-pooled, L2-normalized embeddings (one vector per input text).
 */
async function embedBatch(texts, modelId) {
  const extractor = await getExtractor(modelId);
  const out = await extractor(texts, { pooling: 'mean', normalize: true });
  return out.tolist();
}

module.exports = { embedBatch };
