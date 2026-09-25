// AI assistants / model families readers can filter by. Array order breaks ties in the UI.
// Short or ambiguous names ("Meta", "Apple") are matched case-sensitively: "meta" is a common
// Portuguese word and "apple" shows up in unrelated contexts.
export const AIS = [
  { id: 'chatgpt', label: 'ChatGPT', maker: 'OpenAI', color: '#10a37f', patterns: [/\b(openai|chatgpt|gpt-?\d[\w.]*|sora|dall-?e)\b/i] },
  { id: 'claude', label: 'Claude', maker: 'Anthropic', color: '#d97757', patterns: [/\b(anthropic|claude)\b/i] },
  { id: 'gemini', label: 'Gemini', maker: 'Google', color: '#4285f4', patterns: [/\b(gemini|deepmind|gemma|notebooklm|google ai)\b/i] },
  { id: 'llama', label: 'Llama', maker: 'Meta', color: '#0866ff', patterns: [/\b(llama|meta ai)\b/i, /\bMeta\b/] },
  { id: 'grok', label: 'Grok', maker: 'xAI', color: '#71717a', patterns: [/\b(grok|xai)\b/i] },
  { id: 'copilot', label: 'Copilot', maker: 'Microsoft', color: '#7b61ff', patterns: [/\b(copilot|microsoft ai|mai-\d[\w.-]*)\b/i] },
  { id: 'mistral', label: 'Mistral', maker: 'Mistral AI', color: '#fa520f', patterns: [/\b(mistral|le chat)\b/i] },
  { id: 'deepseek', label: 'DeepSeek', maker: 'DeepSeek', color: '#4d6bfe', patterns: [/\bdeepseek\b/i] },
  { id: 'qwen', label: 'Qwen', maker: 'Alibaba', color: '#615ced', patterns: [/\b(qwen|alibaba)\b/i] },
  { id: 'kimi', label: 'Kimi', maker: 'Moonshot AI', color: '#1f2937', patterns: [/\b(kimi|moonshot ai)\b/i] },
  { id: 'perplexity', label: 'Perplexity', maker: 'Perplexity', color: '#20808d', patterns: [/\bperplexity\b/i] },
  { id: 'apple', label: 'Apple Intelligence', maker: 'Apple', color: '#8e8e93', patterns: [/\b(apple intelligence|siri)\b/i, /\bApple\b/] },
  { id: 'alexa', label: 'Alexa', maker: 'Amazon', color: '#00a8e1', patterns: [/\b(alexa|amazon nova)\b/i] },
];

export function detectAis(text) {
  return AIS.filter((ai) => ai.patterns.some((pattern) => pattern.test(text))).map((ai) => ai.id);
}

/** Everything a story says about itself, including the original (often English) source headlines. */
export function storyText(story) {
  return [story.title, story.summary, story.whyItMatters, ...(story.tags ?? []), ...(story.sources ?? []).map((source) => source.title)]
    .filter(Boolean)
    .join(' \n ');
}

/** Edition-level list for the filter bar: only AIs that appear, most mentioned first. */
export function summarizeAis(stories) {
  return AIS.map((ai, order) => ({ ai, order, count: stories.filter((story) => story.ais?.includes(ai.id)).length }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .map(({ ai, count }) => ({ id: ai.id, label: ai.label, maker: ai.maker, color: ai.color, count }));
}
