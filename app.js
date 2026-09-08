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
    button.onclick = () => admitGuest(button.dataset.peer);
  });

  pendingRequests.querySelectorAll(".reject-btn").forEach((button) => {
    button.onclick = () => rejectGuest(button.dataset.peer);
  });
}

/* =========================
   PEER CONNECTION
========================= */

const PEER_OPTIONS = {
  host: "0.peerjs.com",
  port: 443,
  path: "/",
  secure: true,
  debug: 2
};

function createPeer(customId = null) {
  return new Promise((resolve, reject) => {
    let settled = false;

    state.peer = customId
      ? new Peer(customId, PEER_OPTIONS)
      : new Peer(PEER_OPTIONS);

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("Peer connection timed out."));
      }
    }, 20000);

    state.peer.on("open", (id) => {
      clearTimeout(timeout);

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
        clearTimeout(timeout);
        settled = true;
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
      } else if (error.type === "network") {
        showToast(
          "Network connection failed. Check your internet connection.",
          "error"
        );
      } else {
        showToast(
          "Connection problem. Please try again.",
          "error"
        );
      }
    });

    state.peer.on("disconnected", () => {
      console.warn("PeerJS disconnected.");

      if (state.peer && !state.peer.destroyed) {
        setTimeout(() => {
          if (state.peer && !state.peer.destroyed) {
            state.peer.reconnect();
          }
        }, 2000);
      }
    });

    state.peer.on("close", () => {
      console.warn("PeerJS connection closed.");
    });
  });
}

function setupConnection(connection) {
  if (!connection) return;

  state.connections.set(connection.peer, connection);

  connection.on("open", () => {
    console.log("Connected to peer:", connection.peer);
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
    console.error("Data connection error:", error);
  });
}

function broadcast(payload, exceptPeerId = null) {
  state.connections.forEach((connection, peerId) => {
    if (peerId === exceptPeerId) return;

    if (connection.open) {
      try {
        connection.send(payload);
      } catch (error) {
        console.error("Broadcast error:", error);
      }
    }
  });
}

