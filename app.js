/**
 * MINGLE - Fixed Room Join & Multi-Peer Mesh Connection
 */

(function () {
    'use strict';

    // APP STATE
    const state = {
        peer: null,
        peerId: null,
        roomCode: null,
        username: '',
        isHost: false,
        connections: {}, // peerId -> DataConnection
        participants: {}, // peerId -> { username, isHost }
        pendingApprovals: {}, // peerId -> { username, conn }
        selectedPrivatePeerId: '',
        privateMessages: {}, // peerId -> Array
        localStream: null,
        mediaCalls: {}, // peerId -> MediaConnection
        canvasCtx: null,
        isDrawing: false,
        gameState: {
            activeGame: null,
            data: {}
        }
    };

    // PEERJS CONFIG WITH GUARANTEED STUN SERVERS
    const PEER_CONFIG = {
        debug: 1,
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' }
            ],
            sdpSemantics: 'unified-plan'
        }
    };

    // DOM ELEMENTS
    const el = {
        lobbyScreen: document.getElementById('lobby-screen'),
        waitingScreen: document.getElementById('waiting-screen'),
        roomScreen: document.getElementById('room-screen'),
        usernameInput: document.getElementById('username-input'),
        roomCodeInput: document.getElementById('room-code-input'),
        btnCreateRoom: document.getElementById('btn-create-room'),
        btnJoinRoom: document.getElementById('btn-join-room'),
        btnCancelJoin: document.getElementById('btn-cancel-join'),
        lobbyStatus: document.getElementById('lobby-status'),
        displayRoomCode: document.getElementById('display-room-code'),
        btnCopyCode: document.getElementById('btn-copy-code'),
        btnLeaveRoom: document.getElementById('btn-leave-room'),
        approvalPanel: document.getElementById('approval-panel'),
        approvalList: document.getElementById('approval-list'),
        participantCount: document.getElementById('participant-count'),
        participantsList: document.getElementById('participants-list'),
        videoGrid: document.getElementById('video-grid'),
        btnToggleVideo: document.getElementById('btn-toggle-video'),
        btnEndCall: document.getElementById('btn-end-call'),
        sharedCanvas: document.getElementById('shared-canvas'),
        canvasColor: document.getElementById('canvas-color'),
        canvasSize: document.getElementById('canvas-size'),
        btnClearCanvas: document.getElementById('btn-clear-canvas'),
        groupChatPane: document.getElementById('group-chat-pane'),
        privateChatPane: document.getElementById('private-chat-pane'),
        btnGroupChatTab: document.getElementById('btn-group-chat-tab'),
        btnPrivateChatTab: document.getElementById('btn-private-chat-tab'),
        groupChatMessages: document.getElementById('group-chat-messages'),
        groupChatForm: document.getElementById('group-chat-form'),
        groupChatInput: document.getElementById('group-chat-input'),
        privateRecipientSelect: document.getElementById('private-recipient-select'),
        privateChatMessages: document.getElementById('private-chat-messages'),
        privateChatForm: document.getElementById('private-chat-form'),
        privateChatInput: document.getElementById('private-chat-input'),
        btnSendPrivate: document.getElementById('btn-send-private'),
        gameSelection: document.getElementById('game-selection'),
        gameArena: document.getElementById('game-arena'),
        gameTitle: document.getElementById('game-title'),
        gameDisplay: document.getElementById('game-display'),
        btnExitGame: document.getElementById('btn-exit-game'),
        toastContainer: document.getElementById('toast-container')
    };

    // SPYFALL DATA
    const SPYFALL_DATA = [
        { location: 'Airplane', roles: ['Pilot', 'First Class Passenger', 'Flight Attendant', 'Co-Pilot', 'Security Guard'] },
        { location: 'Bank', roles: ['Armored Car Driver', 'Manager', 'Consultant', 'Customer', 'Teller', 'Security Guard'] },
        { location: 'Beach', roles: ['Lifeguard', 'Surfer', 'Ice Cream Vendor', 'Photographer', 'Sunbather'] },
        { location: 'Hospital', roles: ['Doctor', 'Nurse', 'Patient', 'Surgeon', 'Anesthesiologist', 'Visitor'] },
        { location: 'Movie Studio', roles: ['Stuntman', 'Director', 'Actor', 'Cameraman', 'Producer', 'Sound Tech'] },
        { location: 'Pirate Ship', roles: ['Captain', 'Cook', 'Sailor', 'Prisoner', 'Cannoneer', 'Lookout'] }
    ];

    // TRIVIA DATA
    const TRIVIA_DATA = [
        { q: "What is the capital of France?", options: ["Berlin", "Madrid", "Paris", "Rome"], a: 2 },
        { q: "Which planet is known as the Red Planet?", options: ["Venus", "Mars", "Jupiter", "Saturn"], a: 1 },
        { q: "Which element has the chemical symbol 'O'?", options: ["Gold", "Oxygen", "Osmium", "Silver"], a: 1 },
        { q: "How many sides does a hexagon have?", options: ["5", "6", "7", "8"], a: 1 }
    ];

    function init() {
        setupEventListeners();
        setupCanvas();
        showScreen('lobby-screen');
    }

    function showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const target = document.getElementById(screenId);
        if (target) target.classList.add('active');
    }

    function showToast(msg) {
        if (!el.toastContainer) return;
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = msg;
        el.toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    function showLobbyStatus(msg, isError = true) {
        if (!el.lobbyStatus) return;
        el.lobbyStatus.classList.remove('hidden');
        el.lobbyStatus.style.color = isError ? 'var(--danger)' : 'var(--success)';
        el.lobbyStatus.textContent = msg;
    }

    function setupEventListeners() {
        if (el.btnCreateRoom) el.btnCreateRoom.addEventListener('click', handleCreateRoom);
        if (el.btnJoinRoom) el.btnJoinRoom.addEventListener('click', handleJoinRoom);
        if (el.btnCancelJoin) el.btnCancelJoin.addEventListener('click', resetToLobby);
        if (el.btnLeaveRoom) el.btnLeaveRoom.addEventListener('click', leaveRoom);
        if (el.btnCopyCode) {
            el.btnCopyCode.addEventListener('click', () => {
                if (state.roomCode) {
                    navigator.clipboard.writeText(state.roomCode);
                    showToast('Room code copied!');
                }
            });
        }

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                const targetPane = document.getElementById(btn.dataset.tab);
                if (targetPane) targetPane.classList.add('active');
                if (btn.dataset.tab === 'tab-canvas') resizeCanvas();
            });
        });

        if (el.btnGroupChatTab) {
            el.btnGroupChatTab.addEventListener('click', () => {
                el.btnGroupChatTab.classList.add('active');
                if (el.btnPrivateChatTab) el.btnPrivateChatTab.classList.remove('active');
                if (el.groupChatPane) el.groupChatPane.classList.add('active');
                if (el.privateChatPane) el.privateChatPane.classList.remove('active');
            });
        }

        if (el.btnPrivateChatTab) {
            el.btnPrivateChatTab.addEventListener('click', () => {
                el.btnPrivateChatTab.classList.add('active');
                if (el.btnGroupChatTab) el.btnGroupChatTab.classList.remove('active');
                if (el.privateChatPane) el.privateChatPane.classList.add('active');
                if (el.groupChatPane) el.groupChatPane.classList.remove('active');
            });
        }

        if (el.groupChatForm) el.groupChatForm.addEventListener('submit', sendGroupMessage);
        if (el.privateChatForm) el.privateChatForm.addEventListener('submit', sendPrivateMessage);
        if (el.privateRecipientSelect) el.privateRecipientSelect.addEventListener('change', handlePrivateRecipientChange);

        if (el.btnToggleVideo) el.btnToggleVideo.addEventListener('click', startMediaCall);
        if (el.btnEndCall) el.btnEndCall.addEventListener('click', endMediaCall);

        document.querySelectorAll('.btn-start-game').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (!state.isHost) {
                    showToast('Only the host can start games!');
                    return;
                }
                startGame(e.target.dataset.game);
            });
        });
        if (el.btnExitGame) el.btnExitGame.addEventListener('click', exitGame);
    }

    function generateRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = 'MNG-';
        for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
        return code;
    }

    function initPeer(customId = null) {
        return new Promise((resolve, reject) => {
            if (state.peer) {
                try { state.peer.destroy(); } catch (e) {}
            }

            const peer = customId ? new Peer(customId, PEER_CONFIG) : new Peer(PEER_CONFIG);

            peer.on('open', (id) => {
                state.peerId = id;
                state.peer = peer;
                resolve(peer);
            });

            peer.on('connection', (conn) => {
                handleIncomingConnection(conn);
            });

            peer.on('call', (call) => {
                handleIncomingCall(call);
            });

            peer.on('error', (err) => {
                console.error('PeerJS Error:', err);
                if (err.type === 'unavailable-id') {
                    reject(new Error('ROOM_EXISTS'));
                } else if (err.type === 'peer-unavailable') {
                    reject(new Error('ROOM_NOT_FOUND'));
                } else {
                    reject(err);
                }
            });
        });
    }

    async function handleCreateRoom() {
        const name = el.usernameInput.value.trim();
        if (!name) return showLobbyStatus('Please enter a display name.');

        state.username = name;
        state.isHost = true;
        
        let attempts = 0;
        let created = false;

        while (attempts < 5 && !created) {
            attempts++;
            const code = generateRoomCode();
            try {
                await initPeer(code);
                state.roomCode = code;
                state.participants[state.peerId] = { username: state.username, isHost: true };
                created = true;
                enterRoom();
            } catch (err) {
                if (err.message !== 'ROOM_EXISTS') {
                    showLobbyStatus('Connection error. Try again.');
                    return;
                }
            }
        }

        if (!created) {
            showLobbyStatus('Failed to generate a unique room code. Try again.');
        }
    }

    async function handleJoinRoom() {
        const name = el.usernameInput.value.trim();
        let code = el.roomCodeInput.value.trim().toUpperCase();

        if (!name) return showLobbyStatus('Please enter a display name.');
        if (!code) return showLobbyStatus('Please enter a room code.');

        if (!code.startsWith('MNG-') && code.length === 4) {
            code = 'MNG-' + code;
        }

        state.username = name;
        state.isHost = false;
        state.roomCode = code;

        showScreen('waiting-screen');

        try {
            await initPeer();
            
            let attempts = 0;
            let connected = false;

            const tryConnect = () => {
                attempts++;
                const conn = state.peer.connect(code, { reliable: true });

                const timeout = setTimeout(() => {
                    if (!connected && attempts < 3) {
                        tryConnect();
                    } else if (!connected) {
                        resetToLobby();
                        showToast('Room not found or host offline. Check room code.');
                    }
                }, 4000);

                conn.on('open', () => {
                    connected = true;
                    clearTimeout(timeout);
                    state.connections[code] = conn;
                    setupConnectionListeners(conn);
                    conn.send({ 
                        type: 'JOIN_REQUEST', 
                        username: state.username, 
                        peerId: state.peerId 
                    });
                });

                conn.on('error', () => {
                    clearTimeout(timeout);
                    if (attempts < 3) {
                        setTimeout(tryConnect, 1000);
                    } else {
                        resetToLobby();
                        showToast('Could not connect to host.');
                    }
                });
            };

            tryConnect();

        } catch (err) {
            resetToLobby();
            showToast('Failed to initialize connection engine.');
        }
    }

    function handleIncomingConnection(conn) {
        conn.on('open', () => {
            state.connections[conn.peer] = conn;
        });

        conn.on('data', (data) => {
            if (data.type === 'JOIN_REQUEST' && state.isHost) {
                state.pendingApprovals[data.peerId] = { 
                    username: data.username, 
                    conn: conn,
                    peerId: data.peerId 
                };
                renderApprovals();
                if (el.approvalPanel) el.approvalPanel.classList.remove('hidden');
                showToast(`New join request from ${data.username}`);
            } else {
                handleNetworkData(data, conn);
            }
        });

        conn.on('close', () => {
            handleUserDisconnect(conn.peer);
        });

        conn.on('error', () => {
            handleUserDisconnect(conn.peer);
        });
    }

    function setupConnectionListeners(conn) {
        conn.on('data', (data) => handleNetworkData(data, conn));
        conn.on('close', () => handleUserDisconnect(conn.peer));
    }

    function renderApprovals() {
        if (!el.approvalList) return;
        el.approvalList.innerHTML = '';
        Object.entries(state.pendingApprovals).forEach(([peerId, req]) => {
            const div = document.createElement('div');
            div.className = 'approval-item';
            div.innerHTML = `
                <span><strong>${escapeHTML(req.username)}</strong></span>
                <div>
                    <button class="btn btn-success btn-sm btn-approve" data-id="${peerId}"><i class="fa-solid fa-check"></i></button>
                    <button class="btn btn-danger btn-sm btn-reject" data-id="${peerId}"><i class="fa-solid fa-xmark"></i></button>
                </div>
            `;
            el.approvalList.appendChild(div);
        });

        el.approvalList.querySelectorAll('.btn-approve').forEach(b => {
            b.addEventListener('click', () => approveGuest(b.dataset.id));
        });
        el.approvalList.querySelectorAll('.btn-reject').forEach(b => {
            b.addEventListener('click', () => rejectGuest(b.dataset.id));
        });
    }

    function approveGuest(peerId) {
        const req = state.pendingApprovals[peerId];
        if (!req) return;

        state.connections[peerId] = req.conn;
        state.participants[peerId] = { username: req.username, isHost: false };
        delete state.pendingApprovals[peerId];

        if (Object.keys(state.pendingApprovals).length === 0) {
            if (el.approvalPanel) el.approvalPanel.classList.add('hidden');
        } else {
            renderApprovals();
        }

        req.conn.send({
            type: 'JOIN_APPROVED',
            participants: state.participants,
            roomCode: state.roomCode
        });

        broadcast({
            type: 'PARTICIPANT_JOINED',
            peerId: peerId,
            username: req.username,
            participants: state.participants
        }, peerId);

        updateParticipantsUI();
        addSystemMessage(`${req.username} joined the room.`);

        if (state.localStream && state.peer) {
            setTimeout(() => {
                const call = state.peer.call(peerId, state.localStream);
                if (call) setupCall(call, peerId);
            }, 1000);
        }
    }

    function rejectGuest(peerId) {
        const req = state.pendingApprovals[peerId];
        if (req) {
            req.conn.send({ type: 'JOIN_REJECTED', reason: 'Host rejected your join request.' });
            delete state.pendingApprovals[peerId];
            if (Object.keys(state.pendingApprovals).length === 0 && el.approvalPanel) {
                el.approvalPanel.classList.add('hidden');
            }
            renderApprovals();
        }
    }

    function handleNetworkData(data, conn) {
        switch (data.type) {
            case 'JOIN_APPROVED':
                state.participants = data.participants;
                enterRoom();
                showToast('Joined successfully!');
                connectToAllPeers();
                break;

            case 'JOIN_REJECTED':
                resetToLobby();
                showToast(data.reason || 'Join request rejected.');
                break;

            case 'PARTICIPANT_JOINED':
                if (data.participants) {
                    state.participants = data.participants;
                } else {
                    state.participants[data.peerId] = { username: data.username, isHost: false };
                }
                updateParticipantsUI();
                addSystemMessage(`${data.username} joined the room.`);

                if (!state.connections[data.peerId] && data.peerId !== state.peerId) {
                    const newConn = state.peer.connect(data.peerId, { reliable: true });
                    newConn.on('open', () => {
                        state.connections[data.peerId] = newConn;
                        setupConnectionListeners(newConn);
                    });
                }
                break;

            case 'PARTICIPANT_LEFT':
                handleUserDisconnect(data.peerId);
                break;

            case 'CHAT_GROUP':
                appendGroupMessage(data.senderName, data.text, data.timestamp, false);
                if (state.isHost) broadcast(data, conn.peer);
                break;

            case 'CHAT_PRIVATE':
                if (data.receiverPeerId === state.peerId) {
                    storeAndRenderPrivateMessage(data.senderPeerId, data.senderName, data.text, data.timestamp, false);
                    showToast(`Private message from ${data.senderName}`);
                } else if (state.isHost && state.connections[data.receiverPeerId]) {
                    state.connections[data.receiverPeerId].send(data);
                }
                break;

            case 'CANVAS_DRAW':
                drawOnCanvas(data.prevX, data.prevY, data.currX, data.currY, data.color, data.size, false);
                if (state.isHost) broadcast(data, conn.peer);
                break;

            case 'CANVAS_CLEAR':
                clearCanvas(false);
                if (state.isHost) broadcast(data, conn.peer);
                break;

            case 'GAME_STATE_UPDATE':
                state.gameState = data.gameState;
                renderGameUI();
                if (state.isHost) broadcast(data, conn.peer);
                break;
        }
    }

    function connectToAllPeers() {
        Object.keys(state.participants).forEach(pId => {
            if (pId !== state.peerId && !state.connections[pId]) {
                const conn = state.peer.connect(pId, { reliable: true });
                conn.on('open', () => {
                    state.connections[pId] = conn;
                    setupConnectionListeners(conn);
                });
            }
        });
    }

    function broadcast(data, excludePeerId = null) {
        Object.keys(state.connections).forEach(peerId => {
            if (peerId !== excludePeerId && state.connections[peerId] && state.connections[peerId].open) {
                state.connections[peerId].send(data);
            }
        });
    }

    function handleUserDisconnect(peerId) {
        if (state.participants[peerId]) {
            const name = state.participants[peerId].username;
            delete state.participants[peerId];
            if (state.connections[peerId]) {
                try { state.connections[peerId].close(); } catch(e) {}
                delete state.connections[peerId];
            }
            if (state.mediaCalls[peerId]) {
                try { state.mediaCalls[peerId].close(); } catch(e) {}
                delete state.mediaCalls[peerId];
            }
            
            const videoCard = document.getElementById(`video-${peerId}`);
            if (videoCard) videoCard.remove();

            updateParticipantsUI();
            addSystemMessage(`${name} left the room.`);

            if (state.isHost) {
                broadcast({ type: 'PARTICIPANT_LEFT', peerId: peerId });
            }
        }
    }

    function leaveRoom() {
        endMediaCall();
        if (state.peer) {
            try { state.peer.destroy(); } catch(e) {}
        }
        resetToLobby();
    }

    function resetToLobby() {
        state.peer = null;
        state.peerId = null;
        state.connections = {};
        state.participants = {};
        state.pendingApprovals = {};
        state.isHost = false;
        state.roomCode = null;
        showScreen('lobby-screen');
    }

    function enterRoom() {
        if (el.displayRoomCode) el.displayRoomCode.textContent = state.roomCode;
        updateParticipantsUI();
        showScreen('room-screen');
        resizeCanvas();
    }

    function updateParticipantsUI() {
        if (el.participantCount) el.participantCount.textContent = Object.keys(state.participants).length;
        if (el.participantsList) el.participantsList.innerHTML = '';
        if (el.privateRecipientSelect) el.privateRecipientSelect.innerHTML = '<option value="">-- Select Participant --</option>';

        Object.entries(state.participants).forEach(([id, p]) => {
            if (el.participantsList) {
                const card = document.createElement('div');
                card.className = `participant-card ${p.isHost ? 'is-host' : ''}`;
                card.innerHTML = `<i class="fa-solid fa-user"></i> <span>${escapeHTML(p.username)}</span>`;
                el.participantsList.appendChild(card);
            }

            if (id !== state.peerId && el.privateRecipientSelect) {
                const opt = document.createElement('option');
                opt.value = id;
                opt.textContent = p.username;
                el.privateRecipientSelect.appendChild(opt);
            }
        });
    }

    function sendGroupMessage(e) {
        e.preventDefault();
        if (!el.groupChatInput) return;
        const text = el.groupChatInput.value.trim();
        if (!text) return;

        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        appendGroupMessage(state.username, text, timestamp, true);

        const msgData = {
            type: 'CHAT_GROUP',
            senderName: state.username,
            text: text,
            timestamp: timestamp
        };

        broadcast(msgData);
        el.groupChatInput.value = '';
    }

    function appendGroupMessage(sender, text, timestamp, isSelf) {
        if (!el.groupChatMessages) return;
        const div = document.createElement('div');
        div.className = `message-item ${isSelf ? 'self' : 'other'}`;
        div.innerHTML = `
            <div class="message-meta">${escapeHTML(sender)} • ${timestamp}</div>
            <div class="message-body">${escapeHTML(text)}</div>
        `;
        el.groupChatMessages.appendChild(div);
        el.groupChatMessages.scrollTop = el.groupChatMessages.scrollHeight;
    }

    function addSystemMessage(text) {
        if (!el.groupChatMessages) return;
        const div = document.createElement('div');
        div.className = 'message-item system';
        div.textContent = text;
        el.groupChatMessages.appendChild(div);
        el.groupChatMessages.scrollTop = el.groupChatMessages.scrollHeight;
    }

    function handlePrivateRecipientChange() {
        if (!el.privateRecipientSelect) return;
        state.selectedPrivatePeerId = el.privateRecipientSelect.value;
        const active = !!state.selectedPrivatePeerId;
        if (el.privateChatInput) el.privateChatInput.disabled = !active;
        if (el.btnSendPrivate) el.btnSendPrivate.disabled = !active;
        renderPrivateChatHistory();
    }

    function sendPrivateMessage(e) {
        e.preventDefault();
        if (!el.privateChatInput) return;
        const recipientId = state.selectedPrivatePeerId;
        const text = el.privateChatInput.value.trim();
        if (!recipientId || !text) return;

        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        storeAndRenderPrivateMessage(recipientId, 'You', text, timestamp, true);

        const msgData = {
            type: 'CHAT_PRIVATE',
            senderPeerId: state.peerId,
            receiverPeerId: recipientId,
            senderName: state.username,
            text: text,
            timestamp: timestamp
        };

        if (state.connections[recipientId]) {
            state.connections[recipientId].send(msgData);
        } else if (state.connections[state.roomCode]) {
            state.connections[state.roomCode].send(msgData);
        }

        el.privateChatInput.value = '';
    }

    function storeAndRenderPrivateMessage(peerId, senderName, text, timestamp, isSelf) {
        if (!state.privateMessages[peerId]) state.privateMessages[peerId] = [];
        state.privateMessages[peerId].push({ senderName, text, timestamp, isSelf });

        if (state.selectedPrivatePeerId === peerId) {
            renderPrivateChatHistory();
        }
    }

    function renderPrivateChatHistory() {
        if (!el.privateChatMessages) return;
        el.privateChatMessages.innerHTML = '';
        const list = state.privateMessages[state.selectedPrivatePeerId] || [];
        list.forEach(msg => {
            const div = document.createElement('div');
            div.className = `message-item ${msg.isSelf ? 'self' : 'other'}`;
            div.innerHTML = `
                <div class="message-meta">${escapeHTML(msg.senderName)} • ${msg.timestamp}</div>
                <div class="message-body">${escapeHTML(msg.text)}</div>
            `;
            el.privateChatMessages.appendChild(div);
        });
        el.privateChatMessages.scrollTop = el.privateChatMessages.scrollHeight;
    }

    async function startMediaCall() {
        if (state.localStream) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            state.localStream = stream;
            addVideoTrack(state.peerId, `${state.username} (You)`, stream, true);
            if (el.btnEndCall) el.btnEndCall.classList.remove('hidden');

            Object.keys(state.participants).forEach(peerId => {
                if (peerId !== state.peerId) {
                    const call = state.peer.call(peerId, stream);
                    if (call) setupCall(call, peerId);
                }
            });
        } catch (err) {
            showToast('Unable to access camera or microphone.');
        }
    }

    function handleIncomingCall(call) {
        if (!state.localStream) {
            navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
                state.localStream = stream;
                addVideoTrack(state.peerId, `${state.username} (You)`, stream, true);
                if (el.btnEndCall) el.btnEndCall.classList.remove('hidden');
                call.answer(stream);
                setupCall(call, call.peer);
            }).catch(() => {
                call.answer();
                setupCall(call, call.peer);
            });
        } else {
            call.answer(state.localStream);
            setupCall(call, call.peer);
        }
    }

    function setupCall(call, remotePeerId) {
        state.mediaCalls[remotePeerId] = call;
        call.on('stream', (remoteStream) => {
            const username = state.participants[remotePeerId] ? state.participants[remotePeerId].username : 'Participant';
            addVideoTrack(remotePeerId, username, remoteStream, false);
        });
        call.on('close', () => {
            const videoCard = document.getElementById(`video-${remotePeerId}`);
            if (videoCard) videoCard.remove();
        });
    }

    function addVideoTrack(peerId, name, stream, isSelf) {
        if (!el.videoGrid) return;
        let card = document.getElementById(`video-${peerId}`);
        if (!card) {
            card = document.createElement('div');
            card.id = `video-${peerId}`;
            card.className = 'video-card';
            card.innerHTML = `<video autoplay playsinline ${isSelf ? 'muted' : ''}></video><div class="name-tag">${escapeHTML(name)}</div>`;
            el.videoGrid.appendChild(card);
        }
        const videoElem = card.querySelector('video');
        if (videoElem) {
            videoElem.srcObject = stream;
            videoElem.play().catch(e => console.log('Autoplay blocked:', e));
        }
    }

    function endMediaCall() {
        if (state.localStream) {
            state.localStream.getTracks().forEach(track => track.stop());
            state.localStream = null;
        }
        Object.values(state.mediaCalls).forEach(call => {
            try { call.close(); } catch(e) {}
        });
        state.mediaCalls = {};
        if (el.videoGrid) el.videoGrid.innerHTML = '';
        if (el.btnEndCall) el.btnEndCall.classList.add('hidden');
    }

    function setupCanvas() {
        if (!el.sharedCanvas) return;
        state.canvasCtx = el.sharedCanvas.getContext('2d');
        let prevX = 0, prevY = 0;

        function getPos(e) {
            const rect = el.sharedCanvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            return {
                x: clientX - rect.left,
                y: clientY - rect.top
            };
        }

        const startDraw = (e) => {
            state.isDrawing = true;
            const pos = getPos(e);
            prevX = pos.x;
            prevY = pos.y;
        };

        const draw = (e) => {
            if (!state.isDrawing) return;
            const pos = getPos(e);
            const color = el.canvasColor ? el.canvasColor.value : '#ffffff';
            const size = el.canvasSize ? el.canvasSize.value : 5;

            drawOnCanvas(prevX, prevY, pos.x, pos.y, color, size, true);

            const strokeData = { type: 'CANVAS_DRAW', prevX, prevY, currX: pos.x, currY: pos.y, color, size };
            broadcast(strokeData);

            prevX = pos.x;
            prevY = pos.y;
        };

        const stopDraw = () => state.isDrawing = false;

        el.sharedCanvas.addEventListener('mousedown', startDraw);
        el.sharedCanvas.addEventListener('mousemove', draw);
        el.sharedCanvas.addEventListener('mouseup', stopDraw);
        el.sharedCanvas.addEventListener('mouseleave', stopDraw);

        el.sharedCanvas.addEventListener('touchstart', startDraw);
        el.sharedCanvas.addEventListener('touchmove', draw);
        el.sharedCanvas.addEventListener('touchend', stopDraw);

        if (el.btnClearCanvas) {
            el.btnClearCanvas.addEventListener('click', () => {
                clearCanvas(true);
                broadcast({ type: 'CANVAS_CLEAR' });
            });
        }
    }

    function resizeCanvas() {
        if (!el.sharedCanvas || !el.sharedCanvas.parentElement) return;
        const wrapper = el.sharedCanvas.parentElement;
        el.sharedCanvas.width = wrapper.clientWidth || 600;
        el.sharedCanvas.height = wrapper.clientHeight || 400;
    }

    function drawOnCanvas(pX, pY, cX, cY, color, size, isLocal) {
        if (!state.canvasCtx) return;
        state.canvasCtx.beginPath();
        state.canvasCtx.moveTo(pX, pY);
        state.canvasCtx.lineTo(cX, cY);
        state.canvasCtx.strokeStyle = color;
        state.canvasCtx.lineWidth = size;
        state.canvasCtx.lineCap = 'round';
        state.canvasCtx.stroke();
        state.canvasCtx.closePath();
    }

    function clearCanvas(isLocal) {
        if (!state.canvasCtx || !el.sharedCanvas) return;
        state.canvasCtx.clearRect(0, 0, el.sharedCanvas.width, el.sharedCanvas.height);
    }

    function startGame(gameType) {
        state.gameState.activeGame = gameType;

        if (gameType === 'spyfall') {
            const locObj = SPYFALL_DATA[Math.floor(Math.random() * SPYFALL_DATA.length)];
            const participantKeys = Object.keys(state.participants);
            const spyPeerId = participantKeys[Math.floor(Math.random() * participantKeys.length)];

            state.gameState.data = {
                location: locObj.location,
                roles: locObj.roles,
                spyPeerId: spyPeerId
            };
        } else if (gameType === 'trivia' || gameType === 'music') {
            state.gameState.data = {
                questionIndex: 0,
                scores: {}
            };
            Object.keys(state.participants).forEach(id => state.gameState.data.scores[id] = 0);
        }

        syncGameState();
    }

    function exitGame() {
        state.gameState = { activeGame: null, data: {} };
        syncGameState();
    }

    function syncGameState() {
        renderGameUI();
        if (state.isHost) {
            broadcast({ type: 'GAME_STATE_UPDATE', gameState: state.gameState });
        }
    }

    function renderGameUI() {
        if (!el.gameSelection || !el.gameArena) return;

        if (!state.gameState.activeGame) {
            el.gameSelection.classList.remove('hidden');
            el.gameArena.classList.add('hidden');
            return;
        }

        el.gameSelection.classList.add('hidden');
        el.gameArena.classList.remove('hidden');
        if (el.btnExitGame) el.btnExitGame.classList.toggle('hidden', !state.isHost);

        if (state.gameState.activeGame === 'spyfall') {
            if (el.gameTitle) el.gameTitle.textContent = 'Spyfall';
            const isSpy = state.gameState.data.spyPeerId === state.peerId;
            const secretRole = state.gameState.data.roles ? state.gameState.data.roles[Math.floor(Math.random() * state.gameState.data.roles.length)] : 'Member';

            if (el.gameDisplay) {
                el.gameDisplay.innerHTML = `
                    <div style="text-align: center; padding: 20px;">
                        <h3>Your Secret Role:</h3>
                        <div style="font-size: 22px; color: var(--accent); margin: 15px 0; font-weight: bold;">
                            ${isSpy ? '🕵️ YOU ARE THE SPY!' : `📍 Location: ${state.gameState.data.location}`}
                        </div>
                        <p style="color: var(--text-muted);">
                            ${isSpy ? 'Figure out the secret location before time runs out!' : `Your Role: ${secretRole}`}
                        </p>
                    </div>
                `;
            }
        } else if (state.gameState.activeGame === 'trivia') {
            if (el.gameTitle) el.gameTitle.textContent = 'Trivia Quiz';
            const currentQ = TRIVIA_DATA[state.gameState.data.questionIndex || 0];

            if (el.gameDisplay) {
                el.gameDisplay.innerHTML = `
                    <div style="padding: 10px;">
                        <h3>${escapeHTML(currentQ.q)}</h3>
                        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 15px;">
                            ${currentQ.options.map((opt, idx) => `
                                <button class="btn btn-secondary btn-answer" data-idx="${idx}">${escapeHTML(opt)}</button>
                            `).join('')}
                        </div>
                    </div>
                `;

                el.gameDisplay.querySelectorAll('.btn-answer').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const selected = parseInt(e.target.dataset.idx);
                        if (selected === currentQ.a) showToast('Correct!');
                        else showToast('Incorrect!');
                    });
                });
            }
        } else if (state.gameState.activeGame === 'music') {
            if (el.gameTitle) el.gameTitle.textContent = 'Music Guesser';
            if (el.gameDisplay) {
                el.gameDisplay.innerHTML = `
                    <div style="padding: 10px; text-align: center;">
                        <h3>Guess the song title:</h3>
                        <p style="font-style: italic; margin: 15px 0; color: var(--accent);">
                            "Is this the real life? Is this just fantasy? Caught in a landslide..."
                        </p>
                        <input type="text" id="music-guess-input" placeholder="Enter song title..." style="margin-bottom: 10px;">
                        <button id="btn-submit-music" class="btn btn-primary btn-block">Submit Answer</button>
                    </div>
                `;
                document.getElementById('btn-submit-music')?.addEventListener('click', () => {
                    const val = document.getElementById('music-guess-input').value.trim().toLowerCase();
                    if (val.includes('bohemian rhapsody')) showToast('Correct Guess!');
                    else showToast('Try again!');
                });
            }
        }
    }

    function escapeHTML(str) {
        return String(str || '').replace(/[&<>"']/g, function (m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
        });
    }

    document.addEventListener('DOMContentLoaded', init);
})();
