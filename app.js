/* =========================================================
   MINGLE - Main Application Script
   Fixed DOM initialization + host join requests
   ========================================================= */

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

let screens;
let usernameInput;
let roomCodeInput;
let createRoomBtn;
let joinRoomBtn;
let cancelRequestBtn;
let roomCodeDisplay;
let copyRoomBtn;
let leaveRoomBtn;
let pendingSection;
let pendingRequests;
let participantsList;
let participantCount;
let pendingCount;
let messagesContainer;
let chatForm;
let messageInput;
let toastElement;
let cameraBtn;
let micBtn;
let localVideo;
let remoteVideos;

/* =========================
   ICE & PEER CONFIGURATION
========================= */

const PEER_CONFIG = {
  host: "0.peerjs.com",
  port: 443,
  path: "/",
  secure: true,
  debug: 1,
  config: {
    iceServers: [
      {
        urls: "stun:stun.l.google.com:19302"
      },
      {
        urls: "stun:stun1.l.google.com:19302"
      },
      {
        urls: "stun:stun2.l.google.com:19302"
      },
      {
        urls: "stun:stun.cloudflare.com:3478"
      },
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelay",
        credential: "openrelay"
      },
      {
        urls: "turn:openrelay.metered.ca:443",
        username: "openrelay",
        credential: "openrelay"
      }
    ]
  }
};

function initializeDOM() {
  screens = {
    lobby: $("lobby"),
    waiting: $("waiting"),
    app: $("app")
  };

  usernameInput = $("username");
  roomCodeInput = $("roomCode");
  createRoomBtn = $("createRoomBtn");
  joinRoomBtn = $("joinRoomBtn");
  cancelRequestBtn = $("cancelRequestBtn");
  roomCodeDisplay = $("displayRoomCode");
  copyRoomBtn = $("copyRoomBtn");
  leaveRoomBtn = $("leaveRoomBtn");

  pendingSection = $("pendingSection");
  pendingRequests = $("pendingRequests");
  participantsList = $("participants");
  participantCount = $("participantCount");
  pendingCount = $("pendingCount");

  messagesContainer = $("messages");
  chatForm = $("chatForm");
  messageInput = $("chatInput");

  toastElement = $("toast");

  cameraBtn = $("cameraBtn");
  micBtn = $("micBtn");
  localVideo = $("localVideo");
  remoteVideos = $("remoteVideos");

  bindMainButtons();

  console.log("MINGLE DOM initialized successfully.");
}

function bindMainButtons() {
  if (createRoomBtn) {
    createRoomBtn.onclick = createRoom;
  }

  if (joinRoomBtn) {
    joinRoomBtn.onclick = joinRoom;
  }

  if (cancelRequestBtn) {
    cancelRequestBtn.onclick = cancelJoinRequest;
  }

  if (leaveRoomBtn) {
    leaveRoomBtn.onclick = leaveRoom;
  }

  if (copyRoomBtn) {
    copyRoomBtn.onclick = async () => {
      if (!state.roomCode) return;

      try {
        await navigator.clipboard.writeText(state.roomCode);
        showToast("Room code copied!", "success");
      } catch {
        const temporaryInput = document.createElement("input");
        temporaryInput.value = state.roomCode;
        document.body.appendChild(temporaryInput);
        temporaryInput.select();
        document.execCommand("copy");
        temporaryInput.remove();

        showToast("Room code copied!", "success");
      }
    };
  }
}

function getRoomPeerId(code) {
  return `mingle-room-${code.toUpperCase().trim()}`;
}

function showScreen(screenName) {
  if (!screens) return;

  Object.values(screens).forEach((screen) => {
    if (screen) {
      screen.classList.add("hidden");
    }
  });

  if (screens[screenName]) {
    screens[screenName].classList.remove("hidden");
  }
}

function showToast(message, type = "info") {
  if (!toastElement) {
    console.log(message);
    return;
  }

  toastElement.textContent = message;
  toastElement.className = `toast ${type}`;
  toastElement.classList.add("show");

  clearTimeout(showToast.timeout);

  showToast.timeout = setTimeout(() => {
    toastElement.classList.remove("show");
  }, 3500);
}

