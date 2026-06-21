const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3012;
const ROOT = __dirname;
const ACCOUNT_RECORD_DIR = path.join(ROOT, 'account_record');
const LAST_ACCOUNT_FILE = path.join(ACCOUNT_RECORD_DIR, 'last-account.json');
const STATE_FILE_SUFFIX = 'progress-board.json';
const DEFAULT_ACCOUNT_ID = '000666888';
const MAX_JSON_BYTES = 2 * 1024 * 1024;

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (requestUrl.pathname === '/api/accounts') {
    handleAccountsApi(req, res);
    return;
  }

  if (requestUrl.pathname === '/api/last-account') {
    handleLastAccountApi(req, res);
    return;
  }

  if (requestUrl.pathname === '/api/progress-board') {
    handleProgressBoardApi(req, res, requestUrl);
    return;
  }

  const requestedPath = decodeURIComponent(requestUrl.pathname);
  const relativePath = requestedPath === '/' ? '/index.html' : requestedPath;
  const filePath = path.resolve(ROOT, `.${relativePath}`);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const contentType = contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function getAccountId(value) {
  const normalized = String(value || '').trim().replace(/[^a-zA-Z0-9_]/g, '');
  return normalized || DEFAULT_ACCOUNT_ID;
}

function getStateFileName(accountId) {
  return `${accountId}-${STATE_FILE_SUFFIX}`;
}

function getStateFile(accountId) {
  return path.join(ACCOUNT_RECORD_DIR, getStateFileName(accountId));
}

function handleAccountsApi(req, res) {
  if (req.method !== 'GET') {
    res.writeHead(405, { Allow: 'GET' });
    res.end('Method not allowed');
    return;
  }

  fs.mkdir(ACCOUNT_RECORD_DIR, { recursive: true }, (mkdirError) => {
    if (mkdirError) {
      sendJson(res, 500, { error: 'Unable to read account records' });
      return;
    }

    fs.readdir(ACCOUNT_RECORD_DIR, (readError, files) => {
      if (readError) {
        sendJson(res, 500, { error: 'Unable to read account records' });
        return;
      }

      const accounts = files
        .filter((file) => file.endsWith(`-${STATE_FILE_SUFFIX}`))
        .map((file) => getAccountId(file.split('-')[0]));

      if (!accounts.includes(DEFAULT_ACCOUNT_ID)) accounts.unshift(DEFAULT_ACCOUNT_ID);
      sendJson(res, 200, { accounts: [...new Set(accounts)] });
    });
  });
}

function handleLastAccountApi(req, res) {
  if (req.method === 'GET') {
    fs.readFile(LAST_ACCOUNT_FILE, 'utf8', (error, data) => {
      if (error) {
        sendJson(res, error.code === 'ENOENT' ? 404 : 500, { error: 'Last account not found' });
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  if (req.method === 'PUT') {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > MAX_JSON_BYTES) {
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        const accountId = getAccountId(parsed.accountId);
        const prettyJson = `${JSON.stringify({
          accountId,
          updatedAt: new Date().toISOString(),
        }, null, 2)}\n`;

        fs.mkdir(ACCOUNT_RECORD_DIR, { recursive: true }, (mkdirError) => {
          if (mkdirError) {
            sendJson(res, 500, { error: 'Unable to save last account' });
            return;
          }

          fs.writeFile(LAST_ACCOUNT_FILE, prettyJson, 'utf8', (error) => {
            if (error) {
              sendJson(res, 500, { error: 'Unable to save last account' });
              return;
            }
            sendJson(res, 200, { ok: true, accountId });
          });
        });
      } catch (error) {
        sendJson(res, 400, { error: 'Invalid JSON' });
      }
    });
    req.on('error', () => {
      sendJson(res, 400, { error: 'Unable to read request body' });
    });
    return;
  }

  res.writeHead(405, { Allow: 'GET, PUT' });
  res.end('Method not allowed');
}

function handleProgressBoardApi(req, res, requestUrl) {
  const accountId = getAccountId(requestUrl.searchParams.get('account'));
  const stateFileName = getStateFileName(accountId);
  const stateFile = getStateFile(accountId);

  if (req.method === 'GET') {
    fs.readFile(stateFile, 'utf8', (error, data) => {
      if (error) {
        sendJson(res, error.code === 'ENOENT' ? 404 : 500, { error: 'State file not found' });
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  if (req.method === 'PUT') {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > MAX_JSON_BYTES) {
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        parsed.accountId = accountId;
        parsed.fileName = stateFileName;
        const prettyJson = `${JSON.stringify(parsed, null, 2)}\n`;
        fs.mkdir(ACCOUNT_RECORD_DIR, { recursive: true }, (mkdirError) => {
          if (mkdirError) {
            sendJson(res, 500, { error: 'Unable to save state file' });
            return;
          }

          fs.writeFile(stateFile, prettyJson, 'utf8', (error) => {
            if (error) {
              sendJson(res, 500, { error: 'Unable to save state file' });
              return;
            }
            sendJson(res, 200, { ok: true, fileName: stateFileName });
          });
        });
      } catch (error) {
        sendJson(res, 400, { error: 'Invalid JSON' });
      }
    });
    req.on('error', () => {
      sendJson(res, 400, { error: 'Unable to read request body' });
    });
    return;
  }

  res.writeHead(405, { Allow: 'GET, PUT' });
  res.end('Method not allowed');
}

server.listen(PORT, () => {
  console.log(`Progress board running at http://localhost:${PORT}`);
});
