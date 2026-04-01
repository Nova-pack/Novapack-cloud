const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    let logs = [];
    page.on('console', msg => {
        const text = msg.text();
        logs.push(text);
        if (msg.type() === 'error' || text.includes('Error') || text.includes('error')) {
            console.error("PAGE ERROR/WARNING: ", text);
        } else {
            console.log("LOG: ", text);
        }
    });

    try {
        console.log("Navigating to index.html...");
        await page.goto('https://novapack-68f05.web.app/index.html', { waitUntil: 'networkidle2' });
        
        await page.type('#email', 'alviasasevilla@gmail.com');
        await page.type('#password', 'alviasa2026'); 
        await page.click('.btn'); // INICIAR SESIÓN button
        
        console.log("Waiting for app.html to load and fetch tickets...");
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
        
        await new Promise(r => setTimeout(r, 6000)); 
        
        const tickets = await page.evaluate(() => {
            const rows = document.querySelectorAll('#tickets-list tr');
            return rows.length;
        });
        
        console.log(`FOUND ${tickets} TICKETS IN DOM.`);
        
    } catch (e) {
        console.log("Error running puppeteer:", e);
    } finally {
        await browser.close();
    }
})();