function setStatus(message) {
  const status = $("lobbyStatus");
  if (status) {
    status.textContent = message;
  }
}

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";

  for (let i = 0; i < 6; i++) {
    result += chars.charAt(
      Math.floor(Math.random() * chars.length)
    );
  }

  return result;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* =========================
   PENDING REQUESTS
========================= */

function renderPendingRequests() {
  if (!pendingRequests) {
    console.error("Missing #pendingRequests in index.html");
    return;
  }

  pendingRequests.innerHTML = "";

  if (pendingCount) {
    pendingCount.textContent = state.pendingRequests.size;
  }

  if (state.isHost && pendingSection) {
    pendingSection.classList.remove("hidden");
    pendingSection.style.display = "block";
    pendingSection.style.visibility = "visible";
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
      <div class="request-user">
        <strong>${escapeHtml(request.username)}</strong>
        <small>Wants to join your room</small>
      </div>

      <div class="request-actions">
        <button
          type="button"
          class="admit-btn"
          data-peer="${escapeHtml(peerId)}"
        >
          Admit
        </button>

        <button
          type="button"
          class="reject-btn"
          data-peer="${escapeHtml(peerId)}"
        >
          Reject
        </button>
      </div>
    `;

    pendingRequests.appendChild(card);
  });

  pendingRequests
    .querySelectorAll(".admit-btn")
    .forEach((button) => {
      button.onclick = () => admitGuest(button.dataset.peer);
    });

  pendingRequests
    .querySelectorAll(".reject-btn")
    .forEach((button) => {
      button.onclick = () => rejectGuest(button.dataset.peer);
    });
}

/* =========================
   PEERJS
========================= */

function createPeer(customId = null) {
  return new Promise((resolve, reject) => {
    if (typeof Peer === "undefined") {
      reject(
        new Error(
          "PeerJS is missing. Load PeerJS before app.js in index.html."
        )
      );
      return;
    }

    let settled = false;

    try {
      state.peer = customId
        ? new Peer(customId, PEER_CONFIG)
        : new Peer(PEER_CONFIG);
    } catch (error) {
      reject(error);
      return;
    }

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(
          new Error(
            "PeerJS signaling server timed out."
          )
        );
      }
    }, 20000);

    state.peer.on("open", (id) => {
      clearTimeout(timeout);
      state.peerId = id;

      console.log("Peer opened:", id);

      if (!settled) {
        settled = true;
        resolve(id);
      }
    });

    state.peer.on("connection", (connection) => {
      console.log(
        "INCOMING CONNECTION RECEIVED:",
        connection.peer
      );

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
          "This room code is already active. Try again.",
          "error"
        );
      } else if (error.type === "peer-unavailable") {
        showToast(
          "Room not found or host is offline.",
          "error"
        );
      } else {
        showToast(
          "Network connection problem. Check your internet.",
          "error"
        );
      }
    });

    state.peer.on("disconnected", () => {
      console.warn("Peer disconnected. Reconnecting...");

      if (state.peer && !state.peer.destroyed) {
        state.peer.reconnect();
      }
    });
  });
}

function setupConnection(connection) {
  if (!connection) return;

  state.connections.set(connection.peer, connection);

  connection.on("open", () => {
    console.log(
      "DATA CONNECTION OPEN:",
      connection.peer
    );
  });

  connection.on("data", (payload) => {
    console.log(
      "DATA RECEIVED:",
      payload
    );

    handlePayload(payload, connection);
  });

  connection.on("close", () => {
    console.log(
      "CONNECTION CLOSED:",
      connection.peer
    );

    state.connections.delete(connection.peer);
    state.pendingRequests.delete(connection.peer);
    state.calls.delete(connection.peer);

    removeParticipant(connection.peer);
    renderPendingRequests();

    if (state.isHost) {
      broadcast({
        type: "PARTICIPANTS_UPDATE",
        participants: state.participants
      });
    } else if (connection.peer === state.hostPeerId) {
      showToast(
        "Host left the room. Session ended.",
        "error"
      );

      resetToLobby();
    }
  });

  connection.on("error", (error) => {
    console.error(
      "Data connection error:",
      error
    );
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
  if (!state.connection) {
    console.warn("No connection to host.");
    return;
  }

  if (!state.connection.open) {
    console.warn("Host connection is not open.");
    return;
  }

  try {
    state.connection.send(payload);
  } catch (error) {
    console.error("Send to host error:", error);
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
      showToast(
        "The host rejected your join request.",
        "error"
      );
      resetToLobby();
      break;

    case "CANCEL_REQUEST":
      if (state.isHost) {
        state.pendingRequests.delete(connection.peer);
        renderPendingRequests();

        showToast(
          `${payload.username || "Participant"} cancelled their request.`
        );
      }
      break;

    case "CANVAS_UPDATE":
      drawRemoteCanvas(payload);

      if (state.isHost) {
        broadcast(payload, connection.peer);
      }
      break;

    case "GAME_UPDATE":
      updateRemoteGame(payload);

      if (state.isHost) {
        broadcast(payload, connection.peer);
      }
      break;
  }
}

function handleJoinRequest(payload, connection) {
  console.log(
    "JOIN REQUEST RECEIVED:",
    payload,
    connection?.peer
  );

  if (!state.isHost) {
    console.warn("Received JOIN_REQUEST but current user is not host.");
    return;
  }

  if (!connection) {
    console.error("JOIN_REQUEST has no connection.");
    return;
  }

  if (!connection.open) {
    console.warn("JOIN_REQUEST connection is not open.");
    return;
  }

  const username =
    String(payload.username || "Unknown participant").trim();

  state.pendingRequests.set(connection.peer, {
    username,
    connection
  });

  renderPendingRequests();

  showToast(
    `${username} requested to join your room.`,
    "success"
  );
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
        ${escapeHtml(
          participant.name?.charAt(0)?.toUpperCase() || "?"
        )}
      </span>

      <span class="participant-name">
        ${escapeHtml(participant.name)}
        ${
          participant.isHost
            ? "<small>Host</small>"
            : ""
        }
      </span>
    `;

    participantsList.appendChild(item);
  });

  if (participantCount) {
    participantCount.textContent =
      state.participants.length;
  }
}

