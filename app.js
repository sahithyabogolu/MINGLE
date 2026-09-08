const state = {
  peer: null,
  peerId: null,
  hostPeerId: null,
  roomCode: "",
  username: "",
  isHost: false,
  connection: null,
  connections: new Map(),
  pendingRequests: new Map(),
  participants: [],
  messages: [],
  localStream: null,
  mediaCall: null,
  canvasContext: null,
  drawing: false,
  gamePosition: { x: 50, y: 50 }
};

const $ = (id) => document.getElementById(id);

const screens = {
  lobby: $("lobby"),
  waiting: $("waiting"),
  app: $("app")
};

const usernameInput = $("username");
const roomCodeInput = $("roomCode");
const createRoomBtn = $("createRoomBtn");
const joinRoomBtn = $("joinRoomBtn");
const cancelRequestBtn = $("cancelRequestBtn");
const roomCodeDisplay = $("roomCodeDisplay");
const copyRoomBtn = $("copyRoomBtn");
const leaveRoomBtn = $("leaveRoomBtn");
const pendingRequests = $("pendingRequests");
const participantsList = $("participantsList");
const messagesContainer = $("messages");
const messageInput = $("messageInput");
const sendMessageBtn = $("sendMessageBtn");
const toastContainer = $("toastContainer");

function showScreen(screenName) {
  Object.values(screens).forEach((screen) => {
    if (screen) screen.classList.add("hidden");
  });

  if (screens[screenName]) {
    screens[screenName].classList.remove("hidden");
  }
}

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;

  if (toastContainer) {
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3500);
  } else {
    alert(message);
  }
}

function generateRoomCode() {
  return Math.random()
    .toString(36)
    .substring(2, 8)
    .toUpperCase();
}

function addParticipant(id, name, isHost = false) {
  const existing = state.participants.find(
    (participant) => participant.id === id
  );

  if (existing) {
    existing.name = name;
    existing.isHost = isHost;
  } else {
    state.participants.push({
      id,
      name,
      isHost
    });
  }

  renderParticipants();
}

function removeParticipant(id) {
  state.participants = state.participants.filter(
    (participant) => participant.id !== id
  );

  renderParticipants();
}

function renderParticipants() {
  if (!participantsList) return;

  participantsList.innerHTML = "";

  state.participants.forEach((participant) => {
    const item = document.createElement("div");
    item.className = "participant-item";

    item.innerHTML = `
      <span class="participant-avatar">
        ${participant.name.charAt(0).toUpperCase()}
      </span>
      <span class="participant-name">
        ${escapeHtml(participant.name)}
        ${participant.isHost ? '<small>Host</small>' : ""}
      </span>
    `;

    participantsList.appendChild(item);
  });
}

