const admin = require('firebase-admin');
const serviceAccount = require('./firebase-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkIds() {
    let foundUsers = [];
    let foundComps = [];

    const users = await db.collection('users').get();
    for (const doc of users.docs) {
        const u = doc.data();
        if (JSON.stringify(u).includes('SCRM31') || JSON.stringify(u).includes('SCRM')) {
            foundUsers.push({ id: doc.id, name: u.name, idNum: u.idNum });
        }
        
        const comps = await db.collection('users').doc(doc.id).collection('companies').get();
        for (const cdoc of comps.docs) {
            const c = cdoc.data();
            if (JSON.stringify(c).includes('SCRM31') || JSON.stringify(c).includes('SCRM')) {
                foundComps.push({ uid: doc.id, compId: cdoc.id, name: c.name, prefix: c.prefix });
            }
        }
    }
    
    console.log("Users with SCRM:", foundUsers);
    console.log("Companies with SCRM:", foundComps);
    process.exit(0);
}

checkIds();
