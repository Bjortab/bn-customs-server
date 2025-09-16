require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { llmOpenAI } = require('./adapters/llm/openai');
const { llmOllama } = require('./adapters/llm/ollama');
const { ttsOpenAI } = require('./adapters/tts/openai');
const { ttsCoqui } = require('./adapters/tts/coqui');
const { base64FromBuffer, mimeFromFormat } = require('./utils/audio');

const app = express();

// ---------- Config ----------
const PORT = process.env.PORT || 8080;
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

// Providers
const LLM_PROVIDER = (process.env.LLM_PROVIDER || 'openai').toLowerCase(); // openai | ollama
const TTS_PROVIDER = (process.env.TTS_PROVIDER || 'openai').toLowerCase(); // openai | coqui

// OpenAI
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const LLM_OPENAI_MODEL = process.env.LLM_OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
const OPENAI_TTS_VOICE = process.env.OPENAI_TTS_VOICE || 'alloy';

// Ollama
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'mistral';

// TTS opts
const TTS_FORMAT = (process.env.TTS_FORMAT || 'mp3').toLowerCase(); // mp3|wav|ogg

// Coqui
const COQUI_TTS_URL = process.env.COQUI_TTS_URL || 'http://localhost:8020/tts';
const COQUI_LANG = process.env.COQUI_LANG || 'sv';
const COQUI_VOICE = process.env.COQUI_VOICE || '';

// ---------- Middleware ----------
app.use(express.json({ limit: '2mb' }));
app.use(morgan('tiny'));

if (ALLOWED_ORIGINS.length) {
  app.use(cors({
    origin: (origin, cb) => {
      // Tillåt curl/postman (utan origin) och whitelista
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error('CORS origin not allowed'));
    }
  }));
} else {
  app.use(cors()); // default (allt)
}

// Rate limit (enkel baseline)
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60, // 60 req/min
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// Enkel auth för POST-endpoints
function requireAuth(req, res, next) {
  if (!AUTH_TOKEN) return res.status(500).json({ error: 'server_auth_not_configured' });
  const got = req.headers['authorization'];
  if (got !== AUTH_TOKEN) return res.status(401).json({ error: 'unauthorized' });
  next();
}

// ---------- Health ----------
app.get('/healthz', (_req, res) => res.status(200).send('ok'));
app.get('/status', (_req, res) => {
  const status = {
    ok: true,
    llm: {
      provider: LLM_PROVIDER,
      openai_key: !!OPENAI_API_KEY,
      openai_model: LLM_OPENAI_MODEL,
      ollama_url: OLLAMA_URL,
      ollama_model: OLLAMA_MODEL
    },
    tts: {
      provider: TTS_PROVIDER,
      openai_key: !!OPENAI_API_KEY,
      openai_model: OPENAI_TTS_MODEL,
      openai_voice: OPENAI_TTS_VOICE,
      coqui_url: COQUI_TTS_URL,
      coqui_lang: COQUI_LANG,
      coqui_voice: COQUI_VOICE
    }
  };
  res.json(status);
});

// ---------- LLM ----------
app.post('/llm', requireAuth, async (req, res) => {
  const { prompt, system, temperature, max_tokens, lang } = req.body || {};
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'invalid_prompt' });
  }

  try {
    if (LLM_PROVIDER === 'openai') {
      if (!OPENAI_API_KEY) return res.status(500).json({ error: 'llm_openai_no_key' });
      const { text } = await llmOpenAI({
        apiKey: OPENAI_API_KEY,
        model: LLM_OPENAI_MODEL,
        prompt, system, temperature, max_tokens, lang
      });
      return res.json({ text });
    }

    if (LLM_PROVIDER === 'ollama') {
      const { text } = await llmOllama({
        url: OLLAMA_URL,
        model: OLLAMA_MODEL,
        prompt, temperature, max_tokens
      });
      return res.json({ text });
    }

    return res.status(501).json({ error: 'llm_provider_not_implemented' });
  } catch (err) {
    console.error('LLM error:', err?.response?.data || err.message);
    return res.status(502).json({ error: 'llm_failed' });
  }
});

// ---------- TTS ----------
app.post('/tts', requireAuth, async (req, res) => {
  const { text, voice, lang, format } = req.body || {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'invalid_text' });
  }
  const wantFormat = (format || TTS_FORMAT || 'mp3').toLowerCase();

  try {
    let buffer, mime;

    if (TTS_PROVIDER === 'openai') {
      if (!OPENAI_API_KEY) return res.status(500).json({ error: 'tts_openai_no_key' });
      const out = await ttsOpenAI({
        apiKey: OPENAI_API_KEY,
        model: OPENAI_TTS_MODEL,
        voice: voice || OPENAI_TTS_VOICE,
        text,
        format: wantFormat
      });
      buffer = out.buffer;
      mime = out.mime;
    } else if (TTS_PROVIDER === 'coqui') {
      const out = await ttsCoqui({
        url: COQUI_TTS_URL,
        text,
        lang: lang || COQUI_LANG,
        voice: voice || COQUI_VOICE
      });
      buffer = out.buffer;
      mime = out.mime; // oftast audio/wav
    } else {
      return res.status(501).json({ error: 'tts_provider_not_implemented' });
    }

    // Om klienten vill ha binärt ljud direkt
    const accept = (req.headers['accept'] || '').toLowerCase();
    if (accept.includes('audio/')) {
      res.setHeader('Content-Type', mime || 'application/octet-stream');
      return res.status(200).send(buffer);
    }

    // Annars JSON med base64 (för BN-worker CUSTOM)
    const audio_base64 = base64FromBuffer(buffer);
    return res.json({ audio_base64, mime: mime || 'application/octet-stream' });
  } catch (err) {
    console.error('TTS error:', err?.response?.data || err.message);
    return res.status(502).json({ error: 'tts_failed' });
  }
});

// ---------- 404 ----------
app.use((_req, res) => res.status(404).json({ error: 'not_found' }));

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`BN Custom Bridge listening on :${PORT}`);
});
