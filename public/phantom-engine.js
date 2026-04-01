// phantom-engine.js
// Inteligencia de Envíos y Directorio Global

window.PhantomDirectory = [];
window.isPhantomLoaded = false;

// Carga asíncrona y silenciosa del directorio global
fetch('/gesco_clients.json')
    .then(r => {
        if (r.ok) return r.json();
        throw new Error("Directorio Global no disponible");
    })
    .then(data => {
        if (Array.isArray(data)) {
            window.PhantomDirectory = data;
            window.isPhantomLoaded = true;
            console.log("[NUBE] Directorio Global sincronizado (" + data.length + " registros de coincidencia inteligente)");
        }
    })
    .catch(err => {
        console.warn("[NUBE] Inicialización de autocompletado global en modo local únicamente.");
    });

/**
 * Busca coincidencias en el Directorio Global por Nombre, NIF o Teléfono.
 * Devuelve un máximo de resultados para mantener la interfaz fluida.
 */
window.searchPhantomDirectory = function(query) {
    if (!window.isPhantomLoaded || !query || query.length < 3) return [];
    
    const q = query.toLowerCase().trim();
    const results = [];
    
    for (let c of window.PhantomDirectory) {
        if ((c.name && c.name.toLowerCase().includes(q)) || 
            (c.nif && c.nif.toLowerCase().includes(q)) || 
            (c.senderPhone && c.senderPhone.toLowerCase().includes(q))) {
            results.push(c);
            if (results.length >= 8) break; // Limite para no saturar la vista
        }
    }
    return results;
};