/* =========================
   ROOM CREATION
========================= */

async function createRoom() {
  const username = usernameInput?.value.trim();

  if (!username) {
    showToast("Please enter your name.", "error");
    return;
  }

  state.username = username;
  state.isHost = true;
  state.roomCode = generateRoomCode();
  state.hostPeerId = getRoomPeerId(state.roomCode);

  setStatus("Creating room...");

  try {
    await createPeer(state.hostPeerId);

    addParticipant(
      state.peerId,
      state.username,
      true
    );

    if (roomCodeDisplay) {
      roomCodeDisplay.textContent = state.roomCode;
    }

    if ($("currentUserName")) {
      $("currentUserName").textContent =
        state.username;
    }

    if ($("roomTitle")) {
      $("roomTitle").textContent =
        `MINGLE Room ${state.roomCode}`;
    }

    showScreen("app");
    renderParticipants();
    renderPendingRequests();
    setupAllFeatures();
    setStatus("");

    showToast(
      `Room created! Share code: ${state.roomCode}`,
      "success"
    );
  } catch (error) {
    console.error("Create room error:", error);

    if (state.peer) {
      state.peer.destroy();
    }

    state.peer = null;
    state.isHost = false;
    setStatus("");

    showToast(
      "Could not create room. Try again.",
      "error"
    );
  }
}

