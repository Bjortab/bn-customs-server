// src/server.js
// BN Custom Bridge — LLM & TTS
// v2.0 GC (imports fixade till ./adapters/llm/*)

import express from 'express';
import cors from 'cors';

// ==== LLM-adapters (pekar nu på ./adapters/llm/) ====
import openaiLLM from './adapters/llm/openai.js';
let mistralLLM = null;
try { mistralLLM = (await import('./adapters/llm/mistral.js')).default; } catch (_) { /* optional */ }

// ==== TTS-adapters (ligger i ./tts) ====
import openaiTTS from './tts/openai.js';
let elevenlabsTTS = null;
let coquiTTS = null;
try { elevenlabsTTS = (await import('./tts/elevenlabs.js')).default; } catch (_) { /* optional */ }
try { coquiTTS = (await import('./tts/coqui.js')).default; } catch (_) { /* optional */ }

// ==== Utils ====
import { toDataUrl } from './utils/audio.js';
import { cacheGet, cachePut } from './utils/cache.js';

// ==== Env ====
const {
  PORT = 10000,
  NODE_ENV = 'production',

  // Auth + CORS
  AUTH_TOKEN,
  ALLOWED_ORIGINS, // kommaseparerad lista

  // LLM
  LLM_PROVIDER = 'openai',                 // 'openai' | 'mistral'
  LLM_OPENAI_MODEL = 'gpt-4o-mini',
  // valfritt för mistral: LLM_MISTRAL_MODEL

  // TTS
  TTS_PROVIDER = 'openai',                 // 'openai' | 'elevenlabs' | 'coqui'
  OPENAI_TTS_MODEL = 'gpt-4o-mini-tts',
  OPENAI_TTS_VOICE = 'alloy',
  TTS_FORMAT = 'mp3',                      // 'mp3' | 'wav' | 'ogg'

  // Debug
  DEBUG = '0'
} = process.env;

// ==== App & CORS ====
const app = express();
app.use(express.json({ limit: '2mb' }));

const allowList = (ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);                            // t.ex. curl/postman
    if (allowList.length === 0 || allowList.includes(origin)) {
      return cb(null, true);
    }
    return cb(new Error('CORS: Origin not allowed'), false);
  }
}));

// ==== Auth-middleware (valfritt – används om AUTH_TOKEN satt) ====
app.use((req, res, next) => {
  if (!AUTH_TOKEN) return next();
  const tok = req.headers.authorization || '';
  if (tok === AUTH_TOKEN) return next();
  return res.status(401).json({ ok: false, error: 'unauthorized' });
});

// ==== Helpers ====
const hasOpenAI = !!process.env.OPENAI_API_KEY;
const hasEleven = !!process.env.ELEVENLABS_API_KEY;
const hasCoqui  = !!process.env.COQUI_URL; // din coqui-adress om du kör det

function pickLLM() {
  const p = (LLM_PROVIDER || 'openai').toLowerCase();
  if (p === 'mistral' && mistralLLM) return { name: 'mistral', run: mistralLLM };
  return { name: 'openai', run: openaiLLM };
}

function pickTTS() {
  const p = (TTS_PROVIDER || 'openai').toLowerCase();
  if (p === 'elevenlabs' && elevenlabsTTS) return { name: 'elevenlabs', run: elevenlabsTTS };
  if (p === 'coqui' && coquiTTS)           return { name: 'coqui', run: coquiTTS };
  return { name: 'openai', run: openaiTTS };
}

// ==== /status ====
app.get('/status', (req, res) => {
  const llmChoice = pickLLM();
  const ttsChoice = pickTTS();
  const corsList = allowList.length ? allowList : ['*'];

  return res.json({
    ok: true,
    worker: 'bn-customs-server',
    env: NODE_ENV,
    provider: {
      llm: llmChoice.name.toUpperCase(),
      tts: ttsChoice.name.toUpperCase()
    },
    model: {
      lvl1_3: LLM_OPENAI_MODEL || 'gpt-4o-mini',
      // valfritt: lvi5: process.env.LLM_MISTRAL_MODEL || 'mistral-small-latest'
    },
    tts: {
      provider: ttsChoice.name.toUpperCase(),
      model: OPENAI_TTS_MODEL,
      voice: OPENAI_TTS_VOICE,
      format: TTS_FORMAT
    },
    has_keys: {
      openai: !!hasOpenAI,
      elevenlabs: !!hasEleven,
      coqui: !!hasCoqui
    },
    cors: corsList
  });
});

// ==== /llm ====
app.post('/llm', async (req, res) => {
  try {
    const { prompt = '', lvl = 3, minutes = 3, lang = 'sv' } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ ok: false, error: 'prompt required' });
    }

    // cache key (text-only)
    const cacheKey = `llm:${lang}:${lvl}:${minutes}:${prompt.substring(0, 200)}`;
    const cached = await cacheGet(cacheKey);
    if (cached && cached.text) {
      if (DEBUG === '1') console.log('[LLM] cache hit');
      return res.json({ ok: true, cached: true, text: cached.text });
    }

    const { run } = pickLLM();
    const text = await run({
      prompt, lvl, minutes, lang,
      model: LLM_OPENAI_MODEL
    });

    await cachePut(cacheKey, { text }, 60 * 60 * 24); // 24h
    return res.json({ ok: true, cached: false, text });
  } catch (e) {
    console.error('LLM error:', e);
    return res.status(500).json({ ok: false, error: 'llm_failed', detail: String(e?.message || e) });
  }
});

// ==== /tts ====
app.post('/tts', async (req, res) => {
  try {
    const { text = '', lang = 'sv', voice = OPENAI_TTS_VOICE, format = TTS_FORMAT } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ ok: false, error: 'text required' });
    }

    // cache key (audio)
    const cacheKey = `tts:${lang}:${voice}:${format}:${text.substring(0, 200)}`;
    const cached = await cacheGet(cacheKey);
    if (cached && cached.base64) {
      if (DEBUG === '1') console.log('[TTS] cache hit');
      return res.json({ ok: true, cached: true, audio: { format, base64: cached.base64 } });
    }

    const { run } = pickTTS();
    const audioBuffer = await run({
      text, lang,
      voice: voice || OPENAI_TTS_VOICE,
      model: OPENAI_TTS_MODEL,
      format
    });

    // spara i cache
    const base64 = audioBuffer.toString('base64');
    await cachePut(cacheKey, { base64 }, 60 * 60 * 24); // 24h

    return res.json({ ok: true, cached: false, audio: { format, base64 } });
  } catch (e) {
    console.error('TTS error:', e);
    return res.status(500).json({ ok: false, error: 'tts_failed', detail: String(e?.message || e) });
  }
});

// ==== Root ====
app.get('/', (_req, res) => res.send('BN Custom Bridge up'));

// ==== Start ====
app.listen(PORT, () => {
  console.log(`BN Custom Bridge listening on :${PORT}`);
});
