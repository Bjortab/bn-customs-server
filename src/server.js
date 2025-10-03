// GC v2 — enkelfil-server för BN Custom Bridge (LLM + TTS)
// Använder bara npm-paket: express, cors, openai

import express from "express";
import cors from "cors";
import { OpenAI } from "openai";

const PORT = process.env.PORT || 10000;

// Tillåtna origins för CORS
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

// OpenAI-nyckel och modeller
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const LLM_OPENAI_MODEL = process.env.LLM_OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const OPENAI_TTS_VOICE = process.env.OPENAI_TTS_VOICE || "alloy";
const TTS_FORMAT = (process.env.TTS_FORMAT || "mp3").toLowerCase();

if (!OPENAI_API_KEY) {
  console.error("Saknar OPENAI_API_KEY i miljövariablerna!");
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const app = express();
app.use(express.json({ limit: "2mb" }));

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.length === 0) return cb(null, true);
      cb(null, ALLOWED_ORIGINS.includes(origin));
    },
  })
);

// Hjälpfunktioner
const ok = (res, data) => res.json({ ok: true, ...data });
const fail = (res, code, detail) => res.status(code).json({ ok: false, code, detail });

// Systemprompt beroende på nivå
function buildSystemPrompt({ lvl = 3, minutes = 3, lang = "sv" }) {
  const tone =
    lvl >= 5
      ? "mycket explicit vuxeninnehåll, direkt språk, grafiska detaljer"
      : lvl >= 4
      ? "vuxet innehåll, sensuellt, tydligt men inte pornografiskt"
      : lvl >= 3
      ? "romantiskt och lätt suggestivt, inga grova ord"
      : lvl >= 2
      ? "mjuk romantik, hintar, inga detaljer"
      : "helt familjevänligt";

  const lengthHint =
    minutes >= 5 ? "cirka 700–900 ord" :
    minutes >= 3 ? "cirka 400–600 ord" : "cirka 200–350 ord";

  return `Du skriver på svenska. Håll längden till ${lengthHint}.
Ton: ${tone}. Använd dialog och avsluta berättelsen ordentligt.`;
}

// ROUTES

// Status
app.get("/status", (_req, res) => {
  ok(res, {
    worker: "bn-customs-server",
    provider: "openai",
    llm: { model: LLM_OPENAI_MODEL, has_key: !!OPENAI_API_KEY },
    tts: { model: OPENAI_TTS_MODEL, voice: OPENAI_TTS_VOICE, format: TTS_FORMAT },
    cors: ALLOWED_ORIGINS,
  });
});

// Textgenerering (LLM)
app.post("/llm", async (req, res) => {
  try {
    const { prompt = "", lvl = 3, minutes = 3 } = req.body || {};
    if (!prompt) return fail(res, 400, "prompt_required");

    const system = buildSystemPrompt({ lvl, minutes });

    const completion = await openai.chat.completions.create({
      model: LLM_OPENAI_MODEL,
      temperature: lvl >= 5 ? 1.0 : 0.8,
      max_tokens: 1800,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    });

    const text = completion?.choices?.[0]?.message?.content?.trim() || "(inget svar)";
    ok(res, { text });
  } catch (e) {
    fail(res, 500, e?.message || "llm_error");
  }
});

// TTS (text-till-tal)
app.post("/tts", async (req, res) => {
  try {
    const { text = "" } = req.body || {};
    if (!text) return fail(res, 400, "text_required");

    const audio = await openai.audio.speech.create({
      model: OPENAI_TTS_MODEL,
      voice: OPENAI_TTS_VOICE,
      input: text,
      format: TTS_FORMAT,
    });

    const base64 = Buffer.from(await audio.arrayBuffer()).toString("base64");
    ok(res, { audio_base64: base64, format: TTS_FORMAT, voice: OPENAI_TTS_VOICE });
  } catch (e) {
    fail(res, 500, e?.message || "tts_error");
  }
});

app.use((_req, res) => fail(res, 404, "not_found"));

app.listen(PORT, () => {
  console.log(`BN Custom Bridge kör på port ${PORT}`);
});
