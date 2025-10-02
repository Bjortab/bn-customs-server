// src/server.js
import express from "express";
import cors from "cors";

import { llmOpenAI } from "./llm/openai.js";
import { llmMistral } from "./llm/mistral.js";
// (Ollama is optional; keep or remove if you’re not using it)
// import { llmOllama } from "./llm/ollama.js";

import { ttsOpenAI } from "./tts/openai.js";
import { ttsElevenLabs } from "./tts/elevenlabs.js";
// import { ttsCoqui } from "./tts/coqui.js"; // optional

import { saveAudioToR2 } from "./utils/audio.js";
import { Cache } from "./utils/cache.js";

// --- config from environment ---
const {
  PORT = 10000,
  AUTH_TOKEN = "",
  ALLOWED_ORIGINS = "",
  LLM_PROVIDER = "openai",            // openai | mistral | ollama
  LLM_OPENAI_MODEL = "gpt-4o-mini",
  LLM_MISTRAL_MODEL = "mistral-small-latest",
  TTS_PROVIDER = "openai",            // openai | elevenlabs | coqui
  OPENAI_TTS_MODEL = "gpt-4o-mini-tts",
  OPENAI_TTS_VOICE = "alloy",
  ELEVENLABS_VOICE_ID = "",

  // R2 (optional, used by utils/audio.js)
  R2_BUCKET = "",
  R2_ACCOUNT_ID = "",
  R2_ACCESS_KEY_ID = "",
  R2_SECRET_ACCESS_KEY = "",

  // keys
  OPENAI_API_KEY = "",
  MISTRAL_API_KEY = "",
  ELEVENLABS_API_KEY = "",
} = process.env;

// --- CORS ---
const origins = ALLOWED_ORIGINS
  ? ALLOWED_ORIGINS.split(",").map(s => s.trim())
  : [];

const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (origins.length === 0 || origins.includes(origin)) return cb(null, true);
    cb(new Error("CORS blocked for origin: " + origin));
  }
}));

// --- very simple bearer auth (optional) ---
app.use((req, res, next) => {
  if (!AUTH_TOKEN) return next();
  const got = req.headers.authorization || "";
  if (got === AUTH_TOKEN) return next();
  return res.status(401).json({ ok: false, error: "Unauthorized" });
});

// --- helpers ---
function pickLLM() {
  const p = (LLM_PROVIDER || "openai").toLowerCase();
  if (p === "mistral") return llmMistral({ apiKey: MISTRAL_API_KEY, model: LLM_MISTRAL_MODEL });
  if (p === "ollama")  return { generate: async () => { throw new Error("Ollama not configured"); } };
  // default OpenAI
  return llmOpenAI({ apiKey: OPENAI_API_KEY, model: LLM_OPENAI_MODEL });
}

function pickTTS() {
  const p = (TTS_PROVIDER || "openai").toLowerCase();
  if (p === "elevenlabs") return ttsElevenLabs({ apiKey: ELEVENLABS_API_KEY, voiceId: ELEVENLABS_VOICE_ID });
  // if (p === "coqui") return ttsCoqui({ /* … */ });
  // default OpenAI TTS
  return ttsOpenAI({ apiKey: OPENAI_API_KEY, model: OPENAI_TTS_MODEL, voice: OPENAI_TTS_VOICE });
}

const cache = new Cache();

/**
 * Health
 */
app.get("/status", (req, res) => {
  res.json({
    ok: true,
    provider: `${(LLM_PROVIDER || "openai").toUpperCase()}+${(TTS_PROVIDER || "openai").toUpperCase()}`,
    model: {
      lvl1_3: LLM_OPENAI_MODEL || "gpt-4o-mini",
      lvl5: LLM_MISTRAL_MODEL || "mistral-small-latest"
    },
    tts: {
      provider: (TTS_PROVIDER || "openai").toUpperCase(),
      model: OPENAI_TTS_MODEL,
      voice: OPENAI_TTS_VOICE
    },
    cors: origins,
    bindings: {
      r2: Boolean(R2_BUCKET && R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY),
      kv: true,
      d1: true
    }
  });
});

/**
 * Generate + optional cache-to-R2
 * body: { prompt, lvl, minutes, lang }
 */
app.post("/episodes/generate", async (req, res) => {
  try {
    const { prompt = "", lvl = 3, minutes = 5, lang = "sv" } = req.body || {};
    if (!prompt) return res.status(400).json({ ok: false, error: "Prompt required" });

    const llm = pickLLM();
    const tts = pickTTS();

    // cache key ignores lang for now; include if you want separate per-language caches
    const cacheKey = `v2:${lvl}:${minutes}:${prompt.trim()}`;

    // 1) try cache (text+audio)
    const hit = await cache.get(cacheKey);
    if (hit?.text && hit?.audio) {
      return res.json({ ok: true, cached: true, text: hit.text, audio: hit.audio });
    }

    // 2) generate text
    const text = await llm.generate({ prompt, lvl, minutes, lang });

    // 3) TTS
    const audio = await tts.speak({ text, lang });

    // 4) save to R2 (optional) and KV cache
    let r2Key = null;
    try {
      r2Key = await saveAudioToR2({
        bucket: R2_BUCKET,
        accountId: R2_ACCOUNT_ID,
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
        base64: audio.base64,
        ext: audio.format || "mp3",
        meta: { lvl, minutes, lang }
      });
    } catch (e) {
      // R2 is optional; keep going even if it fails
      console.warn("R2 save failed:", e.message);
    }

    await cache.set(cacheKey, { text, audio, r2Key });

    res.json({ ok: true, cached: false, text, audio, r2Key });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message || "Internal error" });
  }
});

// --- start ---
app.listen(PORT, () => {
  console.log(`BN Custom Bridge listening on :${PORT}`);
});
