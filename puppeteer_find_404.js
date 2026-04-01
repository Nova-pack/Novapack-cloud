const puppeteer = require('puppeteer');
(async () => {
    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        
        page.on('response', response => {
            if (!response.ok()) {
                console.log('HTTP Error:', response.status(), response.url());
            }
        });

        page.on('pageerror', error => console.error('PAGE ERROR:', error.message));
        page.on('console', msg => {
            if (msg.type() === 'error') console.log('BROWSER CONSOLE ERROR:', msg.text());
        });

        await page.goto('http://localhost:5000/admin.html', { waitUntil: 'networkidle0' });
        
        console.log("Page loaded. Testing buttons...");
        try {
            await page.evaluate(() => window.showView('admin-tickets'));
        } catch(e) { console.log('showView error:', e.message); }

        await browser.close();
    } catch (e) {
        console.error("Test failed:", e);
    }
})();
