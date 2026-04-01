const puppeteer = require('puppeteer');
(async () => {
    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        page.on('console', msg => console.log('CONSOLE:', msg.text()));
        page.on('pageerror', error => console.error('PAGE ERROR:', error.message));
        page.on('response', response => {
            if (!response.ok()) {
                console.log(`Failed request: ${response.url()} with status ${response.status()}`);
            }
        });
        await page.goto('http://localhost:5000/admin.html', { waitUntil: 'networkidle2' });
        await browser.close();
    } catch (e) {
        console.error("Puppeteer crashed:", e);
    }
})();
