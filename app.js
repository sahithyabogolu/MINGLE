const $ = (id) => document.getElementById(id);

const state = {
  peer: null,
  roomCode: "",
  hostPeerId: "",
  peerId: "",
  username: "",
  isHost: false,
  isAdmitted: false,
  pendingRequests: new Map(),
  participants: new Map(),
  connections: new Map(),
  pendingRequestId: "",
  localStream: null,
  calls: new Map(),
  game: {
    x: 20,
    y: 20
  }
};

const els = {
  lobby: $("lobby"),
  waiting: $("waiting"),
  app: $("app"),
  username: $("username"),
  roomCode: $("roomCode"),
  lobbyStatus: $("lobbyStatus"),
  createRoomBtn: $("createRoomBtn"),
  joinRoomBtn: $("joinRoomBtn"),
  cancelRequestBtn: $("cancelRequestBtn"),
  displayRoomCode: $("displayRoomCode"),
  copyRoomBtn: $("copyRoomBtn"),
  copyStatus: $("copyStatus"),
  pendingSection: $("pendingSection"),
  pendingRequests: $("pendingRequests"),
  pendingCount: $("pendingCount"),
  participants: $("participants"),
  participantCount: $("participantCount"),
  currentUserName: $("currentUserName"),
  roomTitle: $("roomTitle"),
  connectionStatus: $("connectionStatus"),
  messages: $("messages"),
  chatForm: $("chatForm"),
  chatInput: $("chatInput"),
  privateUsers: $("privateUsers"),
  leaveRoomBtn: $("leaveRoomBtn"),
  localVideo: $("localVideo"),
  remoteVideos: $("remoteVideos"),
  cameraBtn: $("cameraBtn"),
  micBtn: $("micBtn"),
  toast: $("toast"),
  player: $("player")
};

function showOnly(screen) {
  els.lobby.classList.add("hidden");
  els.waiting.classList.add("hidden");
  els.app.classList.add("hidden");
  screen.classList.remove("hidden");
}

function setLobbyStatus(message, error = false) {
  els.lobbyStatus.textContent = message;
  els.lobbyStatus.style.color = error ? "var(--danger)" : "var(--accent)";
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");

  setTimeout(() => {
    els.toast.classList.remove("show");
  }, 2500);
}

function createRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  return code;
}

function cleanName(value) {
  return value.trim().replace(/[<>]/g, "").slice(0, 24);
}

function cleanRoomCode(value) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function createRequestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function addSystemMessage(text) {
  const message = document.createElement("div");
  message.className = "message system";

  const paragraph = document.createElement("p");
  paragraph.textContent = text;

  message.appendChild(paragraph);
  els.messages.appendChild(message);
  els.messages.scrollTop = els.messages.scrollHeight;
}

function addMessage(name, text) {
  const message = document.createElement("div");
  message.className = "message";

  const strong = document.createElement("strong");
  strong.textContent = name;

  const paragraph = document.createElement("p");
  paragraph.textContent = text;

  message.appendChild(strong);
  message.appendChild(paragraph);

  els.messages.appendChild(message);
  els.messages.scrollTop = els.messages.scrollHeight;
}

function sendToConnection(connection, payload) {
  if (connection && connection.open) {
    connection.send(payload);
  }
}

function broadcast(payload, exceptPeerId = null) {
  for (const [peerId, connection] of state.connections) {
    if (peerId !== exceptPeerId) {
      sendToConnection(connection, payload);
    }
  }
}

function broadcastParticipants() {
  const participants = Array.from(state.participants.values());

  broadcast({
    type: "PARTICIPANTS_UPDATE",
    participants
  });

  renderParticipants();
}

function renderParticipants() {
  els.participants.replaceChildren();

  for (const participant of state.participants.values()) {
    const item = document.createElement("div");
    item.className = "participant";

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = participant.name.charAt(0).toUpperCase();

    const details = document.createElement("div");

    const name = document.createElement("strong");
    name.textContent = participant.name;

    const role = document.createElement("small");
    role.textContent = participant.isHost ? "Host" : "Participant";

    details.appendChild(name);
    details.appendChild(role);
    item.appendChild(avatar);
    item.appendChild(details);

    els.participants.appendChild(item);
  }

  els.participantCount.textContent = state.participants.size;
  renderPrivateUsers();
}

function renderPrivateUsers() {
  els.privateUsers.replaceChildren();

  for (const participant of state.participants.values()) {
    if (participant.peerId === state.peerId) continue;

    const button = document.createElement("button");
    button.className = "secondary-btn";
    button.textContent = `Message ${participant.name}`;
    button.style.margin = "6px";

    button.onclick = () => {
      toast(`Private chat with ${participant.name} is ready`);
    };

    els.privateUsers.appendChild(button);
  }
}

