const puppeteer = require('puppeteer');

(async () => {
    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        
        page.on('console', msg => console.log('CONSOLE:', msg.text()));
        page.on('pageerror', error => console.error('PAGE ERROR:', error.message));
        
        await page.goto('http://localhost:5000/admin.html', { waitUntil: 'networkidle0' });

        await new Promise(r => setTimeout(r, 2000));
        
        console.log("\n--- Testing 'Albaranes Manuales' Tab ---");
        try {
            await page.evaluate(() => window.showView('admin-tickets'));
            console.log("Called showView('admin-tickets') successfully.");
        } catch (e) {
            console.error("Error in showView:", e.message);
        }

        await new Promise(r => setTimeout(r, 2000));

        console.log("\n--- Testing 'Sedes' Button ---");
        try {
            await page.evaluate(() => window.openManageCompaniesModal('test'));
            console.log("Called openManageCompaniesModal() successfully.");
        } catch (e) {
            console.error("Error in openManageCompaniesModal:", e.message);
        }

        await new Promise(r => setTimeout(r, 2000));

        console.log("\n--- Testing 'Modificar Cliente' Button ---");
        try {
            await page.evaluate(() => window.openEditUserModal('test'));
            console.log("Called openEditUserModal() successfully.");
        } catch (e) {
            console.error("Error in openEditUserModal:", e.message);
        }

        await new Promise(r => setTimeout(r, 1000));
        await browser.close();
    } catch (e) {
        console.error("Test failed:", e);
    }
})();
