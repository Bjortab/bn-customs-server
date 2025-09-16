const OpenAI = require('openai');

async function llmOpenAI({ apiKey, model, prompt, system, temperature, max_tokens, lang }) {
  const client = new OpenAI({ apiKey });
  const sys = system || `Du är en svensk berättarröst. Svara på ${lang || 'sv'}. Var koncis om inget annat sägs.`;
  const resp = await client.chat.completions.create({
    model: model || 'gpt-4o-mini',
    temperature: typeof temperature === 'number' ? temperature : 0.9,
    max_tokens: max_tokens || 600,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: prompt }
    ]
  });
  const text = resp.choices?.[0]?.message?.content?.trim() || '';
  return { text };
}

module.exports = { llmOpenAI };
