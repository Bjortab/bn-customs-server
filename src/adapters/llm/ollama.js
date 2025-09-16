const axios = require('axios');

async function llmOllama({ url, model, prompt, temperature, max_tokens }) {
  const body = {
    model: model || 'mistral',
    prompt,
    stream: false,
    options: {
      temperature: typeof temperature === 'number' ? temperature : 0.9,
      num_predict: max_tokens || 600
    }
  };
  const { data } = await axios.post(`${url}/api/generate`, body, { timeout: 120000 });
  // Ollama svarar vanligtvis med {response: "..."}
  const text = (data.response || data.output || '').toString().trim();
  return { text };
}

module.exports = { llmOllama };
