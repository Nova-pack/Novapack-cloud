const puppeteer = require('puppeteer');

(async () => {
    try {
        console.log("Launching browser to inspect destinations...");
        const browser = await puppeteer.launch({ headless: "new" });
        const page = await browser.newPage();

        page.on('console', msg => console.log('BROWSER:', msg.text()));

        await page.goto('https://novapack-68f05.web.app/admin.html');

        console.log("Waiting for Firebase / window.db to load...");
        await page.waitForFunction(() => window.db !== undefined);

        await page.evaluate(async () => {
            console.log("Searching for Client 103...");
            const usersRef = window.db.collection('users');
            const snap = await usersRef.get();
            let c103Uid = null;
            snap.forEach(doc => {
                if(String(doc.data().idNum) === '103') c103Uid = doc.id;
            });

            if(!c103Uid) {
                console.log("Client 103 not found.");
                window.done = true; return;
            }
            console.log("Client 103 UID:", c103Uid);

            const destRef = window.db.collection('users').doc(c103Uid).collection('destinations');
            const destSnap = await destRef.limit(10).get();
            console.log(`Found ${destSnap.size} destinations.`);
            
            destSnap.forEach(doc => {
                const d = doc.data();
                console.log(`\nDoc ID: ${doc.id}`);
                console.log(`Name: ${d.name || d.receiver}`);
                console.log(`Full Address field: "${d.address}"`);
                console.log(`Street: "${d.street}"`);
                console.log(`CP: "${d.cp}"`);
                console.log(`Localidad: "${d.localidad}"`);
                console.log(`Province: "${d.province}"`);
            });
            window.done = true;
        });

        await page.waitForFunction(() => window.done === true, { timeout: 30000 });
        await browser.close();
    } catch(e) { console.error(e); process.exit(1); }
})();