function renderPendingRequests() {
  if (!pendingRequests) return;

  pendingRequests.innerHTML = "";

  if (!state.isHost) return;

  if (state.pendingRequests.size === 0) {
    pendingRequests.innerHTML =
      '<p class="empty-state">No pending requests</p>';
    return;
  }

  state.pendingRequests.forEach((request, peerId) => {
    const card = document.createElement("div");
    card.className = "pending-request";

    card.innerHTML = `
      <div>
        <strong>${escapeHtml(request.username)}</strong>
        <small>Wants to join</small>
      </div>
      <div class="request-actions">
        <button class="admit-btn" data-peer="${peerId}">Admit</button>
        <button class="reject-btn" data-peer="${peerId}">Reject</button>
      </div>
    `;

    pendingRequests.appendChild(card);
  });

  pendingRequests.querySelectorAll(".admit-btn").forEach((button) => {
    button.addEventListener("click", () => {
      admitGuest(button.dataset.peer);
    });
  });

  pendingRequests.querySelectorAll(".reject-btn").forEach((button) => {
    button.addEventListener("click", () => {
      rejectGuest(button.dataset.peer);
    });
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createPeer(peerId = undefined) {
  return new Promise((resolve, reject) => {
    let settled = false;

    try {
      state.peer = peerId ? new Peer(peerId) : new Peer();

      state.peer.on("open", (id) => {
        state.peerId = id;

        if (!settled) {
          settled = true;
          resolve(id);
        }
      });

      state.peer.on("connection", (connection) => {
        setupConnection(connection);
      });

      state.peer.on("call", (call) => {
        handleIncomingCall(call);
      });

      state.peer.on("error", (error) => {
        console.error("PeerJS error:", error);

        if (!settled) {
          settled = true;
          reject(error);
        } else {
          if (error.type === "unavailable-id") {
            showToast(
              "That room code is already in use. Please create another room.",
              "error"
            );
          } else {
            showToast("Connection error. Please try again.", "error");
          }
        }
      });

      state.peer.on("disconnected", () => {
        console.log("Peer disconnected");
      });
    } catch (error) {
      reject(error);
    }
  });
}

function setupConnection(connection) {
  if (!connection) return;

  state.connections.set(connection.peer, connection);

  connection.on("open", () => {
    console.log("Connection opened:", connection.peer);
  });

  connection.on("data", (payload) => {
    handlePayload(payload, connection);
  });

  connection.on("close", () => {
    state.connections.delete(connection.peer);
    state.pendingRequests.delete(connection.peer);
    removeParticipant(connection.peer);
    renderPendingRequests();
  });

  connection.on("error", (error) => {
    console.error("Connection error:", error);
  });
}

function handlePayload(payload, connection) {
  if (!payload || !payload.type) return;

  switch (payload.type) {
    case "JOIN_REQUEST":
      handleJoinRequest(payload, connection);
      break;

    case "JOIN_RESPONSE":
      handleJoinResponse(payload);
      break;

    case "PARTICIPANTS_UPDATE":
      state.participants = payload.participants || [];
      renderParticipants();
      break;

    case "CHAT_MESSAGE":
      receiveChatMessage(payload.message);

      if (state.isHost) {
        broadcast(payload, connection.peer);
      }
      break;

    case "HOST_READY":
      showToast("Connected to the host.", "success");
      break;

    case "REJECTED":
      showToast("The host rejected your request.", "error");
      resetToLobby();
      break;

    case "CANCEL_REQUEST":
      if (state.isHost) {
        state.pendingRequests.delete(connection.peer);
        renderPendingRequests();
        showToast(`${payload.username} cancelled their request.`);
      }
      break;

    case "CANVAS_UPDATE":
      drawRemoteCanvas(payload);
      break;

    case "GAME_UPDATE":
      updateRemoteGame(payload);
      break;
  }
}

function handleJoinRequest(payload, connection) {
  if (!state.isHost) return;

  state.pendingRequests.set(connection.peer, {
    username: payload.username,
    connection
  });

  renderPendingRequests();
  showToast(`${payload.username} wants to join your room.`);
}

function handleJoinResponse(payload) {
  if (payload.approved) {
    showToast("You have been admitted!", "success");

    state.participants = payload.participants || [];
    renderParticipants();

    enterRoom();
  } else {
    showToast("Your request was rejected.", "error");
    resetToLobby();
  }
}

function admitGuest(peerId) {
  const request = state.pendingRequests.get(peerId);
  if (!request) return;

  const connection = request.connection;

  state.pendingRequests.delete(peerId);

  addParticipant(peerId, request.username, false);

  connection.send({
    type: "JOIN_RESPONSE",
    approved: true,
    participants: state.participants
  });

  broadcastParticipants();
  renderPendingRequests();

  showToast(`${request.username} admitted.`, "success");
}

function rejectGuest(peerId) {
  const request = state.pendingRequests.get(peerId);
  if (!request) return;

  request.connection.send({
    type: "JOIN_RESPONSE",
    approved: false
  });

  request.connection.close();
  state.pendingRequests.delete(peerId);

  renderPendingRequests();
  showToast("Request rejected.");
}

function broadcast(payload, exceptPeerId = null) {
  state.connections.forEach((connection, peerId) => {
    if (peerId === exceptPeerId) return;

    if (connection.open) {
      connection.send(payload);
    }
  });
}

function broadcastParticipants() {
  const payload = {
    type: "PARTICIPANTS_UPDATE",
    participants: state.participants
  };

  broadcast(payload);
  renderParticipants();
}

async function createRoom() {
  const username = usernameInput.value.trim();

  if (!username) {
    showToast("Please enter your name.", "error");
    return;
  }

  state.username = username;
  state.isHost = true;
  state.roomCode = generateRoomCode();
  state.hostPeerId = state.roomCode;

  try {
    await createPeer(state.roomCode);

    addParticipant(state.peerId, state.username, true);

    if (roomCodeDisplay) {
      roomCodeDisplay.textContent = state.roomCode;
    }

    showToast(
      `Room created. Share code ${state.roomCode} with your friend.`,
      "success"
    );

    enterRoom();
  } catch (error) {
    console.error(error);

    state.peer?.destroy();
    state.peer = null;

    showToast(
      "Could not create the room. Please create another room.",
      "error"
    );
  }
}

async function joinRoom() {
  const username = usernameInput.value.trim();
  const roomCode = roomCodeInput.value.trim().toUpperCase();

  if (!username) {
    showToast("Please enter your name.", "error");
    return;
  }

  if (!roomCode) {
    showToast("Please enter the room code.", "error");
    return;
  }

  state.username = username;
  state.roomCode = roomCode;
  state.hostPeerId = roomCode;
  state.isHost = false;

  try {
    await createPeer();

    const connection = state.peer.connect(state.hostPeerId, {
      reliable: true
    });

    state.connection = connection;
    setupConnection(connection);

    connection.on("open", () => {
      connection.send({
        type: "JOIN_REQUEST",
        username: state.username,
        roomCode: state.roomCode
      });

      showScreen("waiting");
      showToast("Join request sent.");
    });

    connection.on("error", () => {
      showToast(
        "Room not found or host is offline. Check the room code.",
        "error"
      );
      resetToLobby();
    });
  } catch (error) {
    console.error(error);

    showToast(
      "Room not found or host is offline. Check the room code.",
      "error"
    );

    resetToLobby();
  }
}

function enterRoom() {
  showScreen("app");
  renderParticipants();
  renderPendingRequests();
  setupTabs();
  setupChat();
  setupMediaControls();
  setupCanvas();
  setupGame();
}

function cancelJoinRequest() {
  if (state.connection?.open) {
    state.connection.send({
      type: "CANCEL_REQUEST",
      username: state.username
    });
  }

  showToast("Join request cancelled.");
  resetToLobby();
}

function leaveRoom() {
  if (state.isHost) {
    broadcast({
      type: "REJECTED"
    });
  }

  state.connections.forEach((connection) => {
    connection.close();
  });

  state.peer?.destroy();

  resetState();
  showScreen("lobby");
  showToast("You left the room.");
}

function resetToLobby() {
  state.peer?.destroy();
  resetState();
  showScreen("lobby");
}

function resetState() {
  state.peer = null;
  state.peerId = null;
  state.hostPeerId = null;
  state.roomCode = "";
  state.username = "";
  state.isHost = false;
  state.connection = null;
  state.connections.clear();
  state.pendingRequests.clear();
  state.participants = [];
  state.messages = [];
  state.localStream = null;
  state.mediaCall = null;

  renderParticipants();
  renderPendingRequests();
}

function sendPayload(payload) {
  if (state.isHost) {
    broadcast(payload);
  } else if (state.connection?.open) {
    state.connection.send(payload);
  }
}

function setupChat() {
  if (!sendMessageBtn || !messageInput) return;

  sendMessageBtn.onclick = sendChatMessage;

  messageInput.onkeydown = (event) => {
    if (event.key === "Enter") {
      sendChatMessage();
    }
  };
}

function sendChatMessage() {
  const text = messageInput.value.trim();

  if (!text) return;

  const message = {
    id: Date.now(),
    sender: state.username,
    senderId: state.peerId,
    text,
    timestamp: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    })
  };

  receiveChatMessage(message);

  if (state.isHost) {
    broadcast({
      type: "CHAT_MESSAGE",
      message
    });
  } else if (state.connection?.open) {
    state.connection.send({
      type: "CHAT_MESSAGE",
      message
    });
  }

  messageInput.value = "";
}

function receiveChatMessage(message) {
  state.messages.push(message);

  if (!messagesContainer) return;

  const messageElement = document.createElement("div");
  messageElement.className =
    message.senderId === state.peerId
      ? "message own-message"
      : "message";

  messageElement.innerHTML = `
    <div class="message-sender">${escapeHtml(message.sender)}</div>
    <div class="message-text">${escapeHtml(message.text)}</div>
    <div class="message-time">${message.timestamp}</div>
  `;

  messagesContainer.appendChild(messageElement);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function setupTabs() {
  const tabButtons = document.querySelectorAll("[data-tab]");
  const tabPanels = document.querySelectorAll("[data-panel]");

  tabButtons.forEach((button) => {
    button.onclick = () => {
      const selectedTab = button.dataset.tab;

      tabButtons.forEach((tab) => {
        tab.classList.toggle("active", tab === button);
      });

      tabPanels.forEach((panel) => {
        panel.classList.toggle(
          "active",
          panel.dataset.panel === selectedTab
        );
      });
    };
  });
}

async function enableMedia() {
  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    const localVideo = $("localVideo");

    if (localVideo) {
      localVideo.srcObject = state.localStream;
      localVideo.muted = true;
      localVideo.play().catch(() => {});
    }

    if (state.isHost) {
      broadcastMediaCall();
    } else if (state.hostPeerId) {
      callHost();
    }

    showToast("Camera and microphone enabled.", "success");
  } catch (error) {
    console.error(error);
    showToast(
      "Camera or microphone permission was denied.",
      "error"
    );
  }
}

function callHost() {
  if (!state.peer || !state.localStream) return;

  const call = state.peer.call(
    state.hostPeerId,
    state.localStream
  );

  state.mediaCall = call;

  call.on("stream", (remoteStream) => {
    attachRemoteStream(remoteStream);
  });
}

function broadcastMediaCall() {
  state.connections.forEach((connection) => {
    if (!state.localStream) return;

    const call = state.peer.call(
      connection.peer,
      state.localStream
    );

    call.on("stream", (remoteStream) => {
      attachRemoteStream(remoteStream);
    });
  });
}

function handleIncomingCall(call) {
  if (!state.localStream) {
    call.answer();
  } else {
    call.answer(state.localStream);
  }

  state.mediaCall = call;

  call.on("stream", (remoteStream) => {
    attachRemoteStream(remoteStream);
  });
}

function attachRemoteStream(stream) {
  const remoteVideo = $("remoteVideo");

  if (remoteVideo) {
    remoteVideo.srcObject = stream;
    remoteVideo.play().catch(() => {});
  }
}

function setupMediaControls() {
  const cameraBtn = $("cameraBtn");
  const micBtn = $("micBtn");

  if (cameraBtn) {
    cameraBtn.onclick = enableMedia;
  }

  if (micBtn) {
    micBtn.onclick = () => {
      if (!state.localStream) {
        enableMedia();
        return;
      }

      const audioTracks = state.localStream.getAudioTracks();

      audioTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });

      showToast(
        audioTracks[0]?.enabled
          ? "Microphone unmuted."
          : "Microphone muted."
      );
    };
  }
}

