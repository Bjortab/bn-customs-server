import axios from "axios";

export async function generateElevenLabs(prompt, minutes = 3, lang = "sv") {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = "EXAVITQu4vr4xnSDxMaL"; // välj röst

  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    { text: prompt, voice_settings: { stability: 0.3, similarity_boost: 0.7 } },
    { headers: { "xi-api-key": apiKey, "Content-Type": "application/json" }, responseType: "arraybuffer" }
  );

  return {
    text: prompt,
    audio: { format: "mp3", base64: Buffer.from(response.data, "binary").toString("base64") }
  };
}
