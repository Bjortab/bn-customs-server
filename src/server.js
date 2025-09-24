// src/server.js (GC OpenAI-only, ESM)
// Endpoints: /status, /llm, /tts

import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 10000;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LLM_MODEL = process.env.LLM_OPENAI_MODEL || "gpt-4o-mini";
const TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const TTS_VOICE = process.env.OPENAI_TTS_VOICE || "alloy";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",").map(s => s.trim()).filter(Boolean);

app.use(express.json());

// CORS – tillåt bara dina origins
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error("Not allowed by CORS: " + origin));
  },
  methods: ["GET","POST","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"]
}));

// --- STATUS ---
app.get("/status", (_req, res) => {
  res.json({
    ok: true,
    llm: { provider: "openai", openai_key: !!OPENAI_API_KEY, openai_model: LLM_MODEL },
    tts: { provider: "openai", openai_model: TTS_MODEL, openai_voice: TTS_VOICE },
    cors: ALLOWED_ORIGINS
  });
});

// --- LLM: POST /llm { prompt, lang, temperature } -> { text }
app.post("/llm", async (req, res) => {
  try {
    const { prompt, lang = "sv", temperature = 0.9, max_tokens = 600 } = req.body || {};
    if (!prompt) return res.status(400).json({ error: "missing_prompt" });

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        temperature,
        messages: [
          { role: "system", content: `Du är en svensk berättarröst. Språk: ${lang}` },
          { role: "user", content: prompt }
        ],
        max_tokens
      })
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: "openai_llm_error", detail: data });

    const text = data.choices?.[0]?.message?.content?.trim() || "";
    res.json({ text });
  } catch (e) {
    res.status(500).json({ error: "llm_crash", detail: e.message });
  }
});

// --- TTS: POST /tts { text, lang, format } -> { audio_base64, mime }
app.post("/tts", async (req, res) => {
  try {
    const { text, lang = "sv", format = "mp3" } = req.body || {};
    if (!text) return res.status(400).json({ error: "missing_text" });

    const rr = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: TTS_MODEL, voice: TTS_VOICE, input: text, format })
    });
    if (!rr.ok) {
      const detail = await rr.text().catch(() => "");
      return res.status(rr.status).json({ error: "openai_tts_error", detail });
    }
    const buf = Buffer.from(await rr.arrayBuffer());
    res.json({ audio_base64: buf.toString("base64"), mime: format === "mp3" ? "audio/mpeg" : "audio/wav" });
  } catch (e) {
    res.status(500).json({ error: "tts_crash", detail: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ BN Custom Server listening on ${PORT}`);
});
