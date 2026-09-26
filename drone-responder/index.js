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
    const metrics = decodeMetrics(buffer);

    console.log(
        '\n===== VITALS ====='
    );

    console.log(
        JSON.stringify(metrics, null, 2)
    );

    console.log(
        'Timestamp:',
        timestamp,
        'µs'
    );
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

    process.exit(0);
});