function renderPendingRequests() {
  els.pendingRequests.replaceChildren();
  els.pendingCount.textContent = state.pendingRequests.size;

  if (state.pendingRequests.size === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No pending requests.";
    els.pendingRequests.appendChild(empty);
    return;
  }

  for (const request of state.pendingRequests.values()) {
    const card = document.createElement("div");
    card.className = "pending-card";

    const name = document.createElement("strong");
    name.textContent = request.guestName;

    const time = document.createElement("small");
    time.textContent = new Date(request.timestamp).toLocaleTimeString();

    const actions = document.createElement("div");
    actions.className = "pending-actions";

    const admit = document.createElement("button");
    admit.className = "admit-btn";
    admit.textContent = "Admit";
    admit.onclick = () => admitGuest(request.requestId);

    const reject = document.createElement("button");
    reject.className = "reject-btn";
    reject.textContent = "Reject";
    reject.onclick = () => rejectGuest(request.requestId);

    actions.appendChild(admit);
    actions.appendChild(reject);

    card.appendChild(name);
    card.appendChild(time);
    card.appendChild(actions);

    els.pendingRequests.appendChild(card);
  }
}

function enterRoom() {
  showOnly(els.app);

  els.displayRoomCode.textContent = state.roomCode;
  els.currentUserName.textContent = state.username;
  els.roomTitle.textContent = `${state.roomCode} Room`;
  els.connectionStatus.textContent = "Connected";

  renderParticipants();
  addSystemMessage(`Welcome to room ${state.roomCode}.`);
}

function createPeer(peerId = undefined) {
  return new Promise((resolve, reject) => {
    state.peer = peerId ? new Peer(peerId) : new Peer();

    state.peer.on("open", (id) => {
      state.peerId = id;
      resolve(id);
    });

    state.peer.on("error", (error) => {
      console.error(error);
      reject(error);
    });

    state.peer.on("connection", (connection) => {
      setupConnection(connection);
    });

    state.peer.on("call", (call) => {
      handleIncomingCall(call);
    });

    state.peer.on("disconnected", () => {
      els.connectionStatus.textContent = "Disconnected";
    });

    state.peer.on("close", () => {
      els.connectionStatus.textContent = "Connection closed";
    });
  });
}

function setupConnection(connection) {
  if (state.connections.has(connection.peer)) return;

  state.connections.set(connection.peer, connection);

  connection.on("open", () => {
    if (state.isHost) {
      sendToConnection(connection, {
        type: "HOST_READY",
        roomCode: state.roomCode,
        hostPeerId: state.peerId
      });
    }
  });

  connection.on("data", (payload) => {
    handlePayload(payload, connection);
  });

  connection.on("close", () => {
    state.connections.delete(connection.peer);

    if (state.isHost) {
      state.pendingRequests.forEach((request, requestId) => {
        if (request.guestPeerId === connection.peer) {
          state.pendingRequests.delete(requestId);
        }
      });

      state.participants.delete(connection.peer);
      renderPendingRequests();
      broadcastParticipants();
    }
  });

  connection.on("error", () => {
    state.connections.delete(connection.peer);
  });
}

function connectToHost() {
  const connection = state.peer.connect(state.hostPeerId, {
    reliable: true
  });

  setupConnection(connection);

  connection.on("open", () => {
    state.pendingRequestId = createRequestId();

    sendToConnection(connection, {
      type: "JOIN_REQUEST",
      requestId: state.pendingRequestId,
      guestPeerId: state.peerId,
      guestName: state.username,
      roomCode: state.roomCode,
      timestamp: Date.now()
    });

    showOnly(els.waiting);
  });
}

function handlePayload(payload, connection) {
  if (!payload || !payload.type) return;

  if (payload.type === "HOST_READY") {
    state.hostPeerId = connection.peer;
    return;
  }

  if (payload.type === "JOIN_REQUEST" && state.isHost) {
    if (payload.roomCode !== state.roomCode) return;
    if (state.pendingRequests.has(payload.requestId)) return;
    if (state.participants.has(payload.guestPeerId)) return;

    const alreadyPending = Array.from(state.pendingRequests.values())
      .some((request) => request.guestPeerId === payload.guestPeerId);

    if (alreadyPending) return;

    state.pendingRequests.set(payload.requestId, payload);
    renderPendingRequests();

    addSystemMessage(`${payload.guestName} requested to join.`);
    return;
  }

  if (payload.type === "JOIN_RESPONSE") {
    if (payload.requestId !== state.pendingRequestId) return;

    if (payload.approved) {
      state.isAdmitted = true;
      state.hostPeerId = payload.hostPeerId;

      state.participants = new Map(
        payload.participants.map((participant) => [
          participant.peerId,
          participant
        ])
      );

      enterRoom();
      addSystemMessage("The host admitted you.");
    } else {
      state.isAdmitted = false;
      showOnly(els.waiting);
      $("waitingText").textContent =
        payload.reason || "The host did not admit you.";

      state.connections.forEach((connection) => connection.close());
      state.connections.clear();
    }

    return;
  }

  if (payload.type === "PARTICIPANTS_UPDATE") {
    if (!state.isAdmitted) return;

    state.participants = new Map(
      payload.participants.map((participant) => [
        participant.peerId,
        participant
      ])
    );

    renderParticipants();
    return;
  }

  if (payload.type === "CHAT_MESSAGE") {
    if (!state.isAdmitted) return;
    addMessage(payload.name, payload.text);
    return;
  }
}