function sendToHost(payload) {
  if (state.connection && state.connection.open) {
    try {
      state.connection.send(payload);
    } catch (error) {
      console.error("Host send error:", error);
    }
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
    console.error("Create room error:", error);

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

    const connection = state.peer.connect(roomCode, {
      reliable: true,
      serialization: "json"
    });

    state.connection = connection;
    setupConnection(connection);

    const connectionTimeout = setTimeout(() => {
      if (!connection.open) {
        showToast(
          "Could not reach the host. Check the room code and internet connection.",
          "error"
        );

        connection.close();
        resetToLobby();
      }
    }, 20000);

    connection.on("open", () => {
      clearTimeout(connectionTimeout);

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

    connection.on("error", (error) => {
      clearTimeout(connectionTimeout);
      console.error("Join connection error:", error);

      showToast(
        "Room not found or host is offline. Check the room code.",
        "error"
      );

      resetToLobby();
    });
  } catch (error) {
    console.error("Join room error:", error);

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
  if (!messagesContainer || !message) return;

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
      ${escapeHtml(message.timestamp)}
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
      state.localStream =
        await navigator.mediaDevices.getUserMedia({
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

      showToast(
        "Camera and microphone enabled.",
        "success"
      );

      return;
    }

    state.localStream.getVideoTracks().forEach((track) => {
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
      state.localStream =
        await navigator.mediaDevices.getUserMedia({
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

      showToast(
        "Microphone enabled.",
        "success"
      );
    } catch (error) {
      showToast(
        "Microphone permission was denied or unavailable.",
        "error"
      );
    }

    return;
  }

  state.localStream.getAudioTracks().forEach((track) => {
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
  if (!state.peer || !state.localStream || !state.hostPeerId) {
    return;
  }

  const call = state.peer.call(
    state.hostPeerId,
    state.localStream
  );

  state.calls.set(state.hostPeerId, call);

  call.on("stream", (remoteStream) => {
    addRemoteVideo(state.hostPeerId, remoteStream);
  });

  call.on("error", (error) => {
    console.error("Call host error:", error);
  });
}

function callAllParticipants() {
  if (!state.peer || !state.localStream) return;

  state.connections.forEach((connection) => {
    if (!connection.open) return;

    const call = state.peer.call(
      connection.peer,
      state.localStream
    );

    state.calls.set(connection.peer, call);

    call.on("stream", (remoteStream) => {
      addRemoteVideo(connection.peer, remoteStream);
    });

    call.on("error", (error) => {
      console.error("Participant call error:", error);
    });
  });
}

function handleIncomingCall(call) {
  if (!call) return;

  if (state.localStream) {
    call.answer(state.localStream);
  } else {
    call.answer();
  }

  state.calls.set(call.peer, call);

  call.on("stream", (remoteStream) => {
    addRemoteVideo(call.peer, remoteStream);
  });

  call.on("error", (error) => {
    console.error("Incoming call error:", error);
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
    wrapper.dataset.peer = peerId;

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

    if (
      ![
        "w",
        "a",
        "s",
        "d",
        "arrowup",
        "arrowdown",
        "arrowleft",
        "arrowright"
      ].includes(key)
    ) {
      return;
    }

    event.preventDefault();

    if (key === "w" || key === "arrowup") {
      state.gamePosition.y = Math.max(
        0,
        state.gamePosition.y - 3
      );
    }

    if (key === "s" || key === "arrowdown") {
      state.gamePosition.y = Math.min(
        100,
        state.gamePosition.y + 3
      );
    }

    if (key === "a" || key === "arrowleft") {
      state.gamePosition.x = Math.max(
        0,
        state.gamePosition.x - 3
      );
    }

    if (key === "d" || key === "arrowright") {
      state.gamePosition.x = Math.min(
        100,
        state.gamePosition.x + 3
      );
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
  state.gamePosition = { x: 50, y: 50 };

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

/* =========================================================
   MINGLE PARTY GAMES
   Spyfall • Trivia Battle • Guess the Drawing
   ========================================================= */

(function installPartyGames() {
  let partyPanel = null;

  let partyState = {
    game: null,
    active: false,
    round: 0,
    questionIndex: 0,
    scores: {},
    answers: {},
    drawingPlayer: null,
    secretWord: "",
    location: "",
    spy: ""
  };

  const triviaQuestions = [
    {
      question: "Which planet is known as the Red Planet?",
      options: ["Earth", "Mars", "Jupiter", "Venus"],
      answer: "Mars"
    },
    {
      question: "What is the capital of France?",
      options: ["Madrid", "Paris", "Rome", "Berlin"],
      answer: "Paris"
    },
    {
      question: "Which animal is known as the King of the Jungle?",
      options: ["Tiger", "Lion", "Elephant", "Leopard"],
      answer: "Lion"
    },
    {
      question: "How many continents are there?",
      options: ["5", "6", "7", "8"],
      answer: "7"
    },
    {
      question: "Which language runs in a web browser?",
      options: ["Python", "JavaScript", "C++", "Java"],
      answer: "JavaScript"
    }
  ];

  const spyLocations = [
    "Beach",
    "Airport",
    "School",
    "Hospital",
    "Restaurant",
    "Space Station",
    "Wedding",
    "Shopping Mall",
    "Police Station",
    "Movie Theatre"
  ];

  const drawingWords = [
    "Rocket",
    "Pizza",
    "Dragon",
    "Laptop",
    "Guitar",
    "Rainbow",
    "Castle",
    "Dinosaur",
    "Coffee",
    "Airplane"
  ];

  function getMyName() {
    return state.username || $("currentUserName")?.textContent || "Player";
  }

  function isHostPlayer() {
    return state.isHost === true;
  }

  function participantNames() {
    const names = [];

    if (Array.isArray(state.participants)) {
      state.participants.forEach((person) => {
        const name =
          typeof person === "string"
            ? person
            : person.username || person.name;

        if (name && !names.includes(name)) {
          names.push(name);
        }
      });
    }

    if (!names.includes(getMyName())) {
      names.push(getMyName());
    }

    return names;
  }

  function sendPartyMessage(payload) {
    const message = {
      type: "PARTY_GAME",
      ...payload
    };

    if (isHostPlayer()) {
      state.connections.forEach((connection) => {
        if (connection.open) {
          connection.send(message);
        }
      });
    } else if (state.connection?.open) {
      state.connection.send(message);
    }
  }

  function broadcastPartyMessage(payload) {
    if (!isHostPlayer()) return;

    const message = {
      type: "PARTY_GAME",
      ...payload
    };

    state.connections.forEach((connection) => {
      if (connection.open) {
        connection.send(message);
      }
    });
  }

  function createPartyPanel() {
    if (partyPanel || !$("gameBoard")) return;

    partyPanel = document.createElement("div");
    partyPanel.id = "partyGamesPanel";

    partyPanel.innerHTML = `
      <h3>🎮 Party Games</h3>

      <p>
        Play multiplayer games with everyone in this room.
      </p>

      <div id="partyGameButtons">
        <button type="button" data-party-game="spyfall">
          🕵️ Spyfall
        </button>

        <button type="button" data-party-game="trivia">
          🧠 Trivia Battle
        </button>

        <button type="button" data-party-game="drawing">
          🎨 Guess the Drawing
        </button>
      </div>

      <div id="partyGameContent">
        <p>Choose a game to begin.</p>
      </div>
    `;

    const gameBoard = $("gameBoard");

    if (!gameBoard || !gameBoard.parentElement) {
      partyPanel = null;
      return;
    }

    gameBoard.parentElement.insertBefore(
      partyPanel,
      gameBoard
    );

    partyPanel
      .querySelectorAll("[data-party-game]")
      .forEach((button) => {
        button.onclick = () => {
          if (!isHostPlayer()) {
            showPartyNotice(
              "Only the room host can start a game."
            );
            return;
          }

          const selectedGame = button.dataset.partyGame;

          if (selectedGame === "spyfall") {
            startSpyfall();
          }

          if (selectedGame === "trivia") {
            startTrivia();
          }

          if (selectedGame === "drawing") {
            startDrawingGame();
          }
        };
      });
  }

  function partyContent(html) {
    const content = $("partyGameContent");

    if (content) {
      content.innerHTML = html;
    }
  }

  function showPartyNotice(message) {
    partyContent(`
      <div class="party-notice">
        ${escapeHtml(message)}
      </div>
    `);
  }

  /* =========================
     SPYFALL
  ========================= */

  function startSpyfall() {
    if (!isHostPlayer()) return;

    const players = participantNames();

    if (players.length < 3) {
      showPartyNotice("Spyfall needs at least 3 players.");
      return;
    }

    const location =
      spyLocations[
        Math.floor(Math.random() * spyLocations.length)
      ];

    const spy =
      players[Math.floor(Math.random() * players.length)];

    partyState = {
      game: "spyfall",
      active: true,
      round: 1,
      questionIndex: 0,
      scores: {},
      answers: {},
      drawingPlayer: null,
      secretWord: "",
      location,
      spy
    };

    broadcastPartyMessage({
      action: "SPYFALL_START",
      players,
      location,
      spy
    });

    renderSpyfall({
      players,
      location,
      spy
    });
  }

  function renderSpyfall(data) {
    const me = getMyName();
    const isSpy = me === data.spy;

    partyContent(`
      <h4>🕵️ Spyfall — Round ${partyState.round}</h4>

      <div class="party-role-card ${
        isSpy ? "spy-card" : ""
      }">
        <strong>Your role:</strong>

        <div class="party-role">
          ${
            isSpy
              ? "🕵️ YOU ARE THE SPY"
              : "👥 INNOCENT"
          }
        </div>

        ${
          isSpy
            ? `
              <p>
                Try to figure out the secret location
                without being caught.
              </p>
            `
            : `
              <p>
                Secret location:
                <strong>${escapeHtml(data.location)}</strong>
              </p>
            `
        }
      </div>

      <p>
        Ask suspicious questions and identify the spy.
      </p>

      ${
        isHostPlayer()
          ? `
            <button type="button" id="endSpyfallBtn">
              Reveal Spy
            </button>
          `
          : ""
      }
    `);

    $("endSpyfallBtn")?.addEventListener("click", () => {
      broadcastPartyMessage({
        action: "SPYFALL_END",
        spy: data.spy,
        location: data.location
      });

      renderSpyfallEnd(data);
    });
  }

  function renderSpyfallEnd(data) {
    partyState.active = false;

    partyContent(`
      <h4>🕵️ Spyfall Results</h4>

      <p>
        The spy was:
        <strong>${escapeHtml(data.spy)}</strong>
      </p>

      <p>
        The location was:
        <strong>${escapeHtml(data.location)}</strong>
      </p>

      ${
        isHostPlayer()
          ? `
            <button type="button" id="restartSpyfallBtn">
              Play Again
            </button>
          `
          : ""
      }
    `);

    $("restartSpyfallBtn")?.addEventListener(
      "click",
      startSpyfall
    );
  }

  /* =========================
     TRIVIA
  ========================= */

  function startTrivia() {
    if (!isHostPlayer()) return;

    partyState = {
      game: "trivia",
      active: true,
      round: 1,
      questionIndex: 0,
      scores: {},
      answers: {},
      drawingPlayer: null,
      secretWord: "",
      location: "",
      spy: ""
    };

    participantNames().forEach((name) => {
      partyState.scores[name] = 0;
    });

    broadcastPartyMessage({
      action: "TRIVIA_START",
      questionIndex: 0,
      scores: partyState.scores
    });

    renderTriviaQuestion(0);
  }

  function renderTriviaQuestion(index) {
    const question = triviaQuestions[index];

    if (!question) {
      finishTrivia();
      return;
    }

    partyState.questionIndex = index;
    partyState.answers = {};

    partyContent(`
      <h4>
        🧠 Trivia Battle —
        Question ${index + 1}/${triviaQuestions.length}
      </h4>

      <p class="trivia-question">
        ${escapeHtml(question.question)}
      </p>

      <div id="triviaOptions">
        ${question.options
          .map(
            (option) => `
              <button
                type="button"
                data-trivia-answer="${escapeHtml(option)}"
              >
                ${escapeHtml(option)}
              </button>
            `
          )
          .join("")}
      </div>

      <p id="triviaStatus">
        Choose one answer.
      </p>
    `);

    partyPanel
      ?.querySelectorAll("[data-trivia-answer]")
      .forEach((button) => {
        button.onclick = () => {
          const answer = button.dataset.triviaAnswer;

          partyPanel
            ?.querySelectorAll("[data-trivia-answer]")
            .forEach((item) => {
              item.disabled = true;
            });

          const status = $("triviaStatus");

          if (status) {
            status.textContent = "Answer submitted.";
          }

          if (isHostPlayer()) {
            receiveTriviaAnswer(getMyName(), answer);
          } else {
            sendPartyMessage({
              action: "TRIVIA_ANSWER",
              player: getMyName(),
              answer
            });
          }
        };
      });
  }

  function receiveTriviaAnswer(player, answer) {
    if (!isHostPlayer()) return;

    if (
      Object.prototype.hasOwnProperty.call(
        partyState.answers,
        player
      )
    ) {
      return;
    }

    partyState.answers[player] = answer;

    const currentQuestion =
      triviaQuestions[partyState.questionIndex];

    if (answer === currentQuestion.answer) {
      partyState.scores[player] =
        (partyState.scores[player] || 0) + 1;
    }

    broadcastPartyMessage({
      action: "TRIVIA_SCORE_UPDATE",
      scores: partyState.scores,
      answeredBy: player
    });

    const totalPlayers = participantNames().length;

    if (
      Object.keys(partyState.answers).length >= totalPlayers
    ) {
      setTimeout(nextTriviaQuestion, 800);
    }
  }

  function nextTriviaQuestion() {
    if (!isHostPlayer()) return;

    partyState.questionIndex += 1;

    if (
      partyState.questionIndex >= triviaQuestions.length
    ) {
      finishTrivia();
      return;
    }

    broadcastPartyMessage({
      action: "TRIVIA_NEXT",
      questionIndex: partyState.questionIndex,
      scores: partyState.scores
    });

    renderTriviaQuestion(partyState.questionIndex);
  }

  function finishTrivia() {
    partyState.active = false;

    const sortedScores = Object.entries(partyState.scores)
      .sort((a, b) => b[1] - a[1])
      .map(
        ([name, score]) => `
          <li>
            <strong>${escapeHtml(name)}</strong>:
            ${score} point(s)
          </li>
        `
      )
      .join("");

    partyContent(`
      <h4>🏆 Trivia Battle Results</h4>

      <ol>
        ${sortedScores || "<li>No scores yet.</li>"}
      </ol>

      ${
        isHostPlayer()
          ? `
            <button type="button" id="restartTriviaBtn">
              Play Again
            </button>
          `
          : ""
      }
    `);

    if (isHostPlayer()) {
      broadcastPartyMessage({
        action: "TRIVIA_END",
        scores: partyState.scores
      });
    }

    $("restartTriviaBtn")?.addEventListener(
      "click",
      startTrivia
    );
  }

  /* =========================
     GUESS THE DRAWING
  ========================= */

  function startDrawingGame() {
    if (!isHostPlayer()) return;

    const players = participantNames();

    if (players.length < 2) {
      showPartyNotice(
        "Guess the Drawing needs at least 2 players."
      );
      return;
    }

    const drawingPlayer =
      players[Math.floor(Math.random() * players.length)];

    const secretWord =
      drawingWords[
        Math.floor(Math.random() * drawingWords.length)
      ];

    partyState = {
      game: "drawing",
      active: true,
      round: 1,
      questionIndex: 0,
      scores: {},
      answers: {},
      drawingPlayer,
      secretWord,
      location: "",
      spy: ""
    };

    broadcastPartyMessage({
      action: "DRAWING_START",
      drawingPlayer,
      secretWord
    });

    renderDrawingGame(drawingPlayer, secretWord);
  }

  function renderDrawingGame(
    drawingPlayer,
    secretWord
  ) {
    const isDrawer = getMyName() === drawingPlayer;

    partyContent(`
      <h4>🎨 Guess the Drawing</h4>

      <p>
        Drawing player:
        <strong>${escapeHtml(drawingPlayer)}</strong>
      </p>

      ${
        isDrawer
          ? `
            <div class="party-role-card spy-card">
              <p>Your word is:</p>

              <strong class="drawing-word">
                ${escapeHtml(secretWord)}
              </strong>

              <p>
                Use the shared canvas above to draw it.
              </p>
            </div>
          `
          : `
            <div class="party-role-card">
              Watch the shared canvas and type guesses
              in chat.
            </div>
          `
      }

      ${
        isHostPlayer()
          ? `
            <button type="button" id="endDrawingBtn">
              Reveal Word
            </button>
          `
          : ""
      }
    `);

    $("endDrawingBtn")?.addEventListener("click", () => {
      broadcastPartyMessage({
        action: "DRAWING_END",
        secretWord
      });

      renderDrawingResults(secretWord);
    });
  }

  function renderDrawingResults(secretWord) {
    partyState.active = false;

    partyContent(`
      <h4>🎨 Drawing Results</h4>

      <p>
        The word was:
        <strong>${escapeHtml(secretWord)}</strong>
      </p>

      ${
        isHostPlayer()
          ? `
            <button type="button" id="restartDrawingBtn">
              Play Again
            </button>
          `
          : ""
      }
    `);

    $("restartDrawingBtn")?.addEventListener(
      "click",
      startDrawingGame
    );
  }

  /* =========================
     RECEIVE PARTY MESSAGES
  ========================= */

  function handlePartyMessage(payload) {
    if (!payload || payload.type !== "PARTY_GAME") {
      return;
    }

    if (payload.action === "SPYFALL_START") {
      partyState = {
        game: "spyfall",
        active: true,
        round: 1,
        questionIndex: 0,
        scores: {},
        answers: {},
        drawingPlayer: null,
        secretWord: "",
        location: payload.location,
        spy: payload.spy
      };

      renderSpyfall(payload);
      return;
    }

    if (payload.action === "SPYFALL_END") {
      renderSpyfallEnd(payload);
      return;
    }

    if (payload.action === "TRIVIA_START") {
      partyState = {
        game: "trivia",
        active: true,
        round: 1,
        questionIndex: payload.questionIndex || 0,
        scores: payload.scores || {},
        answers: {},
        drawingPlayer: null,
        secretWord: "",
        location: "",
        spy: ""
      };

      renderTriviaQuestion(payload.questionIndex || 0);
      return;
    }

    if (payload.action === "TRIVIA_ANSWER") {
      if (isHostPlayer()) {
        receiveTriviaAnswer(
          payload.player,
          payload.answer
        );
      }

      return;
    }

    if (payload.action === "TRIVIA_SCORE_UPDATE") {
      partyState.scores =
        payload.scores || partyState.scores;
      return;
    }

    if (payload.action === "TRIVIA_NEXT") {
      partyState.questionIndex = payload.questionIndex;
      partyState.scores =
        payload.scores || partyState.scores;

      renderTriviaQuestion(payload.questionIndex);
      return;
    }

    if (payload.action === "TRIVIA_END") {
      partyState.scores = payload.scores || {};
      partyState.active = false;

      const sortedScores = Object.entries(
        partyState.scores
      )
        .sort((a, b) => b[1] - a[1])
        .map(
          ([name, score]) => `
            <li>
              <strong>${escapeHtml(name)}</strong>:
              ${score} point(s)
            </li>
          `
        )
        .join("");

      partyContent(`
        <h4>🏆 Trivia Battle Results</h4>

        <ol>
          ${sortedScores || "<li>No scores yet.</li>"}
        </ol>
      `);

      return;
    }

    if (payload.action === "DRAWING_START") {
      partyState = {
        game: "drawing",
        active: true,
        round: 1,
        questionIndex: 0,
        scores: {},
        answers: {},
        drawingPlayer: payload.drawingPlayer,
        secretWord: payload.secretWord,
        location: "",
        spy: ""
      };

      renderDrawingGame(
        payload.drawingPlayer,
        payload.secretWord
      );

      return;
    }

    if (payload.action === "DRAWING_END") {
      renderDrawingResults(payload.secretWord);
    }
  }

  const originalHandlePayload = handlePayload;

  handlePayload = function (payload, connection) {
    originalHandlePayload(payload, connection);
    handlePartyMessage(payload);
  };

  const originalSetupAllFeatures = setupAllFeatures;

  setupAllFeatures = function () {
    originalSetupAllFeatures();
    setupPartyGames();
  };

  function setupPartyGames() {
    const oldPanel =
      document.getElementById("partyGamesPanel");

    if (oldPanel) {
      oldPanel.remove();
    }

    partyPanel = null;
    createPartyPanel();
  }

  if ($("gameBoard")) {
    setupPartyGames();
  }
})();
