const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require('fs');

const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", (error) => {
    console.error("JSDOM SCRIPT ERROR:", error.message, error.stack);
});
virtualConsole.on("error", (msg) => {
    if (msg.toString().includes("TypeError")) console.error("CONSOLE ERROR:", msg);
});

try {
    const html = fs.readFileSync('public/admin.html', 'utf8');
    const dom = new JSDOM(html, {
        runScripts: "dangerously",
        virtualConsole,
        beforeParse(window) {
            window.firebase = {
                initializeApp: () => ({}),
                auth: () => ({
                    onAuthStateChanged: (cb) => { 
                        // Simulate logged in user to avoid redirect
                        setTimeout(() => cb({ uid: 'test-admin' }), 10);
                        return () => {};
                    },
                    signOut: () => Promise.resolve()
                }),
                firestore: () => ({
                    collection: () => ({
                        get: () => Promise.resolve({ docs: [], size: 0, forEach: function(cb) { this.docs.forEach(cb) } }),
                        doc: () => ({
                            set: () => Promise.resolve(),
                            get: () => Promise.resolve({ exists: true, data: () => ({ name: 'Test' }) }),
                            collection: () => ({ get: () => Promise.resolve({ docs: [], empty: true, forEach: function(cb) {} }) })
                        })
                    }),
                    collectionGroup: () => ({
                        get: () => Promise.resolve({ docs: [], forEach: function(cb) { this.docs.forEach(cb) } })
                    })
                })
            };
            window.firebaseConfig = {};
            window.auth = window.firebase.auth();
            window.db = window.firebase.firestore();
        }
    });

    setTimeout(() => {
        const window = dom.window;
        let errors = 0;
        console.log("Testing functions...");
        try {
            window.adminTicketUID = "test";
            window.openEditUserModal("test");
            console.log("✅ openEditUserModal passed!");
        } catch(e) { console.error("❌ openEditUserModal failed:", e.message); errors++; }

        try {
            window.adminTicketUID = "test";
            window.openManageCompaniesModal("test");
            console.log("✅ openManageCompaniesModal passed!");
        } catch(e) { console.error("❌ openManageCompaniesModal failed:", e.message); errors++; }

        try {
            window.showView("admin-tickets");
            console.log("✅ showView('admin-tickets') passed!");
        } catch(e) { console.error("❌ showView('admin-tickets') failed:", e.message); errors++; }

        process.exit(errors > 0 ? 1 : 0);
    }, 1500);

} catch (e) {
    console.log("Fatal parse error:", e.message);
    process.exit(1);
}