function admitGuest(requestId) {
  const request = state.pendingRequests.get(requestId);
  if (!request) return;

  const connection = state.connections.get(request.guestPeerId);
  if (!connection || !connection.open) {
    state.pendingRequests.delete(requestId);
    renderPendingRequests();
    toast("Guest is no longer connected.");
    return;
  }

  const participant = {
    peerId: request.guestPeerId,
    name: request.guestName,
    isHost: false
  };

  state.participants.set(request.guestPeerId, participant);
  state.pendingRequests.delete(requestId);

  sendToConnection(connection, {
    type: "JOIN_RESPONSE",
    requestId,
    approved: true,
    roomCode: state.roomCode,
    hostPeerId: state.peerId,
    participants: Array.from(state.participants.values())
  });

  renderPendingRequests();
  broadcastParticipants();
  addSystemMessage(`${request.guestName} joined the room.`);
}

function rejectGuest(requestId) {
  const request = state.pendingRequests.get(requestId);
  if (!request) return;

  const connection = state.connections.get(request.guestPeerId);

  if (connection) {
    sendToConnection(connection, {
      type: "JOIN_RESPONSE",
      requestId,
      approved: false,
      reason: "The host did not admit you."
    });

    setTimeout(() => connection.close(), 300);
  }

  state.pendingRequests.delete(requestId);
  renderPendingRequests();
  addSystemMessage(`${request.guestName}'s request was rejected.`);
}

async function createRoom() {
  const username = cleanName(els.username.value);

  if (!username) {
    setLobbyStatus("Enter your name first.", true);
    return;
  }

  state.username = username;
  state.roomCode = createRoomCode();
  state.isHost = true;
  state.isAdmitted = true;

  setLobbyStatus("Creating your room...");

  try {
    await createPeer();

    state.hostPeerId = state.peerId;

    state.participants.set(state.peerId, {
      peerId: state.peerId,
      name: state.username,
      isHost: true
    });

    els.pendingSection.classList.remove("hidden");
    enterRoom();
  } catch (error) {
    console.error(error);
    setLobbyStatus("Could not create the room. Try again.", true);
  }
}

async function joinRoom() {
  const username = cleanName(els.username.value);
  const roomCode = cleanRoomCode(els.roomCode.value);

  if (!username) {
    setLobbyStatus("Enter your name first.", true);
    return;
  }

  if (!roomCode || roomCode.length !== 6) {
    setLobbyStatus("Enter a valid 6-character room code.", true);
    return;
  }

  state.username = username;
  state.roomCode = roomCode;
  state.isHost = false;
  state.isAdmitted = false;

  setLobbyStatus("Connecting to the host...");

  /*
    IMPORTANT:
    For this quick MVP, the host's PeerJS ID is shared alongside
    the room code. The room code itself is not used as the PeerJS ID.
  */

  const hostPeerId = prompt(
    "Enter the host PeerJS ID shared by the room creator:"
  );

  if (!hostPeerId || hostPeerId === state.peerId) {
    setLobbyStatus("A valid host PeerJS ID is required.", true);
    return;
  }

  state.hostPeerId = hostPeerId.trim();

  try {
    await createPeer();
    connectToHost();
  } catch (error) {
    console.error(error);
    setLobbyStatus(
      "Room not found or host is offline. Check the room details.",
      true
    );
  }
}

function cancelRequest() {
  state.connections.forEach((connection) => {
    if (connection.peer === state.hostPeerId) {
      sendToConnection(connection, {
        type: "CANCEL_REQUEST",
        requestId: state.pendingRequestId,
        guestPeerId: state.peerId
      });
    }

    connection.close();
  });

  state.connections.clear();
  state.pendingRequestId = "";
  showOnly(els.lobby);
  setLobbyStatus("Join request cancelled.");
}

