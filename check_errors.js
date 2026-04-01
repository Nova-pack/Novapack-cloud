const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    page.on('console', msg => {
        console.log(`[PAGE ${msg.type().toUpperCase()}] ${msg.text()}`);
    });

    page.on('pageerror', error => {
        console.log(`[PAGE EXCEPTION] ${error.message}`);
    });

    try {
        await page.evaluateOnNewDocument(() => {
            // Mock window.location to prevent redirects
            Object.defineProperty(window, 'location', {
                value: { href: 'dont-redirect', assign: () => {}, replace: () => {} },
                writable: false
            });
        });
        await page.goto('file://c:/NOVAPACK CLOUD/public/admin.html', { waitUntil: 'domcontentloaded' });
        await new Promise(r => setTimeout(r, 2000));
        
        const domInfo = await page.evaluate(() => {
            try {
                const u = document.getElementById('view-users');
                const t = document.getElementById('view-admin-tickets');
                const r = document.getElementById('view-reports');
                return {
                    usersHasTickets: u && t ? u.contains(t) : false,
                    usersHasReports: u && r ? u.contains(r) : false,
                    usersChildrenCount: u ? u.children.length : 0
                };
            } catch(e) {
                return e.message;
            }
        });
        require('fs').writeFileSync('c:/NOVAPACK CLOUD/dom_info.json', JSON.stringify(domInfo, null, 2));
        await new Promise(r => setTimeout(r, 1000));
        await page.screenshot({ path: 'c:/NOVAPACK CLOUD/screenshot.png', fullPage: true });
        console.log("Screenshot saved.");
    } catch (e) {
        console.error("Puppeteer Navigation Error:", e);
    } finally {
        await browser.close();
    }
})();
