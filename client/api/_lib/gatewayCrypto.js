// Envelope encryption for merchant secrets (their Paystack secret key) so a
// database dump alone never yields a usable key — an attacker would also need
// GATEWAY_ENC_KEY, which lives only in the server environment, never in the DB.
//
// AES-256-GCM (authenticated). Stored form: "enc:v1:<iv>:<tag>:<ciphertext>",
// all base64. Values without the prefix are treated as legacy plaintext and
// returned as-is, so existing rows keep working and get re-encrypted the next
// time the merchant re-connects. If GATEWAY_ENC_KEY is unset, encrypt() is a
// passthrough (stores plaintext) — set the key to turn protection on; nothing
// breaks either way.
//
// This folder (_lib) is deliberately underscore-prefixed: the self-hosted
// Express server only mounts top-level *.js as routes, and Vercel excludes
// underscore paths from routing — so this is an importable helper, not an
// endpoint.
import crypto from 'node:crypto';

function key() {
  const raw = process.env.GATEWAY_ENC_KEY || '';
  if (!raw) return null;
  const buf = raw.length === 64 ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  return buf.length === 32 ? buf : null; // AES-256 needs exactly 32 bytes
}

export function encryptSecret(plain) {
  const k = key();
  if (!k || !plain) return plain; // not configured (or empty) → passthrough
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decryptSecret(stored) {
  if (!stored || !String(stored).startsWith('enc:v1:')) return stored; // legacy plaintext
  const k = key();
  if (!k) throw new Error('Payment key encryption is not configured on the server.');
  const [, , ivB, tagB, ctB] = String(stored).split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(ivB, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB, 'base64')), decipher.final()]).toString('utf8');
}
