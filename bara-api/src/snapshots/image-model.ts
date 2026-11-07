/** Keep image-model routing separate from the short witness instruction call. */
export function imageModelOptions() {
  const model = process.env.OPENAI_IMAGE_MODEL || process.env.OPENAI_MODEL || 'gpt-6-luna';
  // Preserve the existing non-reasoning latency and output-token budgets.
  return { model, ...(model === 'gpt-6-luna' || model.startsWith('gpt-6-luna-')
    ? { reasoning: { effort: 'none' as const } } : {}) };
}
