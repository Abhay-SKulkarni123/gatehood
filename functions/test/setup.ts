process.env.GCLOUD_PROJECT = 'demo-gatehood';
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-gatehood' });
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.FUNCTIONS_EMULATOR_HOST ||= '127.0.0.1:5001';
