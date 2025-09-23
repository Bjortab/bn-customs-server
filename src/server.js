// src/server.js
import express from "express";
import cors from "cors";

const app = express();
app.use(express.json());

// Hämta miljövariabler
const PORT = process.env.PORT || 10000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim());

// CORS setup
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS: " + origin));
    }
  }
}));

// STATUS endpoint
app.get("/status", (req, res) => {
  res.json({
    ok: true,
    openai_key: !!OPENAI_API_KEY,
    llm: { provider: "openai", model: process.env.LLM_OPENAI_MODEL || "gpt-4o-mini" },
    tts: { provider: "openai", model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts", voice: process.env.OPENAI_TTS_VOICE || "alloy" }
  });
});

// GENERATE endpoint (text + TTS)
app.post("/generate", async (req, res) => {
  try {
    const { prompt, level, minutes, lang } = req.body;
    if (!prompt) return res.status(400).json({ error: "No prompt provided" });

    // 1. Skicka till OpenAI LLM
    const llmResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.LLM_OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: "Du är en berättar-AI för BlushNarratives." },
          { role: "user", content: prompt }
        ],
        max_tokens: 500
      })
    });

    const llmData = await llmResp.json();
    const text = llmData.choices?.[0]?.message?.content || "Inget svar från LLM.";

    // 2. Skicka till OpenAI TTS
    const ttsResp = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
        voice: process.env.OPENAI_TTS_VOICE || "alloy",
        input: text
      })
    });

    const audioBuffer = Buffer.from(await ttsResp.arrayBuffer());

    res.json({ ok: true, text, audio: audioBuffer.toString("base64") });

  } catch (err) {
    console.error("Error in /generate:", err);
    res.status(500).json({ error: "Generation failed", detail: err.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`BN Custom Server running on port ${PORT}`);
});
