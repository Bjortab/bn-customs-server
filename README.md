# BN Custom Bridge (LLM & TTS)

En liten Node/Express-server som exponerar två endpoints:
- POST /llm  → svarar med { text }
- POST /tts  → svarar med { audio_base64, mime } eller binärt ljud beroende på Accept-header

## Snabbstart
1) Klistra in repo-strukturen i GitHub (eller lokalt).
2) `cp .env.example .env` och fyll i värden.
3) `npm install`
4) `npm run dev` (lokalt) eller deploya till valfri host.

## Miljövariabler (se .env.example)
- AUTH_TOKEN=Bearer <hemligt>  ← detta måste matcha BN_*_AUTH i din worker
- ALLOWED_ORIGINS=https://bn-demo01.pages.dev

### LLM
- LLM_PROVIDER=openai|ollama
- OPENAI_API_KEY=...
- LLM_OPENAI_MODEL=gpt-4o-mini
- OLLAMA_URL=http://localhost:11434
- OLLAMA_MODEL=mistral

### TTS
- TTS_PROVIDER=openai|coqui
- OPENAI_API_KEY=...
- OPENAI_TTS_MODEL=gpt-4o-mini-tts
- OPENAI_TTS_VOICE=alloy
- TTS_FORMAT=mp3  (mp3|wav|ogg)
- COQUI_TTS_URL=http://localhost:8020/tts
- COQUI_LANG=sv
- COQUI_VOICE=  (om din server stödjer speaker-id)

## Curl-test
# LLM
curl -X POST https://<din-host>/llm \
 -H "Authorization: Bearer <hemligt>" -H "Content-Type: application/json" \
 -d '{"prompt":"Skriv två meningar om kaffe på svenska.","temperature":0.7}'

# TTS (JSON)
curl -X POST https://<din-host>/tts \
 -H "Authorization: Bearer <hemligt>" -H "Content-Type: application/json" \
 -d '{"text":"Hej Björn, detta är ett TTS-test.","lang":"sv","format":"mp3"}'

# TTS (få binärt ljud direkt)
curl -X POST https://<din-host>/tts \
 -H "Authorization: Bearer <hemligt>" -H "Content-Type: application/json" -H "Accept: audio/*" \
 -d '{"text":"Hej Björn, detta är ett TTS-test.","lang":"sv","format":"mp3"}' --output out.mp3

## Hälsa
GET /status  → vilka providers är aktiva och config-checks
GET /healthz → 200 OK
