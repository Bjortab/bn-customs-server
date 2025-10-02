import express from "express";
import morgan from "morgan";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";

import { generateOpenAI } from "./adapters/openai.js";
import { generateMistral } from "./adapters/mistral.js";
import { generateElevenLabs } from "./adapters/elevenlabs.js";
import { cacheGet, cacheSet } from "./utils/cache.js";

dotenv.config();
const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

const PORT = process.env.PORT || 8787;

app.get("/", (req, res) => {
  res.json({ ok: true, service: "bn-customs-server" });
});

app.post("/llm", async (req, res) => {
  try {
    const { prompt, lvl, minutes, lang } = req.body;
    if (!prompt) return res.status(400).json({ error: "Missing prompt" });

    // Bygg cache-nyckel baserat på input
    const cacheKey = `llm-${lvl}-${lang}-${prompt}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return res.json({ ok: true, cached: true, ...cached });
    }

    let output;
    if (lvl == 3) {
      output = await generateOpenAI(prompt, minutes, lang);
    } else if (lvl == 5) {
      output = await generateElevenLabs(prompt, minutes, lang);
    } else {
      output = await generateMistral(prompt, minutes, lang);
    }

    await cacheSet(cacheKey, output);
    res.json({ ok: true, cached: false, ...output });

  } catch (err) {
    console.error("LLM error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`BN Customs server running on port ${PORT}`);
});
