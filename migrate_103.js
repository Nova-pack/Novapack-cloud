const puppeteer = require('puppeteer');

(async () => {
    try {
        console.log("Launching browser...");
        const browser = await puppeteer.launch({ headless: "new" });
        const page = await browser.newPage();

        page.on('console', msg => console.log('BROWSER:', msg.text()));

        // Directly navigate to production deployment
        await page.goto('https://novapack-68f05.web.app/admin.html');

        console.log("Waiting for Firebase to load...");
        await page.waitForFunction(() => window.db !== undefined);

        console.log("Executing migration script...");
        await page.evaluate(async () => {
            console.log("Starting migration inside browser context...");
            
            const usersRef = window.db.collection('users');
            const snap = await usersRef.get();
            
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

            if (!client103) {
                console.log("ERROR: Client 103 not found!");
                return;
            }
            if (!alphaClient) {
                console.log("ERROR: No synthetic alpha client found to merge!");
                return;
            }

            console.log("Found Client 103 ID:", client103.id);
            console.log("Found Alpha Client ID:", alphaClient.id);

            // 1. Migrate tickets from alphaClient.id to client103.id
            const ticketsRef = window.db.collection('tickets');
            const ticketsSnap = await ticketsRef.where('storageUid', '==', alphaClient.id).get();
            
            console.log(`Found ${ticketsSnap.size} tickets to migrate.`);
            
            const batch = window.db.batch();
            let count = 0;
            
            ticketsSnap.forEach(tDoc => {
                const updatedData = {
                    storageUid: client103.id,
                    clientIdNum: '103'
                };
                batch.update(tDoc.ref, updatedData);
                count++;
            });

            // 2. Migrate destinations (Agenda)
            const destSnap = await window.db.collection('destinations').where('storageUid', '==', alphaClient.id).get();
            console.log(`Found ${destSnap.size} destinations to migrate.`);
            destSnap.forEach(dDoc => {
                batch.update(dDoc.ref, { storageUid: client103.id });
                count++;
            });

            // 3. Migrate companies
            const compSnap = await usersRef.doc(alphaClient.id).collection('companies').get();
            console.log(`Found ${compSnap.size} companies to migrate.`);
            // Cannot batch move across subcollections easily without looping, let's just do it sequentially inside async
            
            if (count > 0) {
                await batch.commit();
                console.log("Batch commit successful for Tickets and Destinations.");
            }

            // Move companies
            for (const cDoc of compSnap.docs) {
                await usersRef.doc(client103.id).collection('companies').doc(cDoc.id).set(cDoc.data());
                await cDoc.ref.delete();
            }

            // 4. Update Client 103 to contain authUid linking to Alpha Client's Auth
            // This guarantees the user's future logins will securely map to Client 103 instead!
            await usersRef.doc(client103.id).update({
                authUid: alphaClient.id,
                email: alphaClient.email || client103.email
            });
            console.log("Linked AuthUID to Client 103 successfully.");

            // 5. Delete synthetic profile
            await usersRef.doc(alphaClient.id).delete();
            console.log("Deleted orphan synthetic profile successfully.");

            console.log("MIGRATION COMPLETE!");
            window.migrationDone = true;
        });

        await page.waitForFunction(() => window.migrationDone === true, { timeout: 30000 });
        console.log("Script finished successfully. Exiting...");
        await browser.close();

    } catch (e) {
        console.error("Puppeteer Error:", e);
        process.exit(1);
    }
})();
