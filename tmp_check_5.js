
            window.adminIdentity = null;
            function setAdminIdentity(name) {
                window.adminIdentity = name;
                document.getElementById('admin-identity-box').style.display = 'none';
                document.getElementById('admin-name-span').textContent = name;
                document.getElementById('admin-welcome-msg').style.display = 'block';
                console.log("Admin Identity Set:", name);
                sessionStorage.setItem('adminActiveIdentity', name);
            }
            
            // Check session identity
            window.addEventListener('load', () => {
                const savedIdentity = sessionStorage.getItem('adminActiveIdentity');
                if(savedIdentity) {
                    setAdminIdentity(savedIdentity);
                }
                
                // Set default view on load
                setTimeout(()=> {
                    if (typeof showView === 'function') showView('welcome');
                }, 100);
            });
        