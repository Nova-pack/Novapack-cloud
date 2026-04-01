const puppeteer = require('puppeteer');

(async () => {
    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        page.on('console', msg => {
            console.log(`[CONSOLE] ${msg.type().toUpperCase()} : ${msg.text()}`);
        });

        page.on('pageerror', error => {
            console.log(`[PAGE_ERROR] ${error.message}\n${error.stack}`);
        });

        await page.goto('http://localhost:5000/admin.html', { waitUntil: 'networkidle0' });

        console.log("Waiting for user table...");
        await page.waitForTimeout(2000);

        console.log("Clicking + NUEVO CLIENTE button...");
        await page.evaluate(() => {
            const btn = document.getElementById('btn-add-user');
            if (btn) btn.click();
            else console.log("btn-add-user NOT FOUND in DOM");
        });

        await page.waitForTimeout(1000);

        console.log("Clicking Albaranes Manuales button (guessing id)...");
        await page.evaluate(() => {
            const spans = Array.from(document.querySelectorAll('span'));
            const albBtn = spans.find(el => el.textContent.includes('Albaranes Manuales'));
            if (albBtn) albBtn.closest('.menu-item').click();
            else console.log("Albaranes Manuales NOT FOUND in DOM");
        });

        await page.waitForTimeout(1000);

        await browser.close();
    } catch (e) {
        console.error("Puppeteer Script Error:", e);
    }
})();
