const { spawn } = require('child_process');
const http = require('http');

const cam = spawn('rpicam-vid', [
  '--nopreview',
  '-t', '0',           // run until killed
  '--inline',          // raw stream to stdout
  '--codec', 'mjpeg',
  '--width', '1280',
  '--height', '720'
]);

cam.stderr.on('data', d => console.error(`rpicam-vid: ${d}`));
cam.on('close', code => console.log(`rpicam-vid exited with code ${code}`));

// Track connected clients so each frame is written to all of them
const clients = new Set();

let buffer = Buffer.alloc(0);
const SOI = Buffer.from([0xff, 0xd8]); // JPEG start-of-image marker

cam.stdout.on('data', chunk => {
  buffer = Buffer.concat([buffer, chunk]);

  // Find frame boundaries by locating consecutive SOI markers
  let start = buffer.indexOf(SOI);
  while (start !== -1) {
    const next = buffer.indexOf(SOI, start + 2);
    if (next === -1) break; // wait for more data to complete this frame

    const frame = buffer.slice(start, next);
    for (const res of clients) {
      res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);
      res.write(frame);
      res.write('\r\n');
    }

    buffer = buffer.slice(next);
    start = buffer.indexOf(SOI, 2);
  }
});

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
    'Cache-Control': 'no-cache',
    Connection: 'close',
    Pragma: 'no-cache'
  });

  clients.add(res);

  req.on('close', () => {
    clients.delete(res);
  });
});

server.listen(8080, () => console.log('Streaming on http://<pi-ip>:8080'));

process.on('SIGINT', () => {
  cam.kill();
  server.close();
  process.exit();
});