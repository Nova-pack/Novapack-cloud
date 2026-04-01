const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    let errors = [];
    page.on('console', msg => {
        if (msg.type() === 'error' || msg.type() === 'warning') {
            errors.push(msg.text());
        }
    });
    page.on('pageerror', err => {
        errors.push(err.toString());
    });

    try {
        await page.goto('https://novapack-68f05.web.app/app.html', { waitUntil: 'networkidle2', timeout: 30000 });
        
        console.log("Waiting for auth and queries to run...");
        await new Promise(r => setTimeout(r, 5000));
        
        console.log("--- CAPTURED ERRORS & WARNINGS ---");
        errors.forEach(e => console.log(e));
        console.log("----------------------------------");
        
    } catch (e) {
        console.log("Error running puppeteer:", e);
    } finally {
        await browser.close();
    }
})();
