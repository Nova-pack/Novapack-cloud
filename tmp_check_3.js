
            // Click-based dropdown toggle (avoids overflow:hidden clipping)
            document.addEventListener('click', function(e) {
                // Close all open dropdowns first
                document.querySelectorAll('.adv-dropdown-menu.show').forEach(m => {
                    if (!m.contains(e.target) && !m.previousElementSibling?.contains(e.target)) {
                        m.classList.remove('show');
                    }
                });
                // Toggle clicked dropdown
                const btn = e.target.closest('.adv-dropdown-btn');
                if (btn) {
                    const menu = btn.nextElementSibling;
                    if (menu && menu.classList.contains('adv-dropdown-menu')) {
                        const wasOpen = menu.classList.contains('show');
                        document.querySelectorAll('.adv-dropdown-menu.show').forEach(m => m.classList.remove('show'));
                        if (!wasOpen) {
                            const rect = btn.getBoundingClientRect();
                            menu.style.top = rect.bottom + 'px';
                            menu.style.left = rect.left + 'px';
                            menu.classList.add('show');
                        }
                    }
                }
            });
            