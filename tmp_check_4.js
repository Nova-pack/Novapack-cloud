
            function switchBillingTab(tabId) {
                // Hide all tab content
                document.getElementById('billing-tab-pending').style.display = 'none';
                document.getElementById('billing-tab-debidos').style.display = 'none';
                document.getElementById('billing-tab-issued').style.display = 'none';
                document.getElementById('billing-tab-credit').style.display = 'none';
                document.getElementById('billing-tab-fiscal').style.display = 'none';
                
                // Reset all tab buttons to transparent
                ['pending','debidos','issued','credit','fiscal'].forEach(t => {
                    const btn = document.getElementById('tab-billing-' + t);
                    if(btn) btn.style.background = 'transparent';
                });

                // Activate selected tab
                document.getElementById('billing-tab-' + tabId).style.display = 'block';
                const activeBtn = document.getElementById('tab-billing-' + tabId);
                if(activeBtn) activeBtn.style.background = 'rgba(255,255,255,0.2)';

                // Data triggers
                if(tabId === 'credit' && typeof initCreditNotesListView === 'function') initCreditNotesListView();
                if(tabId === 'debidos' && typeof loadDebidosManager === 'function') loadDebidosManager();
                if(tabId === 'issued' && typeof loadInvoices === 'function') {
                    document.getElementById('invoice-table-body').innerHTML = '<tr><td colspan="9" style="text-align:center;">Cargando...</td></tr>';
                    setTimeout(() => loadInvoices('first'), 100);
                }
            }
        