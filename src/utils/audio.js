function base64FromBuffer(buf) {
  return Buffer.from(buf).toString('base64');
}

function bufferFromBase64(b64) {
  return Buffer.from(b64, 'base64');
}

function mimeFromFormat(fmt) {
  const f = (fmt || 'mp3').toLowerCase();
  if (f === 'mp3') return 'audio/mpeg';
  if (f === 'wav') return 'audio/wav';
  if (f === 'ogg') return 'audio/ogg';
  return 'application/octet-stream';
}

module.exports = { base64FromBuffer, bufferFromBase64, mimeFromFormat };
