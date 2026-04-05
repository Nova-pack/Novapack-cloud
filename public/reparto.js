// =============================================
// NOVAPACK REPARTO — App de Repartidor v4
// GPS Route + Drag & Drop + Notifications
// =============================================

(function() {
'use strict';

// --- GLOBALS ---
var currentDriverPhone = '';
var currentDriverName = '';
var currentRouteLabel = '';
var deliveries = [];
var manualOrder = null; // array of docIds if user has manually reordered
var currentFilter = 'pending';
var confirmationResult = null;
var qrScanner = null;
var leafletMap = null;
var mapMarkers = [];
var currentScanDoc = null;
var unsubscribe = null;
var modDocId = null;
var dragSrcIndex = null;
var knownDeliveryIds = new Set(); // To detect NEW deliveries
var confirmInProgress = false; // Guard: prevent snapshot re-render during delivery confirmation
var scannedPackages = {}; // { ticketId: Set([1, 2, 3]) } — tracks scanned bultos
var currentPkgTotal = 0; // total packages expected for current scan
var isFirstSnapshot = true; // Skip notifications on initial load
var notificationSound = null;
var _isMasterPinSession = false; // Flag to prevent onAuthStateChanged interference

// --- NOTIFICATION SYSTEM ---
function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
        Notification.requestPermission().then(function(perm) {
            if (perm === 'granted') {
                showToast('Notificaciones activadas.', 'success');
            }
        });
    }
}

function sendNotification(title, body, onTapCallback) {
    // 1. In-app toast (longer duration for visibility)
    showToast('📦 ' + body, 'success', 8000);

    // 2. Play alert sound EVERY TIME (fresh oscillator)
    try {
        var actx = new (window.AudioContext || window.webkitAudioContext)();
        // Double beep for urgency
        function beep(freq, startTime, duration) {
            var osc = actx.createOscillator();
            var gain = actx.createGain();
            osc.connect(gain);
            gain.connect(actx.destination);
            osc.frequency.value = freq;
            gain.gain.value = 0.4;
            osc.start(actx.currentTime + startTime);
            osc.stop(actx.currentTime + startTime + duration);
        }
        beep(880, 0, 0.15);
        beep(1100, 0.2, 0.15);
        beep(880, 0.4, 0.2);
        setTimeout(function() { actx.close(); }, 1000);
    } catch (e) { console.warn('Sound error:', e); }

    // 3. Vibrate (mobile)
    try {
        if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 300]);
    } catch (e) {}

    // 4. Browser notification (desktop / PWA / Android)
    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistration().then(function(reg) {
                    if (reg) {
                        reg.showNotification(title, {
                            body: body,
                            icon: 'icon_new.png',
                            badge: 'icon_new.png',
                            tag: 'reparto-' + Date.now(),
                            requireInteraction: true,
                            vibrate: [200, 100, 200, 100, 300]
                        });
                    } else {
                        // Fallback
                        new Notification(title, { body: body, icon: 'icon_new.png' });
                    }
                });
            } else {
                new Notification(title, { body: body, icon: 'icon_new.png' });
            }
        } catch (e) { console.warn('Notification error:', e); }
    }

    // 5. Persistent in-app banner (visible until dismissed)
    try {
        var existing = document.getElementById('new-delivery-banner');
        if (existing) existing.remove();
        var banner = document.createElement('div');
        banner.id = 'new-delivery-banner';
        banner.style.cssText = 'position:fixed; top:0; left:0; width:100%; z-index:9998; background:linear-gradient(135deg,#FF4D00,#FF6600); color:white; padding:14px 20px; font-weight:800; font-size:0.9rem; text-align:center; cursor:pointer; box-shadow:0 4px 20px rgba(255,77,0,0.5); animation:slideDown 0.3s ease;';
        banner.innerHTML = '\ud83d\udce6 <span style="text-decoration:underline;">' + title + '</span> \u2014 ' + body + ' <span style="opacity:0.7; font-size:0.75rem; margin-left:10px;">(toca para ver)</span>';
        banner.onclick = function() { banner.remove(); if (typeof onTapCallback === 'function') onTapCallback(); };
        document.body.appendChild(banner);
        // Auto-remove after 20s
        setTimeout(function() { if (banner.parentNode) banner.remove(); }, 20000);
    } catch (e) {}
}

// --- TOAST SYSTEM (with sound & vibration) ---
var _toastAudioCtx = null;
function _toastBeep(freq, ms) {
    try {
        if (!_toastAudioCtx) _toastAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        var osc = _toastAudioCtx.createOscillator();
        var gain = _toastAudioCtx.createGain();
        osc.connect(gain); gain.connect(_toastAudioCtx.destination);
        osc.frequency.value = freq;
        gain.gain.value = 0.3;
        osc.start(); osc.stop(_toastAudioCtx.currentTime + (ms / 1000));
    } catch(e) {}
}
function showToast(message, type, duration) {
    type = type || 'info';
    duration = duration || 3000;
    var container = document.getElementById('toast-container');
    if (!container) return;
    var t = document.createElement('div');
    t.className = 'toast ' + type;
    var icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    t.innerHTML = '<span>' + (icons[type] || '') + '</span><span>' + message + '</span>';
    container.appendChild(t);

    // Sound + vibration by type
    if (type === 'success') { _toastBeep(880, 150); }
    else if (type === 'error') { _toastBeep(300, 300); }
    else if (type === 'warning') { _toastBeep(600, 200); }
    if (type === 'error' || type === 'warning') {
        try { navigator.vibrate && navigator.vibrate(type === 'error' ? [200, 100, 200] : [150]); } catch(e) {}
    }

    setTimeout(function() {
        t.classList.add('hide');
        setTimeout(function() { t.remove(); }, 300);
    }, duration);
}

// --- IMAGE COMPRESSION (resize + compress before upload) ---
function compressImage(file, maxWidth, quality) {
    maxWidth = maxWidth || 1200;
    quality = quality || 0.65;
    return new Promise(function(resolve) {
        // If file is small enough (<500KB), skip compression
        if (file.size < 500000) { resolve(file); return; }
        var reader = new FileReader();
        reader.onload = function(e) {
            var img = new Image();
            img.onload = function() {
                var w = img.width, h = img.height;
                if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
                var canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                canvas.toBlob(function(blob) {
                    if (blob && blob.size < file.size) {
                        resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
                    } else {
                        resolve(file); // Original smaller, keep it
                    }
                }, 'image/jpeg', quality);
            };
            img.onerror = function() { resolve(file); };
            img.src = e.target.result;
        };
        reader.onerror = function() { resolve(file); };
        reader.readAsDataURL(file);
    });
}

// --- HELPERS ---
function showLoading() { document.getElementById('loading-overlay').classList.add('active'); }
function hideLoading() { document.getElementById('loading-overlay').classList.remove('active'); }
function normalizePhone(p) { return (p || '').toString().replace(/\D/g, '').replace(/^34/, ''); }

function getPackageCount(d) {
    if (d.packagesList && d.packagesList.length > 0) {
        return d.packagesList.reduce(function(sum, p) { return sum + (parseInt(p.qty) || 1); }, 0);
    }
    return d.packages || 1;
}

// --- HAVERSINE DISTANCE (km) ---
function haversine(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// --- GPS ROUTE SORT (Nearest Neighbor) ---
function sortByGPSProximity(items, startLat, startLon) {
    // Only sort items that have coordinates
    var withCoords = items.filter(function(d) { return d._lat && d._lon; });
    var withoutCoords = items.filter(function(d) { return !d._lat || !d._lon; });

    if (withCoords.length === 0) return items;

    var sorted = [];
    var remaining = withCoords.slice();
    var curLat = startLat;
    var curLon = startLon;

    while (remaining.length > 0) {
        var nearest = 0;
        var nearestDist = Infinity;
        for (var i = 0; i < remaining.length; i++) {
            var dist = haversine(curLat, curLon, remaining[i]._lat, remaining[i]._lon);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearest = i;
            }
        }
        var next = remaining.splice(nearest, 1)[0];
        sorted.push(next);
        curLat = next._lat;
        curLon = next._lon;
    }

    // Append items without coords at the end
    return sorted.concat(withoutCoords);
}

// --- GEOCODE ADDRESS (Nominatim, cached) ---
var geocodeCache = {};
async function geocodeAddress(d) {
    if (d._lat && d._lon) return; // already geocoded
    var addr = [d.address, d.localidad, d.cp, d.province, 'España'].filter(Boolean).join(', ');
    if (!addr || addr === 'España') return;

    if (geocodeCache[addr]) {
        d._lat = geocodeCache[addr].lat;
        d._lon = geocodeCache[addr].lon;
        return;
    }

    try {
        var res = await fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(addr) + '&limit=1');
        var data = await res.json();
        if (data.length > 0) {
            d._lat = parseFloat(data[0].lat);
            d._lon = parseFloat(data[0].lon);
            geocodeCache[addr] = { lat: d._lat, lon: d._lon };
        }
    } catch (e) { console.warn('Geocode error:', addr, e); }
}

// --- WAIT FOR FIREBASE ---
function waitForFirebase(cb) {
    if (typeof firebase !== 'undefined' && firebase.auth && firebase.firestore) {
        cb();
    } else {
        setTimeout(function() { waitForFirebase(cb); }, 100);
    }
}

// --- INIT ---
document.addEventListener('DOMContentLoaded', function() {
    waitForFirebase(initApp);
});

