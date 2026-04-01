const puppeteer = require('puppeteer');
(async () => {
    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        // Log all console messages
        page.on('console', msg => {
            console.log(`[CONSOLE] ${msg.type().toUpperCase()} : ${msg.text()}`);
        });

        // Log page errors (unhandled exceptions in the page)
        page.on('pageerror', error => {
            console.log(`[PAGE_ERROR] ${error.message}\n${error.stack}`);
        });

        await page.goto('http://localhost:5000/admin.html', { waitUntil: 'networkidle0' });

        console.log("Page loaded. Evaluating body text...");
        const bodyContent = await page.evaluate(() => document.body.innerText.substring(0, 100));
        console.log("Body preview:", bodyContent.replace(/\n/g, ' '));

        await browser.close();
    } catch (e) {
        console.error("Puppeteer Script Error:", e);
    }
})();
