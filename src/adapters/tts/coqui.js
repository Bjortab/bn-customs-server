const axios = require('axios');
const { bufferFromBase64 } = require('../../utils/audio');

// OBS: Coqui XTTS-servrar varierar. Den här adaptern är "best effort":
// Vi postar { text, speaker?, language? } och försöker läsa ett av fälten:
// audio_base64 | wav_base64 | base64 | audio
async function ttsCoqui({ url, text, lang, voice }) {
  const payload = {
    text,
    language: lang || 'sv',
    speaker: voice || undefined
  };
  const { data } = await axios.post(url, payload, {
    timeout: 180000,
    headers: { 'Content-Type': 'application/json' }
  });

  const b64 = data.audio_base64 || data.wav_base64 || data.base64 || data.audio;
  if (!b64) {
    throw new Error('coqui_response_missing_audio');
  }
  const buf = bufferFromBase64(b64);
  // De flesta självhostade XTTS svarar med WAV
  const mime = 'audio/wav';
  return { buffer: buf, mime };
}

module.exports = { ttsCoqui };
