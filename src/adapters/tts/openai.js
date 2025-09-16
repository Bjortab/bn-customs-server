const OpenAI = require('openai');
const { mimeFromFormat } = require('../../utils/audio');

async function ttsOpenAI({ apiKey, model, voice, text, format }) {
  const client = new OpenAI({ apiKey });

  const resp = await client.audio.speech.create({
    model: model || 'gpt-4o-mini-tts',
    voice: voice || 'alloy',
    input: text,
    format: (format || 'mp3').toLowerCase()
  });

  // resp är en Readable-like/ArrayBuffer beroende på lib-version
  const arrayBuffer = await resp.arrayBuffer();
  const buf = Buffer.from(arrayBuffer);
  const mime = mimeFromFormat(format || 'mp3');
  return { buffer: buf, mime };
}

module.exports = { ttsOpenAI };
