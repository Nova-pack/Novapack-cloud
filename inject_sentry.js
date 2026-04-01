const fs = require('fs');

// Sentry integration script that will be injected into all HTML files
// Uses the Sentry CDN bundle (no npm required)
const sentryScript = `
    <!-- ===== SENTRY ERROR MONITORING ===== -->
    <script src="https://browser.sentry-cdn.com/8.49.0/bundle.min.js" crossorigin="anonymous"></script>
    <script>
        window.NOVAPACK_SENTRY_READY = false;
        if (typeof Sentry !== 'undefined') {
            Sentry.init({
                dsn: window.NOVAPACK_SENTRY_DSN || "",
                environment: location.hostname === 'localhost' ? 'development' : 'production',
                release: 'novapack-cloud@2.0',
                // Only send errors in production
                enabled: location.hostname !== 'localhost',
                // Sample 100% of errors (free tier allows 5000/month)
                sampleRate: 1.0,
                // Ignore common non-critical errors
                ignoreErrors: [
                    'ResizeObserver loop',
                    'Loading chunk',
                    'Network request failed',
                    'AbortError',
                    'cancelled',
                ],
                beforeSend(event) {
                    // Tag with the current page for easy filtering
                    const page = location.pathname.includes('admin') ? 'admin' :
                                 location.pathname.includes('app') ? 'client' :
                                 location.pathname.includes('reparto') ? 'driver' : 'unknown';
                    event.tags = event.tags || {};
                    event.tags.novapack_module = page;
                    return event;
                }
            });
            window.NOVAPACK_SENTRY_READY = true;
            console.log("Sentry monitoring active (env: " + (location.hostname === 'localhost' ? 'dev' : 'prod') + ")");
        }
    </script>
`;

// Also create a config file where the user can put their DSN
const configContent = `// ============================================
// NOVAPACK SENTRY CONFIGURATION
// ============================================
// 1. Crea una cuenta gratuita en https://sentry.io
// 2. Crea un proyecto de tipo "JavaScript / Browser"
// 3. Copia tu DSN y pégalo aquí abajo
// 4. Despliega a Firebase Hosting
//
// El DSN tiene este formato:
// https://xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx@oXXXXXX.ingest.sentry.io/XXXXXXX
// ============================================

window.NOVAPACK_SENTRY_DSN = "";

// Para probar que funciona, descomenta esta línea y recarga:
// setTimeout(() => { throw new Error("TEST: Sentry funciona correctamente en Novapack"); }, 3000);
`;

fs.writeFileSync('public/sentry-config.js', configContent);
console.log("Created sentry-config.js");

// Now inject into each HTML file
const files = ['public/admin.html', 'public/app.html', 'public/reparto.html'];

files.forEach(file => {
    if (!fs.existsSync(file)) {
        console.log(`File ${file} not found, skipping`);
        return;
    }
    
    let html = fs.readFileSync(file, 'utf8');
    
    if (html.includes('sentry-cdn.com')) {
        console.log(`${file}: Sentry already integrated, skipping`);
        return;
    }
    
    // Add sentry-config.js script tag first, then the Sentry SDK
    const configScript = `    <script src="sentry-config.js?v=1"></script>\n`;
    
    // Find the best injection point: after firebase-config.js or before </head>
    const firebaseConfigIdx = html.indexOf('firebase-config.js');
    if (firebaseConfigIdx > -1) {
        // Find end of that script tag
        const endTag = html.indexOf('</script>', firebaseConfigIdx);
        if (endTag > -1) {
            const insertAt = endTag + '</script>'.length;
            html = html.substring(0, insertAt) + '\n' + configScript + sentryScript + html.substring(insertAt);
        }
    } else {
        // Fallback: before </head>
        const headEnd = html.indexOf('</head>');
        html = html.substring(0, headEnd) + configScript + sentryScript + html.substring(headEnd);
    }
    
    fs.writeFileSync(file, html);
    console.log(`${file}: Sentry integrated ✅`);
});
