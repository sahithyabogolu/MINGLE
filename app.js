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
  calls: new Map(),
  cameraEnabled: false,
  micEnabled: false,
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
const roomCodeDisplay = $("displayRoomCode");
const copyRoomBtn = $("copyRoomBtn");
const leaveRoomBtn = $("leaveRoomBtn");

const pendingSection = $("pendingSection");
const pendingRequests = $("pendingRequests");
const participantsList = $("participants");
const participantCount = $("participantCount");
const pendingCount = $("pendingCount");

const messagesContainer = $("messages");
const chatForm = $("chatForm");
const messageInput = $("chatInput");

const toastElement = $("toast");

const cameraBtn = $("cameraBtn");
const micBtn = $("micBtn");
const localVideo = $("localVideo");
const remoteVideos = $("remoteVideos");

function showScreen(screenName) {
  Object.values(screens).forEach((screen) => {
    if (screen) screen.classList.add("hidden");
  });

  if (screens[screenName]) {
    screens[screenName].classList.remove("hidden");
  }
}

function showToast(message, type = "info") {
  if (!toastElement) {
    alert(message);
    return;
  }

  toastElement.textContent = message;
  toastElement.className = `toast ${type}`;
  toastElement.classList.add("show");

  setTimeout(() => {
    toastElement.classList.remove("show");
  }, 3500);
}

function setStatus(message) {
  const status = $("lobbyStatus");
  if (status) status.textContent = message;
}

