
        window.addEventListener('error', function(e) {
            console.error("FATAL JS CRASH:\n" + e.message + "\nLinea: " + e.lineno);
        });
        window.addEventListener('unhandledrejection', function(e) {
            console.error("ASYNC CRASH:\n" + (e.reason ? e.reason.message : "Desconocida"));
        });
    