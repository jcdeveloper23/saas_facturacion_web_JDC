import { onRequest } from 'firebase-functions/v2/https';
import * as path from 'path';
import * as fs from 'fs';

const YAML_URL = 'https://us-central1-facturasproec.cloudfunctions.net/serveApiDocs';

function buildSwaggerUiHtml(): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SaasFacturacion — API Reference</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f7fa; }

    /* ── Top bar ── */
    .top-bar {
      background: #1a1f36;
      padding: 14px 28px;
      display: flex;
      align-items: center;
      gap: 16px;
      position: sticky;
      top: 0;
      z-index: 100;
      box-shadow: 0 2px 8px rgba(0,0,0,.35);
    }
    .top-bar .logo {
      color: #fff;
      font-size: 17px;
      font-weight: 700;
      letter-spacing: .3px;
      white-space: nowrap;
    }
    .top-bar .badge {
      background: #3b5bdb;
      color: #fff;
      font-size: 11px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 4px;
      letter-spacing: .4px;
    }
    .top-bar .spacer { flex: 1; }
    .top-bar .yaml-link {
      color: #a5b4fc;
      font-size: 12px;
      text-decoration: none;
      border: 1px solid #3b5bdb;
      border-radius: 4px;
      padding: 4px 10px;
      transition: background .15s;
    }
    .top-bar .yaml-link:hover { background: #3b5bdb; color: #fff; }

    /* ── Auth helper banner ── */
    .auth-banner {
      background: #eff6ff;
      border-left: 4px solid #3b82f6;
      margin: 20px 28px 0;
      padding: 14px 18px;
      border-radius: 0 6px 6px 0;
      font-size: 13px;
      color: #1e3a5f;
      line-height: 1.55;
    }
    .auth-banner strong { color: #1d4ed8; }
    .auth-banner code {
      background: #dbeafe;
      padding: 1px 5px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
    }
    .auth-steps { margin-top: 8px; padding-left: 16px; }
    .auth-steps li { margin-top: 4px; }

    /* ── Swagger UI overrides ── */
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info { margin: 20px 0 10px; }
    .swagger-ui .scheme-container { padding: 12px 0; }

    #swagger-ui { padding: 0 20px 40px; max-width: 1280px; margin: 0 auto; }
  </style>
</head>
<body>

  <div class="top-bar">
    <span class="logo">⚡ SaasFacturacion</span>
    <span class="badge">API Reference</span>
    <span class="spacer"></span>
    <a class="yaml-link" href="${YAML_URL}" target="_blank">↓ openapi.yaml</a>
  </div>

  <div class="auth-banner">
    <strong>🔐 Cómo autenticarse para probar los endpoints</strong>
    <ol class="auth-steps">
      <li>Haz clic en <strong>POST /getAuthToken</strong> → <em>Try it out</em> → ingresa tu <code>email</code> y <code>password</code> → <em>Execute</em>.</li>
      <li>Copia el valor de <code>idToken</code> de la respuesta.</li>
      <li>Haz clic en el botón <strong>Authorize 🔓</strong> (arriba a la derecha) → pega el token → <em>Authorize</em>.</li>
      <li>Todos los endpoints protegidos enviarán automáticamente <code>Authorization: Bearer &lt;token&gt;</code>.</li>
    </ol>
  </div>

  <div id="swagger-ui"></div>

  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
  <script>
    SwaggerUIBundle({
      url: '${YAML_URL}',
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
      layout: 'StandaloneLayout',
      tryItOutEnabled: true,
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      deepLinking: true,
      defaultModelsExpandDepth: 1,
      defaultModelExpandDepth: 2,
      operationsSorter: 'alpha',
    });
  </script>
</body>
</html>`;
}

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

    // ?ui=true  o  Accept: text/html  → Swagger UI
    const wantsUi =
      req.query['ui'] === 'true' ||
      (req.headers['accept'] ?? '').includes('text/html');

    if (wantsUi) {
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=300');
      res.status(200).send(buildSwaggerUiHtml());
      return;
    }

    // Default → raw YAML (para Postman, openapi-generator, etc.)
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
