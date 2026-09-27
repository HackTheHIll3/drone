import express from 'express';
import {
    SmartSpectraSDK,
    breathingMetrics,
    cardioMetrics,
    faceMetrics,
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

let latestMetrics = { metrics: {}, timestamp: 0 };

const app = express();

// Handle CORS for all routes
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

// Catch-all for anything else -> 404 JSON (matches original behavior)
app.use((request, response) => {
    response.status(404).json({ error: 'Not found' });
});

const port = Number(process.env.PORT || 3000);
const server = app.listen(port, '127.0.0.1', () => {
    console.log(`Metrics endpoint available at http://127.0.0.1:${port}/metrics`);
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
    const decoded = decodeMetrics(buffer);

    console.log(decoded);

    // Merge each top-level category (breathing, cardio, face, ...)
    for (const [category, data] of Object.entries(decoded)) {
        if (!latestMetrics.metrics[category]) {
            latestMetrics.metrics[category] = {};
        }
        // Merge each metric within the category
        for (const [metric, readings] of Object.entries(data)) {
            // Keep only the latest reading (or accumulate if you want history)
            latestMetrics.metrics[category][metric] = readings;
        }
    }

    latestMetrics.timestamp = timestamp;

    console.log("Sucessufly scnanned and got metrics");
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