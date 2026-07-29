// Self-hosted equivalent of Vercel's file-based /api routing (client/api/*.js).
// Each handler already uses the standard Vercel Node signature (req, res),
// so they run unmodified here.
import express from 'express';
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.join(__dirname, '..', 'client', 'api');

const app = express();
// Behind nginx (a single proxy hop): derive req.ip from the trusted chain so a
// client-sent X-Forwarded-For can't be spoofed. The job-post report dedup keys
// off req.ip, so this prevents forged reports from hiding posts.
app.set('trust proxy', 1);
app.use(express.json());

for (const file of readdirSync(apiDir).filter((f) => f.endsWith('.js'))) {
  const name = file.slice(0, -3);
  const { default: handler } = await import(pathToFileURL(path.join(apiDir, file)));
  app.all(`/api/${name}`, (req, res) => handler(req, res));
}

const port = process.env.PORT || 4000;
app.listen(port, '127.0.0.1', () => {
  console.log(`collarone-api listening on 127.0.0.1:${port}`);
});
