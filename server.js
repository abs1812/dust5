// package.json 없이 단독 실행 가능한 로컬 테스트 서버 (CommonJS)
const http = require('http');
const fs = require('fs');
const path = require('path');
const dustHandler = require('./api/dust.js');

// .env.local 환경변수 수동 로드
if (fs.existsSync('.env.local')) {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...values] = trimmed.split('=');
      process.env[key.trim()] = values.join('=').trim();
    }
  }
}

// MIME 타입 매핑
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

// 로컬 테스트용 HTTP 서버 생성
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // 1. /api/dust 요청 처리 (Vercel 서버리스 함수 연동)
  if (pathname === '/api/dust') {
    const query = Object.fromEntries(parsedUrl.searchParams.entries());
    const mockReq = {
      method: req.method,
      query: query,
      headers: req.headers
    };

    const mockRes = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) {
        this.headers[k] = v;
        res.setHeader(k, v);
      },
      status(code) {
        this.statusCode = code;
        res.statusCode = code;
        return this;
      },
      json(data) {
        res.setHeader('Content-Type', 'application/json; charset=UTF-8');
        res.end(JSON.stringify(data));
      }
    };

    try {
      await dustHandler(mockReq, mockRes);
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=UTF-8');
      res.end(JSON.stringify({ message: '서버 내부 오류', error: err.message }));
    }
    return;
  }

  // 2. 정적 파일 서빙 (index.html, style.css, script.js 등)
  let filePath = pathname === '/' ? '/index.html' : pathname;
  const safePath = path.join(__dirname, path.normalize(filePath));

  if (!safePath.startsWith(__dirname)) {
    res.statusCode = 403;
    return res.end('Access Denied');
  }

  if (fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(safePath).pipe(res);
  } else {
    res.statusCode = 404;
    res.end('Not Found');
  }
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`[서버 실행 완료] http://localhost:${PORT}`);
});
