const admin = require('firebase-admin');

// Initialize Firebase Admin with the credentials file.
// Check if novapack-firebase-adminsdk exists or we just use default app context
const serviceAccount = require('./serviceAccountKey.json'); // We don't have this!
