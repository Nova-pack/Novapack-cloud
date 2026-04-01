const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function check103() {
    console.log("Fetching latest tickets for 103...");
    const snap = await db.collection('tickets')
        .where('clientIdNum', '==', '103')
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get();
        
    if(snap.empty) {
        console.log("No tickets found for 103.");
        return;
    }
    
    snap.forEach(doc => {
        const t = doc.data();
        console.log(`\nID: ${doc.id}`);
        console.log(`Receiver: ${t.receiver}`);
        console.log(`Address: ${t.address}`);
        console.log(`Locality: ${t.localidad} | CP: ${t.cp}`);
        console.log(`Driver Phone: "${t.driverPhone}"`);
        console.log(`Created: ${t.createdAt ? t.createdAt.toDate().toISOString() : 'Unknown'}`);
    });
}

check103().catch(console.error).finally(() => process.exit(0));
