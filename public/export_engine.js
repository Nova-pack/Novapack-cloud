// Export Engine - Novapack ERP
// Provides CSV and Excel (XLSX) export for any data table

(function() {
    'use strict';

    // ==================== CSV EXPORT ====================
    window.exportToCSV = function(data, filename) {
        if (!data || data.length === 0) {
            alert('No hay datos para exportar.');
            return;
        }

        const headers = Object.keys(data[0]);
        const csvRows = [];

        // Header row
        csvRows.push(headers.map(h => `"${h}"`).join(';'));

        // Data rows
        data.forEach(row => {
            const values = headers.map(h => {
                let val = row[h];
                if (val === null || val === undefined) val = '';
                // Handle Firestore Timestamps
                if (val && typeof val === 'object' && typeof val.toDate === 'function') {
                    val = val.toDate().toLocaleDateString('es-ES');
                }
                // Escape quotes
                val = String(val).replace(/"/g, '""');
                return `"${val}"`;
            });
            csvRows.push(values.join(';'));
        });

        const csvContent = '\uFEFF' + csvRows.join('\r\n'); // BOM for Excel UTF-8
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        downloadBlob(blob, (filename || 'export') + '.csv');
    };

    // ==================== EXCEL EXPORT ====================
    window.exportToExcel = function(data, filename, sheetName) {
        if (!data || data.length === 0) {
            alert('No hay datos para exportar.');
            return;
        }

        // Use SheetJS if available, otherwise load it
        if (typeof XLSX === 'undefined') {
            loadSheetJS(() => doExcelExport(data, filename, sheetName));
        } else {
            doExcelExport(data, filename, sheetName);
        }
    };

    function doExcelExport(data, filename, sheetName) {
        // Convert Firestore timestamps
        const cleanData = data.map(row => {
            const clean = {};
            for (const key in row) {
                let val = row[key];
                if (val && typeof val === 'object' && typeof val.toDate === 'function') {
                    val = val.toDate().toLocaleDateString('es-ES');
                }
                if (val === null || val === undefined) val = '';
                clean[key] = val;
            }
            return clean;
        });

        const ws = XLSX.utils.json_to_sheet(cleanData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Datos');

        // Auto-size columns
        const headers = Object.keys(cleanData[0]);
        ws['!cols'] = headers.map(h => ({
            wch: Math.max(h.length, ...cleanData.slice(0, 50).map(r => String(r[h] || '').length)) + 2
        }));

        XLSX.writeFile(wb, (filename || 'export') + '.xlsx');
    }

    function loadSheetJS(callback) {
        if (typeof XLSX !== 'undefined') { callback(); return; }
        const script = document.createElement('script');
        script.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
        script.onload = callback;
        script.onerror = () => alert('Error cargando librería de exportación. Comprueba tu conexión.');
        document.head.appendChild(script);
    }

    // ==================== HELPER ====================
    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ==================== EXPORT MENU BUILDER ====================
    // Call this to add a floating export button to any container
    window.addExportButton = function(containerId, getDataFn, filenameBase) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // Avoid duplicating
        if (container.querySelector('.export-menu-btn')) return;

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'position:relative; display:inline-block;';
        wrapper.innerHTML = `
            <button class="export-menu-btn" style="background:#333; border:1px solid #555; color:#4CAF50; padding:6px 14px; font-size:0.8rem; cursor:pointer; border-radius:4px; display:flex; align-items:center; gap:5px;">
                <span class="material-symbols-outlined" style="font-size:16px;">download</span> Exportar ▾
            </button>
            <div class="export-dropdown" style="display:none; position:absolute; top:100%; right:0; background:#1e1e1e; border:1px solid #3c3c3c; border-radius:6px; min-width:180px; z-index:100; box-shadow:0 4px 15px rgba(0,0,0,0.5); margin-top:2px;">
                <button class="export-opt-csv" style="width:100%; text-align:left; background:none; border:none; color:#d4d4d4; padding:10px 15px; cursor:pointer; font-size:0.85rem; display:flex; align-items:center; gap:8px;">
                    <span style="color:#4CAF50;">📄</span> Descargar CSV
                </button>
                <div style="height:1px; background:#3c3c3c;"></div>
                <button class="export-opt-xlsx" style="width:100%; text-align:left; background:none; border:none; color:#d4d4d4; padding:10px 15px; cursor:pointer; font-size:0.85rem; display:flex; align-items:center; gap:8px;">
                    <span style="color:#2196F3;">📊</span> Descargar Excel (.xlsx)
                </button>
            </div>
        `;

        const btn = wrapper.querySelector('.export-menu-btn');
        const dropdown = wrapper.querySelector('.export-dropdown');

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        });

        wrapper.querySelector('.export-opt-csv').addEventListener('click', () => {
            dropdown.style.display = 'none';
            const data = getDataFn();
            exportToCSV(data, filenameBase || 'export');
        });

        wrapper.querySelector('.export-opt-xlsx').addEventListener('click', () => {
            dropdown.style.display = 'none';
            const data = getDataFn();
            exportToExcel(data, filenameBase || 'export');
        });

        // Close dropdown on outside click
        document.addEventListener('click', () => { dropdown.style.display = 'none'; });

        container.appendChild(wrapper);
    };

    // Hover effects for dropdown items
    document.addEventListener('mouseover', (e) => {
        if (e.target.closest('.export-opt-csv, .export-opt-xlsx')) {
            e.target.closest('button').style.background = 'rgba(255,255,255,0.05)';
        }
    });
    document.addEventListener('mouseout', (e) => {
        if (e.target.closest('.export-opt-csv, .export-opt-xlsx')) {
            e.target.closest('button').style.background = 'none';
        }
    });

    console.log('[Export Engine] ✅ Motor de exportación cargado');
})();
