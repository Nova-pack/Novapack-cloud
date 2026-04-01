const puppeteer = require('puppeteer');

(async () => {
    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        let logs = [];
        page.on('console', msg => {
            logs.push(`[CONSOLE] ${msg.type().toUpperCase()} : ${msg.text()}`);
        });

        page.on('pageerror', error => {
            logs.push(`[PAGE_ERROR] ${error.message}\n${error.stack}`);
        });

        // Set up mock auth before loading
        await page.evaluateOnNewDocument(() => {
            window.mockAuthTriggered = false;
        });

        await page.goto('http://localhost:5000/admin.html', { waitUntil: 'load' });

        // Let's inject a mock firebase object directly after load if it's there
        // Actually, firebase loads from CDN, so we just wait a bit and override
        await page.waitForTimeout(2000);

        console.log("Logs during load:");
        console.log(logs.join('\n'));

        await browser.close();
    } catch (e) {
        console.error("Puppeteer Script Error:", e);
    }
})();
