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

function sendNotification(title, body) {
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
        banner.innerHTML = '📦 <span style="text-decoration:underline;">' + title + '</span> — ' + body + ' <span style="opacity:0.7; font-size:0.75rem; margin-left:10px;">(toca para cerrar)</span>';
        banner.onclick = function() { banner.remove(); };
        document.body.appendChild(banner);
        // Auto-remove after 20s
        setTimeout(function() { if (banner.parentNode) banner.remove(); }, 20000);
    } catch (e) {}
}

// --- TOAST SYSTEM ---
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
    setTimeout(function() {
        t.classList.add('hide');
        setTimeout(function() { t.remove(); }, 300);
    }, duration);
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

    // --- AUTH STATE ---
    auth.onAuthStateChanged(async function(user) {
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
        document.getElementById('driver-name').textContent = currentDriverName;
        document.getElementById('main-app').style.display = 'block';

        try {
            var savedOrder = localStorage.getItem('routeOrder_' + currentDriverName);
            if (savedOrder) manualOrder = JSON.parse(savedOrder);
        } catch(e) { console.warn('Error loading route order:', e); }

        startDeliveryListener();
        startPickupListener();
        requestNotificationPermission();
        showToast('Bienvenido, ' + currentDriverName, 'success');
    }

    // --- LOGOUT ---
    document.getElementById('btn-logout').addEventListener('click', function() {
        if (confirm('¿Cerrar sesión?')) {
            stopScanner();
            auth.signOut();
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
                if (err.code === 'failed-precondition') {
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
        var total = deliveries.length;
        var pending = deliveries.filter(function(d) { return d.status !== 'Entregado' && !d.delivered; }).length;
        var delivered = deliveries.filter(function(d) { return d.status === 'Entregado' || d.delivered; }).length;
        document.getElementById('stat-total').textContent = total;
        document.getElementById('stat-pending').textContent = pending;
        document.getElementById('stat-delivered').textContent = delivered;
    }

    // --- FILTERS ---
    document.querySelectorAll('.filter-chip').forEach(function(chip) {
        chip.addEventListener('click', function() {
            document.querySelectorAll('.filter-chip').forEach(function(c) { c.classList.remove('active'); });
            chip.classList.add('active');
            currentFilter = chip.dataset.filter;
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

    // --- REPORT INCIDENT ---
    async function reportIncident(d) {
        var reason = prompt('⚠️ REPORTAR INCIDENCIA\n\nIndica el motivo de la incidencia para el albarán ' + (d.id || d._id) + ':\n\nEjemplos: Dirección incorrecta, Ausente, Rechazado, Daño en mercancía, etc.');
        if (!reason || !reason.trim()) return;
        
        showLoading();
        try {
            var docRef = d._ref || db.collection('tickets').doc(d._id);
            await docRef.update({
                status: 'Incidencia',
                incidentReason: reason.trim(),
                incidentReportedBy: currentDriverName,
                incidentReportedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            closeModal();
            showToast('⚠️ Incidencia reportada: ' + (d.id || d._id), 'warning');
        } catch (e) {
            showToast('Error reportando incidencia: ' + e.message, 'error');
        } finally {
            hideLoading();
        }
    }

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
                    if (snap2.empty) { showToast('Albarán no encontrado: ' + searchId, 'error'); hideLoading(); return; }
                    doc = snap2.docs[0];
                } else {
                    doc = snap.docs[0];
                }
            }

            var d = doc.data();
            d._id = doc.id;
            d._ref = doc.ref;
            currentScanDoc = d;

            // Calculate total packages from ticket data
            var totalPkgs = d.packagesList ? d.packagesList.reduce(function(s, p) { return s + (parseInt(p.qty) || 1); }, 0) : (parseInt(d.packages) || 1);
            if (pkgTotal > 0) totalPkgs = pkgTotal; // trust QR if present
            currentPkgTotal = totalPkgs;

            // Initialize scanned set for this ticket if needed
            var ticketKey = d.id || d._id;
            if (!scannedPackages[ticketKey]) {
                scannedPackages[ticketKey] = new Set();
            }

            // Register scanned package
            if (pkgNum > 0) {
                if (scannedPackages[ticketKey].has(pkgNum)) {
                    showToast('📦 Bulto ' + pkgNum + '/' + totalPkgs + ' ya escaneado.', 'info');
                } else {
                    scannedPackages[ticketKey].add(pkgNum);
                    showToast('📦 Bulto ' + pkgNum + '/' + totalPkgs + ' escaneado ✅', 'success');
                }
            } else {
                // Old QR format without PKG — mark ALL as scanned
                for (var i = 1; i <= totalPkgs; i++) scannedPackages[ticketKey].add(i);
                showToast('Albarán encontrado: ' + ticketKey, 'success');
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
        statusEl.textContent = isDelivered ? 'ENTREGADO' : 'PENDIENTE';
        statusEl.className = 'dc-status ' + (isDelivered ? 'delivered' : 'pending');

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
        if (isDelivered) {
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
            deliveryData.billingReady = true;

            // Upload signature (with timeout, non-blocking on failure)
            try {
                var sigData = getSignatureDataURL();
                if (sigData) {
                    var sigBlob = await (await fetch(sigData)).blob();
                    var sigRef = storage.ref('deliveries/' + docId + '/signature.png');
                    await withTimeout(sigRef.put(sigBlob, { contentType: 'image/png' }), 15000, 'Firma');
                    deliveryData.signatureURL = await withTimeout(sigRef.getDownloadURL(), 5000, 'Firma URL');
                }
            } catch (sigErr) {
                console.warn('Signature upload failed (will save delivery anyway):', sigErr);
                showToast('⚠️ Firma no guardada, pero la entrega se registrará.', 'warning');
            }

            // Upload photo (with timeout, non-blocking on failure)
            try {
                var photoFile = document.getElementById('confirm-photo').files[0];
                if (photoFile) {
                    var ext = photoFile.name.split('.').pop() || 'jpg';
                    var photoRef = storage.ref('deliveries/' + docId + '/photo.' + ext);
                    await withTimeout(photoRef.put(photoFile, { contentType: photoFile.type }), 20000, 'Foto');
                    deliveryData.photoURL = await withTimeout(photoRef.getDownloadURL(), 5000, 'Foto URL');
                }
            } catch (photoErr) {
                console.warn('Photo upload failed (will save delivery anyway):', photoErr);
            }

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

    // --- SIGNATURE CANVAS ---
    (function() {
        var canvas = document.getElementById('sig-canvas');
        if (!canvas) return;
        var ctx = canvas.getContext('2d');
        var drawing = false, lx = 0, ly = 0;

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

        showToast('✅ Mapa completo: ' + geocoded + ' ubicadas' + (failed > 0 ? ', ' + failed + ' sin localizar' : ''), failed > 0 ? 'warning' : 'success');
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

    // --- LIMPIEZA AUTOMÁTICA A MEDIANOCHE ---
    (function scheduleMidnightClean() {
        var now = new Date();
        var midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0); // próxima medianoche
        var msUntilMidnight = midnight.getTime() - now.getTime();

        setTimeout(function() {
            console.log('[REPARTO] Limpieza automática de medianoche ejecutándose...');
            clearDeliveredFromRoute();
            // Reprogramar para la siguiente medianoche
            setInterval(function() {
                console.log('[REPARTO] Limpieza automática diaria ejecutándose...');
                clearDeliveredFromRoute();
            }, 24 * 60 * 60 * 1000);
        }, msUntilMidnight);

        console.log('[REPARTO] Limpieza automática programada en ' + Math.round(msUntilMidnight / 60000) + ' minutos (medianoche).');
    })();

} // END initApp
})();
