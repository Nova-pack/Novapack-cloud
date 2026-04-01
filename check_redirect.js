const puppeteer = require('puppeteer');

(async () => {
    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        
        await page.goto('http://localhost:5000/admin.html', { waitUntil: 'networkidle0' });
        
        console.log("Final URL:", page.url());
        
        await browser.close();
    } catch (e) {
        console.error("Test failed:", e);
    }
})();
