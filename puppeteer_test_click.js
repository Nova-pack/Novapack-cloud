const puppeteer = require('puppeteer');
(async () => {
    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        page.on('console', msg => console.log('CONSOLE:', msg.text()));
        page.on('pageerror', error => console.error('PAGE ERROR:', error.message));

        await page.goto('http://localhost:5000/admin.html', { waitUntil: 'networkidle0' });

        // Wait for userTableBody to have buttons
        await page.waitForSelector('.user-row button', { timeout: 5000 }).catch(() => console.log("No users loaded"));

        console.log("Clicking 'Editar Cliente' button...");
        await page.evaluate(() => {
            const btns = document.querySelectorAll('.user-row button');
            if (btns.length > 0) btns[0].click(); // Click Edit button
        });

        await new Promise(r => setTimeout(r, 1000));
        await browser.close();
    } catch (e) {
        console.error("Puppeteer test failed:", e);
    }
})();