function leaveRoom() {
  state.connections.forEach((connection) => connection.close());

  if (state.peer) {
    state.peer.destroy();
  }

  state.connections.clear();
  state.participants.clear();
  state.pendingRequests.clear();

  state.peer = null;
  state.peerId = "";
  state.hostPeerId = "";
  state.roomCode = "";
  state.isHost = false;
  state.isAdmitted = false;

  els.messages.replaceChildren();
  showOnly(els.lobby);
  setLobbyStatus("You left the room.");
}

function sendChatMessage(event) {
  event.preventDefault();

  const text = els.chatInput.value.trim();
  if (!text || !state.isAdmitted) return;

  const payload = {
    type: "CHAT_MESSAGE",
    name: state.username,
    text
  };

  addMessage("You", text);

  if (state.isHost) {
    broadcast(payload);
  } else {
    const hostConnection = state.connections.get(state.hostPeerId);
    sendToConnection(hostConnection, payload);
  }

  els.chatInput.value = "";
}

async function enableCamera() {
  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    els.localVideo.srcObject = state.localStream;
    els.cameraBtn.textContent = "Camera Enabled";
    els.micBtn.textContent = "Mic Enabled";

    for (const participant of state.participants.values()) {
      if (participant.peerId === state.peerId) continue;

      const call = state.peer.call(participant.peerId, state.localStream);
      handleCall(call, participant.name);
    }
  } catch (error) {
    toast("Camera or microphone permission was denied.");
  }
}

function handleIncomingCall(call) {
  if (!state.localStream) {
    call.close();
    toast("Enable your camera before accepting calls.");
    return;
  }

  call.answer(state.localStream);
  handleCall(call, "Participant");
}

function handleCall(call, name) {
  state.calls.set(call.peer, call);

  call.on("stream", (stream) => {
    let card = document.getElementById(`video-${call.peer}`);

    if (!card) {
      card = document.createElement("div");
      card.className = "remote-video-card";
      card.id = `video-${call.peer}`;

      const video = document.createElement("video");
      video.autoplay = true;
      video.playsInline = true;
      video.id = `remote-${call.peer}`;

      const label = document.createElement("span");
      label.textContent = name;

      card.appendChild(video);
      card.appendChild(label);
      els.remoteVideos.appendChild(card);
    }

    document.getElementById(`remote-${call.peer}`).srcObject = stream;
  });

  call.on("close", () => {
    document.getElementById(`video-${call.peer}`)?.remove();
    state.calls.delete(call.peer);
  });
}

function setupCanvas() {
  const canvas = $("canvas");
  const context = canvas.getContext("2d");

  let drawing = false;

  canvas.addEventListener("mousedown", () => {
    drawing = true;
  });

  canvas.addEventListener("mouseup", () => {
    drawing = false;
    context.beginPath();
  });

  canvas.addEventListener("mousemove", (event) => {
    if (!drawing) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    context.lineWidth = 3;
    context.lineCap = "round";
    context.strokeStyle = "#8f304f";

    context.lineTo(x, y);
    context.stroke();
    context.beginPath();
    context.moveTo(x, y);
  });
}

function setupGame() {
  document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();

    if (key === "arrowup" || key === "w") state.game.y -= 10;
    if (key === "arrowdown" || key === "s") state.game.y += 10;
    if (key === "arrowleft" || key === "a") state.game.x -= 10;
    if (key === "arrowright" || key === "d") state.game.x += 10;

    state.game.x = Math.max(0, Math.min(576, state.game.x));
    state.game.y = Math.max(0, Math.min(276, state.game.y));

    els.player.style.left = `${state.game.x}px`;
    els.player.style.top = `${state.game.y}px`;
  });
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((item) => {
        item.classList.remove("active");
      });

      document.querySelectorAll(".tab-panel").forEach((panel) => {
        panel.classList.remove("active");
      });

      tab.classList.add("active");
      $(`${tab.dataset.tab}Tab`).classList.add("active");
    });
  });
}

els.createRoomBtn.addEventListener("click", createRoom);
els.joinRoomBtn.addEventListener("click", joinRoom);
els.cancelRequestBtn.addEventListener("click", cancelRequest);
els.leaveRoomBtn.addEventListener("click", leaveRoom);
els.chatForm.addEventListener("submit", sendChatMessage);
els.cameraBtn.addEventListener("click", enableCamera);
els.micBtn.addEventListener("click", enableCamera);

els.copyRoomBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(state.roomCode);
    els.copyStatus.textContent = "Copied!";
  } catch {
    els.copyStatus.textContent = "Copy failed.";
  }

  setTimeout(() => {
    els.copyStatus.textContent = "";
  }, 1800);
});

els.roomCode.addEventListener("input", () => {
  els.roomCode.value = cleanRoomCode(els.roomCode.value);
});

setupTabs();
setupCanvas();
setupGame();
