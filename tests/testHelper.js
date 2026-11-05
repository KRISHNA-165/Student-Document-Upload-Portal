const http = require('http');

function createMultipartPayload(fields = {}, files = []) {
  const boundary = '----Boundary' + Math.random().toString(36).substring(2);
  const chunks = [];

  for (const [key, val] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`));
  }

  for (const f of files) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${f.name}"; filename="${f.filename}"\r\nContent-Type: ${f.contentType || 'application/octet-stream'}\r\n\r\n`
      )
    );
    chunks.push(f.buffer);
    chunks.push(Buffer.from('\r\n'));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: Buffer.concat(chunks)
  };
}

function mockRequest(app, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const req = new http.IncomingMessage(null);
      req.method = (options.method || 'GET').toUpperCase();
      req.url = options.url || '/';
      req.headers = Object.assign({}, options.headers || {});

      let requestBodyBuffer = null;
      if (options.body) {
        if (Buffer.isBuffer(options.body)) {
          requestBodyBuffer = options.body;
          req.headers['content-length'] = requestBodyBuffer.length.toString();
        } else if (typeof options.body === 'object') {
          // Plain object: pre-assign req.body directly for express handlers
          req.body = options.body;
          requestBodyBuffer = Buffer.from(JSON.stringify(options.body));
          if (!req.headers['content-type']) {
            req.headers['content-type'] = 'application/json';
          }
          req.headers['content-length'] = requestBodyBuffer.length.toString();
        } else {
          requestBodyBuffer = Buffer.from(String(options.body));
          req.headers['content-length'] = requestBodyBuffer.length.toString();
        }
      }

      const res = new http.ServerResponse(req);
      const chunks = [];

      res.write = function (chunk) {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        return true;
      };

      res.end = function (chunk) {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        const rawBuffer = Buffer.concat(chunks);
        const textBody = rawBuffer.toString('utf-8');
        let jsonData = null;
        try {
          jsonData = JSON.parse(textBody);
        } catch {
          // Non-JSON response
        }

        resolve({
          statusCode: res.statusCode,
          headers: res.getHeaders(),
          body: textBody,
          json: jsonData,
          buffer: rawBuffer
        });
      };

      app.handle(req, res);

      if (requestBodyBuffer) {
        req.push(requestBodyBuffer);
        req.complete = true;
        req.push(null);
      } else {
        req.complete = true;
        req.push(null);
      }
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  createMultipartPayload,
  mockRequest
};