function setupCanvas() {
  const canvas = $("sharedCanvas");
  if (!canvas) return;

  state.canvasContext = canvas.getContext("2d");

  let drawing = false;

  canvas.onmousedown = (event) => {
    drawing = true;
    state.canvasContext.beginPath();
    state.canvasContext.moveTo(event.offsetX, event.offsetY);
  };

  canvas.onmousemove = (event) => {
    if (!drawing) return;

    state.canvasContext.lineTo(event.offsetX, event.offsetY);
    state.canvasContext.stroke();

    sendPayload({
      type: "CANVAS_UPDATE",
      x: event.offsetX,
      y: event.offsetY
    });
  };

  canvas.onmouseup = () => {
    drawing = false;
  };

  canvas.onmouseleave = () => {
    drawing = false;
  };
}

function drawRemoteCanvas(payload) {
  if (!state.canvasContext) return;

  state.canvasContext.lineTo(payload.x, payload.y);
  state.canvasContext.stroke();
}

function setupGame() {
  const gameBoard = $("gameBoard");
  if (!gameBoard) return;

  gameBoard.onclick = (event) => {
    const rect = gameBoard.getBoundingClientRect();

    state.gamePosition.x =
      ((event.clientX - rect.left) / rect.width) * 100;

    state.gamePosition.y =
      ((event.clientY - rect.top) / rect.height) * 100;

    updateGamePosition();

    sendPayload({
      type: "GAME_UPDATE",
      peerId: state.peerId,
      x: state.gamePosition.x,
      y: state.gamePosition.y
    });
  };
}

function updateGamePosition() {
  const player = document.querySelector(
    `[data-player="${state.peerId}"]`
  );

  if (player) {
    player.style.left = `${state.gamePosition.x}%`;
    player.style.top = `${state.gamePosition.y}%`;
  }
}

function updateRemoteGame(payload) {
  const player = document.querySelector(
    `[data-player="${payload.peerId}"]`
  );

  if (player) {
    player.style.left = `${payload.x}%`;
    player.style.top = `${payload.y}%`;
  }
}

if (createRoomBtn) {
  createRoomBtn.addEventListener("click", createRoom);
}

if (joinRoomBtn) {
  joinRoomBtn.addEventListener("click", joinRoom);
}

if (cancelRequestBtn) {
  cancelRequestBtn.addEventListener("click", cancelJoinRequest);
}

if (leaveRoomBtn) {
  leaveRoomBtn.addEventListener("click", leaveRoom);
}

if (copyRoomBtn) {
  copyRoomBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(state.roomCode);
      showToast("Room code copied.", "success");
    } catch {
      showToast("Copy failed. Please copy the code manually.");
    }
  });
}

showScreen("lobby");