function initApp() {
    var storage = firebase.storage();

    // --- CONNECTION STATUS MONITOR ---
    function updateConnectionDot(online) {
        var dot = document.getElementById('connection-dot');
        if (!dot) return;
        dot.className = 'conn-dot ' + (online ? 'online' : 'offline');
        dot.title = online ? 'Conectado' : 'Sin conexión';
    }
    updateConnectionDot(navigator.onLine);
    window.addEventListener('online', function() {
        updateConnectionDot(true);
        showToast('Conexión restablecida.', 'success');
    });
    window.addEventListener('offline', function() {
        updateConnectionDot(false);
        showToast('Sin conexión a Internet.', 'warning', 5000);
    });

    // --- AUTH: PHONE SMS ---
    document.getElementById('btn-send-sms').addEventListener('click', async function() {
        var phoneRaw = document.getElementById('phone-input').value.trim();
        if (!phoneRaw || phoneRaw.length < 6) {
            document.getElementById('login-error').textContent = 'Introduce un número válido.';
            return;
        }
        var phone = '+34' + phoneRaw.replace(/\D/g, '').replace(/^34/, '');
        document.getElementById('login-error').textContent = '';
        showLoading();

        try {
            window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
                size: 'invisible',
                callback: function() {}
            });
            confirmationResult = await auth.signInWithPhoneNumber(phone, window.recaptchaVerifier);
            document.getElementById('login-step-phone').style.display = 'none';
            document.getElementById('login-step-code').style.display = 'block';
        } catch (e) {
            console.error('SMS error:', e);
            document.getElementById('login-error').textContent = 'Error enviando SMS: ' + e.message;
            if (window.recaptchaVerifier) { window.recaptchaVerifier.clear(); window.recaptchaVerifier = null; }
        } finally {
            hideLoading();
        }
    });

    document.getElementById('btn-verify-code').addEventListener('click', async function() {
        var code = document.getElementById('sms-code-input').value.trim();
        if (!code) return;
        showLoading();
        try {
            await confirmationResult.confirm(code);
        } catch (e) {
            document.getElementById('login-error').textContent = 'Código incorrecto.';
            hideLoading();
        }
    });

    document.getElementById('btn-back-phone').addEventListener('click', function() {
        document.getElementById('login-step-code').style.display = 'none';
        document.getElementById('login-step-phone').style.display = 'block';
        document.getElementById('login-error').textContent = '';
    });

    // --- MASTER PIN AUTH ---
    var _adminRoutes = [];

    document.getElementById('btn-master-pin').addEventListener('click', async function() {
        var pin = (document.getElementById('master-pin-input').value || '').trim();
        if (!pin) {
            document.getElementById('login-error').textContent = 'Introduce un PIN maestro.';
            return;
        }
        document.getElementById('login-error').textContent = '';
        showLoading();

        try {
            var configDoc = await db.collection('config').doc('phones').get();
            var configData = configDoc.exists ? configDoc.data() : {};
            var pin1 = configData.masterPin1 || '';
            var pin2 = configData.masterPin2 || '';

            if (pin !== pin1 && pin !== pin2) {
                document.getElementById('login-error').textContent = 'PIN maestro incorrecto.';
                hideLoading();
                return;
            }

            // PIN valid — load all routes
            var phonesSnap = await db.collection('config').doc('phones').collection('list').get();
            _adminRoutes = [];
            phonesSnap.forEach(function(doc) {
                var d = doc.data();
                _adminRoutes.push({
                    docId: doc.id,
                    label: d.label || 'Sin nombre',
                    number: d.number || '',
                    driverNames: [d.driverName, d.driverName2, d.driverName3, d.driverName4].filter(function(n) { return n && n.trim(); })
                });
            });

            if (_adminRoutes.length === 0) {
                document.getElementById('login-error').textContent = 'No hay rutas configuradas.';
                hideLoading();
                return;
            }

            // Anonymous auth needed so Firestore rules (request.auth != null) allow ticket queries
            _isMasterPinSession = true;
            try {
                await auth.signInAnonymously();
                console.log('[REPARTO] Master PIN: anonymous auth OK');
            } catch (authErr) {
                console.error('[REPARTO] Anonymous auth failed:', authErr);
                document.getElementById('login-error').textContent = 'Error de autenticación. Contacta al administrador.';
                hideLoading();
                return;
            }

            showAdminRouteSelector();
        } catch (e) {
            console.error('Master PIN error:', e);
            document.getElementById('login-error').textContent = 'Error: ' + e.message;
        } finally {
            hideLoading();
        }
    });

    function showAdminRouteSelector() {
        document.getElementById('login-view').style.display = 'none';
        document.getElementById('main-app').style.display = 'none';
        document.getElementById('driver-selector-view').style.display = 'none';
        document.getElementById('admin-route-selector').style.display = 'flex';

        var container = document.getElementById('admin-route-options');
        container.innerHTML = '';

        _adminRoutes.forEach(function(route) {
            var driversText = route.driverNames.length > 0 ? route.driverNames.join(' · ') : 'Sin chóferes';
            var btn = document.createElement('button');
            btn.className = 'driver-option-btn';
            btn.style.borderColor = 'rgba(171,71,188,0.3)';
            btn.style.background = 'rgba(171,71,188,0.06)';
            btn.innerHTML = '<span class="driver-icon">📍</span><div style="text-align:left;"><div>' + route.label.toUpperCase() + '</div><div style="font-size:0.65rem; color:#888; font-weight:400; letter-spacing:0; margin-top:2px;">' + driversText + '</div></div>';
            btn.addEventListener('click', function() {
                currentDriverPhone = normalizePhone(route.number);
                currentRouteLabel = route.label;

                if (route.driverNames.length <= 1) {
                    currentDriverName = route.driverNames[0] || 'ADMIN';
                    document.getElementById('admin-route-selector').style.display = 'none';
                    enterMainApp();
                } else {
                    document.getElementById('admin-route-selector').style.display = 'none';
                    showDriverSelector(route.driverNames, route.label);
                }
            });
            container.appendChild(btn);
        });
    }

    document.getElementById('btn-admin-back').addEventListener('click', function() {
        document.getElementById('admin-route-selector').style.display = 'none';
        document.getElementById('login-view').style.display = 'flex';
        document.getElementById('master-pin-input').value = '';
    });

    // --- AUTH STATE ---
    auth.onAuthStateChanged(async function(user) {
        // Skip if master PIN session (anonymous auth) — route selector handles the flow
        if (_isMasterPinSession) return;

        if (user && user.phoneNumber) {
            showLoading();
            try {
                currentDriverPhone = normalizePhone(user.phoneNumber);
                console.log('[REPARTO] Autenticado:', currentDriverPhone);

                var phonesSnap = await db.collection('config').doc('phones').collection('list').get();
                var found = false;
                var foundRouteLabel = '';
                var driverNames = [];

                phonesSnap.forEach(function(doc) {
                    var d = doc.data();
                    var routePhone = normalizePhone(d.number);
                    if (routePhone === currentDriverPhone) {
                        found = true;
                        foundRouteLabel = d.label || '';
                        // Collect all configured driver names
                        if (d.driverName) driverNames.push(d.driverName);
                        if (d.driverName2) driverNames.push(d.driverName2);
                        if (d.driverName3) driverNames.push(d.driverName3);
                        if (d.driverName4) driverNames.push(d.driverName4);
                    }
                });

                currentRouteLabel = foundRouteLabel;

                // If no names found, use a default
                if (driverNames.length === 0) {
                    driverNames.push(found ? 'Repartidor' : 'Repartidor ' + currentDriverPhone.slice(-4));
                }

                // If only one driver, skip selection and go straight to app
                if (driverNames.length === 1) {
                    currentDriverName = driverNames[0];
                    enterMainApp();
                } else {
                    // Show driver selector
                    showDriverSelector(driverNames, foundRouteLabel);
                }

            } catch (e) {
                console.error('Init error:', e);
                showToast('Error al inicializar: ' + e.message, 'error', 5000);
            } finally {
                hideLoading();
            }
        } else {
            document.getElementById('login-view').style.display = 'flex';
            document.getElementById('main-app').style.display = 'none';
            document.getElementById('driver-selector-view').style.display = 'none';
            document.getElementById('admin-route-selector').style.display = 'none';
            if (unsubscribe) { unsubscribe(); unsubscribe = null; }
        }
    });

    // --- DRIVER SELECTOR ---
    function showDriverSelector(names, routeLabel) {
        document.getElementById('login-view').style.display = 'none';
        document.getElementById('main-app').style.display = 'none';
        document.getElementById('driver-selector-view').style.display = 'flex';

        var labelEl = document.getElementById('driver-route-label');
        if (routeLabel) {
            labelEl.textContent = '📍 ' + routeLabel;
        } else {
            labelEl.textContent = '';
        }

        var container = document.getElementById('driver-options');
        var driverIcons = ['🚛', '🚚', '🏍️', '🚐'];
        container.innerHTML = '';

        names.forEach(function(name, idx) {
            var btn = document.createElement('button');
            btn.className = 'driver-option-btn';
            btn.innerHTML = '<span class="driver-icon">' + (driverIcons[idx] || '🚛') + '</span><span>' + name.toUpperCase() + '</span>';
            btn.addEventListener('click', function() {
                currentDriverName = name;
                document.getElementById('driver-selector-view').style.display = 'none';
                enterMainApp();
            });
            container.appendChild(btn);
        });
    }

    // --- ENTER MAIN APP (after driver selected) ---
    function enterMainApp() {
        document.getElementById('login-view').style.display = 'none';
        document.getElementById('driver-selector-view').style.display = 'none';
        document.getElementById('admin-route-selector').style.display = 'none';
        document.getElementById('driver-name').textContent = currentDriverName;
        document.getElementById('main-app').style.display = 'block';

        try {
            var savedOrder = localStorage.getItem('routeOrder_' + currentDriverName);
            if (savedOrder) manualOrder = JSON.parse(savedOrder);
        } catch(e) { console.warn('Error loading route order:', e); }

        startDeliveryListener();
        startPickupListener();
        startDriverAlertListener();
        requestNotificationPermission();
        showToast('Bienvenido, ' + currentDriverName, 'success');
    }

    // --- LOGOUT ---
    document.getElementById('btn-logout').addEventListener('click', function() {
        if (confirm('¿Cerrar sesión?')) {
            stopScanner();
            // Unsubscribe from Firestore listeners
            if (unsubscribe) { unsubscribe(); unsubscribe = null; }
            if (pickupUnsubscribe) { pickupUnsubscribe(); pickupUnsubscribe = null; }
            if (alertUnsubscribe) { alertUnsubscribe(); alertUnsubscribe = null; }
            // Reset all session state
            currentDriverPhone = '';
            currentDriverName = '';
            currentRouteLabel = '';
            deliveries = [];
            manualOrder = null;
            currentScanDoc = null;
            currentFilter = 'pending';
            knownDeliveryIds = new Set();
            knownPickupIds = new Set();
            isFirstPickupSnapshot = true;
            knownAlertIds = new Set();
            isFirstAlertSnapshot = true;
            scannedPackages = {};
            isFirstSnapshot = true;
            _adminRoutes = [];
            _isMasterPinSession = false;
            confirmInProgress = false;
            // Hide all views, show login
            document.getElementById('main-app').style.display = 'none';
            document.getElementById('driver-selector-view').style.display = 'none';
            document.getElementById('admin-route-selector').style.display = 'none';
            document.getElementById('login-view').style.display = 'flex';
            document.getElementById('master-pin-input').value = '';
            document.getElementById('phone-input').value = '';
            document.getElementById('login-error').textContent = '';
            // Sign out Firebase auth (for SMS users; no-op for PIN users)
            auth.signOut().catch(function() {});
            showToast('Sesión cerrada.', 'info');
        }
    });

    // --- REFRESH ---
    document.getElementById('btn-refresh').addEventListener('click', function() {
        var btn = document.getElementById('btn-refresh');
        btn.classList.add('spinning');
        setTimeout(function() { btn.classList.remove('spinning'); }, 800);
        if (unsubscribe) { unsubscribe(); unsubscribe = null; }
        startDeliveryListener();
        showToast('Entregas actualizadas.', 'info');
    });

    // --- SORT ROUTE BY GPS ---
    document.getElementById('btn-sort-route').addEventListener('click', function() {
        if (deliveries.length === 0) {
            showToast('No hay entregas para ordenar.', 'warning');
            return;
        }

        showLoading();
        showToast('Obteniendo ubicación GPS...', 'info');

        if (!navigator.geolocation) {
            showToast('GPS no disponible en este dispositivo.', 'error');
            hideLoading();
            return;
        }

        navigator.geolocation.getCurrentPosition(
            async function(pos) {
                var myLat = pos.coords.latitude;
                var myLon = pos.coords.longitude;
                showToast('Calculando ruta óptima...', 'info');

                // Geocode all pending deliveries
                var pending = deliveries.filter(function(d) { return d.status !== 'Entregado' && !d.delivered; });
                await Promise.all(pending.map(geocodeAddress));

                // Sort by nearest neighbor
                var sorted = sortByGPSProximity(pending, myLat, myLon);
                var delivered = deliveries.filter(function(d) { return d.status === 'Entregado' || d.delivered; });

                // Save the manual order
                manualOrder = sorted.map(function(d) { return d._id; }).concat(delivered.map(function(d) { return d._id; }));
                try { localStorage.setItem('routeOrder_' + currentDriverName, JSON.stringify(manualOrder)); } catch(e) {}

                // Reorder deliveries array
                deliveries = sorted.concat(delivered);
                renderDeliveries();
                hideLoading();

                var geocoded = pending.filter(function(d) { return d._lat && d._lon; }).length;
                showToast('Ruta optimizada: ' + geocoded + '/' + pending.length + ' puntos geolocalizados.', 'success', 4000);
            },
            function(err) {
                hideLoading();
                showToast('Error GPS: ' + err.message + '. Activa la ubicación.', 'error', 5000);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    });

    // --- REAL-TIME DELIVERY LISTENER ---
    function startDeliveryListener() {
        if (unsubscribe) unsubscribe();

        unsubscribe = db.collection('tickets')
            .where('driverPhone', '==', currentDriverPhone)
            .onSnapshot(function(snap) {
                deliveries = [];
                snap.forEach(function(doc) {
                    var d = doc.data();
                    d._id = doc.id;
                    d._ref = doc.ref;
                    deliveries.push(d);
                });

                // Detect NEW deliveries (not on first load)
                if (!isFirstSnapshot) {
                    deliveries.forEach(function(d) {
                        if (!knownDeliveryIds.has(d._id) && d.status !== 'Entregado' && !d.delivered) {
                            sendNotification(
                                '📦 Nueva entrega asignada',
                                (d.receiver || 'Sin nombre') + ' — ' + [d.localidad, d.cp].filter(Boolean).join(', ')
                            );
                        }
                    });
                }
                // Update known IDs
                knownDeliveryIds = new Set(deliveries.map(function(d) { return d._id; }));
                isFirstSnapshot = false;

                // Apply manual order if user has reordered
                if (manualOrder && manualOrder.length > 0) {
                    deliveries.sort(function(a, b) {
                        var ia = manualOrder.indexOf(a._id);
                        var ib = manualOrder.indexOf(b._id);
                        if (ia === -1) ia = 9999;
                        if (ib === -1) ib = 9999;
                        return ia - ib;
                    });
                } else {
                    // Default: pending first, then by CP
                    deliveries.sort(function(a, b) {
                        var aD = a.status === 'Entregado' || a.delivered;
                        var bD = b.status === 'Entregado' || b.delivered;
                        if (aD && !bD) return 1;
                        if (!aD && bD) return -1;
                        return (a.cp || '').localeCompare(b.cp || '');
                    });
                }

                // Skip re-render if confirmation is in progress to avoid UI disruption
                if (!confirmInProgress) {
                    renderDeliveries();
                }
                updateStats();
            }, function(err) {
                console.error('Listener error:', err);
                if (err.code === 'permission-denied') {
                    showToast('Sin permisos para ver albaranes. Reinicia la app.', 'error', 8000);
                } else if (err.code === 'failed-precondition') {
                    showToast('Índice Firestore necesario. Contacta al admin.', 'error', 8000);
                }
            });
    }

    // --- PICKUP REQUESTS LISTENER ---
    var pickupUnsubscribe = null;
    var knownPickupIds = new Set();
    var isFirstPickupSnapshot = true;

    function startPickupListener() {
        if (pickupUnsubscribe) pickupUnsubscribe();

        pickupUnsubscribe = db.collection('pickupRequests')
            .where('status', '==', 'pending')
            .onSnapshot(function(snap) {
                var pickups = [];
                snap.forEach(function(doc) {
                    var d = doc.data();
                    d._id = doc.id;
                    pickups.push(d);
                });

                // Detect NEW pickups (not on first load)
                if (!isFirstPickupSnapshot) {
                    pickups.forEach(function(p) {
                        if (!knownPickupIds.has(p._id)) {
                            sendNotification(
                                '\ud83d\udce6 RECOGIDA PENDIENTE',
                                (p.senderName || 'Cliente') + ' \u2014 ' + (p.senderAddress || '') + ' \u2014 ' + (p.packages || 1) + ' bultos'
                            );
                        }
                    });
                }
                knownPickupIds = new Set(pickups.map(function(p) { return p._id; }));
                isFirstPickupSnapshot = false;

                renderPickupCards(pickups);
            }, function(err) {
                console.warn('Pickup listener error:', err);
            });
    }

    // --- DRIVER ALERTS LISTENER (admin pickup/collection alerts) ---
    var alertUnsubscribe = null;
    var knownAlertIds = new Set();
    var isFirstAlertSnapshot = true;
    var _driverAlerts = [];

    function startDriverAlertListener() {
        if (!currentDriverPhone) return;
        if (alertUnsubscribe) alertUnsubscribe();

        alertUnsubscribe = db.collection('driver_alerts')
            .where('routePhone', '==', currentDriverPhone)
            .where('completed', '==', false)
            .onSnapshot(function(snap) {
                var alerts = [];
                snap.forEach(function(doc) {
                    var d = doc.data();
                    d._id = doc.id;
                    alerts.push(d);
                });

                // Sort newest first
                alerts.sort(function(a, b) {
                    var ta = a.createdAt ? (typeof a.createdAt.toDate === 'function' ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime()) : 0;
                    var tb = b.createdAt ? (typeof b.createdAt.toDate === 'function' ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime()) : 0;
                    return tb - ta;
                });

                // Notify for new unread alerts
                alerts.forEach(function(a) {
                    if (!a.read && !knownAlertIds.has(a._id)) {
                        sendNotification(
                            a.title || '\ud83d\udce2 AVISO DE ADMIN',
                            a.body || '',
                            function() {
                                // On banner tap: open alerts panel
                                var panel = document.getElementById('alerts-panel');
                                var arrow = document.getElementById('alerts-panel-arrow');
                                if (panel && panel.style.display === 'none') {
                                    panel.style.display = 'block';
                                    if (arrow) arrow.style.transform = 'rotate(180deg)';
                                    _renderAlertsPanel();
                                }
                                // Scroll to alerts button
                                var btn = document.getElementById('btn-alerts-toggle');
                                if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                        );
                        // Mark as read (seen) but NOT completed
                        db.collection('driver_alerts').doc(a._id).update({ read: true })
                            .catch(function(e) { console.warn('Error marking alert read:', e); });
                    }
                });

                knownAlertIds = new Set(alerts.map(function(a) { return a._id; }));
                isFirstAlertSnapshot = false;
                _driverAlerts = alerts;
                _updateAlertsBadge();
                _renderAlertsPanel();
            }, function(err) {
                console.warn('Driver alert listener error:', err);
            });
    }

    function _updateAlertsBadge() {
        var badge = document.getElementById('alerts-count-badge');
        if (!badge) return;
        var count = _driverAlerts.length;
        badge.textContent = count;
        badge.style.display = count > 0 ? 'inline-block' : 'none';
        // Pulse the button if there are pending alerts
        var btn = document.getElementById('btn-alerts-toggle');
        if (btn) {
            btn.style.borderColor = count > 0 ? '#4CAF50' : '#333';
            btn.style.boxShadow = count > 0 ? '0 0 12px rgba(76,175,80,0.3)' : 'none';
        }
    }

    window.toggleAlertsPanel = function() {
        var panel = document.getElementById('alerts-panel');
        var arrow = document.getElementById('alerts-panel-arrow');
        if (!panel) return;
        if (panel.style.display === 'none') {
            panel.style.display = 'block';
            if (arrow) arrow.style.transform = 'rotate(180deg)';
            _renderAlertsPanel();
        } else {
            panel.style.display = 'none';
            if (arrow) arrow.style.transform = 'rotate(0deg)';
        }
    };

    function _renderAlertsPanel() {
        var panel = document.getElementById('alerts-panel');
        if (!panel || panel.style.display === 'none') return;

        if (_driverAlerts.length === 0) {
            panel.innerHTML = '<div style="text-align:center; padding:24px; color:#888; font-size:0.85rem;">' +
                '<span class="material-symbols-outlined" style="font-size:2rem; display:block; margin-bottom:8px; color:#4CAF50;">check_circle</span>' +
                'No hay recogidas ni avisos pendientes</div>';
            return;
        }

        var html = '';
        _driverAlerts.forEach(function(a) {
            var typeIcon = '\ud83d\udce2';
            var typeLabel = 'Aviso';
            var typeColor = '#2196F3';
            if (a.type === 'recogida') { typeIcon = '\ud83d\udce5'; typeLabel = 'Recogida'; typeColor = '#FF9800'; }
            else if (a.type === 'entrega_urgente') { typeIcon = '\ud83d\udea8'; typeLabel = 'Entrega urgente'; typeColor = '#FF3B30'; }

            var dateStr = '';
            if (a.createdAt) {
                var d = typeof a.createdAt.toDate === 'function' ? a.createdAt.toDate() : new Date(a.createdAt);
                dateStr = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                var today = new Date();
                if (d.toDateString() !== today.toDateString()) {
                    dateStr = d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) + ' ' + dateStr;
                }
            }

            html += '<div style="background:linear-gradient(135deg, ' + typeColor + '15, ' + typeColor + '08); border:1px solid ' + typeColor + '44; border-radius:12px; padding:14px; margin-bottom:10px;">';
            // Header
            html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">';
            html += '<span style="color:' + typeColor + '; font-weight:800; font-size:0.82rem; letter-spacing:0.5px;">' + typeIcon + ' ' + typeLabel.toUpperCase() + '</span>';
            html += '<span style="color:#888; font-size:0.72rem;">' + dateStr + '</span>';
            html += '</div>';
            // Address
            if (a.address) {
                html += '<div style="display:flex; align-items:start; gap:6px; margin-bottom:6px; color:#eee; font-size:0.9rem; line-height:1.5;">';
                html += '<span style="font-size:1rem; flex-shrink:0;">\ud83d\udccd</span>';
                html += '<span style="font-weight:600;">' + a.address + '</span>';
                html += '</div>';
            }
            // Notes
            if (a.notes) {
                html += '<div style="display:flex; align-items:start; gap:6px; margin-bottom:6px; color:#aaa; font-size:0.82rem; line-height:1.4;">';
                html += '<span style="font-size:0.9rem; flex-shrink:0;">\ud83d\udcdd</span>';
                html += '<span>' + a.notes + '</span>';
                html += '</div>';
            }
            // Sent by
            if (a.sentBy) {
                html += '<div style="color:#666; font-size:0.7rem; margin-bottom:8px;">Enviado por: ' + a.sentBy + '</div>';
            }
            // Action buttons
            html += '<div style="display:flex; gap:8px; margin-top:10px;">';
            // Google Maps
            if (a.address) {
                html += '<button onclick="window.open(\'https://www.google.com/maps/search/' + encodeURIComponent(a.address) + '\', \'_blank\')" style="flex:1; padding:10px; background:#1e3a5f; color:#5dade2; border:1px solid #2d5a8e; border-radius:8px; font-weight:800; font-size:0.78rem; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px;">\ud83d\udccd C\u00d3MO LLEGAR</button>';
            }
            // Complete
            html += '<button onclick="completeDriverAlert(\'' + a._id + '\')" style="flex:1; padding:10px; background:linear-gradient(135deg,#4CAF50,#2E7D32); color:white; border:none; border-radius:8px; font-weight:800; font-size:0.78rem; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px;">\u2705 COMPLETADA</button>';
            html += '</div>';
            html += '</div>';
        });

        panel.innerHTML = html;
    }

    window.completeDriverAlert = async function(alertId) {
        if (!confirm('\u00bfMarcar como completada?')) return;
        try {
            await db.collection('driver_alerts').doc(alertId).update({
                completed: true,
                completedAt: firebase.firestore.FieldValue.serverTimestamp(),
                completedBy: currentDriverName
            });
            showToast('Recogida/aviso completado', 'success');
        } catch(e) {
            console.error('Error completing alert:', e);
            showToast('Error: ' + e.message, 'error');
        }
    };

    function renderPickupCards(pickups) {
        var container = document.getElementById('delivery-list');
        if (!container) return;

        // Remove old pickup cards
        var oldCards = container.querySelectorAll('.pickup-card');
        oldCards.forEach(function(c) { c.remove(); });

        if (pickups.length === 0) return;

        pickups.forEach(function(p) {
            var card = document.createElement('div');
            card.className = 'pickup-card';
            card.style.cssText = 'background:linear-gradient(135deg,rgba(76,175,80,0.15),rgba(76,175,80,0.05)); border:2px solid #4CAF50; border-radius:12px; padding:14px; margin-bottom:10px; animation:slideDown 0.3s ease;';

            var turnIcon = p.timeSlot === 'TARDE' ? '\ud83c\udf19' : '\u2600\ufe0f';
            var notesHtml = p.notes ? '<div style="margin-top:6px; font-style:italic; color:#aaa; font-size:0.75rem;">\ud83d\udcdd ' + p.notes + '</div>' : '';
            var destHtml = p.destination ? '<div style="margin-top:4px;"><strong>Destino:</strong> ' + p.destination + '</div>' : '';
            var createdStr = '';
            if (p.createdAt && typeof p.createdAt.toDate === 'function') {
                var d = p.createdAt.toDate();
                createdStr = d.toLocaleTimeString('es-ES', {hour:'2-digit', minute:'2-digit'});
            }

            card.innerHTML =
                '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">' +
                    '<span style="color:#4CAF50; font-weight:900; font-size:0.8rem; letter-spacing:1px;">\ud83d\udce6 RECOGIDA PENDIENTE</span>' +
                    '<span style="color:#888; font-size:0.7rem;">' + turnIcon + ' ' + (p.timeSlot || '') + (createdStr ? ' \u2022 ' + createdStr : '') + '</span>' +
                '</div>' +
                '<div style="font-size:0.9rem; line-height:1.7; color:#eee;">' +
                    '<div><strong>\ud83d\udc64 ' + (p.senderName || 'Cliente') + '</strong></div>' +
                    '<div>\ud83d\udccd ' + (p.senderAddress || 'Sin direcci\u00f3n') + '</div>' +
                    '<div>\ud83d\udcde ' + (p.senderPhone || '---') + '</div>' +
                    destHtml +
                    '<div>\ud83d\udce6 ' + (p.packages || 1) + ' bultos</div>' +
                    notesHtml +
                '</div>' +
                '<div style="display:flex; gap:8px; margin-top:10px;">' +
                    '<button onclick="window.open(\'' + (p.mapsUrl || '#') + '\', \'_blank\')" style="flex:1; padding:8px; background:#4CAF50; color:white; border:none; border-radius:8px; font-weight:800; font-size:0.75rem; cursor:pointer;">\ud83d\udccd C\u00d3MO LLEGAR</button>' +
                    '<button onclick="completePickup(\'' + p._id + '\')" style="flex:1; padding:8px; background:rgba(255,255,255,0.1); color:#4CAF50; border:1px solid #4CAF50; border-radius:8px; font-weight:800; font-size:0.75rem; cursor:pointer;">\u2705 COMPLETADA</button>' +
                '</div>';

            container.insertBefore(card, container.firstChild);
        });
    }

    window.completePickup = async function(pickupId) {
        if (!confirm('\u00bfMarcar esta recogida como completada?')) return;
        try {
            await db.collection('pickupRequests').doc(pickupId).update({
                status: 'completed',
                completedAt: firebase.firestore.FieldValue.serverTimestamp(),
                completedBy: currentDriverName
            });
            showToast('Recogida completada.', 'success');
        } catch (e) {
            console.error('Error completando recogida:', e);
            showToast('Error: ' + e.message, 'error');
        }
    };

    // --- RENDER DELIVERIES ---
    function renderDeliveries() {
        var container = document.getElementById('delivery-list');
        var filtered = deliveries.slice();

        if (currentFilter === 'pending') filtered = filtered.filter(function(d) { return d.status !== 'Entregado' && !d.delivered && d.status !== 'pending_confirmation'; });
        else if (currentFilter === 'delivered') filtered = filtered.filter(function(d) { return d.status === 'Entregado' || d.delivered; });
        else if (currentFilter === 'morning') filtered = filtered.filter(function(d) { return d.timeSlot === 'MAÑANA'; });
        else if (currentFilter === 'afternoon') filtered = filtered.filter(function(d) { return d.timeSlot === 'TARDE'; });

        if (filtered.length === 0) {
            container.innerHTML = '<div class="empty-state">' +
                '<div class="icon">📦</div>' +
                '<p>No hay entregas' + (currentFilter !== 'all' ? ' con este filtro' : ' asignadas') + '</p>' +
                '</div>';
            return;
        }

        container.innerHTML = filtered.map(function(d, idx) {
            var isDelivered = d.status === 'Entregado' || d.delivered;
            var statusClass = isDelivered ? 'delivered' : 'pending';
            var statusText = isDelivered ? 'ENTREGADO' : (d.status === 'pending_confirmation' ? '⏳ MOD.' : 'PENDIENTE');
            var addr = [d.address, d.localidad, d.cp, d.province].filter(Boolean).join(', ');
            var pkgCount = getPackageCount(d);
            var orderNum = isDelivered ? '' : '<span class="route-order">' + (idx + 1) + '</span>';

            return '<div class="delivery-card ' + statusClass + '" data-id="' + d._id + '" data-idx="' + idx + '" draggable="true">' +
                '<span class="drag-handle">⠿</span>' +
                '<div class="dc-header">' +
                    '<span class="dc-id">' + orderNum + (d.id || d._id.substring(0,12)) + '</span>' +
                    '<span class="dc-status ' + statusClass + '">' + statusText + '</span>' +
                '</div>' +
                '<div class="dc-name">' + (d.receiver || d.clientName || 'Sin nombre') + '</div>' +
                '<div class="dc-addr">' + (addr || 'Sin dirección') + '</div>' +
                '<div class="dc-footer">' +
                    '<span class="dc-packages">📦 ' + pkgCount + ' bultos ' + (d.timeSlot ? (d.timeSlot === 'MAÑANA' ? '☀️' : '🌙') : '') + '</span>' +
                    '<button class="dc-gps" data-addr="' + (addr || '').replace(/"/g, '&quot;') + '">📍 GPS</button>' +
                '</div>' +
            '</div>';
        }).join('');

        // Card click → detail modal
        container.querySelectorAll('.delivery-card').forEach(function(card) {
            card.addEventListener('click', function(e) {
                if (e.target.classList.contains('dc-gps') || e.target.classList.contains('drag-handle')) return;
                var id = card.dataset.id;
                var d = deliveries.find(function(x) { return x._id === id; });
                if (d) showDetailModal(d);
            });
        });

        // GPS buttons
        container.querySelectorAll('.dc-gps').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                openGPS(btn.dataset.addr);
            });
        });

        // Drag & drop
        setupDragAndDrop(container);
    }

    // --- DRAG & DROP ---
    function setupDragAndDrop(container) {
        var cards = container.querySelectorAll('.delivery-card');

        cards.forEach(function(card) {
            card.addEventListener('dragstart', function(e) {
                dragSrcIndex = parseInt(card.dataset.idx);
                card.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', card.dataset.idx);
            });

            card.addEventListener('dragend', function() {
                card.classList.remove('dragging');
                container.querySelectorAll('.delivery-card').forEach(function(c) { c.classList.remove('drag-over'); });
            });

            card.addEventListener('dragover', function(e) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                container.querySelectorAll('.delivery-card').forEach(function(c) { c.classList.remove('drag-over'); });
                card.classList.add('drag-over');
            });

            card.addEventListener('dragleave', function() {
                card.classList.remove('drag-over');
            });

            card.addEventListener('drop', function(e) {
                e.preventDefault();
                card.classList.remove('drag-over');
                var fromIdx = dragSrcIndex;
                var toIdx = parseInt(card.dataset.idx);
                if (fromIdx === toIdx || fromIdx === null) return;

                // Reorder deliveries array
                var item = deliveries.splice(fromIdx, 1)[0];
                deliveries.splice(toIdx, 0, item);

                // Save manual order
                manualOrder = deliveries.map(function(d) { return d._id; });
                try { localStorage.setItem('routeOrder_' + currentDriverName, JSON.stringify(manualOrder)); } catch(e) {}

                renderDeliveries();
                showToast('Orden actualizado.', 'info', 1500);
            });
        });

        // Touch drag support for mobile
        setupTouchDrag(container);
    }

    function setupTouchDrag(container) {
        var touchSrcIdx = null;
        var touchClone = null;
        var touchStartY = 0;

        container.querySelectorAll('.drag-handle').forEach(function(handle) {
            handle.addEventListener('touchstart', function(e) {
                e.preventDefault();
                var card = handle.closest('.delivery-card');
                touchSrcIdx = parseInt(card.dataset.idx);
                touchStartY = e.touches[0].clientY;

                // Create visual clone
                touchClone = card.cloneNode(true);
                touchClone.style.position = 'fixed';
                touchClone.style.zIndex = '500';
                touchClone.style.opacity = '0.8';
                touchClone.style.width = card.offsetWidth + 'px';
                touchClone.style.pointerEvents = 'none';
                touchClone.style.left = card.getBoundingClientRect().left + 'px';
                touchClone.style.top = e.touches[0].clientY - 30 + 'px';
                document.body.appendChild(touchClone);

                card.classList.add('dragging');
            }, { passive: false });
        });

        container.addEventListener('touchmove', function(e) {
            if (touchSrcIdx === null || !touchClone) return;
            e.preventDefault();
            touchClone.style.top = e.touches[0].clientY - 30 + 'px';

            // Highlight target card
            var target = document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY);
            container.querySelectorAll('.delivery-card').forEach(function(c) { c.classList.remove('drag-over'); });
            if (target) {
                var targetCard = target.closest('.delivery-card');
                if (targetCard && targetCard.dataset.idx !== String(touchSrcIdx)) {
                    targetCard.classList.add('drag-over');
                }
            }
        }, { passive: false });

        container.addEventListener('touchend', function(e) {
            if (touchSrcIdx === null) return;

            // Find drop target
            container.querySelectorAll('.delivery-card').forEach(function(c) { c.classList.remove('dragging'); c.classList.remove('drag-over'); });
            if (touchClone) { touchClone.remove(); touchClone = null; }

            var touch = e.changedTouches[0];
            var target = document.elementFromPoint(touch.clientX, touch.clientY);
            if (target) {
                var targetCard = target.closest('.delivery-card');
                if (targetCard) {
                    var toIdx = parseInt(targetCard.dataset.idx);
                    if (toIdx !== touchSrcIdx) {
                        var item = deliveries.splice(touchSrcIdx, 1)[0];
                        deliveries.splice(toIdx, 0, item);
                        manualOrder = deliveries.map(function(d) { return d._id; });
                        try { localStorage.setItem('routeOrder_' + currentDriverName, JSON.stringify(manualOrder)); } catch(e) {}
                        renderDeliveries();
                        showToast('Orden actualizado.', 'info', 1500);
                    }
                }
            }
            touchSrcIdx = null;
        });
    }

    // --- STATS ---
    function updateStats() {
        var pending = deliveries.filter(function(d) { return d.status !== 'Entregado' && !d.delivered; }).length;
        var delivered = deliveries.filter(function(d) { return d.status === 'Entregado' || d.delivered; }).length;
        var morning = deliveries.filter(function(d) { return d.timeSlot === 'MAÑANA'; }).length;
        var afternoon = deliveries.filter(function(d) { return d.timeSlot === 'TARDE'; }).length;
        document.getElementById('stat-pending').textContent = pending;
        document.getElementById('stat-delivered').textContent = delivered;
        document.getElementById('stat-morning').textContent = morning;
        document.getElementById('stat-afternoon').textContent = afternoon;
    }

    // --- FILTERS (stat-box tap) ---
    document.querySelectorAll('.stat-filter').forEach(function(box) {
        box.addEventListener('click', function() {
            var filter = box.dataset.filter;
            if (currentFilter === filter) {
                // Tap again = deselect → show all
                box.classList.remove('active');
                currentFilter = 'all';
            } else {
                document.querySelectorAll('.stat-filter').forEach(function(b) { b.classList.remove('active'); });
                box.classList.add('active');
                currentFilter = filter;
            }
            renderDeliveries();
        });
    });

    // --- GPS ---
    function openGPS(address) {
        if (!address) { showToast('Sin dirección disponible.', 'warning'); return; }
        var url = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address);
        window.open(url, '_blank');
    }
    window.openGPS = openGPS;

    // --- DETAIL MODAL ---
    function showDetailModal(d) {
        var modal = document.getElementById('detail-modal');
        var content = document.getElementById('modal-content');
        var isDelivered = d.status === 'Entregado' || d.delivered;
        var addr = [d.address, d.localidad, d.cp, d.province].filter(Boolean).join(', ');
        var pkgCount = getPackageCount(d);

        content.innerHTML =
            '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">' +
                '<h3 style="color:var(--brand); margin:0; font-size:1rem; font-weight:800;">' + (d.id || '') + '</h3>' +
                '<span class="dc-status ' + (isDelivered ? 'delivered' : 'pending') + '">' + (isDelivered ? 'ENTREGADO' : 'PENDIENTE') + '</span>' +
            '</div>' +
            '<div style="font-size:0.9rem; line-height:1.8; margin-bottom:20px;">' +
                '<b>Destinatario:</b> ' + (d.receiver || '---') + '<br>' +
                '<b>Dirección:</b> ' + (addr || '---') + '<br>' +
                '<b>Bultos:</b> ' + pkgCount + '<br>' +
                '<b>Turno:</b> ' + (d.timeSlot === 'MAÑANA' ? '☀️ Mañana' : '🌙 Tarde') + '<br>' +
                '<b>Remitente:</b> ' + (d.sender || '---') + '<br>' +
                (d.notes ? '<b>Observaciones:</b> ' + d.notes + '<br>' : '') +
                (d.cod ? '<b>Reembolso:</b> ' + d.cod + '€<br>' : '') +
                (d.deliveryReceiverName ? '<b>Recibido por:</b> ' + d.deliveryReceiverName + '<br>' : '') +
            '</div>' +
            '<div style="display:flex; flex-direction:column; gap:8px;">' +
                '<button class="btn btn-primary" id="modal-btn-gps">📍 ABRIR EN GPS</button>' +
                (!isDelivered ?
                    '<button class="btn btn-success" id="modal-btn-deliver">✅ ENTREGAR (MANUAL)</button>' +
                    '<button class="btn btn-outline" id="modal-btn-modify">✏️ SOLICITAR MODIFICACIÓN</button>' +
                    '<button class="btn" id="modal-btn-incident" style="background:#FF3B30; color:white; border:none;">⚠️ INCIDENCIA</button>'
                : '') +
                '<button class="btn btn-outline" id="modal-btn-close" style="color:var(--text-dim);">CERRAR</button>' +
            '</div>';

        modal.classList.add('active');

        document.getElementById('modal-btn-gps').onclick = function() { openGPS(addr); };
        document.getElementById('modal-btn-close').onclick = function() { closeModal(); };

        var btnDeliver = document.getElementById('modal-btn-deliver');
        if (btnDeliver) {
            btnDeliver.onclick = function() {
                closeModal();
                switchView('view-scanner');
                loadTicketForConfirmation(d);
            };
        }

        var btnModify = document.getElementById('modal-btn-modify');
        if (btnModify) {
            btnModify.onclick = function() {
                closeModal();
                openModificationModal(d);
            };
        }

        // Incident button
        var btnIncident = document.getElementById('modal-btn-incident');
        if (btnIncident) {
            btnIncident.onclick = function() {
                reportIncident(d);
            };
        }
    }

    function closeModal() {
        document.getElementById('detail-modal').classList.remove('active');
    }
    window.closeModal = closeModal;

    // --- REPORT INCIDENT (with optional photo) ---
    var _incidentDelivery = null;

    function reportIncident(d) {
        _incidentDelivery = d;
        var modal = document.getElementById('incident-modal');
        if (!modal) return;
        document.getElementById('incident-modal-ticket').textContent = 'Albaran: ' + (d.id || d._id);
        document.getElementById('incident-reason-select').value = '';
        document.getElementById('incident-detail').value = '';
        document.getElementById('incident-photo-input').value = '';
        document.getElementById('incident-photo-preview').style.display = 'none';
        document.getElementById('incident-photo-preview').src = '';
        closeModal(); // close detail modal first
        modal.classList.add('active');
    }

    // Incident camera
    document.getElementById('btn-incident-camera').addEventListener('click', function() {
        document.getElementById('incident-photo-input').click();
    });
    document.getElementById('incident-photo-input').addEventListener('change', function(e) {
        var f = e.target.files[0];
        if (f) {
            var reader = new FileReader();
            reader.onload = function(ev) {
                document.getElementById('incident-photo-preview').src = ev.target.result;
                document.getElementById('incident-photo-preview').style.display = 'block';
            };
            reader.readAsDataURL(f);
        }
    });

    // Incident cancel
    document.getElementById('btn-incident-cancel').addEventListener('click', function() {
        document.getElementById('incident-modal').classList.remove('active');
        _incidentDelivery = null;
    });

    // Incident send
    document.getElementById('btn-incident-send').addEventListener('click', async function() {
        var d = _incidentDelivery;
        if (!d) return;
        var reason = document.getElementById('incident-reason-select').value;
        if (!reason) { showToast('Selecciona un motivo', 'error'); return; }
        var detail = (document.getElementById('incident-detail').value || '').trim();
        var fullReason = reason + (detail ? ' - ' + detail : '');

        var sendBtn = document.getElementById('btn-incident-send');
        sendBtn.disabled = true;
        sendBtn.textContent = 'Enviando...';

        try {
            var updateData = {
                status: 'Incidencia',
                incidentReason: fullReason,
                incidentReportedBy: currentDriverName,
                incidentReportedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            // Upload photo if present
            var photoFile = document.getElementById('incident-photo-input').files[0];
            if (photoFile) {
                photoFile = await compressImage(photoFile);
                var docId = d._id || d.docId;
                var photoRef = storage.ref('incidents/' + docId + '/photo.jpg');
                await photoRef.put(photoFile, { contentType: photoFile.type });
                updateData.incidentPhotoURL = await photoRef.getDownloadURL();
            }

            var docRef = d._ref || db.collection('tickets').doc(d._id);
            await docRef.update(updateData);

            document.getElementById('incident-modal').classList.remove('active');
            _incidentDelivery = null;
            showToast('Incidencia reportada: ' + (d.id || d._id), 'warning');
        } catch (e) {
            showToast('Error: ' + e.message, 'error');
        } finally {
            sendBtn.disabled = false;
            sendBtn.textContent = 'ENVIAR INCIDENCIA';
        }
    });

    document.getElementById('detail-modal').addEventListener('click', function(e) {
        if (e.target === e.currentTarget) closeModal();
    });

    // --- MODIFICATION MODAL ---
    function openModificationModal(d) {
        modDocId = d._id;
        var addr = [d.address, d.localidad, d.cp, d.province].filter(Boolean).join(', ');
        document.getElementById('mod-ticket-info').innerHTML =
            '<b>Albarán:</b> ' + (d.id || d._id) + '<br>' +
            '<b>Destino:</b> ' + (d.receiver || '---') + '<br>' +
            '<b>Dirección actual:</b> ' + (addr || '---');
        document.getElementById('mod-address').value = '';
        document.getElementById('mod-packages').value = '';
        document.getElementById('mod-notes').value = '';
        document.getElementById('mod-modal').classList.add('active');
    }

    document.getElementById('btn-mod-cancel').addEventListener('click', function() {
        document.getElementById('mod-modal').classList.remove('active');
        modDocId = null;
    });

    document.getElementById('mod-modal').addEventListener('click', function(e) {
        if (e.target === e.currentTarget) {
            document.getElementById('mod-modal').classList.remove('active');
            modDocId = null;
        }
    });

    document.getElementById('btn-mod-send').addEventListener('click', async function() {
        if (!modDocId) return;
        var d = deliveries.find(function(x) { return x._id === modDocId; });
        if (!d) return;

        var newAddr = document.getElementById('mod-address').value.trim();
        var newPkgs = document.getElementById('mod-packages').value.trim();
        var newNotes = document.getElementById('mod-notes').value.trim();

        if (!newAddr && !newPkgs && !newNotes) {
            showToast('Indica al menos un cambio o motivo.', 'warning');
            return;
        }

        showLoading();
        var changes = {};
        if (newAddr && newAddr !== d.address) changes.address = newAddr;
        if (newPkgs) changes.packages = parseInt(newPkgs);
        if (newNotes) changes.notes = (d.notes || '') + ' | [REPARTIDOR ' + currentDriverName + ': ' + newNotes + ']';

        try {
            await d._ref.update({
                pendingChanges: changes,
                pendingChangesText: 'Modificación solicitada por ' + currentDriverName + ' (' + currentDriverPhone + ')',
                status: 'pending_confirmation'
            });
            // Immediately remove it from local state to ensure it hides before snapshot arrives
            var idx = deliveries.findIndex(function(x) { return x._id === d._id; });
            if (idx > -1) deliveries[idx].status = 'pending_confirmation';
            renderDeliveries();
            document.getElementById('mod-modal').classList.remove('active');
            modDocId = null;
            showToast('Solicitud enviada al admin.', 'success');
        } catch (e) {
            showToast('Error: ' + e.message, 'error');
        } finally {
            hideLoading();
        }
    });

    // --- NAVIGATION ---
    function switchView(viewId) {
        document.querySelectorAll('.view').forEach(function(v) { v.classList.remove('active'); });
        document.getElementById(viewId).classList.add('active');
        document.querySelectorAll('.nav-btn').forEach(function(b) { b.classList.remove('active'); });
        var navBtn = document.querySelector('.nav-btn[data-view="' + viewId + '"]');
        if (navBtn) navBtn.classList.add('active');

        if (viewId === 'view-scanner') { startScanner(); } else { stopScanner(); }
        if (viewId === 'view-map') { setTimeout(initMap, 200); }
    }

    document.querySelectorAll('.nav-btn').forEach(function(btn) {
        btn.addEventListener('click', function() { switchView(btn.dataset.view); });
    });

    document.getElementById('btn-scan-fab').addEventListener('click', function() { switchView('view-scanner'); });

    // --- QR SCANNER ---
    async function startScanner() {
        var container = document.getElementById('qr-reader');
        if (!container || typeof Html5Qrcode === 'undefined') return;
        if (qrScanner) await stopScanner();
        try {
            qrScanner = new Html5Qrcode('qr-reader');
            await qrScanner.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: { width: 250, height: 250 } },
                function(text) { stopScanner(); handleScan(text); }
            );
        } catch (e) { console.error('Scanner start error:', e); }
    }

    async function stopScanner() {
        if (qrScanner) {
            try { await qrScanner.stop(); } catch (e) {}
            qrScanner = null;
        }
    }

    document.getElementById('btn-manual-search').addEventListener('click', function() {
        var val = document.getElementById('manual-id-input').value.trim();
        if (val) handleScan(val);
    });

    document.getElementById('manual-id-input').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            var val = e.target.value.trim();
            if (val) handleScan(val);
        }
    });

    // --- HANDLE SCAN ---
    async function handleScan(rawText) {
        showLoading();
        var searchId = rawText.trim();
        var pkgNum = 0; // 0 = old format (no individual tracking)
        var pkgTotal = 0;

        // Parse structured QR: ID:xxx|DEST:xxx|...|PKG:2/3
        if (rawText.indexOf('|') > -1 && rawText.toUpperCase().indexOf('ID:') > -1) {
            var parts = rawText.split('|');
            parts.forEach(function(p) {
                var idx = p.indexOf(':');
                if (idx > -1) {
                    var key = p.substring(0, idx).trim().toUpperCase();
                    var val = p.substring(idx + 1).trim();
                    if (key === 'ID') searchId = val;
                    if (key === 'PKG') {
                        var pkgParts = val.split('/');
                        if (pkgParts.length === 2) {
                            pkgNum = parseInt(pkgParts[0]) || 0;
                            pkgTotal = parseInt(pkgParts[1]) || 0;
                        }
                    }
                }
            });
        }

        try {
            if (rawText.charAt(0) === '{') {
                var j = JSON.parse(rawText);
                searchId = j.docId || j.id || searchId;
            }
        } catch (e) {}

        try {
            var doc = await db.collection('tickets').doc(searchId).get();
            if (!doc.exists) {
                var snap = await db.collection('tickets').where('id', '==', searchId).get();
                if (snap.empty) {
                    var snap2 = await db.collection('tickets').where('id', '==', searchId.replace(/^0+/, '')).get();
                    if (snap2.empty) {
                        // Ticket not found — could be deleted by admin
                        showToast('⚠️ ALBARÁN NO ENCONTRADO: ' + searchId + '. Puede haber sido eliminado por administración.', 'error', 6000);
                        hideLoading();
                        return;
                    }
                    doc = snap2.docs[0];
                } else {
                    doc = snap.docs[0];
                }
            }

            var d = doc.data();
            d._id = doc.id;
            d._ref = doc.ref;
            currentScanDoc = d;

            // --- DETECT ALREADY DELIVERED ---
            var isAlreadyDelivered = d.status === 'Entregado' || d.delivered;
            if (isAlreadyDelivered) {
                var deliveredDate = '';
                if (d.deliveredAt) {
                    try { deliveredDate = ' el ' + (d.deliveredAt.toDate ? d.deliveredAt.toDate() : new Date(d.deliveredAt)).toLocaleString('es-ES'); } catch(e) {}
                }
                showToast('⚠️ ALBARÁN YA ENTREGADO' + deliveredDate + '. Receptor: ' + (d.deliveredTo || d.receiverName || '---'), 'warning', 8000);
            }

            // --- DETECT INCIDENCIA / DEVUELTO ---
            if (d.status === 'Incidencia') {
                showToast('⚠️ ALBARÁN CON INCIDENCIA registrada. Consulta con administración.', 'warning', 6000);
            } else if (d.status === 'Devuelto') {
                showToast('⚠️ ALBARÁN MARCADO COMO DEVUELTO. No se debe entregar.', 'error', 6000);
            }

            // Calculate total packages from ticket data
            var totalPkgs = d.packagesList ? d.packagesList.reduce(function(s, p) { return s + (parseInt(p.qty) || 1); }, 0) : (parseInt(d.packages) || 1);
            if (pkgTotal > 0) totalPkgs = pkgTotal; // trust QR if present
            currentPkgTotal = totalPkgs;

            // Initialize scanned set for this ticket if needed
            var ticketKey = d.id || d._id;
            if (!scannedPackages[ticketKey]) {
                scannedPackages[ticketKey] = new Set();
            }

            // --- DETECT DUPLICATE SCAN (same ticket, old format, already fully scanned) ---
            if (pkgNum === 0 && scannedPackages[ticketKey].size >= totalPkgs && scannedPackages[ticketKey].size > 0 && !isAlreadyDelivered) {
                showToast('ℹ️ Este albarán ya fue escaneado en esta sesión.', 'info', 5000);
            }

            // Register scanned package
            if (pkgNum > 0) {
                if (scannedPackages[ticketKey].has(pkgNum)) {
                    showToast('📦 Bulto ' + pkgNum + '/' + totalPkgs + ' ya escaneado (duplicado).', 'warning');
                } else {
                    scannedPackages[ticketKey].add(pkgNum);
                    showToast('📦 Bulto ' + pkgNum + '/' + totalPkgs + ' escaneado ✅', 'success');
                }
            } else {
                // Old QR format without PKG — mark ALL as scanned
                for (var i = 1; i <= totalPkgs; i++) scannedPackages[ticketKey].add(i);
                if (!isAlreadyDelivered && d.status !== 'Devuelto' && d.status !== 'Incidencia') {
                    showToast('Albarán encontrado: ' + ticketKey, 'success');
                }
            }

            await loadTicketForConfirmation(d, totalPkgs);
        } catch (e) {
            showToast('Error buscando albarán: ' + e.message, 'error');
        } finally {
            hideLoading();
        }
    }

    async function loadTicketForConfirmation(d, totalPkgs) {
        currentScanDoc = d;
        var panel = document.getElementById('scan-result');
        panel.style.display = 'block';

        document.getElementById('scan-ticket-id').textContent = 'ALBARÁN: ' + (d.id || d._id);
        var statusEl = document.getElementById('scan-ticket-status');
        var isDelivered = d.status === 'Entregado' || d.delivered;
        var statusText = isDelivered ? 'ENTREGADO' : (d.status === 'Incidencia' ? 'INCIDENCIA' : (d.status === 'Devuelto' ? 'DEVUELTO' : 'PENDIENTE'));
        var statusClass = isDelivered ? 'delivered' : (d.status === 'Incidencia' || d.status === 'Devuelto' ? 'delivered' : 'pending');
        statusEl.textContent = statusText;
        statusEl.className = 'dc-status ' + statusClass;
        if (d.status === 'Incidencia') { statusEl.style.background = 'rgba(255,152,0,0.2)'; statusEl.style.color = '#FF9800'; }
        else if (d.status === 'Devuelto') { statusEl.style.background = 'rgba(255,59,48,0.2)'; statusEl.style.color = '#FF3B30'; }
        else { statusEl.style.background = ''; statusEl.style.color = ''; }

        var addr = [d.address, d.localidad, d.cp, d.province].filter(Boolean).join(', ');
        if (!totalPkgs) totalPkgs = getPackageCount(d);
        var ticketKey = d.id || d._id;
        var scanned = scannedPackages[ticketKey] || new Set();
        var scannedCount = scanned.size;
        var allScanned = scannedCount >= totalPkgs;

        // Build package progress HTML
        var pkgProgressHtml = '';
        if (totalPkgs > 1) {
            pkgProgressHtml = '<div style="margin:8px 0; padding:8px; background:rgba(255,255,255,0.05); border-radius:8px; border:1px solid var(--border);">';
            pkgProgressHtml += '<div style="font-size:0.7rem; color:var(--text-dim); font-weight:700; margin-bottom:6px;">CONTROL DE BULTOS (' + scannedCount + '/' + totalPkgs + '):</div>';
            pkgProgressHtml += '<div style="display:flex; flex-wrap:wrap; gap:4px;">';
            for (var i = 1; i <= totalPkgs; i++) {
                var isScanned = scanned.has(i);
                pkgProgressHtml += '<div style="padding:4px 10px; border-radius:6px; font-size:0.75rem; font-weight:700; ' +
                    (isScanned
                        ? 'background:rgba(76,217,100,0.2); color:#4CD964; border:1px solid rgba(76,217,100,0.4);'
                        : 'background:rgba(255,255,255,0.05); color:var(--text-dim); border:1px solid var(--border);') +
                    '">' + (isScanned ? '✅' : '⬜') + ' Bulto ' + i + '</div>';
            }
            pkgProgressHtml += '</div>';
            if (!allScanned && !isDelivered) {
                pkgProgressHtml += '<div style="margin-top:8px; text-align:center;"><button id="btn-scan-next-pkg" style="background:var(--brand); color:white; border:none; padding:8px 20px; border-radius:8px; font-weight:700; font-size:0.8rem; cursor:pointer;">📷 ESCANEAR SIGUIENTE BULTO</button></div>';
            }
            pkgProgressHtml += '</div>';
        }

        document.getElementById('scan-ticket-details').innerHTML =
            '<b>Destino:</b> ' + (d.receiver || '---') + '<br>' +
            '<b>Dirección:</b> ' + addr + '<br>' +
            '<b>Bultos:</b> ' + totalPkgs + '<br>' +
            '<b>Remitente:</b> ' + (d.sender || '---') + '<br>' +
            (d.notes ? '<b>Obs:</b> ' + d.notes + '<br>' : '') +
            (isDelivered ? '<div style="margin:8px 0; padding:10px; background:rgba(76,217,100,0.15); border:1px solid rgba(76,217,100,0.4); border-radius:8px; text-align:center; font-weight:700; font-size:0.85rem; color:#4CD964;">✅ YA ENTREGADO' + (d.deliveredTo ? ' — Receptor: ' + d.deliveredTo : '') + '</div>' : '') +
            (d.status === 'Devuelto' ? '<div style="margin:8px 0; padding:10px; background:rgba(255,59,48,0.15); border:1px solid rgba(255,59,48,0.4); border-radius:8px; text-align:center; font-weight:700; font-size:0.85rem; color:#FF3B30;">🚫 DEVUELTO — No entregar</div>' : '') +
            (d.status === 'Incidencia' ? '<div style="margin:8px 0; padding:10px; background:rgba(255,152,0,0.15); border:1px solid rgba(255,152,0,0.4); border-radius:8px; text-align:center; font-weight:700; font-size:0.85rem; color:#FF9800;">⚠️ INCIDENCIA — Consultar con administración</div>' : '') +
            pkgProgressHtml;

        // Bind "scan next" button
        var btnScanNext = document.getElementById('btn-scan-next-pkg');
        if (btnScanNext) {
            btnScanNext.addEventListener('click', function() {
                switchView('view-scanner');
            });
        }

        var confirmPanel = document.getElementById('confirm-panel');
        var btnConfirm = document.getElementById('btn-confirm-delivery');
        if (isDelivered || d.status === 'Devuelto') {
            confirmPanel.style.display = 'none';
            btnConfirm.style.display = 'none';
        } else {
            confirmPanel.style.display = 'block';
            // Show confirm button only if all packages scanned
            if (allScanned) {
                btnConfirm.style.display = 'flex';
                btnConfirm.textContent = '✅ REGISTRAR ENTREGA';
            } else {
                btnConfirm.style.display = 'flex';
                btnConfirm.textContent = '⏳ FALTAN ' + (totalPkgs - scannedCount) + ' BULTOS';
            }
            document.getElementById('confirm-receiver').value = '';
            clearSignature();
            document.getElementById('photo-preview').style.display = 'none';
            document.getElementById('confirm-photo').value = '';
            document.getElementById('photo-status').textContent = 'Sin foto';
        }
    }

    // --- CONFIRM DELIVERY ---
    document.getElementById('btn-confirm-delivery').addEventListener('click', async function() {
        if (!currentScanDoc) return;
        if (confirmInProgress) return; // Prevent double-click

        // Check all packages scanned
        var ticketKey = currentScanDoc.id || currentScanDoc._id;
        var scanned = scannedPackages[ticketKey] || new Set();
        if (currentPkgTotal > 1 && scanned.size < currentPkgTotal) {
            showToast('Faltan ' + (currentPkgTotal - scanned.size) + ' bultos por escanear.', 'warning');
            return;
        }

        var receiverName = document.getElementById('confirm-receiver').value.trim();
        if (!receiverName) {
            showToast('Indica quién recibe el paquete.', 'warning');
            document.getElementById('confirm-receiver').focus();
            return;
        }
        if (isSignatureEmpty()) {
            showToast('Se necesita la firma del receptor.', 'warning');
            return;
        }

        var btn = document.getElementById('btn-confirm-delivery');
        btn.disabled = true;
        btn.textContent = '⏳ Procesando...';
        showLoading();
        confirmInProgress = true; // Block snapshot re-renders

        // Helper: wrap a promise with a timeout
        function withTimeout(promise, ms, label) {
            return Promise.race([
                promise,
                new Promise(function(_, reject) {
                    setTimeout(function() { reject(new Error(label + ' timeout (' + ms + 'ms)')); }, ms);
                })
            ]);
        }

        try {
            var docId = currentScanDoc._id;
            var docRef = currentScanDoc._ref || db.collection('tickets').doc(docId);
            var deliveryData = {
                status: 'Entregado',
                delivered: true,
                deliveredAt: firebase.firestore.FieldValue.serverTimestamp(),
                distributedAt: firebase.firestore.FieldValue.serverTimestamp(),
                deliveryReceiverName: receiverName,
                deliveredByDriver: currentDriverName,
                deliveredByPhone: currentDriverPhone
            };

            // Auto-asignación de cargo según tipo de porte
            if (currentScanDoc.shippingType === 'Debidos') {
                deliveryData.billingTarget = 'destinatario';
                deliveryData.billingName = receiverName;
            } else {
                deliveryData.billingTarget = 'remitente';
                deliveryData.billingName = currentScanDoc.sender || currentScanDoc.clientName || '';
            }
            // Upload signature (MANDATORY — abort delivery if fails)
            var sigData = getSignatureDataURL();
            if (sigData) {
                var sigBlob = await (await fetch(sigData)).blob();
                var sigRef = storage.ref('deliveries/' + docId + '/signature.png');
                await withTimeout(sigRef.put(sigBlob, { contentType: 'image/png' }), 15000, 'Firma');
                deliveryData.signatureURL = await withTimeout(sigRef.getDownloadURL(), 5000, 'Firma URL');
            }

            // Upload photo (optional, non-blocking on failure)
            try {
                var photoFile = document.getElementById('confirm-photo').files[0];
                if (photoFile) {
                    photoFile = await compressImage(photoFile);
                    var photoRef = storage.ref('deliveries/' + docId + '/photo.jpg');
                    await withTimeout(photoRef.put(photoFile, { contentType: photoFile.type }), 20000, 'Foto');
                    deliveryData.photoURL = await withTimeout(photoRef.getDownloadURL(), 5000, 'Foto URL');
                }
            } catch (photoErr) {
                console.warn('Photo upload failed (will save delivery anyway):', photoErr);
            }

            // billingReady only if signature was uploaded
            deliveryData.billingReady = !!deliveryData.signatureURL;

            // Save delivery status (this is the critical operation)
            await withTimeout(docRef.update(deliveryData), 10000, 'Firestore');

            // --- POD: Notificar al cliente ---
            try {
                var uidToNotify = currentScanDoc.uid;
                if (uidToNotify) {
                    await db.collection('user_notifications').add({
                        uid: uidToNotify,
                        type: 'delivery_confirmed',
                        ticketId: docId,
                        message: 'Su envío #' + (currentScanDoc.id || docId) + ' ha sido entregado a ' + receiverName,
                        receiverName: receiverName,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        read: false
                    });
                }
            } catch (notifErr) {
                console.warn('Error mandando notificación al cliente:', notifErr);
            }

            document.getElementById('scan-ticket-details').innerHTML =
                '<div style="text-align:center; padding:20px;">' +
                    '<div style="font-size:3rem;">✅</div>' +
                    '<div style="font-size:1.1rem; font-weight:900; color:var(--success); margin:8px 0;">¡ENTREGA REGISTRADA!</div>' +
                    '<div style="color:var(--text-dim); font-size:0.85rem;">Receptor: <b>' + receiverName + '</b></div>' +
                '</div>';
            document.getElementById('confirm-panel').style.display = 'none';
            btn.style.display = 'none';
            showToast('Entrega registrada correctamente.', 'success');

            // Clean up package tracker
            var doneKey = currentScanDoc.id || currentScanDoc._id;
            delete scannedPackages[doneKey];
            currentPkgTotal = 0;

            setTimeout(function() {
                document.getElementById('scan-result').style.display = 'none';
                confirmInProgress = false; // Re-enable snapshot renders
                switchView('view-deliveries');
                renderDeliveries(); // Force refresh now
                btn.disabled = false;
                btn.textContent = '✅ REGISTRAR ENTREGA';
                btn.style.display = 'flex';
            }, 2000);

        } catch (e) {
            console.error('Delivery confirmation error:', e);
            showToast('Error: ' + e.message, 'error');
            btn.disabled = false;
            btn.textContent = '✅ REGISTRAR ENTREGA';
            confirmInProgress = false; // Re-enable snapshot renders
        } finally {
            hideLoading();
        }
    });

    // --- SIGNATURE CANVAS (responsive) ---
    (function() {
        var canvas = document.getElementById('sig-canvas');
        if (!canvas) return;
        var ctx = canvas.getContext('2d');
        var drawing = false, lx = 0, ly = 0;

        function resizeCanvas() {
            var wrap = canvas.parentElement;
            var w = wrap ? wrap.clientWidth : 300;
            var h = Math.round(w * 0.35); // ~35% aspect ratio
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
            }
        }
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        function pos(e) {
            var r = canvas.getBoundingClientRect();
            var sx = canvas.width / r.width, sy = canvas.height / r.height;
            var t = e.touches ? e.touches[0] : e;
            return { x: (t.clientX - r.left) * sx, y: (t.clientY - r.top) * sy };
        }
        function start(e) { e.preventDefault(); drawing = true; var p = pos(e); lx = p.x; ly = p.y; }
        function draw(e) {
            if (!drawing) return; e.preventDefault();
            var p = pos(e);
            ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(p.x, p.y);
            ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke();
            lx = p.x; ly = p.y;
        }
        function stop() { drawing = false; }

        canvas.addEventListener('mousedown', start);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stop);
        canvas.addEventListener('mouseleave', stop);
        canvas.addEventListener('touchstart', start, { passive: false });
        canvas.addEventListener('touchmove', draw, { passive: false });
        canvas.addEventListener('touchend', stop);
    })();

    function clearSignature() {
        var c = document.getElementById('sig-canvas');
        if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
    }
    document.getElementById('btn-clear-sig').addEventListener('click', clearSignature);

    function isSignatureEmpty() {
        var c = document.getElementById('sig-canvas');
        if (!c) return true;
        var b = document.createElement('canvas');
        b.width = c.width; b.height = c.height;
        return c.toDataURL() === b.toDataURL();
    }

    function getSignatureDataURL() {
        var c = document.getElementById('sig-canvas');
        return c ? c.toDataURL('image/png') : null;
    }

    // --- PHOTO ---
    document.getElementById('btn-take-photo').addEventListener('click', function() {
        document.getElementById('confirm-photo').click();
    });
    document.getElementById('confirm-photo').addEventListener('change', function(e) {
        var f = e.target.files[0];
        if (f) {
            var reader = new FileReader();
            reader.onload = function(ev) {
                document.getElementById('photo-preview').src = ev.target.result;
                document.getElementById('photo-preview').style.display = 'block';
                document.getElementById('photo-status').textContent = '✅ Foto lista';
            };
            reader.readAsDataURL(f);
        }
    });

    // --- MAP (LEAFLET) ---
    async function initMap() {
        var container = document.getElementById('route-map');
        if (!container) return;

        if (!leafletMap) {
            leafletMap = L.map('route-map').setView([36.72, -4.42], 12);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap'
            }).addTo(leafletMap);
        }

        mapMarkers.forEach(function(m) { leafletMap.removeLayer(m); });
        mapMarkers = [];
        if (window._routeLine) { leafletMap.removeLayer(window._routeLine); window._routeLine = null; }

        if (deliveries.length === 0) {
            showToast('No hay entregas para mostrar en el mapa.', 'info');
            return;
        }

        var pending = deliveries.filter(function(d) { return d.status !== 'Entregado' && !d.delivered; });
        var delivered = deliveries.filter(function(d) { return d.status === 'Entregado' || d.delivered; });
        var routeCoords = [];
        var allDeliveries = [].concat(pending, delivered);

        function makeIcon(color, label) {
            return L.divIcon({
                className: '',
                html: '<div style="background:' + color + '; color:white; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:0.75rem; border:2px solid white; box-shadow:0 2px 6px rgba(0,0,0,0.4);">' + (label || '') + '</div>',
                iconSize: [28, 28],
                iconAnchor: [14, 14],
                popupAnchor: [0, -16]
            });
        }

        // Helper: geocode with fallback (full addr → locality+cp → province)
        async function geocodeWithFallback(d) {
            if (d._lat && d._lon) return true;

            // Attempt 1: full address
            var parts1 = [d.address, d.localidad, d.cp, d.province, 'España'].filter(Boolean);
            if (parts1.length > 1) {
                await tryGeocode(d, parts1.join(', '));
                if (d._lat) return true;
            }
            // Attempt 2: locality + cp + province
            var parts2 = [d.localidad, d.cp, d.province, 'España'].filter(Boolean);
            if (parts2.length > 1 && parts2.join(',') !== parts1.join(',')) {
                await tryGeocode(d, parts2.join(', '));
                if (d._lat) return true;
            }
            // Attempt 3: just address field as-is
            if (d.address && d.address.length > 5) {
                await tryGeocode(d, d.address + ', España');
                if (d._lat) return true;
            }
            return false;
        }

        async function tryGeocode(d, addr) {
            if (!addr || addr.trim() === 'España') return;
            if (geocodeCache[addr]) {
                d._lat = geocodeCache[addr].lat;
                d._lon = geocodeCache[addr].lon;
                return;
            }
            try {
                var res = await fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(addr) + '&limit=1&countrycodes=es');
                var data = await res.json();
                if (data.length > 0) {
                    d._lat = parseFloat(data[0].lat);
                    d._lon = parseFloat(data[0].lon);
                    geocodeCache[addr] = { lat: d._lat, lon: d._lon };
                }
            } catch (e) { console.warn('Geocode error:', addr, e); }
        }

        // Show loading feedback
        showToast('🗺️ Cargando mapa: 0/' + allDeliveries.length + ' direcciones...', 'info');

        // Process SEQUENTIALLY with delay to respect Nominatim rate limit
        var geocoded = 0;
        var failed = 0;
        for (var i = 0; i < allDeliveries.length; i++) {
            var d = allDeliveries[i];
            var success = await geocodeWithFallback(d);
            
            if (success && d._lat && d._lon) {
                var isDelivered = d.status === 'Entregado' || d.delivered;
                var pkgCount = getPackageCount(d);
                var pendingIdx = pending.indexOf(d);
                var icon = isDelivered
                    ? makeIcon('#4CD964', '✓')
                    : makeIcon('#FF6600', String(pendingIdx + 1));

                var marker = L.marker([d._lat, d._lon], { icon: icon }).addTo(leafletMap);
                marker.bindPopup(
                    '<div style="min-width:160px;">' +
                    '<b style="font-size:0.9rem;">' + (d.receiver || '') + '</b><br>' +
                    '<span style="color:#666;">' + [d.address, d.localidad, d.cp].filter(Boolean).join(', ') + '</span><br>' +
                    '📦 ' + pkgCount + ' bultos<br>' +
                    '<span style="font-weight:700; color:' + (isDelivered ? '#4CD964' : '#FF6600') + ';">' +
                    (isDelivered ? '✅ ENTREGADO' : '⏳ PENDIENTE (#' + (pendingIdx + 1) + ')') +
                    '</span></div>'
                );
                mapMarkers.push(marker);

                if (!isDelivered) {
                    routeCoords[pendingIdx] = [d._lat, d._lon];
                }
                geocoded++;
            } else {
                failed++;
                console.warn('Geocode failed for:', d.receiver, [d.address, d.localidad, d.cp, d.province].filter(Boolean).join(', '));
            }

            // Update progress every 3 items
            if ((i + 1) % 3 === 0 || i === allDeliveries.length - 1) {
                showToast('🗺️ Mapa: ' + (i + 1) + '/' + allDeliveries.length + ' (' + geocoded + ' ok, ' + failed + ' sin ubicar)', 'info');
            }

            // Rate limit: wait 350ms between geocode API calls (Nominatim allows ~1/sec)
            if (i < allDeliveries.length - 1 && !allDeliveries[i + 1]._lat) {
                await new Promise(function(resolve) { setTimeout(resolve, 350); });
            }
        }

        // Final: fit bounds and draw route
        if (mapMarkers.length > 0) {
            var group = L.featureGroup(mapMarkers);
            leafletMap.fitBounds(group.getBounds().pad(0.1));

            var orderedCoords = routeCoords.filter(Boolean);
            if (orderedCoords.length > 1) {
                window._routeLine = L.polyline(orderedCoords, {
                    color: '#FF6600', weight: 3, opacity: 0.6, dashArray: '8, 6'
                }).addTo(leafletMap);
            }
        }

        showToast('\u2705 Mapa completo: ' + geocoded + ' ubicadas' + (failed > 0 ? ', ' + failed + ' sin localizar' : ''), failed > 0 ? 'warning' : 'success');

        // --- ADD PICKUP/ALERT MARKERS ---
        if (_driverAlerts && _driverAlerts.length > 0) {
            var alertsWithAddr = _driverAlerts.filter(function(a) { return a.address; });
            if (alertsWithAddr.length > 0) {
                showToast('\ud83d\udce5 Cargando ' + alertsWithAddr.length + ' recogida(s) en mapa...', 'info');
            }
            for (var ai = 0; ai < alertsWithAddr.length; ai++) {
                var alert = alertsWithAddr[ai];
                var alertCoords = null;

                // Geocode the alert address
                var alertAddr = alert.address + ', Espa\u00f1a';
                if (geocodeCache[alertAddr]) {
                    alertCoords = geocodeCache[alertAddr];
                } else {
                    try {
                        var ares = await fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(alertAddr) + '&limit=1&countrycodes=es');
                        var adata = await ares.json();
                        if (adata.length > 0) {
                            alertCoords = { lat: parseFloat(adata[0].lat), lon: parseFloat(adata[0].lon) };
                            geocodeCache[alertAddr] = alertCoords;
                        }
                    } catch(e) { console.warn('Alert geocode error:', e); }
                    if (ai < alertsWithAddr.length - 1) {
                        await new Promise(function(resolve) { setTimeout(resolve, 350); });
                    }
                }

                if (alertCoords) {
                    var aTypeIcon = alert.type === 'recogida' ? '\ud83d\udce5' : (alert.type === 'entrega_urgente' ? '\ud83d\udea8' : '\ud83d\udce2');
                    var aColor = alert.type === 'recogida' ? '#FF9800' : (alert.type === 'entrega_urgente' ? '#FF3B30' : '#2196F3');
                    var aLabel = alert.type === 'recogida' ? 'RECOGIDA' : (alert.type === 'entrega_urgente' ? 'URGENTE' : 'AVISO');
                    var alertIcon = L.divIcon({
                        className: '',
                        html: '<div style="background:' + aColor + '; color:white; width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.1rem; border:3px solid white; box-shadow:0 2px 10px ' + aColor + '88; animation:pulse 1.5s infinite;">' + aTypeIcon + '</div>',
                        iconSize: [34, 34],
                        iconAnchor: [17, 17],
                        popupAnchor: [0, -20]
                    });
                    var aMarker = L.marker([alertCoords.lat, alertCoords.lon], { icon: alertIcon }).addTo(leafletMap);
                    aMarker.bindPopup(
                        '<div style="min-width:180px;">' +
                        '<b style="font-size:0.9rem; color:' + aColor + ';">' + aTypeIcon + ' ' + aLabel + '</b><br>' +
                        '<span style="color:#333;">' + alert.address + '</span><br>' +
                        (alert.notes ? '<span style="color:#666; font-size:0.85em;">\ud83d\udcdd ' + alert.notes + '</span><br>' : '') +
                        '<a href="https://www.google.com/maps/search/' + encodeURIComponent(alert.address) + '" target="_blank" style="color:#1a73e8; font-weight:700; font-size:0.85em;">Navegar \u2192</a>' +
                        '</div>'
                    );
                    mapMarkers.push(aMarker);
                }
            }
            // Re-fit bounds to include alert markers
            if (mapMarkers.length > 0) {
                var allGroup = L.featureGroup(mapMarkers);
                leafletMap.fitBounds(allGroup.getBounds().pad(0.1));
            }
        }
    }

    window.addEventListener('resize', function() {
        if (leafletMap) leafletMap.invalidateSize();
    });

    // --- LIMPIAR JORNADA: Eliminar entregados de la ruta del repartidor ---
    async function clearDeliveredFromRoute() {
        var delivered = deliveries.filter(function(d) { return d.status === 'Entregado' || d.delivered; });
        if (delivered.length === 0) {
            showToast('No hay entregas entregadas para limpiar.', 'info');
            return;
        }
        showLoading();
        try {
            var batch = db.batch();
            var count = 0;
            delivered.forEach(function(d) {
                var ref = d._ref || db.collection('tickets').doc(d._id);
                batch.update(ref, { driverPhone: firebase.firestore.FieldValue.delete() });
                count++;
            });
            await batch.commit();
            showToast('\u2705 ' + count + ' entrega(s) limpiada(s) de tu ruta.', 'success');
        } catch (e) {
            console.error('Error limpiando jornada:', e);
            showToast('Error al limpiar: ' + e.message, 'error');
        } finally {
            hideLoading();
        }
    }
    window.clearDeliveredFromRoute = clearDeliveredFromRoute;

    // Botón "Limpiar Jornada"
    var btnClean = document.getElementById('btn-clean-route');
    if (btnClean) {
        btnClean.addEventListener('click', function() {
            var delivered = deliveries.filter(function(d) { return d.status === 'Entregado' || d.delivered; });
            if (delivered.length === 0) {
                showToast('No hay entregas entregadas para limpiar.', 'info');
                return;
            }
            if (confirm('\u00bfLimpiar ' + delivered.length + ' albar\u00e1n(es) entregados de tu ruta?\n\nLos pendientes se mantendr\u00e1n.')) {
                clearDeliveredFromRoute();
            }
        });
    }

    // --- LIMPIEZA AUTOMÁTICA CADA 8 HORAS ---
    (function schedulePeriodicClean() {
        var INTERVAL_MS = 8 * 60 * 60 * 1000; // 8 horas

        // Ejecutar la primera limpieza tras 5 minutos (dar tiempo a que cargue todo)
        setTimeout(function() {
            console.log('[REPARTO] Limpieza automática inicial ejecutándose...');
            clearDeliveredFromRoute();
        }, 5 * 60 * 1000);

        // Repetir cada 8 horas
        setInterval(function() {
            console.log('[REPARTO] Limpieza automática periódica (cada 8h) ejecutándose...');
            clearDeliveredFromRoute();
        }, INTERVAL_MS);

        console.log('[REPARTO] Limpieza automática programada cada 8 horas.');
    })();

    // ============================================================
    //  COOPER PHOTO — Recogidas & Entregas
    // ============================================================
    var _cooperType = null; // 'recogida' or 'entrega'

    window.openCooperPhoto = function(type) {
        _cooperType = type;
        var modal = document.getElementById('cooper-modal');
        var title = document.getElementById('cooper-modal-title');
        if (!modal) return;
        if (type === 'recogida') {
            title.innerHTML = '<span style="font-size:1.3rem;">📥</span> RECOGIDA COOPER';
            title.style.color = '#FF9800';
        } else {
            title.innerHTML = '<span style="font-size:1.3rem;">📤</span> ENTREGA COOPER';
            title.style.color = '#4CAF50';
        }
        // Reset
        document.getElementById('cooper-photo-preview').style.display = 'none';
        document.getElementById('cooper-photo-preview').src = '';
        document.getElementById('cooper-photo-input').value = '';
        document.getElementById('cooper-photo-status').textContent = 'Sin foto';
        document.getElementById('btn-cooper-send').style.display = 'none';
        var noteEl = document.getElementById('cooper-note');
        if (noteEl) noteEl.value = '';
        modal.classList.add('active');
    };

    // Camera button
    document.getElementById('btn-cooper-camera').addEventListener('click', function() {
        document.getElementById('cooper-photo-input').click();
    });

    // Photo selected
    document.getElementById('cooper-photo-input').addEventListener('change', function(e) {
        var f = e.target.files[0];
        if (f) {
            var reader = new FileReader();
            reader.onload = function(ev) {
                document.getElementById('cooper-photo-preview').src = ev.target.result;
                document.getElementById('cooper-photo-preview').style.display = 'block';
                document.getElementById('cooper-photo-status').textContent = 'Foto lista';
                document.getElementById('btn-cooper-send').style.display = 'block';
            };
            reader.readAsDataURL(f);
        }
    });

    // Cancel
    document.getElementById('btn-cooper-cancel').addEventListener('click', function() {
        document.getElementById('cooper-modal').classList.remove('active');
        _cooperType = null;
    });

    // Send photo
    document.getElementById('btn-cooper-send').addEventListener('click', async function() {
        var photoFile = document.getElementById('cooper-photo-input').files[0];
        if (!photoFile) { showToast('Haz una foto primero', 'error'); return; }

        var sendBtn = document.getElementById('btn-cooper-send');
        sendBtn.disabled = true;
        sendBtn.textContent = 'Comprimiendo...';

        try {
            photoFile = await compressImage(photoFile);
            sendBtn.textContent = 'Subiendo...';
            var ts = Date.now();
            var storagePath = 'cooper/' + _cooperType + '/' + ts + '.jpg';
            var photoRef = storage.ref(storagePath);
            await photoRef.put(photoFile, { contentType: photoFile.type });
            var photoURL = await photoRef.getDownloadURL();

            // Save record to Firestore
            var noteVal = (document.getElementById('cooper-note') ? document.getElementById('cooper-note').value : '').trim();
            await db.collection('cooper_photos').add({
                type: _cooperType,
                photoURL: photoURL,
                storagePath: storagePath,
                note: noteVal,
                route: currentRouteLabel || 'Sin ruta',
                driverName: currentDriverName || 'Desconocido',
                driverPhone: currentDriverPhone || '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                timestamp: ts
            });

            showToast((_cooperType === 'recogida' ? 'Recogida' : 'Entrega') + ' Cooper registrada', 'success');
            document.getElementById('cooper-modal').classList.remove('active');
            _cooperType = null;
            // Refresh counters and log
            cooperUpdateCounters();
            if (document.getElementById('cooper-log-panel').style.display !== 'none') {
                loadCooperLog();
            }
        } catch(err) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            sendBtn.disabled = false;
            sendBtn.textContent = 'ENVIAR FOTO';
        }
    });

    // =============================================
    //  COOPER COUNTERS + DAILY FOLDER ARCHIVE
    // =============================================
    var _cooperLogOpen = false;
    var _cooperAllItems = []; // cached from last load
    var _cooperOpenDay = null; // null = folders view, 'YYYY-MM-DD' = open folder

    // Update today's counters on buttons
    window.cooperUpdateCounters = async function() {
        try {
            var snap = await db.collection('cooper_photos')
                .where('driverName', '==', currentDriverName || 'Desconocido')
                .get();
            var today = new Date().toLocaleDateString('es-ES');
            var recCount = 0, entCount = 0;
            _cooperAllItems = [];
            snap.forEach(function(doc) {
                var item = doc.data(); item.docId = doc.id;
                var d = item.createdAt ? (typeof item.createdAt.toDate === 'function' ? item.createdAt.toDate() : new Date(item.createdAt)) : new Date(item.timestamp || 0);
                _cooperAllItems.push({ data: item, date: d });
                if (d.toLocaleDateString('es-ES') === today) {
                    if (item.type === 'recogida') recCount++;
                    else entCount++;
                }
            });
            _cooperAllItems.sort(function(a, b) { return b.date - a.date; });
            var cR = document.getElementById('cooper-count-recogida');
            var cE = document.getElementById('cooper-count-entrega');
            if (cR) cR.textContent = recCount;
            if (cE) cE.textContent = entCount;
        } catch(e) { console.warn('[Cooper] Counter error:', e.message); }
    };

    window.toggleCooperLog = function() {
        var panel = document.getElementById('cooper-log-panel');
        var arrow = document.getElementById('cooper-log-arrow');
        _cooperLogOpen = !_cooperLogOpen;
        if (_cooperLogOpen) {
            panel.style.display = 'block';
            arrow.style.transform = 'rotate(180deg)';
            _cooperOpenDay = null;
            loadCooperLog();
        } else {
            panel.style.display = 'none';
            arrow.style.transform = 'rotate(0deg)';
        }
    };

    window.cooperOpenDay = function(dayKey) {
        _cooperOpenDay = dayKey;
        _renderCooperLogContent();
    };

    window.cooperBackToFolders = function() {
        _cooperOpenDay = null;
        _renderCooperLogContent();
    };

    window.loadCooperLog = async function() {
        var panel = document.getElementById('cooper-log-panel');
        if (!panel) return;
        panel.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">Cargando...</div>';
        await cooperUpdateCounters();
        _renderCooperLogContent();
    };

    function _renderCooperLogContent() {
        var panel = document.getElementById('cooper-log-panel');
        if (!panel) return;

        if (_cooperAllItems.length === 0) {
            panel.innerHTML = '<div style="text-align:center; padding:20px; color:#666; font-size:0.82rem;">No hay registros Cooper</div>';
            return;
        }

        // Group by day
        var dayGroups = {};
        _cooperAllItems.forEach(function(entry) {
            var dayKey = entry.date.toISOString().split('T')[0];
            var dayLabel = entry.date.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });
            if (!dayGroups[dayKey]) dayGroups[dayKey] = { label: dayLabel, items: [] };
            dayGroups[dayKey].items.push(entry);
        });
        var dayKeys = Object.keys(dayGroups).sort().reverse();

        // If a folder is open, show its photos
        if (_cooperOpenDay && dayGroups[_cooperOpenDay]) {
            var folder = dayGroups[_cooperOpenDay];
            var html = '';
            html += '<div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">';
            html += '<button onclick="cooperBackToFolders()" style="background:#2a2a2d; border:1px solid #444; color:#2196F3; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:0.78rem; display:flex; align-items:center; gap:4px;">';
            html += '<span style="font-size:0.9rem;">←</span> Volver</button>';
            html += '<span style="color:#FF9800; font-weight:700; font-size:0.82rem; text-transform:capitalize;">📂 ' + folder.label + '</span>';
            html += '<span style="color:#666; font-size:0.72rem;">(' + folder.items.length + ')</span>';
            html += '</div>';

            folder.items.forEach(function(entry) {
                var d = entry.date;
                var time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                var typeIcon = entry.data.type === 'recogida' ? '📥' : '📤';
                var typeLabel = entry.data.type === 'recogida' ? 'Recogida' : 'Entrega';
                var shift = d.getHours() < 14 ? '☀️' : '🌙';

                html += '<div style="display:flex; align-items:center; gap:8px; padding:8px; background:rgba(255,255,255,0.03); border-radius:8px; margin-bottom:6px; border:1px solid #222;">';
                html += '<a href="' + (entry.data.photoURL || '#') + '" target="_blank" style="flex-shrink:0;">';
                html += '<img src="' + (entry.data.photoURL || '') + '" style="width:52px; height:52px; object-fit:cover; border-radius:8px; border:1px solid #333;" loading="lazy">';
                html += '</a>';
                html += '<div style="flex:1; min-width:0;">';
                html += '<div style="font-size:0.8rem; color:#ddd;">' + typeIcon + ' ' + typeLabel + ' <span style="color:#888;">' + shift + ' ' + time + '</span></div>';
                if (entry.data.note) {
                    html += '<div style="font-size:0.72rem; color:#999; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">📝 ' + entry.data.note + '</div>';
                }
                html += '</div>';
                // WhatsApp button
                var waMsg = '📦 Cooper ' + typeLabel + '\n📅 ' + folder.label + ' ' + time + '\n🚛 ' + (entry.data.route || 'Sin ruta') + '\n👤 ' + (entry.data.driverName || '') + (entry.data.note ? '\n📝 ' + entry.data.note : '') + '\n\n' + (entry.data.photoURL || '');
                html += '<a href="https://wa.me/?text=' + encodeURIComponent(waMsg) + '" target="_blank" style="flex-shrink:0; background:#25D366; color:#fff; padding:4px 8px; border-radius:6px; font-size:0.7rem; text-decoration:none; display:flex; align-items:center; gap:3px;">📲</a>';
                html += '</div>';
            });

            panel.innerHTML = html;
            return;
        }

        // Folder view
        var html = '';
        dayKeys.forEach(function(dayKey) {
            var folder = dayGroups[dayKey];
            var recCount = 0, entCount = 0;
            folder.items.forEach(function(e) {
                if (e.data.type === 'recogida') recCount++; else entCount++;
            });
            var isToday = dayKey === new Date().toISOString().split('T')[0];

            html += '<div onclick="cooperOpenDay(\'' + dayKey + '\')" style="display:flex; align-items:center; gap:10px; padding:10px 12px; background:' + (isToday ? 'rgba(255,152,0,0.08)' : 'rgba(255,255,255,0.02)') + '; border:1px solid ' + (isToday ? 'rgba(255,152,0,0.3)' : '#222') + '; border-radius:8px; margin-bottom:6px; cursor:pointer;" ontouchstart="this.style.background=\'rgba(255,152,0,0.15)\'" ontouchend="this.style.background=\'' + (isToday ? 'rgba(255,152,0,0.08)' : 'rgba(255,255,255,0.02)') + '\'">';
            html += '<span style="font-size:1.4rem;">📁</span>';
            html += '<div style="flex:1; min-width:0;">';
            html += '<div style="font-size:0.82rem; color:#ddd; font-weight:600; text-transform:capitalize;">' + folder.label + (isToday ? ' <span style="color:#FF9800; font-size:0.7rem;">(HOY)</span>' : '') + '</div>';
            html += '<div style="font-size:0.72rem; color:#888; display:flex; gap:10px; margin-top:2px;">';
            html += '<span>📥 ' + recCount + ' recogidas</span>';
            html += '<span>📤 ' + entCount + ' entregas</span>';
            html += '<span>📷 ' + folder.items.length + ' total</span>';
            html += '</div></div>';
            html += '<span style="color:#555; font-size:1rem;">›</span>';
            html += '</div>';
        });

        panel.innerHTML = html;
    }

    // Load counters on app init (after route selection)
    var _counterInterval = setInterval(function() {
        if (currentDriverName) {
            clearInterval(_counterInterval);
            cooperUpdateCounters();
        }
    }, 2000);

} // END initApp
})();
