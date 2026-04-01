const admin = require('firebase-admin');

admin.initializeApp({
    projectId: 'novapack-68f05'
});

const db = admin.firestore();

async function dedupeAgenda() {
    try {
        console.log("Locating autocristalsevilla@gmail.com user UID...");
        const usersSnap = await db.collection('users').where('email', '==', 'autocristalsevilla@gmail.com').get();
        if (usersSnap.empty) {
            console.error("User autocristalsevilla@gmail.com not found!");
            // Let's try searching by name or idNum just in case
            const allUsers = await db.collection('users').get();
            let found = null;
            allUsers.forEach(d => {
                const data = d.data();
                if(data.email && data.email.includes('autocristalsevilla')) found = d.id;
            });
            if (!found) {
                console.log("Could not find user. Exiting.");
                process.exit(1);
            }
            console.log("Found user via partial email match: " + found);
            return await cleanUID(found);
        }

        const uid = usersSnap.docs[0].id;
        console.log("Found exact user UID:", uid);
        await cleanUID(uid);

    } catch (e) {
        console.error("Error:", e);
    }
}

async function cleanUID(uid) {
    console.log(`Fetching destinations agenda for user ${uid}...`);
    const destSnap = await db.collection('users').doc(uid).collection('destinations').get();
    
    console.log(`Found ${destSnap.size} clients in agenda.`);
    
    // Group by sanitized ID
    const groups = {};

    destSnap.forEach(doc => {
        const d = doc.data();
        let name = String(d.name || "(Sin Nombre)").trim();
        // Strict normalization exactly like the app
        let cleanName = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ' ').trim().toLowerCase();
        let sanitizedId = cleanName.replace(/[^a-z0-9\-_]/gi, '_');

        if (!groups[sanitizedId]) {
            groups[sanitizedId] = [];
        }
        groups[sanitizedId].push({ id: doc.id, data: d });
    });

    let totalDeleted = 0;
    
    // Iterating over grouped documents
    for (const sanitizedId in groups) {
        const docs = groups[sanitizedId];
        if (docs.length > 1) {
            console.log(`Found DUPLICATES for [${sanitizedId}]: ${docs.length} copies.`);
            
            // Sort by number of addresses descending to keep the richest one as primary
            docs.sort((a, b) => {
                const aAddrs = Array.isArray(a.data.addresses) ? a.data.addresses.length : 0;
                const bAddrs = Array.isArray(b.data.addresses) ? b.data.addresses.length : 0;
                return bAddrs - aAddrs;
            });

            const primary = docs[0];
            const primaryAddrs = primary.data.addresses || [];
            let docsToDelete = [];
            
            // Merge unique addresses from the others to the primary
            for (let i = 1; i < docs.length; i++) {
                const duplicate = docs[i];
                const dupAddrs = duplicate.data.addresses || [];
                
                dupAddrs.forEach(newAddr => {
                    // Check if address signature exists
                    const sigNew = getAddressSignature(newAddr);
                    const exists = primaryAddrs.some(a => getAddressSignature(a) === sigNew);
                    if (!exists) {
                        primaryAddrs.push(newAddr);
                    }
                });
                docsToDelete.push(duplicate.id);
            }

            // Update Primary
            await db.collection('users').doc(uid).collection('destinations').doc(primary.id).update({
                addresses: primaryAddrs
            });
            console.log(` -> Merged addresses into primary doc: ${primary.id} (Total Addrs: ${primaryAddrs.length})`);

            // Delete Duplicates
            for (const delId of docsToDelete) {
                await db.collection('users').doc(uid).collection('destinations').doc(delId).delete();
                console.log(` -> Deleted duplicate doc: ${delId}`);
                totalDeleted++;
            }
        }
    }

    console.log(`\nCleanup complete! Deleted a total of ${totalDeleted} duplicate clients.`);
    process.exit(0);
}

function getAddressSignature(a) {
    if(!a) return "";
    const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, '').toLowerCase();
    return norm(a.address) + norm(a.street) + norm(a.number) + norm(a.localidad) + norm(a.cp);
}

dedupeAgenda();
