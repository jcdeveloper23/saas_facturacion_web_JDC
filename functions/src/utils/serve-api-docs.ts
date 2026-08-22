import { onRequest } from 'firebase-functions/v2/https';
import * as path from 'path';
import * as fs from 'fs';

export const serveApiDocs = onRequest(
  { memory: '256MiB' },
  (req, res) => {
    // CORS — allow any origin (documentation is public read-only)
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    const yamlPath = path.join(__dirname, '..', '..', 'docs', 'openapi.yaml');
    if (!fs.existsSync(yamlPath)) {
      res.status(404).json({ error: 'openapi.yaml not found', path: yamlPath });
      return;
    }

    const yaml = fs.readFileSync(yamlPath, 'utf-8');
    res.set('Content-Type', 'application/yaml');
    res.set('Cache-Control', 'public, max-age=3600');
    res.status(200).send(yaml);
  }
);
