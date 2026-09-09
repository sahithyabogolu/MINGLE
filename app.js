/**
 * Fix: Ensure robust multi-peer handling and real-time room join broadcasts
 */

// 1. Keep all data connections open and listen for disconnection explicitly
function handleIncomingConnection(conn) {
    // Prevent default connection timeout or idle closure
    conn.on('open', () => {
        state.connections[conn.peer] = conn;
    });

    conn.on('data', (data) => {
        if (data.type === 'JOIN_REQUEST' && state.isHost) {
            // Save request with connection reference
            state.pendingApprovals[conn.peer] = { 
                username: data.username, 
                conn: conn 
            };
            renderApprovals();
            el.approvalPanel.classList.remove('hidden');
            showToast(`New join request from ${data.username}`);
        } else {
            handleNetworkData(data, conn);
        }
    });

    conn.on('close', () => {
        handleUserDisconnect(conn.peer);
    });

    conn.on('error', (err) => {
        console.error(`Connection error with peer ${conn.peer}:`, err);
        handleUserDisconnect(conn.peer);
    });
}

// 2. Broadcast join approval & full participant list to EVERY connected peer
function approveGuest(peerId) {
    const req = state.pendingApprovals[peerId];
    if (!req) return;

    state.connections[peerId] = req.conn;
    state.participants[peerId] = { username: req.username, isHost: false };
    delete state.pendingApprovals[peerId];

    if (Object.keys(state.pendingApprovals).length === 0) {
        el.approvalPanel.classList.add('hidden');
    } else {
        renderApprovals();
    }

    // Send host approval + full participant list directly to the joining user
    req.conn.send({
        type: 'JOIN_APPROVED',
        participants: state.participants,
        roomCode: state.roomCode
    });

    // Broadcast the new participant to ALL existing room members
    broadcast({
        type: 'PARTICIPANT_JOINED',
        peerId: peerId,
        username: req.username,
        participants: state.participants
    }, peerId);

    updateParticipantsUI();
    addSystemMessage(`${req.username} joined the room.`);
}

// 3. Update network message handler to synchronize participants immediately
function handleNetworkData(data, conn) {
    switch (data.type) {
        case 'JOIN_APPROVED':
            state.participants = data.participants;
            enterRoom();
            showToast('Welcome to the room!');
            break;

        case 'PARTICIPANT_JOINED':
            // Merge full participant list if provided, or add single user
            if (data.participants) {
                state.participants = data.participants;
            } else {
                state.participants[data.peerId] = { username: data.username, isHost: false };
            }
            updateParticipantsUI();
            addSystemMessage(`${data.username} joined the room.`);
            
            // Host re-broadcasts to ensure multi-peer propagation
            if (state.isHost) {
                broadcast(data, conn.peer);
            }
            break;

        case 'PARTICIPANT_LEFT':
            handleUserDisconnect(data.peerId);
            break;

        // ... remaining cases (CHAT, CANVAS, GAME) stay identical ...
    }
}
