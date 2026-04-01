const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  await page.goto('https://novapack-68f05.web.app/test-perms.html', { waitUntil: 'networkidle0' });
  
  try {
      await page.waitForFunction(() => document.getElementById('status').innerText !== 'Testing...', { timeout: 10000 });
      const statusHtml = await page.evaluate(() => document.getElementById('status').innerText);
      console.log("STATUS RESULT:", statusHtml);
  } catch(e) {
      console.log("Timeout waiting for firestore.");
  }
  
  await browser.close();
})();