async function joinRoom() {
  const username = usernameInput?.value.trim();
  const roomCode = roomCodeInput?.value.trim().toUpperCase();

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
  state.hostPeerId = getRoomPeerId(roomCode);
  state.isHost = false;

  setStatus("Connecting to host...");

  try {
    await createPeer();

    const connection = state.peer.connect(
      state.hostPeerId,
      {
        reliable: true,
        serialization: "json"
      }
    );

    state.connection = connection;
    setupConnection(connection);

    const connectionTimeout = setTimeout(() => {
      if (!connection.open) {
        showToast(
          "Host unreachable. Check the room code.",
          "error"
        );

        connection.close();
        resetToLobby();
      }
    }, 20000);

    connection.on("open", () => {
      clearTimeout(connectionTimeout);

      console.log(
        "CONNECTED TO HOST:",
        state.hostPeerId
      );

      connection.send({
        type: "JOIN_REQUEST",
        username: state.username,
        roomCode: state.roomCode
      });

      const waitingText = $("waitingText");

      if (waitingText) {
        waitingText.textContent =
          `Your request has been sent to room ${state.roomCode}. Waiting for approval...`;
      }

      setStatus("");
      showScreen("waiting");
    });

    connection.on("error", (error) => {
      clearTimeout(connectionTimeout);
      console.error("Join connection error:", error);

      showToast(
        "Could not connect to room host.",
        "error"
      );

      resetToLobby();
    });
  } catch (error) {
    console.error("Join room error:", error);

    setStatus("");

    showToast(
      "Room not found or host is offline.",
      "error"
    );

    resetToLobby();
  }
}

/* =========================
   ADMIT / REJECT
========================= */

function admitGuest(peerId) {
  const request = state.pendingRequests.get(peerId);

  if (!request) {
    showToast("This request is no longer available.", "error");
    return;
  }

  if (!request.connection || !request.connection.open) {
    state.pendingRequests.delete(peerId);
    renderPendingRequests();

    showToast(
      "This participant disconnected.",
      "error"
    );

    return;
  }

  try {
    addParticipant(
      peerId,
      request.username,
      false
    );

    request.connection.send({
      type: "JOIN_RESPONSE",
      approved: true,
      participants: state.participants
    });

    state.pendingRequests.delete(peerId);

    broadcast({
      type: "PARTICIPANTS_UPDATE",
      participants: state.participants
    });

    renderPendingRequests();

    showToast(
      `${request.username} admitted.`,
      "success"
    );

    if (state.localStream) {
      const call = state.peer.call(
        peerId,
        state.localStream
      );

      state.calls.set(peerId, call);

      call.on("stream", (remoteStream) => {
        addRemoteVideo(peerId, remoteStream);
      });
    }
  } catch (error) {
    console.error("Admit guest error:", error);

    showToast(
      "Could not admit this participant.",
      "error"
    );
  }
}

function rejectGuest(peerId) {
  const request = state.pendingRequests.get(peerId);

  if (!request) return;

  try {
    if (request.connection?.open) {
      request.connection.send({
        type: "JOIN_RESPONSE",
        approved: false
      });
    }
  } catch (error) {
    console.error("Reject error:", error);
  }

  state.pendingRequests.delete(peerId);
  renderPendingRequests();

  setTimeout(() => {
    if (request.connection) {
      request.connection.close();
    }
  }, 500);

  showToast("Request rejected.");
}

/* =========================
   JOIN RESPONSE
========================= */

function handleJoinResponse(payload) {
  if (!payload.approved) {
    showToast(
      "Your request was declined by the host.",
      "error"
    );

    resetToLobby();
    return;
  }

  state.participants = payload.participants || [];

  if (
    !state.participants.some(
      (participant) => participant.id === state.peerId
    )
  ) {
    state.participants.push({
      id: state.peerId,
      name: state.username,
      isHost: false
    });
  }

  if ($("currentUserName")) {
    $("currentUserName").textContent =
      state.username;
  }

  if ($("roomTitle")) {
    $("roomTitle").textContent =
      `MINGLE Room ${state.roomCode}`;
  }

  if (roomCodeDisplay) {
    roomCodeDisplay.textContent = state.roomCode;
  }

  renderParticipants();
  showScreen("app");
  setupAllFeatures();

  showToast(
    "Welcome to MINGLE!",
    "success"
  );
}

/* =========================
   INITIALIZATION
========================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {
    initializeDOM();
  }
);
