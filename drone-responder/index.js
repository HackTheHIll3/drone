import { createServer } from 'node:http';
import {
    SmartSpectraSDK,
    breathingMetrics,
    cardioMetrics,
    decodeMetrics
} from '@smartspectra/node-sdk';

const apiKey = process.env.SMARTSPECTRA_API_KEY;

if (!apiKey) {
    console.error(
        'ERROR: SMARTSPECTRA_API_KEY environment variable is not set.'
    );

    process.exit(1);
}

console.log('Starting SmartSpectra...');

let latestMetrics = null;

const server = createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== '/metrics') {
        response.writeHead(404, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'Not found' }));
        return;
    }

    if (!latestMetrics) {
        response.writeHead(503, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'Metrics are not available yet' }));
        return;
    }

    response.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
    });
    response.end(JSON.stringify(latestMetrics));
});

const port = Number(process.env.PORT || 3000);
server.listen(port, '127.0.0.1', () => {
    console.log(`Metrics endpoint available at http://127.0.0.1:${port}/metrics`);
});

const sdk = new SmartSpectraSDK({
    apiKey,
    requestedMetrics: [
        ...breathingMetrics,
        ...cardioMetrics
    ]
});

sdk.on('processingStatus', (status) => {
    console.log('Processing status:', status);
});

sdk.on('validationStatus', (code, timestamp, hint) => {
    console.log(
        'Validation:',
        code,
        hint,
        'at',
        timestamp,
        'µs'
    );
});

sdk.on('metrics', (buffer, timestamp) => {
    latestMetrics = {
        metrics: decodeMetrics(buffer),
        timestamp
    };
});

sdk.on('error', (code, message, retryable) => {
    console.error(
        'SmartSpectra error:',
        code,
        message,
        'retryable =',
        retryable
    );
});

// Use the default Windows camera
sdk.useCamera();

console.log('Starting camera...');

sdk.start();

console.log(
    'SmartSpectra is running. Look at the camera.'
);
console.log(
    'Press Ctrl+C to stop.'
);

// Clean shutdown
process.on('SIGINT', async () => {
    console.log('\nStopping SmartSpectra...');

    await sdk.stopAsync();
    await sdk.destroy();
    await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    });

    process.exit(0);
});