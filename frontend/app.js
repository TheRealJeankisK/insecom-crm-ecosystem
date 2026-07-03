document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements - Auth & Navigation
    const viewLogin = document.getElementById('view-login');
    const appWorkspace = document.getElementById('app-workspace');
    const loginForm = document.getElementById('login-form');
    const loginUsername = document.getElementById('login-username');
    const loginPassword = document.getElementById('login-password');
    const loginError = document.getElementById('login-error');
    const userDisplayName = document.getElementById('user-display-name');
    const btnLogout = document.getElementById('btn-logout');
    
    // Recovery Elements
    const btnForgotPassword = document.getElementById('btn-forgot-password');
    const recoveryMessage = document.getElementById('recovery-message');
    const btnCloseRecovery = document.getElementById('btn-close-recovery');

    // Forgot Password Interactions
    btnForgotPassword.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.classList.add('hidden');
        recoveryMessage.classList.remove('hidden');
    });

    btnCloseRecovery.addEventListener('click', () => {
        recoveryMessage.classList.add('hidden');
        loginForm.classList.remove('hidden');
    });
    
    // DOM Elements - Views and Tabs
    const menuItems = document.querySelectorAll('.menu-item[data-target]');
    const viewPanes = document.querySelectorAll('.view-pane');
    const viewTitle = document.getElementById('view-title');

    // DOM Elements - Leads & Notifications
    const leadForm = document.getElementById('lead-form');
    const leadsTableBody = document.getElementById('leads-table-body');
    const notificationsList = document.getElementById('notifications-list');
    const notificationCount = document.getElementById('notification-count');
    const btnRefresh = document.getElementById('btn-refresh');
    // State Variables
    let notificationsCache = [];
    let leadsCache = [];
    let filteredLeads = [];
    let currentSortCol = 'id';
    let currentSortDir = 'desc';
    let editLeadId = null;
    let pollIntervalLeads = null;
    let pollIntervalNotifications = null;

    // Search/Filter and Export DOM Elements
    const leadsSearchInput = document.getElementById('leads-search-input');
    const leadsFilterRequirement = document.getElementById('leads-filter-requirement');
    const exportSelect = document.getElementById('export-select');

    // --- AUTHENTICATION FLOW ---
    checkAuth();

    function checkAuth() {
        const token = sessionStorage.getItem('auth_token');
        const username = sessionStorage.getItem('auth_username');
        
        if (token && username) {
            // User is logged in
            viewLogin.classList.add('hidden');
            appWorkspace.classList.remove('hidden');
            userDisplayName.innerText = username;
            updateHeaderAvatar(username);
            
            // Start background sync
            startSync();
            
            // Switch to default view
            switchTab('view-list');
        } else {
            // User is not logged in
            viewLogin.classList.remove('hidden');
            appWorkspace.classList.add('hidden');
            
            // Stop sync
            stopSync();
        }
    }

    // Update Top Bar Profile Avatar with dynamic initials and custom deterministic gradient
    function updateHeaderAvatar(username) {
        const avatarEl = document.querySelector('.top-bar .avatar');
        if (!avatarEl) return;
        
        const userInitial = username.charAt(0).toUpperCase();
        
        // Premium curated color gradients
        const gradients = [
            { bg: 'linear-gradient(135deg, #6ba92a 0%, #3a651a 100%)', shadow: 'rgba(107, 169, 42, 0.25)' },
            { bg: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', shadow: 'rgba(59, 130, 246, 0.25)' },
            { bg: 'linear-gradient(135deg, #8b5cf6 0%, #5b21b6 100%)', shadow: 'rgba(139, 92, 246, 0.25)' },
            { bg: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)', shadow: 'rgba(236, 72, 153, 0.25)' },
            { bg: 'linear-gradient(135deg, #f97316 0%, #c2410c 100%)', shadow: 'rgba(249, 115, 22, 0.25)' },
            { bg: 'linear-gradient(135deg, #10b981 0%, #047857 100%)', shadow: 'rgba(16, 185, 129, 0.25)' }
        ];
        
        // Select gradient deterministically based on username string hash
        let hash = 0;
        for (let i = 0; i < username.length; i++) {
            hash = username.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash) % gradients.length;
        const selectedGradient = gradients[index];
        
        // Apply dynamic styling and initials letter
        avatarEl.style.background = selectedGradient.bg;
        avatarEl.style.boxShadow = `0 4px 15px ${selectedGradient.shadow}`;
        avatarEl.innerHTML = `<span style="font-weight: 700; text-transform: uppercase; font-size: 1.1rem; letter-spacing: 0.5px;">${userInitial}</span>`;
    }

    // Handle Login Form Submit
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = loginUsername.value.trim();
        const password = loginPassword.value;
        
        const btnLogin = loginForm.querySelector('.btn-login');
        const originalContent = btnLogin.innerHTML;
        btnLogin.disabled = true;
        btnLogin.innerHTML = '<span>Verificando...</span> <i class="fa-solid fa-spinner fa-spin"></i>';
        loginError.classList.add('hidden');

        try {
            const response = await fetch('/api/v1/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Credenciales incorrectas');
                }
                throw new Error('Error en el servidor');
            }

            const data = await response.json();
            
            // Save session
            sessionStorage.setItem('auth_token', data.access_token);
            sessionStorage.setItem('auth_username', data.username);
            
            // Reset form
            loginForm.reset();
            
            // Refresh layout
            checkAuth();
            showToast(`<i class="fa-solid fa-shield-halved"></i> ¡Bienvenido, ${data.username}!`);
            
        } catch (error) {
            console.error('Login error:', error);
            loginError.classList.remove('hidden');
        } finally {
            btnLogin.disabled = false;
            btnLogin.innerHTML = originalContent;
        }
    });

    // Handle Logout Click
    btnLogout.addEventListener('click', () => {
        sessionStorage.removeItem('auth_token');
        sessionStorage.removeItem('auth_username');
        checkAuth();
        showToast('<i class="fa-solid fa-right-from-bracket"></i> Sesión cerrada.');
    });

    // --- TAB / WINDOW SWITCHING FLOW ---
    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const target = item.getAttribute('data-target');
            switchTab(target);
        });
    });

    function switchTab(targetId) {
        menuItems.forEach(mi => {
            if (mi.getAttribute('data-target') === targetId) {
                mi.classList.add('active');
            } else {
                mi.classList.remove('active');
            }
        });
        switchView(targetId);
    }

    function switchView(targetId) {
        viewPanes.forEach(pane => {
            if (pane.id === targetId) {
                pane.classList.remove('hidden');
            } else {
                pane.classList.add('hidden');
            }
        });

        // Update Title and Icon on Banner dynamically
        const bannerIconContainer = document.querySelector('.welcome-banner .banner-icon');
        if (targetId === 'view-form') {
            viewTitle.innerText = 'Portal de Registro de Leads';
            if (bannerIconContainer) {
                bannerIconContainer.innerHTML = '<i class="fa-solid fa-user-plus"></i>';
            }
        } else if (targetId === 'view-list') {
            viewTitle.innerText = 'Historial Comercial (Base MySQL)';
            if (bannerIconContainer) {
                bannerIconContainer.innerHTML = '<i class="fa-solid fa-building-shield"></i>';
            }
            fetchLeads(); // load immediately when viewing
        } else if (targetId === 'view-notifications') {
            viewTitle.innerText = 'Alertas de Preventa (Caché Redis)';
            if (bannerIconContainer) {
                bannerIconContainer.innerHTML = '<i class="fa-solid fa-bell"></i>';
            }
            fetchNotifications(); // load immediately
        }
    }

    // --- DATA INTEGRATION & SYNC ---
    
    // Auth headers helper
    function getAuthHeaders() {
        const token = sessionStorage.getItem('auth_token');
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
    }

    // Handle unauthorized responses (401)
    function handleUnauthorized(response) {
        if (response.status === 401) {
            sessionStorage.removeItem('auth_token');
            sessionStorage.removeItem('auth_username');
            checkAuth();
            showToast('<i class="fa-solid fa-triangle-exclamation"></i> Sesión expirada. Inicia sesión de nuevo.');
            return true;
        }
        return false;
    }

    function startSync() {
        stopSync(); // safety clear
        fetchLeads();
        fetchNotifications();
        pollIntervalNotifications = setInterval(fetchNotifications, 3000);
        pollIntervalLeads = setInterval(fetchLeads, 10000);
    }

    function stopSync() {
        if (pollIntervalLeads) clearInterval(pollIntervalLeads);
        if (pollIntervalNotifications) clearInterval(pollIntervalNotifications);
        pollIntervalLeads = null;
        pollIntervalNotifications = null;
        notificationsCache = [];
    }

    // Fetch Leads from Backend (MySQL)
    async function fetchLeads() {
        if (!sessionStorage.getItem('auth_token')) return;
        
        try {
            const response = await fetch('/api/v1/leads', {
                headers: getAuthHeaders()
            });
            
            if (handleUnauthorized(response)) return;
            if (!response.ok) throw new Error('Error al consultar base de datos');
            
            const data = await response.json();
            leadsCache = data;
            applyFiltersAndRender();
        } catch (error) {
            console.error('Error fetching leads:', error);
            leadsTableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-td" style="color: var(--color-danger);">
                        <i class="fa-solid fa-triangle-exclamation"></i> Error al conectar con el servidor MySQL.
                    </td>
                </tr>
            `;
        }
    }

    // Fetch Notifications from Backend (Redis)
    async function fetchNotifications() {
        if (!sessionStorage.getItem('auth_token')) return;
        
        try {
            const response = await fetch('/api/v1/leads/notifications', {
                headers: getAuthHeaders()
            });
            
            if (handleUnauthorized(response)) return;
            if (!response.ok) throw new Error('Error al consultar caché de alertas');
            
            const data = await response.json();
            
            // Show toast on new alerts
            if (data.length > notificationsCache.length && notificationsCache.length > 0) {
                const latest = data[data.length - 1];
                showToast(`<i class="fa-solid fa-bell" style="color: var(--accent-green);"></i> Alerta: ${latest.title}`);
            }

            notificationsCache = data;
            renderNotifications(data);
        } catch (error) {
            console.error('Error fetching notifications:', error);
        }
    }

    // Submit Lead Form (Create or Update)
    async function handleFormSubmit(e) {
        e.preventDefault();

        // Extract multiple email inputs
        const emailInputs = Array.from(document.querySelectorAll('.lead-email-input'))
            .map(input => input.value.trim())
            .filter(val => val !== '');
        const emailsStr = emailInputs.join(', ');

        // Extract multiple phone inputs (strip all spaces for DB storage)
        const phoneInputs = Array.from(document.querySelectorAll('.lead-telefono-input'))
            .map(input => input.value.replace(/\s+/g, '').trim())
            .filter(val => val !== '');
        const phonesStr = phoneInputs.join(', ');

        // Extract multiple project inputs
        const projectInputs = Array.from(document.querySelectorAll('.lead-proyecto-input'))
            .map(input => input.value.trim())
            .filter(val => val !== '');
        const projectsStr = projectInputs.join(', ');

        // Extract requirements type
        let reqsVal = document.getElementById('requerimientos').value;
        if (reqsVal === 'OTRO') {
            reqsVal = document.getElementById('requerimientos-otro').value.trim();
            if (!reqsVal) {
                showToast('<i class="fa-solid fa-triangle-exclamation" style="color: var(--color-danger);"></i> Por favor, especifique el requerimiento personalizado.');
                return;
            }
        }

        // Extract extra details note
        const detailsVal = document.getElementById('detalles-textarea').value.trim();

        // Extract Lead Status and Meeting Date
        const statusVal = document.getElementById('lead-estado').value;
        const fechaCitaVal = document.getElementById('lead-fecha-cita').value;

        const leadData = {
            nombre: document.getElementById('nombre').value.trim(),
            email: emailsStr,
            telefono: phonesStr,
            proyecto: projectsStr,
            requerimientos: reqsVal,
            detalles: detailsVal || null,
            estado: statusVal,
            fecha_cita: fechaCitaVal || null
        };

        const btnSubmit = document.getElementById('btn-submit');
        const originalBtnContent = btnSubmit.innerHTML;
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<span>Procesando...</span> <i class="fa-solid fa-spinner fa-spin"></i>';

        const isEdit = editLeadId !== null;
        const targetUrl = isEdit ? `/api/v1/leads/${editLeadId}` : '/api/v1/leads';
        const targetMethod = isEdit ? 'PUT' : 'POST';

        try {
            const response = await fetch(targetUrl, {
                method: targetMethod,
                headers: getAuthHeaders(),
                body: JSON.stringify(leadData)
            });

            if (handleUnauthorized(response)) return;
            if (!response.ok) throw new Error('Error al guardar el lead');

            // Reset form
            leadForm.reset();
            
            // Clean dynamic fields back to 1 input
            document.getElementById('email-fields-container').querySelectorAll('.dynamic-input-wrapper').forEach((el, idx) => {
                if (idx > 0) el.remove();
            });
            document.getElementById('telefono-fields-container').querySelectorAll('.dynamic-input-wrapper').forEach((el, idx) => {
                if (idx > 0) el.remove();
            });
            document.getElementById('proyecto-fields-container').querySelectorAll('.dynamic-input-wrapper').forEach((el, idx) => {
                if (idx > 0) el.remove();
            });
            document.getElementById('requerimientos-otro-container').classList.add('hidden');
            document.getElementById('requerimientos-otro').value = '';
            document.getElementById('requerimientos-otro').required = false;
            
            // Reset status & meeting fields
            document.getElementById('lead-estado').value = 'Pendiente';
            document.getElementById('fecha-cita-container').classList.add('hidden');
            document.getElementById('lead-fecha-cita').value = '';
            document.getElementById('lead-fecha-cita').required = false;

            if (isEdit) {
                editLeadId = null;
                document.querySelector('.form-card .card-header h3').innerText = 'Nuevo Prospecto Comercial';
                document.getElementById('btn-submit').innerHTML = '<span>Registrar en CRM</span> <i class="fa-solid fa-paper-plane"></i>';
                showToast('<i class="fa-solid fa-circle-check" style="color: var(--color-success);"></i> Cambios guardados y publicados en la cola.');
            } else {
                showToast('<i class="fa-solid fa-circle-check" style="color: var(--color-success);"></i> Lead guardado y publicado en la cola.');
            }

            // Redirect back to list view
            switchTab('view-list');

            // Pre-fetch updates after small delay for queue processing
            setTimeout(() => {
                fetchLeads();
                fetchNotifications();
            }, 1000);

        } catch (error) {
            console.error('Error submitting form:', error);
            showToast(`<i class="fa-solid fa-circle-xmark" style="color: var(--color-danger);"></i> Error al ${isEdit ? 'guardar cambios' : 'registrar lead'}.`);
        } finally {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = originalBtnContent;
        }
    }

    // Format phone number visually with spaces
    function formatPhoneVisual(phoneStr) {
        if (!phoneStr) return '-';
        
        const cleaned = phoneStr.replace(/\s+/g, '');
        
        if (cleaned.startsWith('+593') && cleaned.length === 13) {
            return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 6)} ${cleaned.slice(6, 9)} ${cleaned.slice(9)}`;
        }
        
        if (cleaned.startsWith('09') && cleaned.length === 10) {
            return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
        }
        
        if (cleaned.length === 9) {
            return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
        }
        
        if (cleaned.startsWith('+5932') && cleaned.length === 12) {
            return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 5)} ${cleaned.slice(5, 8)} ${cleaned.slice(8)}`;
        }
        
        return cleaned;
    }

    // Render Leads Table
    function renderLeads(leads) {
        if (!leads || leads.length === 0) {
            leadsTableBody.innerHTML = `
                <tr>
                    <td colspan="10" class="empty-td">
                        <i class="fa-solid fa-folder-open"></i> No hay prospectos comerciales registrados en MySQL.
                    </td>
                </tr>
            `;
            return;
        }

        leadsTableBody.innerHTML = leads.map(lead => {
            const date = new Date(lead.created_at).toLocaleString();
            
            // Format dynamic lists to display nicely
            const emailsList = lead.email.split(',').map(e => `<div>${e.trim()}</div>`).join('');
            const phonesList = lead.telefono.split(',').map(t => `<div>${formatPhoneVisual(t.trim())}</div>`).join('');
            const projectsList = lead.proyecto.split(',').map(p => `<span class="project-tag block-tag"><i class="fa-solid fa-building"></i> ${p.trim()}</span>`).join('');
            
            const detallesText = lead.detalles ? `<span class="detalles-cell" title="${lead.detalles}">${lead.detalles}</span>` : '<span class="text-muted">-</span>';
            
            // Format status badge and meeting date info
            const leadStatus = lead.estado || 'Pendiente';
            let estadoHtml = '';
            if (leadStatus === 'Interesado') {
                estadoHtml = `<span class="badge-status status-interesado"><i class="fa-solid fa-fire"></i> Interesado</span>`;
                if (lead.fecha_cita) {
                    const citaDate = new Date(lead.fecha_cita).toLocaleString();
                    estadoHtml += `<div class="cita-text" title="Llamada de seguimiento programada"><i class="fa-solid fa-calendar-day"></i> ${citaDate}</div>`;
                }
            } else if (leadStatus === 'No Interesado') {
                estadoHtml = `<span class="badge-status status-no-interesado"><i class="fa-solid fa-snowflake"></i> No Interesado</span>`;
            } else {
                estadoHtml = `<span class="badge-status status-pendiente"><i class="fa-solid fa-clock"></i> Pendiente</span>`;
            }
            
            return `
                <tr>
                    <td><strong>#${lead.id}</strong></td>
                    <td><div class="projects-cell">${projectsList}</div></td>
                    <td><strong>${lead.nombre}</strong></td>
                    <td><div class="emails-cell">${emailsList}</div></td>
                    <td><div class="phones-cell">${phonesList}</div></td>
                    <td><span class="badge-req">${lead.requerimientos}</span></td>
                    <td><div class="estado-cell">${estadoHtml}</div></td>
                    <td>${detallesText}</td>
                    <td><span class="date-cell">${date}</span></td>
                    <td>
                        <div class="table-actions">
                            <button class="btn-table-edit" onclick="editLead(${lead.id})" title="Editar Lead"><i class="fa-solid fa-pen"></i></button>
                            <button class="btn-table-delete" onclick="deleteLead(${lead.id})" title="Borrar Lead"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Render Notifications (Handles Badge Count and triggers filtering)
    function renderNotifications(notifications) {
        if (!notifications || notifications.length === 0) {
            notificationsList.innerHTML = `
                <div class="no-notifications">
                    <i class="fa-solid fa-circle-nodes"></i>
                    <p>Esperando eventos del Broker de Mensajería...</p>
                </div>
            `;
            notificationCount.innerText = '0';
            return;
        }

        notificationCount.innerText = notifications.length;
        applyFiltersAndRenderNotifications();
    }

    // Apply client-side filters for notifications
    function applyFiltersAndRenderNotifications() {
        const notifSearchInput = document.getElementById('notif-search-input');
        const notifFilterType = document.getElementById('notif-filter-type');
        
        const query = notifSearchInput ? notifSearchInput.value.toLowerCase().trim() : '';
        const filterType = notifFilterType ? notifFilterType.value : 'ALL';
        
        let result = [...notificationsCache];
        
        // 1. Search Query filter (checks title and message body)
        if (query !== '') {
            result = result.filter(notif => {
                const titleMatch = notif.title && notif.title.toLowerCase().includes(query);
                const msgMatch = notif.message && notif.message.toLowerCase().includes(query);
                return titleMatch || msgMatch;
            });
        }
        
        // 2. Type/Status category filter
        if (filterType !== 'ALL') {
            result = result.filter(notif => {
                const action = notif.action || 'created';
                const estado = notif.estado || 'Pendiente';
                
                if (filterType === 'CREATED') {
                    return action === 'created';
                } else if (filterType === 'INTERESADO') {
                    return action === 'updated' && estado === 'Interesado';
                } else if (filterType === 'DESCARTADO') {
                    return action === 'updated' && estado === 'No Interesado';
                } else if (filterType === 'UPDATED') {
                    return action === 'updated' && estado !== 'Interesado' && estado !== 'No Interesado';
                } else if (filterType === 'DELETED') {
                    return action === 'deleted';
                }
                return true;
            });
        }
        
        renderNotificationsList(result);
    }

    // Render Notifications List HTML
    function renderNotificationsList(notifications) {
        if (!notifications || notifications.length === 0) {
            notificationsList.innerHTML = `
                <div class="no-notifications">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <p>No se encontraron alertas que coincidan con la búsqueda.</p>
                </div>
            `;
            return;
        }

        const sortedList = [...notifications].reverse();

        notificationsList.innerHTML = sortedList.map(notif => {
            const time = new Date(notif.timestamp).toLocaleTimeString();
            
            // Determine styling classes and icons based on action/status
            let notifClass = 'notif-created';
            let iconHtml = '<i class="fa-solid fa-circle-plus" style="color: var(--accent-green)"></i>';
            
            const action = notif.action || 'created';
            const estado = notif.estado || 'Pendiente';
            
            if (action === 'deleted') {
                notifClass = 'notif-deleted';
                iconHtml = '<i class="fa-solid fa-trash-can" style="color: #f43f5e"></i>';
            } else if (action === 'updated') {
                if (estado === 'Interesado') {
                    notifClass = 'notif-interesado';
                    iconHtml = '<i class="fa-solid fa-fire-flame-curved" style="color: #f87171"></i>';
                } else if (estado === 'No Interesado') {
                    notifClass = 'notif-no-interesado';
                    iconHtml = '<i class="fa-solid fa-snowflake" style="color: #64748b"></i>';
                } else {
                    notifClass = 'notif-updated';
                    iconHtml = '<i class="fa-solid fa-arrows-rotate" style="color: #38bdf8"></i>';
                }
            } else { // created
                if (estado === 'Interesado') {
                    notifClass = 'notif-created-interesado';
                    iconHtml = '<i class="fa-solid fa-circle-check" style="color: var(--accent-green)"></i>';
                }
            }
            
            return `
                <div class="notification-item ${notifClass}">
                    <div class="notification-header">
                        <span class="notification-title">${iconHtml} ${notif.title}</span>
                        <span class="notification-time">${time}</span>
                    </div>
                    <p class="notification-body">${notif.message}</p>
                    <div class="notification-meta">
                        <span><i class="fa-solid fa-microchip"></i> Lambda Trigger: Queue</span>
                        <span><i class="fa-solid fa-database"></i> Cache: Redis</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Form submits & Refreshes
    leadForm.addEventListener('submit', handleFormSubmit);
    btnRefresh.addEventListener('click', () => {
        fetchLeads();
        fetchNotifications();
        showToast('<i class="fa-solid fa-sync fa-spin"></i> Sincronizando datos...');
    });

    // --- SEARCH, FILTER & EXPORT LOGIC ---
    function applyFiltersAndRender() {
        if (!leadsCache) return;
        
        const query = leadsSearchInput.value.toLowerCase().trim();
        const filterReq = leadsFilterRequirement.value;
        
        filteredLeads = leadsCache.filter(lead => {
            // Matches Search Query (ID, nombre, email, telefono, proyecto)
            const matchesQuery = !query || 
                lead.id.toString().includes(query) ||
                lead.nombre.toLowerCase().includes(query) ||
                lead.email.toLowerCase().includes(query) ||
                lead.telefono.toLowerCase().includes(query) ||
                lead.proyecto.toLowerCase().includes(query) ||
                lead.requerimientos.toLowerCase().includes(query);
                
            // Matches Dropdown Requirement Filter
            const matchesReq = filterReq === 'ALL' || lead.requerimientos === filterReq;
            
            return matchesQuery && matchesReq;
        });
        
        // Sort leads based on active sorting criteria
        filteredLeads.sort((a, b) => {
            let valA, valB;
            if (currentSortCol === 'id') {
                valA = Number(a.id);
                valB = Number(b.id);
            } else if (currentSortCol === 'created_at') {
                valA = new Date(a.created_at);
                valB = new Date(b.created_at);
            } else {
                // Map frontend property name to lead object key (nombre -> nombre, proyecto -> proyecto, email -> email)
                const prop = currentSortCol === 'nombre' ? 'nombre' : 
                             currentSortCol === 'proyecto' ? 'proyecto' :
                             currentSortCol === 'email' ? 'email' :
                             currentSortCol === 'telefono' ? 'telefono' :
                             currentSortCol === 'requerimientos' ? 'requerimientos' : currentSortCol;
                
                valA = (a[prop] || '').toString().toLowerCase();
                valB = (b[prop] || '').toString().toLowerCase();
            }
            
            if (valA < valB) return currentSortDir === 'asc' ? -1 : 1;
            if (valA > valB) return currentSortDir === 'asc' ? 1 : -1;
            return 0;
        });
        
        updateSortHeaders();
        renderLeads(filteredLeads);
    }

    function updateSortHeaders() {
        const headers = document.querySelectorAll('.leads-table th.sortable');
        headers.forEach(th => {
            const col = th.getAttribute('data-sort');
            const icon = th.querySelector('i');
            if (!icon) return;
            
            th.classList.remove('active-sort');
            
            if (col === currentSortCol) {
                th.classList.add('active-sort');
                if (currentSortDir === 'asc') {
                    icon.className = 'fa-solid fa-sort-up';
                } else {
                    icon.className = 'fa-solid fa-sort-down';
                }
            } else {
                icon.className = 'fa-solid fa-sort';
            }
        });
    }

    function exportJSON() {
        if (!filteredLeads || filteredLeads.length === 0) {
            showToast('<i class="fa-solid fa-triangle-exclamation" style="color: var(--color-danger);"></i> No hay registros filtrados para exportar.');
            return;
        }
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(filteredLeads, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", "leads_insecom_filtrados.json");
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        showToast('<i class="fa-solid fa-file-code" style="color: var(--color-success);"></i> JSON exportado correctamente.');
    }

    function exportExcel() {
        if (!filteredLeads || filteredLeads.length === 0) {
            showToast('<i class="fa-solid fa-triangle-exclamation" style="color: var(--color-danger);"></i> No hay registros filtrados para exportar.');
            return;
        }
        // Create CSV format
        const headers = ["ID", "Proyecto/Edificio", "Contacto", "Email", "Telefono", "Requerimientos", "Fecha de Registro"];
        const rows = filteredLeads.map(lead => [
            lead.id,
            `"${lead.proyecto.replace(/"/g, '""')}"`,
            `"${lead.nombre.replace(/"/g, '""')}"`,
            `"${lead.email.replace(/"/g, '""')}"`,
            `"${lead.telefono.replace(/"/g, '""')}"`,
            `"${lead.requerimientos.replace(/"/g, '""')}"`,
            `"${new Date(lead.created_at).toLocaleString()}"`
        ]);
        
        // Use BOM \uFEFF for Excel UTF-8 support (Spanish characters like accents)
        const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", url);
        downloadAnchor.setAttribute("download", "leads_insecom_filtrados.csv");
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        showToast('<i class="fa-solid fa-file-excel" style="color: var(--color-success);"></i> Excel/CSV exportado.');
    }

    function exportImage() {
        if (!filteredLeads || filteredLeads.length === 0) {
            showToast('<i class="fa-solid fa-triangle-exclamation" style="color: var(--color-danger);"></i> No hay registros para exportar.');
            return;
        }
        showToast('<i class="fa-solid fa-spinner fa-spin"></i> Generando imagen...');
        const target = document.getElementById('leads-table-to-export');
        
        // Small delay for rendering safety
        setTimeout(() => {
            html2canvas(target, {
                backgroundColor: "#0f172a", // Match card background
                scale: 2, // High resolution
                logging: false
            }).then(canvas => {
                const link = document.createElement('a');
                link.download = 'leads_insecom_reporte.png';
                link.href = canvas.toDataURL('image/png');
                document.body.appendChild(link);
                link.click();
                link.remove();
                showToast('<i class="fa-solid fa-file-image" style="color: var(--color-success);"></i> Reporte de imagen descargado.');
            }).catch(err => {
                console.error("Error generating canvas:", err);
                showToast('<i class="fa-solid fa-triangle-exclamation" style="color: var(--color-danger);"></i> Error al exportar imagen.');
            });
        }, 150);
    }

    // Binding Search/Filter & Export Event Listeners
    leadsSearchInput.addEventListener('input', applyFiltersAndRender);
    leadsFilterRequirement.addEventListener('change', applyFiltersAndRender);

    // Binding Search & Filter for Notifications
    const notifSearchInput = document.getElementById('notif-search-input');
    const notifFilterType = document.getElementById('notif-filter-type');
    if (notifSearchInput) notifSearchInput.addEventListener('input', applyFiltersAndRenderNotifications);
    if (notifFilterType) notifFilterType.addEventListener('change', applyFiltersAndRenderNotifications);

    // Bind sort click listener to header elements
    document.querySelectorAll('.leads-table th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.getAttribute('data-sort');
            if (currentSortCol === col) {
                currentSortDir = currentSortDir === 'asc' ? 'desc' : 'asc';
            } else {
                currentSortCol = col;
                currentSortDir = 'asc';
            }
            applyFiltersAndRender();
        });
    });
    
    exportSelect.addEventListener('change', (e) => {
        const value = e.target.value;
        if (value === 'JSON') {
            exportJSON();
        } else if (value === 'EXCEL') {
            exportExcel();
        } else if (value === 'IMAGE') {
            exportImage();
        }
        // Reset selection back to placeholder
        e.target.value = "";
    });

    // Bind Goto Create Lead button listener
    const btnGotoCreate = document.getElementById('btn-goto-create');
    btnGotoCreate.addEventListener('click', () => {
        // Reset edit mode
        editLeadId = null;
        leadForm.reset();
        
        // Reset card titles and buttons
        document.querySelector('.form-card .card-header h3').innerText = 'Nuevo Prospecto Comercial';
        document.getElementById('btn-submit').innerHTML = '<span>Registrar en CRM</span> <i class="fa-solid fa-paper-plane"></i>';
        
        // Remove dynamic inputs except the first one
        document.getElementById('email-fields-container').querySelectorAll('.dynamic-input-wrapper').forEach((el, idx) => {
            if (idx > 0) el.remove();
        });
        document.getElementById('telefono-fields-container').querySelectorAll('.dynamic-input-wrapper').forEach((el, idx) => {
            if (idx > 0) el.remove();
        });
        document.getElementById('proyecto-fields-container').querySelectorAll('.dynamic-input-wrapper').forEach((el, idx) => {
            if (idx > 0) el.remove();
        });
        
        // Hide custom requirement input
        document.getElementById('requerimientos-otro-container').classList.add('hidden');
        document.getElementById('requerimientos-otro').value = '';
        document.getElementById('requerimientos-otro').required = false;

        // Reset status & meeting fields
        document.getElementById('lead-estado').value = 'Pendiente';
        document.getElementById('fecha-cita-container').classList.add('hidden');
        document.getElementById('lead-fecha-cita').value = '';
        document.getElementById('lead-fecha-cita').required = false;

        switchTab('view-form');
    });

    // Custom requirement toggle visibility listener
    const selectReqs = document.getElementById('requerimientos');
    const containerOtro = document.getElementById('requerimientos-otro-container');
    const inputOtro = document.getElementById('requerimientos-otro');

    selectReqs.addEventListener('change', () => {
        if (selectReqs.value === 'OTRO') {
            containerOtro.classList.remove('hidden');
            inputOtro.required = true;
            inputOtro.focus();
        } else {
            containerOtro.classList.add('hidden');
            inputOtro.value = '';
            inputOtro.required = false;
        }
    });

    // Lead status change listener (toggles visibility of meeting date picker)
    const selectEstado = document.getElementById('lead-estado');
    const containerCita = document.getElementById('fecha-cita-container');
    const inputCita = document.getElementById('lead-fecha-cita');
    
    selectEstado.addEventListener('change', () => {
        if (selectEstado.value === 'Interesado') {
            containerCita.classList.remove('hidden');
            inputCita.required = true;
            inputCita.focus();
        } else {
            containerCita.classList.add('hidden');
            inputCita.value = '';
            inputCita.required = false;
        }
    });

    // Edit Lead (Exposed Globally)
    window.editLead = function(id) {
        const lead = leadsCache.find(l => l.id === id);
        if (!lead) return;
        
        editLeadId = id;
        
        // Populate standard inputs
        document.getElementById('nombre').value = lead.nombre;
        document.getElementById('detalles-textarea').value = lead.detalles || '';
        
        // Populate dynamic emails
        const emailContainer = document.getElementById('email-fields-container');
        emailContainer.querySelectorAll('.dynamic-input-wrapper').forEach(el => el.remove());
        const emails = lead.email.split(',');
        emails.forEach((emailVal, idx) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'dynamic-input-wrapper';
            wrapper.innerHTML = `
                <input type="email" class="lead-email-input" placeholder="Ej. contacto@edificio.com" required value="${emailVal.trim()}">
                ${idx > 0 ? `
                <button type="button" class="btn-remove-input" onclick="this.parentElement.remove()">
                    <i class="fa-solid fa-minus"></i>
                </button>` : ''}
            `;
            emailContainer.appendChild(wrapper);
        });

        // Populate dynamic phones
        const phoneContainer = document.getElementById('telefono-fields-container');
        phoneContainer.querySelectorAll('.dynamic-input-wrapper').forEach(el => el.remove());
        const phones = lead.telefono.split(',');
        phones.forEach((phoneVal, idx) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'dynamic-input-wrapper';
            wrapper.innerHTML = `
                <input type="text" class="lead-telefono-input" placeholder="Ej. +593 999999999" required value="${phoneVal.trim()}">
                ${idx > 0 ? `
                <button type="button" class="btn-remove-input" onclick="this.parentElement.remove()">
                    <i class="fa-solid fa-minus"></i>
                </button>` : ''}
            `;
            phoneContainer.appendChild(wrapper);
        });

        // Populate dynamic projects
        const projectContainer = document.getElementById('proyecto-fields-container');
        projectContainer.querySelectorAll('.dynamic-input-wrapper').forEach(el => el.remove());
        const projects = lead.proyecto.split(',');
        projects.forEach((projVal, idx) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'dynamic-input-wrapper';
            wrapper.innerHTML = `
                <input type="text" class="lead-proyecto-input" placeholder="Ej. Torre Elite Plaza" required value="${projVal.trim()}">
                ${idx > 0 ? `
                <button type="button" class="btn-remove-input" onclick="this.parentElement.remove()">
                    <i class="fa-solid fa-minus"></i>
                </button>` : ''}
            `;
            projectContainer.appendChild(wrapper);
        });

        // Populate requirements
        const standardOptions = [
            "BMS & Climatización (HVAC)",
            "Seguridad Electrónica y CCTV",
            "Control de Accesos & Biométricos",
            "Audio/Video Integral & Cableado",
            "Proyecto Completo de Edificio Inteligente"
        ];
        
        if (standardOptions.includes(lead.requerimientos)) {
            selectReqs.value = lead.requerimientos;
            containerOtro.classList.add('hidden');
            inputOtro.value = '';
            inputOtro.required = false;
        } else {
            selectReqs.value = "OTRO";
            containerOtro.classList.remove('hidden');
            inputOtro.value = lead.requerimientos;
            inputOtro.required = true;
        }

        // Populate status and meeting fields
        const leadEstado = lead.estado || 'Pendiente';
        document.getElementById('lead-estado').value = leadEstado;
        
        const fechaCitaContainer = document.getElementById('fecha-cita-container');
        const leadFechaCita = document.getElementById('lead-fecha-cita');
        
        if (leadEstado === 'Interesado') {
            fechaCitaContainer.classList.remove('hidden');
            leadFechaCita.value = lead.fecha_cita || '';
        } else {
            fechaCitaContainer.classList.add('hidden');
            leadFechaCita.value = '';
        }

        // Update form titles
        document.querySelector('.form-card .card-header h3').innerText = 'Editar Prospecto Comercial';
        document.getElementById('btn-submit').innerHTML = '<span>Guardar Cambios</span> <i class="fa-solid fa-floppy-disk"></i>';
        
        switchTab('view-form');
    };

    // Delete Lead (Exposed Globally)
    window.deleteLead = async function(id) {
        if (!confirm(`¿Está seguro de que desea eliminar el lead #${id}? Esta acción eliminará permanentemente el registro.`)) {
            return;
        }
        
        try {
            const response = await fetch(`/api/v1/leads/${id}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            
            if (handleUnauthorized(response)) return;
            if (!response.ok) throw new Error('Error al eliminar el lead');
            
            showToast('<i class="fa-solid fa-trash-can" style="color: var(--color-success);"></i> Lead eliminado de MySQL.');
            fetchLeads();
        } catch (error) {
            console.error('Error deleting lead:', error);
            showToast('<i class="fa-solid fa-triangle-exclamation" style="color: var(--color-danger);"></i> Error al eliminar el lead.');
        }
    };

    // Dynamic inputs adder (Exposed Globally)
    window.addDynamicField = function(containerId, inputClass, placeholder, inputType) {
        const container = document.getElementById(containerId);
        const wrapper = document.createElement('div');
        wrapper.className = 'dynamic-input-wrapper';
        wrapper.innerHTML = `
            <input type="${inputType}" class="${inputClass}" placeholder="${placeholder}" required>
            <button type="button" class="btn-remove-input" onclick="this.parentElement.remove()">
                <i class="fa-solid fa-minus"></i>
            </button>
        `;
        container.appendChild(wrapper);
    };

    // Clear Notification History Click Listener
    const btnClearNotifications = document.getElementById('btn-clear-notifications');
    btnClearNotifications.addEventListener('click', async () => {
        if (!confirm('¿Está seguro de que desea limpiar todo el historial de alertas en Redis?')) {
            return;
        }
        
        try {
            const response = await fetch('/api/v1/leads/notifications', {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            
            if (handleUnauthorized(response)) return;
            if (!response.ok) throw new Error('Error al limpiar el historial de alertas');
            
            showToast('<i class="fa-solid fa-trash-can" style="color: var(--color-success);"></i> Historial de alertas limpiado en Redis.');
            notificationsCache = [];
            renderNotifications([]);
        } catch (error) {
            console.error('Error clearing notifications:', error);
            showToast('<i class="fa-solid fa-triangle-exclamation" style="color: var(--color-danger);"></i> Error al limpiar historial de alertas.');
        }
    });

    // Toast alert helper
    function showToast(message) {
        toast.innerHTML = message;
        toast.classList.remove('hidden');
        
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 4000);
    }
});
