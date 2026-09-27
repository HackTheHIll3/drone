import express from 'express';
import sharp from 'sharp';
import { PassThrough } from 'stream';
import {
    SmartSpectraSDK,
    breathingMetrics,
    cardioMetrics,
    faceMetrics,
    decodeMetrics,
    PixelFormat
} from '@smartspectra/node-sdk';

const apiKey = process.env.SMARTSPECTRA_API_KEY;

if (!apiKey) {
    console.error(
        'ERROR: SMARTSPECTRA_API_KEY environment variable is not set.'
    );
    process.exit(1);
}

console.log('Starting SmartSpectra...');

let latestMetrics = { metrics: {}, timestamp: 0 };

const app = express();

app.use((request, response, next) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    next();
});

app.get('/metrics', (request, response) => {
    if (!latestMetrics) {
        return response.status(503).json({ error: 'Metrics are not available yet' });
    }
    response.set('Cache-Control', 'no-store');
    response.status(200).json(latestMetrics);
});

// ---- Camera stream (MJPEG over HTTP, viewable via <img>) ----

const mjpegStream = new PassThrough();

app.get('/camera-stream', (request, response) => {
    response.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
        'Cache-Control': 'no-cache',
        Connection: 'close',
    });
    mjpegStream.pipe(response, { end: false });
    request.on('close', () => mjpegStream.unpipe(response));
});

// Only RGB-family formats are handled here; NV12/NV21/YUYV need a
// colorspace conversion step first (see note below).
function channelsForFormat(pixelFormat) {
    switch (pixelFormat) {
        case PixelFormat.kRGB:
        case PixelFormat.kBGR:
            return 3;
        case PixelFormat.kRGBA:
        case PixelFormat.kBGRA:
            return 4;
        default:
            return null;
    }
}

function isBgrOrder(pixelFormat) {
    return pixelFormat === PixelFormat.kBGR || pixelFormat === PixelFormat.kBGRA;
}

// Strip row padding (stride > width * channels) so sharp gets tightly
// packed raw pixel data, and swap B/R bytes if the buffer is BGR(A).
function normalizeFrame(buf, width, height, channels, stride, bgr) {
    const rowBytes = width * channels;
    const out = Buffer.alloc(rowBytes * height);

    for (let y = 0; y < height; y++) {
        const srcRowStart = y * stride;
        const dstRowStart = y * rowBytes;
        buf.copy(out, dstRowStart, srcRowStart, srcRowStart + rowBytes);
    }

    if (bgr) {
        for (let i = 0; i < out.length; i += channels) {
            const b = out[i];
            out[i] = out[i + 2];
            out[i + 2] = b;
        }
    }

    return out;
}

let encoding = false; // simple backpressure guard - drop frames if we fall behind

async function handleVideoOutput(buf, width, height, stride, pixelFormat) {
    if (encoding) return; // skip this frame rather than let the queue build up
    const channels = channelsForFormat(pixelFormat);
    if (channels == null) {
        console.warn('Unsupported pixel format for preview, skipping frame:', pixelFormat);
        return;
    }

    encoding = true;
    try {
        const packed = normalizeFrame(buf, width, height, channels, stride, isBgrOrder(pixelFormat));
        const jpeg = await sharp(packed, { raw: { width, height, channels } })
            .jpeg({ quality: 80 })
            .toBuffer();

        mjpegStream.write(
            `--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`
        );
        mjpegStream.write(jpeg);
        mjpegStream.write('\r\n');
    } catch (err) {
        console.error('Frame encode error:', err);
    } finally {
        encoding = false;
    }
}

// Catch-all -> 404 JSON
app.use((request, response) => {
    response.status(404).json({ error: 'Not found' });
});

const port = Number(process.env.PORT || 3000);
const server = app.listen(port, '127.0.0.1', () => {
    console.log(`Metrics endpoint available at http://127.0.0.1:${port}/metrics`);
    console.log(`Camera stream available at http://127.0.0.1:${port}/camera-stream`);
});

const sdk = new SmartSpectraSDK({
    apiKey,
    requestedMetrics: [
        ...breathingMetrics,
        ...cardioMetrics,
        ...faceMetrics
    ]
});

sdk.on('processingStatus', (status) => {
    console.log('Processing status:', status);
});

sdk.on('validationStatus', (code, timestamp, hint) => {
    console.log('Validation:', code, hint, 'at', timestamp, 'µs');
});

sdk.on('metrics', (buffer, timestamp) => {
    const decoded = decodeMetrics(buffer);

    for (const [category, data] of Object.entries(decoded)) {
        if (!latestMetrics.metrics[category]) {
            latestMetrics.metrics[category] = {};
        }
        for (const [metric, readings] of Object.entries(data)) {
            latestMetrics.metrics[category][metric] = readings;
        }
    }

    latestMetrics.timestamp = timestamp;
});

sdk.on('videoOutput', (buf, width, height, stride, pixelFormat, timestampUs) => {
    handleVideoOutput(buf, width, height, stride, pixelFormat);
});

sdk.on('error', (code, message, retryable) => {
    console.error('SmartSpectra error:', code, message, 'retryable =', retryable);
});

sdk.useCamera();

console.log('Starting camera...');
sdk.start();
console.log('SmartSpectra is running. Look at the camera.');
console.log('Press Ctrl+C to stop.');

process.on('SIGINT', async () => {
    console.log('\nStopping SmartSpectra...');
    await sdk.stopAsync();
    await sdk.destroy();
    await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    });
    process.exit(0);
});