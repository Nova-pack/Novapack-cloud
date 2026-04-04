// =============================================
// NOVAPACK — Comunicaciones Masivas v1.0
// =============================================
// Detect active clients, compose messages, send
// email campaigns + in-app notifications.
// =============================================

(function() {
    'use strict';

    let _activeClients = [];   // [{uid, name, email, adminEmail, idNum, ticketCount, selected}]
    let _campaignHistory = [];

    // --- LOAD ---
    window.loadComunicaciones = function() {
        comLoadHistory();
    };

    // --- DETECT ACTIVE CLIENTS ---
    window.comDetectActiveClients = async function() {
        const listEl = document.getElementById('com-client-list');
        const summaryEl = document.getElementById('com-client-summary');
        if (!listEl) return;

        listEl.innerHTML = '<div style="padding:20px; text-align:center; color:#aaa;">Analizando albaranes del periodo...</div>';
        summaryEl.style.display = 'none';

        try {
            const period = document.getElementById('com-period').value;
            const minTickets = parseInt(document.getElementById('com-min-tickets').value) || 1;

            // Calculate date threshold
            const now = new Date();
            let since;
            switch (period) {
                case '6m': since = new Date(now.getFullYear(), now.getMonth() - 6, 1); break;
                case '3m': since = new Date(now.getFullYear(), now.getMonth() - 3, 1); break;
                case '1m': since = new Date(now.getFullYear(), now.getMonth() - 1, 1); break;
                default:   since = new Date(now.getFullYear(), 0, 1); break; // year
            }

            // Query tickets created since threshold
            const snap = await db.collection('tickets')
                .where('createdAt', '>=', since)
                .get();

            // Count tickets per UID
            const uidCounts = {};
            snap.forEach(function(doc) {
                var d = doc.data();
                var uid = d.uid || d.userId;
                if (!uid) return;
                uidCounts[uid] = (uidCounts[uid] || 0) + 1;
            });

            // Filter by minimum ticket count
            const activeUids = Object.entries(uidCounts)
                .filter(function(e) { return e[1] >= minTickets; })
                .sort(function(a, b) { return b[1] - a[1]; });

            if (activeUids.length === 0) {
                listEl.innerHTML = '<div style="padding:20px; text-align:center; color:#888;">No se encontraron clientes activos con esos criterios.</div>';
                _activeClients = [];
                return;
            }

            // Fetch user details
            var usersSnap = await db.collection('users').get();
            var userMap = {};
            usersSnap.forEach(function(doc) {
                userMap[doc.id] = doc.data();
            });

            _activeClients = [];
            activeUids.forEach(function(entry) {
                var uid = entry[0];
                var count = entry[1];
                var u = userMap[uid];
                if (!u) return;
                if (u.isGlobal) return; // Skip global/system accounts
                var email = u.adminEmail || u.email || '';
                _activeClients.push({
                    uid: uid,
                    name: u.name || '',
                    email: email,
                    adminEmail: u.adminEmail || '',
                    idNum: u.idNum || u.clientNumber || '',
                    ticketCount: count,
                    selected: !!email // Auto-select clients that have email
                });
            });

            _renderClientList();

        } catch (err) {
            console.error('[COM] Error detecting active clients:', err);
            listEl.innerHTML = '<div style="padding:20px; text-align:center; color:#FF5252;">Error: ' + err.message + '</div>';
        }
    };

    function _renderClientList() {
        var listEl = document.getElementById('com-client-list');
        var summaryEl = document.getElementById('com-client-summary');

        if (_activeClients.length === 0) {
            listEl.innerHTML = '<div style="padding:20px; text-align:center; color:#888;">No hay clientes.</div>';
            summaryEl.style.display = 'none';
            return;
        }

        var withEmail = _activeClients.filter(function(c) { return !!c.email; }).length;
        var selected = _activeClients.filter(function(c) { return c.selected; }).length;
        var noEmail = _activeClients.length - withEmail;

        summaryEl.style.display = 'block';
        summaryEl.innerHTML = '<strong>' + _activeClients.length + '</strong> clientes activos detectados &mdash; ' +
            '<strong>' + selected + '</strong> seleccionados &mdash; ' +
            '<strong>' + withEmail + '</strong> con email' +
            (noEmail > 0 ? ' &mdash; <span style="color:#FF5252;">' + noEmail + ' sin email</span>' : '');

        var html = '<table style="width:100%; border-collapse:collapse; font-size:0.82rem;">';
        html += '<thead><tr style="background:#1a1a2e; position:sticky; top:0; z-index:1;">';
        html += '<th style="padding:8px; width:36px; text-align:center;"><input type="checkbox" ' + (selected === _activeClients.length ? 'checked' : '') + ' onchange="comToggleAll(this.checked)" style="accent-color:#FF9800; cursor:pointer;"></th>';
        html += '<th style="padding:8px; text-align:left; color:#aaa;">Cliente</th>';
        html += '<th style="padding:8px; text-align:left; color:#aaa;">Email</th>';
        html += '<th style="padding:8px; text-align:center; color:#aaa;">Albaranes</th>';
        html += '</tr></thead><tbody>';

        _activeClients.forEach(function(c, i) {
            var bg = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)';
            var emailColor = c.email ? '#d4d4d4' : '#FF5252';
            html += '<tr style="background:' + bg + '; border-bottom:1px solid #222;">';
            html += '<td style="padding:6px 8px; text-align:center;"><input type="checkbox" data-idx="' + i + '" ' + (c.selected ? 'checked' : '') + ' onchange="comToggleClient(' + i + ', this.checked)" style="accent-color:#FF9800; cursor:pointer;"' + (!c.email ? ' disabled title="Sin email"' : '') + '></td>';
            html += '<td style="padding:6px 8px;"><span style="color:#FF9800; font-weight:bold; margin-right:5px;">' + (c.idNum || '-') + '</span> ' + (c.name || 'Sin nombre') + '</td>';
            html += '<td style="padding:6px 8px; color:' + emailColor + ';">' + (c.email || 'Sin email') + '</td>';
            html += '<td style="padding:6px 8px; text-align:center; color:#4CAF50; font-weight:bold;">' + c.ticketCount + '</td>';
            html += '</tr>';
        });

        html += '</tbody></table>';
        listEl.innerHTML = html;

        // Update stats
        var statsEl = document.getElementById('com-stats');
        if (statsEl) {
            statsEl.innerHTML =
                '<div style="background:rgba(76,175,80,0.1); border:1px solid rgba(76,175,80,0.3); border-radius:8px; padding:8px 14px; text-align:center;">' +
                '<div style="font-size:1.3rem; font-weight:900; color:#4CAF50;">' + _activeClients.length + '</div>' +
                '<div style="font-size:0.7rem; color:#aaa;">Activos</div></div>' +
                '<div style="background:rgba(255,152,0,0.1); border:1px solid rgba(255,152,0,0.3); border-radius:8px; padding:8px 14px; text-align:center;">' +
                '<div style="font-size:1.3rem; font-weight:900; color:#FF9800;">' + selected + '</div>' +
                '<div style="font-size:0.7rem; color:#aaa;">Seleccionados</div></div>' +
                '<div style="background:rgba(33,150,243,0.1); border:1px solid rgba(33,150,243,0.3); border-radius:8px; padding:8px 14px; text-align:center;">' +
                '<div style="font-size:1.3rem; font-weight:900; color:#2196F3;">' + withEmail + '</div>' +
                '<div style="font-size:0.7rem; color:#aaa;">Con Email</div></div>';
        }
    }

    window.comToggleClient = function(idx, checked) {
        if (_activeClients[idx]) {
            _activeClients[idx].selected = checked;
            _renderClientList();
        }
    };

    window.comToggleAll = function(checked) {
        _activeClients.forEach(function(c) {
            if (c.email) c.selected = checked;
        });
        _renderClientList();
    };

    window.comSelectAll = function() {
        var allSelected = _activeClients.every(function(c) { return !c.email || c.selected; });
        _activeClients.forEach(function(c) {
            if (c.email) c.selected = !allSelected;
        });
        _renderClientList();
    };

    // --- PREVIEW ---
    window.comPreview = function() {
        var subject = (document.getElementById('com-subject').value || '').trim();
        var body = (document.getElementById('com-body').value || '').trim();
        var previewBox = document.getElementById('com-preview-box');

        if (!subject || !body) {
            alert('Rellena el asunto y el mensaje antes de previsualizar.');
            return;
        }

        var selected = _activeClients.filter(function(c) { return c.selected; });
        if (selected.length === 0) {
            alert('No hay clientes seleccionados.');
            return;
        }

        // Preview with first selected client's data
        var sample = selected[0];
        var previewBody = _replaceVars(body, sample);
        var chEmail = document.getElementById('com-ch-email').checked;
        var chNotify = document.getElementById('com-ch-notify').checked;

        var channelsText = [];
        if (chEmail) channelsText.push('Email SMTP');
        if (chNotify) channelsText.push('Notificación In-App');

        previewBox.style.display = 'block';
        previewBox.innerHTML =
            '<div style="margin-bottom:12px; font-size:0.8rem; color:#aaa;">Vista previa (datos de: <strong style="color:#FF9800;">' + (sample.name || sample.uid) + '</strong>)</div>' +
            '<div style="margin-bottom:8px;"><strong style="color:#2196F3;">Asunto:</strong> <span style="color:#eee;">' + _escHtml(subject) + '</span></div>' +
            '<div style="background:#0f0f0f; border:1px solid #333; border-radius:6px; padding:14px; white-space:pre-wrap; color:#d4d4d4; font-size:0.9rem; line-height:1.6; margin-bottom:10px;">' + _escHtml(previewBody) + '</div>' +
            '<div style="font-size:0.8rem; color:#aaa;">Canales: <strong>' + channelsText.join(' + ') + '</strong> &mdash; Destinatarios: <strong style="color:#FF9800;">' + selected.length + '</strong></div>';
    };

    // --- SEND ---
    window.comSend = async function() {
        var subject = (document.getElementById('com-subject').value || '').trim();
        var body = (document.getElementById('com-body').value || '').trim();
        var chEmail = document.getElementById('com-ch-email').checked;
        var chNotify = document.getElementById('com-ch-notify').checked;

        if (!subject || !body) {
            alert('Rellena el asunto y el mensaje.');
            return;
        }
        if (!chEmail && !chNotify) {
            alert('Selecciona al menos un canal de envío.');
            return;
        }

        var selected = _activeClients.filter(function(c) { return c.selected; });
        if (selected.length === 0) {
            alert('No hay clientes seleccionados.');
            return;
        }

        if (!confirm('Vas a enviar una comunicación a ' + selected.length + ' clientes.\n\n' +
            'Canales: ' + (chEmail ? 'Email ' : '') + (chNotify ? 'Notificación ' : '') + '\n' +
            'Asunto: ' + subject + '\n\n' +
            '¿Confirmar envío?')) {
            return;
        }

        var sendBtn = document.getElementById('com-send-btn');
        var progressEl = document.getElementById('com-progress');
        var progressText = document.getElementById('com-progress-text');
        var progressCount = document.getElementById('com-progress-count');
        var progressBar = document.getElementById('com-progress-bar');

        sendBtn.disabled = true;
        sendBtn.style.opacity = '0.5';
        progressEl.style.display = 'block';

        // Create campaign document
        var campaignRef = db.collection('campaigns').doc();
        var campaignData = {
            subject: subject,
            bodyTemplate: body,
            channels: { email: chEmail, notification: chNotify },
            recipientCount: selected.length,
            sentCount: 0,
            failedCount: 0,
            status: 'sending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: (typeof user !== 'undefined' && user) ? user.uid : 'admin'
        };

        try {
            await campaignRef.set(campaignData);
        } catch (err) {
            console.error('[COM] Error creating campaign:', err);
        }

        var sent = 0;
        var failed = 0;
        var total = selected.length;
        var BATCH_SIZE = 10;

        for (var i = 0; i < total; i += BATCH_SIZE) {
            var chunk = selected.slice(i, i + BATCH_SIZE);
            var promises = chunk.map(function(client) {
                return _sendToClient(client, subject, body, chEmail, chNotify, campaignRef.id)
                    .then(function() { sent++; })
                    .catch(function(err) {
                        failed++;
                        console.warn('[COM] Failed for', client.uid, err.message);
                    });
            });

            await Promise.all(promises);

            // Update progress
            var done = sent + failed;
            var pct = Math.round((done / total) * 100);
            progressBar.style.width = pct + '%';
            progressCount.textContent = done + ' / ' + total;
            progressText.textContent = 'Enviando... (' + pct + '%)';
        }

        // Done
        progressText.textContent = 'Completado';
        progressCount.textContent = sent + ' enviados, ' + failed + ' fallidos';
        progressBar.style.width = '100%';
        progressBar.style.background = failed > 0 ? 'linear-gradient(90deg,#FF9800,#FF5722)' : 'linear-gradient(90deg,#4CAF50,#2E7D32)';

        sendBtn.disabled = false;
        sendBtn.style.opacity = '1';

        // Update campaign document
        try {
            await campaignRef.update({
                status: 'completed',
                sentCount: sent,
                failedCount: failed,
                completedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (err) {
            console.error('[COM] Error updating campaign:', err);
        }

        comLoadHistory();
    };

    async function _sendToClient(client, subject, body, chEmail, chNotify, campaignId) {
        var personalBody = _replaceVars(body, client);

        // 1. In-app notification
        if (chNotify) {
            await db.collection('user_notifications').add({
                uid: client.uid,
                type: 'campaign',
                title: subject,
                body: personalBody,
                campaignId: campaignId,
                read: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        // 2. Email via mailbox outgoing queue
        if (chEmail && client.email) {
            await db.collection('mailbox').add({
                type: 'outgoing_campaign',
                campaignId: campaignId,
                to: client.email,
                toName: client.name,
                toUid: client.uid,
                subject: subject,
                body: personalBody,
                status: 'outgoing',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    }

    // --- CAMPAIGN HISTORY ---
    function comLoadHistory() {
        var histEl = document.getElementById('com-history');
        if (!histEl) return;

        db.collection('campaigns')
            .orderBy('createdAt', 'desc')
            .limit(20)
            .get()
            .then(function(snap) {
                if (snap.empty) {
                    histEl.innerHTML = '<div style="color:#666; font-style:italic;">No hay campañas previas.</div>';
                    return;
                }

                var html = '<table style="width:100%; border-collapse:collapse; font-size:0.82rem;">';
                html += '<thead><tr style="background:#1a1a2e;">';
                html += '<th style="padding:8px; text-align:left; color:#aaa;">Fecha</th>';
                html += '<th style="padding:8px; text-align:left; color:#aaa;">Asunto</th>';
                html += '<th style="padding:8px; text-align:center; color:#aaa;">Destinatarios</th>';
                html += '<th style="padding:8px; text-align:center; color:#aaa;">Enviados</th>';
                html += '<th style="padding:8px; text-align:center; color:#aaa;">Fallidos</th>';
                html += '<th style="padding:8px; text-align:center; color:#aaa;">Estado</th>';
                html += '</tr></thead><tbody>';

                snap.forEach(function(doc) {
                    var d = doc.data();
                    var date = d.createdAt && typeof d.createdAt.toDate === 'function' ? d.createdAt.toDate().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
                    var statusColor = d.status === 'completed' ? '#4CAF50' : d.status === 'sending' ? '#FF9800' : '#888';
                    var statusLabel = d.status === 'completed' ? 'Completada' : d.status === 'sending' ? 'Enviando...' : d.status || '-';
                    var channels = [];
                    if (d.channels && d.channels.email) channels.push('Email');
                    if (d.channels && d.channels.notification) channels.push('Notif.');
                    html += '<tr style="border-bottom:1px solid #222;">';
                    html += '<td style="padding:6px 8px; white-space:nowrap;">' + date + '</td>';
                    html += '<td style="padding:6px 8px;">' + _escHtml(d.subject || '-') + ' <span style="color:#666; font-size:0.75rem;">(' + channels.join('+') + ')</span></td>';
                    html += '<td style="padding:6px 8px; text-align:center;">' + (d.recipientCount || 0) + '</td>';
                    html += '<td style="padding:6px 8px; text-align:center; color:#4CAF50;">' + (d.sentCount || 0) + '</td>';
                    html += '<td style="padding:6px 8px; text-align:center; color:' + (d.failedCount > 0 ? '#FF5252' : '#666') + ';">' + (d.failedCount || 0) + '</td>';
                    html += '<td style="padding:6px 8px; text-align:center; color:' + statusColor + '; font-weight:bold;">' + statusLabel + '</td>';
                    html += '</tr>';
                });

                html += '</tbody></table>';
                histEl.innerHTML = html;
            })
            .catch(function(err) {
                console.error('[COM] Error loading history:', err);
                histEl.innerHTML = '<div style="color:#FF5252;">Error al cargar historial.</div>';
            });
    }

    // --- HELPERS ---
    function _replaceVars(text, client) {
        return text
            .replace(/\{nombre\}/gi, client.name || '')
            .replace(/\{empresa\}/gi, client.name || '')
            .replace(/\{ncliente\}/gi, client.idNum || '')
            .replace(/\{email\}/gi, client.email || '');
    }

    function _escHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

})();
