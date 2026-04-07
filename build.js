#!/usr/bin/env node
/**
 * NOVAPACK CLOUD — Build Script
 * Obfuscates and minifies JS files in public/ before deploy.
 * Usage: node build.js
 */

const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const PUBLIC_DIR = path.join(__dirname, 'public');

// Files/dirs to skip (libraries, already minified, etc.)
const SKIP = [
    'firebase-compat.js',      // Firebase SDK
    'firebase-auth-compat.js',
    'firebase-firestore-compat.js',
    'firebase-storage-compat.js',
    'node_modules'
];

const TERSER_OPTIONS = {
    compress: {
        drop_console: false,   // Keep console.log for debugging
        passes: 2,
        dead_code: true,
        conditionals: true,
        evaluate: true
    },
    mangle: {
        reserved: [
            // Firebase globals
            'firebase', 'db', 'auth', 'storage',
            // Window-exposed functions (used in onclick handlers in HTML)
            'currentUser', 'currentCompanyId', 'companies',
            'userMap', 'escapeHtml', 'showLoading', 'hideLoading',
            'PhantomDirectory', 'searchPhantomDirectory',
            'billingCompaniesMap'
        ]
    },
    output: {
        comments: false,
        beautify: false
    }
};

async function processFile(filePath) {
    const relPath = path.relative(PUBLIC_DIR, filePath);

    // Skip non-JS
    if (!filePath.endsWith('.js')) return;

    // Skip excluded files
    for (const skip of SKIP) {
        if (relPath.includes(skip)) return;
    }

    try {
        const code = fs.readFileSync(filePath, 'utf8');

        // Skip tiny files or already minified (single long line)
        if (code.length < 100) return;

        const result = await minify(code, TERSER_OPTIONS);

        if (result.code) {
            const banner = '/* (c) NOVAPACK Cloud - All Rights Reserved */\n';
            fs.writeFileSync(filePath, banner + result.code, 'utf8');
            const savings = Math.round((1 - result.code.length / code.length) * 100);
            console.log(`  ✓ ${relPath} (${savings}% reducido)`);
        }
    } catch (err) {
        console.error(`  ✗ ${relPath}: ${err.message}`);
    }
}

function walkDir(dir) {
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!SKIP.includes(entry.name)) {
                files.push(...walkDir(fullPath));
            }
        } else if (entry.name.endsWith('.js')) {
            files.push(fullPath);
        }
    }
    return files;
}

async function main() {
    console.log('NOVAPACK Build — Ofuscando código JS...\n');

    const jsFiles = walkDir(PUBLIC_DIR);
    console.log(`Encontrados ${jsFiles.length} archivos JS\n`);

    for (const file of jsFiles) {
        await processFile(file);
    }

    console.log('\n✅ Build completado');
}

main().catch(err => {
    console.error('Build failed:', err);
    process.exit(1);
});
