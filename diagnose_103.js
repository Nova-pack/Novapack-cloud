const admin = require('firebase-admin');

// IMPORTANT: Replace with the actual path to your service account key file
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function check103() {
    console.log("Fetching users...");
    const snap = await db.collection('users').get();
    
    let client103 = null;
    let alphaClient = null;

    snap.forEach(doc => {
        const d = doc.data();
        if (String(d.idNum) === '103') {
            client103 = { id: doc.id, ...d };
        }
        if (d.isSynthetic) {
            alphaClient = { id: doc.id, ...d };
        }
    });

    console.log("Client 103:", client103);
    console.log("Alpha Client:", alphaClient);
    
    // Search for Alpha user tickets
    if (alphaClient) {
        const tSnap = await db.collection('tickets').where('storageUid', '==', alphaClient.id).get();
        console.log(`Found ${tSnap.size} tickets for Alpha Client ${alphaClient.id}`);
    }
}

check103().then(() => process.exit());
