const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    
    try {
        await page.goto('file://c:/NOVAPACK CLOUD/public/app.html', { waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 2000));
        
        const html = await page.evaluate(() => {
            const sel = document.getElementById('ticket-province');
            return sel ? sel.innerHTML : "NOT FOUND";
        });
        
        console.log("TICKET PROVINCE HTML:\n" + html);

    } catch (e) {
        console.error("Puppeteer Error:", e);
    } finally {
        await browser.close();
    }
})();
