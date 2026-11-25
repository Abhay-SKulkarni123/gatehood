export const FUNCTIONS_REGION = process.env.FUNCTIONS_REGION || 'us-central1';

export const FANOUT_CHUNK_SIZE = 25;
export const FANOUT_CONCURRENCY = 5;
export const TRANSIENT_ATTEMPTS = 3;

export const RETRY_SCHEDULE = 'every 5 minutes';
export const RETRY_BATCH_LIMIT = 100;
export const RETRY_CONCURRENCY = 5;
export const RETRY_LEASE_MS = 4 * 60 * 1000;
export const MAX_RETRY_ATTEMPTS = 5;

export const DEMO_PROJECT_ID = 'demo-gatehood';