function generateRoomCode() {
  return Math.random()
    .toString(36)
    .substring(2, 8)
    .toUpperCase();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================
   PARTICIPANTS
========================= */

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
        ${escapeHtml(participant.name.charAt(0).toUpperCase())}
      </span>

      <span class="participant-name">
        ${escapeHtml(participant.name)}
        ${participant.isHost ? "<small>Host</small>" : ""}
      </span>
    `;

    participantsList.appendChild(item);
  });

  if (participantCount) {
    participantCount.textContent = state.participants.length;
  }
}

/* =========================
   PENDING REQUESTS
========================= */

function renderPendingRequests() {
  if (!pendingRequests) return;

  pendingRequests.innerHTML = "";

  if (pendingCount) {
    pendingCount.textContent = state.pendingRequests.size;
  }

  if (state.isHost && pendingSection) {
    pendingSection.classList.remove("hidden");
  }

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
        <button class="admit-btn" data-peer="${peerId}">
          Admit
        </button>

        <button class="reject-btn" data-peer="${peerId}">
          Reject
        </button>
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

/* =========================
   PEER CONNECTION
========================= */

function createPeer(customId = null) {
  return new Promise((resolve, reject) => {
    let completed = false;

    state.peer = customId ? new Peer(customId) : new Peer();

    state.peer.on("open", (id) => {
      state.peerId = id;

      if (!completed) {
        completed = true;
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

      if (!completed) {
        completed = true;
        reject(error);
        return;
      }

      if (error.type === "unavailable-id") {
        showToast(
          "That room code is already being used. Create another room.",
          "error"
        );
      } else if (error.type === "peer-unavailable") {
        showToast(
          "Room not found. Check the room code and try again.",
          "error"
        );
      } else {
        showToast("Connection problem. Please try again.", "error");
      }
    });

    state.peer.on("disconnected", () => {
      console.log("Peer disconnected");
    });
  });
}

function setupConnection(connection) {
  if (!connection) return;

  state.connections.set(connection.peer, connection);

  connection.on("open", () => {
    console.log("Connected to:", connection.peer);
  });

  connection.on("data", (payload) => {
    handlePayload(payload, connection);
  });

  connection.on("close", () => {
    state.connections.delete(connection.peer);
    state.pendingRequests.delete(connection.peer);
    state.calls.delete(connection.peer);

    removeParticipant(connection.peer);
    renderPendingRequests();
  });

  connection.on("error", (error) => {
    console.error("Connection error:", error);
  });
}

function broadcast(payload, exceptPeerId = null) {
  state.connections.forEach((connection, peerId) => {
    if (peerId === exceptPeerId) return;

    if (connection.open) {
      connection.send(payload);
    }
  });
}

function sendToHost(payload) {
  if (state.connection && state.connection.open) {
    state.connection.send(payload);
  }
}

/* =========================
   PAYLOAD HANDLING
========================= */

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

/* =========================
   ROOM CREATION / JOINING
========================= */

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

  setStatus("Creating room...");

  try {
    await createPeer(state.roomCode);

    addParticipant(state.peerId, state.username, true);

    roomCodeDisplay.textContent = state.roomCode;
    $("currentUserName").textContent = state.username;
    $("roomTitle").textContent = `MINGLE Room ${state.roomCode}`;

    showScreen("app");
    renderParticipants();
    renderPendingRequests();
    setupAllFeatures();

    showToast(
      `Room created. Share code ${state.roomCode} with your friend.`,
      "success"
    );
  } catch (error) {
    console.error(error);

    state.peer?.destroy();
    state.peer = null;

    setStatus("");
    showToast(
      "Could not create the room. Please try again.",
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

  setStatus("Connecting to room...");

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

      $("waitingText").textContent =
        `Your request has been sent to the host of room ${state.roomCode}.`;

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

function handleJoinRequest(payload, connection) {
  if (!state.isHost) return;

  state.pendingRequests.set(connection.peer, {
    username: payload.username,
    connection
  });

  renderPendingRequests();

  showToast(`${payload.username} wants to join your room.`);
}

function admitGuest(peerId) {
  const request = state.pendingRequests.get(peerId);

  if (!request) return;

  state.pendingRequests.delete(peerId);

  addParticipant(peerId, request.username, false);

  request.connection.send({
    type: "JOIN_RESPONSE",
    approved: true,
    participants: state.participants
  });

  broadcast({
    type: "PARTICIPANTS_UPDATE",
    participants: state.participants
  });

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

function handleJoinResponse(payload) {
  if (!payload.approved) {
    showToast("Your request was rejected.", "error");
    resetToLobby();
    return;
  }

  state.participants = payload.participants || [];

  if (!state.participants.some((person) => person.id === state.peerId)) {
    state.participants.push({
      id: state.peerId,
      name: state.username,
      isHost: false
    });
  }

  $("currentUserName").textContent = state.username;
  $("roomTitle").textContent = `MINGLE Room ${state.roomCode}`;
  roomCodeDisplay.textContent = state.roomCode;

  renderParticipants();
  showScreen("app");
  setupAllFeatures();

  showToast("You have been admitted!", "success");
}

/* =========================
   CHAT
========================= */

function setupChat() {
  if (!chatForm) return;

  chatForm.onsubmit = (event) => {
    event.preventDefault();
    sendChatMessage();
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

  const payload = {
    type: "CHAT_MESSAGE",
    message
  };

  if (state.isHost) {
    broadcast(payload);
  } else {
    sendToHost(payload);
  }

  messageInput.value = "";
}

function receiveChatMessage(message) {
  state.messages.push(message);

  const messageElement = document.createElement("div");

  messageElement.className =
    message.senderId === state.peerId
      ? "message own-message"
      : "message";

  messageElement.innerHTML = `
    <div class="message-sender">
      ${escapeHtml(message.sender)}
    </div>

    <div class="message-text">
      ${escapeHtml(message.text)}
    </div>

    <div class="message-time">
      ${message.timestamp}
    </div>
  `;

  messagesContainer.appendChild(messageElement);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/* =========================
   TABS
========================= */

function setupTabs() {
  const tabButtons = document.querySelectorAll(".tab");
  const tabPanels = document.querySelectorAll(".tab-panel");

  tabButtons.forEach((button) => {
    button.onclick = () => {
      const tabName = button.dataset.tab;

      tabButtons.forEach((tab) => {
        tab.classList.toggle("active", tab === button);
      });

      tabPanels.forEach((panel) => {
        panel.classList.toggle(
          "active",
          panel.id === `${tabName}Tab`
        );
      });
    };
  });
}

/* =========================
   CAMERA AND MICROPHONE
========================= */

async function enableCamera() {
  try {
    if (!state.localStream) {
      state.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

      localVideo.srcObject = state.localStream;
      localVideo.play().catch(() => {});

      state.cameraEnabled = true;
      state.micEnabled = true;

      cameraBtn.textContent = "Disable Camera";
      micBtn.textContent = "Disable Mic";

      if (state.isHost) {
        callAllParticipants();
      } else {
        callHost();
      }

      showToast("Camera and microphone enabled.", "success");
      return;
    }

    const videoTracks = state.localStream.getVideoTracks();

    videoTracks.forEach((track) => {
      track.enabled = !track.enabled;
      state.cameraEnabled = track.enabled;
    });

    cameraBtn.textContent = state.cameraEnabled
      ? "Disable Camera"
      : "Enable Camera";

    showToast(
      state.cameraEnabled
        ? "Camera enabled."
        : "Camera disabled."
    );
  } catch (error) {
    console.error(error);
    showToast(
      "Camera permission was denied or unavailable.",
      "error"
    );
  }
}

async function toggleMic() {
  if (!state.localStream) {
    try {
      state.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

      localVideo.srcObject = state.localStream;
      localVideo.play().catch(() => {});

      state.cameraEnabled = true;
      state.micEnabled = true;

      cameraBtn.textContent = "Disable Camera";
      micBtn.textContent = "Disable Mic";

      if (state.isHost) {
        callAllParticipants();
      } else {
        callHost();
      }

      showToast("Microphone enabled.", "success");
    } catch (error) {
      showToast(
        "Microphone permission was denied or unavailable.",
        "error"
      );
    }

    return;
  }

  const audioTracks = state.localStream.getAudioTracks();

  audioTracks.forEach((track) => {
    track.enabled = !track.enabled;
    state.micEnabled = track.enabled;
  });

  micBtn.textContent = state.micEnabled
    ? "Disable Mic"
    : "Enable Mic";

  showToast(
    state.micEnabled
      ? "Microphone enabled."
      : "Microphone disabled."
  );
}

function callHost() {
  if (!state.peer || !state.localStream) return;

  const call = state.peer.call(
    state.hostPeerId,
    state.localStream
  );

  state.calls.set(state.hostPeerId, call);

  call.on("stream", (remoteStream) => {
    addRemoteVideo(state.hostPeerId, remoteStream);
  });
}

function callAllParticipants() {
  if (!state.peer || !state.localStream) return;

  state.connections.forEach((connection) => {
    const call = state.peer.call(
      connection.peer,
      state.localStream
    );

    state.calls.set(connection.peer, call);

    call.on("stream", (remoteStream) => {
      addRemoteVideo(connection.peer, remoteStream);
    });
  });
}

function handleIncomingCall(call) {
  if (state.localStream) {
    call.answer(state.localStream);
  } else {
    call.answer();
  }

  state.calls.set(call.peer, call);

  call.on("stream", (remoteStream) => {
    addRemoteVideo(call.peer, remoteStream);
  });
}

function addRemoteVideo(peerId, stream) {
  if (!remoteVideos) return;

  let video = document.querySelector(
    `video[data-peer="${peerId}"]`
  );

  if (!video) {
    const wrapper = document.createElement("div");
    wrapper.className = "video-card";

    video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.dataset.peer = peerId;

    const label = document.createElement("span");
    label.textContent = "Participant";

    wrapper.appendChild(video);
    wrapper.appendChild(label);
    remoteVideos.appendChild(wrapper);
  }

  video.srcObject = stream;
  video.play().catch(() => {});
}

function setupMediaControls() {
  if (cameraBtn) {
    cameraBtn.onclick = enableCamera;
  }

  if (micBtn) {
    micBtn.onclick = toggleMic;
  }
}

/* =========================
   SHARED CANVAS
========================= */

function setupCanvas() {
  const canvas = $("canvas");

  if (!canvas) return;

  state.canvasContext = canvas.getContext("2d");

  canvas.onmousedown = (event) => {
    state.drawing = true;

    state.canvasContext.beginPath();
    state.canvasContext.moveTo(event.offsetX, event.offsetY);
  };

  canvas.onmousemove = (event) => {
    if (!state.drawing) return;

    state.canvasContext.lineTo(event.offsetX, event.offsetY);
    state.canvasContext.stroke();

    const payload = {
      type: "CANVAS_UPDATE",
      x: event.offsetX,
      y: event.offsetY
    };

    if (state.isHost) {
      broadcast(payload);
    } else {
      sendToHost(payload);
    }
  };

  canvas.onmouseup = () => {
    state.drawing = false;
  };

  canvas.onmouseleave = () => {
    state.drawing = false;
  };
}

function drawRemoteCanvas(payload) {
  if (!state.canvasContext) return;

  state.canvasContext.lineTo(payload.x, payload.y);
  state.canvasContext.stroke();
}

/* =========================
   SIMPLE GAME
========================= */

function setupGame() {
  const gameBoard = $("gameBoard");
  const player = $("player");

  if (!gameBoard || !player) return;

  document.onkeydown = (event) => {
    const key = event.key.toLowerCase();

    if (!["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
      return;
    }

    event.preventDefault();

    if (key === "w" || key === "arrowup") {
      state.gamePosition.y = Math.max(0, state.gamePosition.y - 3);
    }

    if (key === "s" || key === "arrowdown") {
      state.gamePosition.y = Math.min(100, state.gamePosition.y + 3);
    }

    if (key === "a" || key === "arrowleft") {
      state.gamePosition.x = Math.max(0, state.gamePosition.x - 3);
    }

    if (key === "d" || key === "arrowright") {
      state.gamePosition.x = Math.min(100, state.gamePosition.x + 3);
    }

    player.style.left = `${state.gamePosition.x}%`;
    player.style.top = `${state.gamePosition.y}%`;

    const payload = {
      type: "GAME_UPDATE",
      peerId: state.peerId,
      x: state.gamePosition.x,
      y: state.gamePosition.y
    };

    if (state.isHost) {
      broadcast(payload);
    } else {
      sendToHost(payload);
    }
  };
}

function updateRemoteGame(payload) {
  const player = document.querySelector(
    `[data-player="${payload.peerId}"]`
  );

  if (!player) return;

  player.style.left = `${payload.x}%`;
  player.style.top = `${payload.y}%`;
}

/* =========================
   LEAVE / RESET
========================= */

function cancelJoinRequest() {
  if (state.connection?.open) {
    state.connection.send({
      type: "CANCEL_REQUEST",
      username: state.username
    });
  }

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

  state.calls.forEach((call) => {
    call.close();
  });

  if (state.localStream) {
    state.localStream.getTracks().forEach((track) => {
      track.stop();
    });
  }

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
  state.calls.clear();
  state.localStream = null;
  state.cameraEnabled = false;
  state.micEnabled = false;

  if (localVideo) {
    localVideo.srcObject = null;
  }

  if (remoteVideos) {
    remoteVideos.innerHTML = "";
  }

  renderParticipants();
  renderPendingRequests();
}

function setupAllFeatures() {
  setupTabs();
  setupChat();
  setupMediaControls();
  setupCanvas();
  setupGame();
}

/* =========================
   BUTTON EVENTS
========================= */

createRoomBtn?.addEventListener("click", createRoom);
joinRoomBtn?.addEventListener("click", joinRoom);
cancelRequestBtn?.addEventListener("click", cancelJoinRequest);
leaveRoomBtn?.addEventListener("click", leaveRoom);

copyRoomBtn?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(state.roomCode);

    const copyStatus = $("copyStatus");
    if (copyStatus) copyStatus.textContent = "Copied!";

    showToast("Room code copied.", "success");

    setTimeout(() => {
      if (copyStatus) copyStatus.textContent = "";
    }, 2000);
  } catch {
    showToast("Please copy the room code manually.");
  }
});

showScreen("lobby");
