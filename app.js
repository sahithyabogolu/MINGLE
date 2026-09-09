/* =========================================================
   MINGLE - Corrected Main Application Script
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
const pendingCount = $("pendingCount");

const participantsList = $("participants");
const participantCount = $("participantCount");

const messagesContainer = $("messages");
const chatForm = $("chatForm");
const messageInput = $("chatInput");

const toastElement = $("toast");

const cameraBtn = $("cameraBtn");
const micBtn = $("micBtn");
const localVideo = $("localVideo");
const remoteVideos = $("remoteVideos");

/* =========================================================
   PEERJS CONFIGURATION
========================================================= */

const PEER_CONFIG = {
  host: "0.peerjs.com",
  port: 443,
  path: "/",
  secure: true,
  debug: 2,
  config: {
    iceServers: [
      {
        urls: "stun:stun.l.google.com:19302"
      },
      {
        urls: "stun:stun1.l.google.com:19302"
      },
      {
        urls: "stun:stun.cloudflare.com:3478"
      }
    ]
  }
};

function getRoomPeerId(roomCode) {
  return `mingle-room-${roomCode.trim().toUpperCase()}`;
}

/* =========================================================
   GENERAL UI
========================================================= */

function showScreen(screenName) {
  Object.values(screens).forEach((screen) => {
    if (screen) screen.classList.add("hidden");
  });

  if (screens[screenName]) {
    screens[screenName].classList.remove("hidden");
  }
}

function setStatus(message) {
  const status = $("lobbyStatus");
  if (status) status.textContent = message;
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function generateRoomCode() {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let i = 0; i < 6; i++) {
    code += characters.charAt(
      Math.floor(Math.random() * characters.length)
    );
  }

  return code;
}

/* =========================================================
   PARTICIPANTS
========================================================= */

function addParticipant(id, name, isHost = false) {
  if (!id) return;

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
          String(participant.name || "?")
            .charAt(0)
            .toUpperCase()
        )}
      </span>

      <span class="participant-name">
        ${escapeHtml(participant.name || "Participant")}
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
    participantCount.textContent = state.participants.length;
  }
}

/* =========================================================
   PENDING JOIN REQUESTS
========================================================= */

function renderPendingRequests() {
  if (!pendingRequests) {
    console.error("Missing HTML element: pendingRequests");
    return;
  }

  pendingRequests.innerHTML = "";

  if (pendingCount) {
    pendingCount.textContent = String(
      state.pendingRequests.size
    );
  }

  if (pendingSection && state.isHost) {
    pendingSection.classList.remove("hidden");
    pendingSection.style.display = "block";
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
        <strong>
          ${escapeHtml(request.username || "Participant")}
        </strong>

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
      button.addEventListener("click", () => {
        admitGuest(button.dataset.peer);
      });
    });

  pendingRequests
    .querySelectorAll(".reject-btn")
    .forEach((button) => {
      button.addEventListener("click", () => {
        rejectGuest(button.dataset.peer);
      });
    });
}

/* =========================================================
   PEERJS CONNECTION
========================================================= */

function createPeer(customId = null) {
  return new Promise((resolve, reject) => {
    let completed = false;

    if (state.peer) {
      try {
        state.peer.destroy();
      } catch (error) {
        console.warn("Previous peer cleanup failed:", error);
      }

      state.peer = null;
    }

    const peer = customId
      ? new Peer(customId, PEER_CONFIG)
      : new Peer(PEER_CONFIG);

    state.peer = peer;

    const timeout = setTimeout(() => {
      if (completed) return;

      completed = true;

      try {
        peer.destroy();
      } catch (error) {
        console.warn(error);
      }

      reject(
        new Error(
          "PeerJS could not connect to the signaling server."
        )
      );
    }, 20000);

    peer.on("open", (id) => {
      clearTimeout(timeout);

      state.peerId = id;

      console.log("Peer opened successfully:", id);

      if (!completed) {
        completed = true;
        resolve(id);
      }
    });

    peer.on("connection", (connection) => {
      console.log(
        "Incoming data connection received:",
        connection.peer
      );

      setupConnection(connection);
    });

    peer.on("call", (call) => {
      console.log("Incoming media call:", call.peer);
      handleIncomingCall(call);
    });

    peer.on("error", (error) => {
      console.error("PeerJS error:", error);

      if (!completed) {
        clearTimeout(timeout);
        completed = true;
        reject(error);
        return;
      }

      if (error.type === "unavailable-id") {
        showToast(
          "This room is already active. Try another room code.",
          "error"
        );
      } else if (error.type === "peer-unavailable") {
        showToast(
          "The room host is unavailable.",
          "error"
        );
      } else if (error.type === "network") {
        showToast(
          "PeerJS network error. Check your internet connection.",
          "error"
        );
      } else {
        showToast(
          `Connection error: ${error.type || "unknown error"}`,
          "error"
        );
      }
    });

    peer.on("disconnected", () => {
      console.warn("Peer disconnected from signaling server.");

      if (
        state.peer &&
        !state.peer.destroyed &&
        !state.peer.disconnected
      ) {
        state.peer.reconnect();
      }
    });

    peer.on("close", () => {
      console.warn("Peer connection closed.");
    });
  });
}

function setupConnection(connection) {
  if (!connection) return;

  console.log(
    "Setting up connection with:",
    connection.peer
  );

  state.connections.set(connection.peer, connection);

  connection.on("open", () => {
    console.log(
      "Data connection opened with:",
      connection.peer
    );
  });

  connection.on("data", (payload) => {
    console.log(
      "Data received from:",
      connection.peer,
      payload
    );

    handlePayload(payload, connection);
  });

  connection.on("close", () => {
    console.log(
      "Connection closed:",
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
    } else if (
      connection.peer === state.hostPeerId
    ) {
      showToast(
        "The host left the room.",
        "error"
      );

      resetToLobby();
    }
  });

  connection.on("error", (error) => {
    console.error(
      "Data connection error:",
      connection.peer,
      error
    );
  });
}

function broadcast(payload, exceptPeerId = null) {
  state.connections.forEach((connection, peerId) => {
    if (peerId === exceptPeerId) return;

    if (connection && connection.open) {
      try {
        connection.send(payload);
      } catch (error) {
        console.error("Broadcast failed:", error);
      }
    }
  });
}

function sendToHost(payload) {
  if (!state.connection) {
    console.warn("No host connection exists.");
    return;
  }

  if (!state.connection.open) {
    console.warn("Host connection is not open.");
    return;
  }

  try {
    state.connection.send(payload);
  } catch (error) {
    console.error("Could not send to host:", error);
  }
}

/* =========================================================
   MESSAGE HANDLING
========================================================= */

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
      state.participants = Array.isArray(
        payload.participants
      )
        ? payload.participants
        : [];

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
        "The host rejected your request.",
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

/* =========================================================
   CREATE ROOM
========================================================= */

async function createRoom() {
  const username = usernameInput?.value.trim();

  if (!username) {
    showToast("Please enter your name.", "error");
    return;
  }

  if (createRoomBtn) {
    createRoomBtn.disabled = true;
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
    console.error("Create room failed:", error);

    if (state.peer) {
      state.peer.destroy();
      state.peer = null;
    }

    setStatus("");

    showToast(
      "Could not create the room. Please try again.",
      "error"
    );
  } finally {
    if (createRoomBtn) {
      createRoomBtn.disabled = false;
    }
  }
}

/* =========================================================
   JOIN ROOM
========================================================= */

async function joinRoom() {
  const username = usernameInput?.value.trim();
  const roomCode = roomCodeInput?.value
    .trim()
    .toUpperCase();

  if (!username) {
    showToast("Please enter your name.", "error");
    return;
  }

  if (!roomCode) {
    showToast("Please enter the room code.", "error");
    return;
  }

  if (joinRoomBtn) {
    joinRoomBtn.disabled = true;
  }

  state.username = username;
  state.roomCode = roomCode;
  state.hostPeerId = getRoomPeerId(roomCode);
  state.isHost = false;

  setStatus("Connecting to host...");

  try {
    await createPeer();

    console.log(
      "Attempting to connect to host:",
      state.hostPeerId
    );

    const connection = state.peer.connect(
      state.hostPeerId,
      {
        reliable: true,
        serialization: "json"
      }
    );

    state.connection = connection;

    setupConnection(connection);

    let connectionOpened = false;

    const connectionTimeout = setTimeout(() => {
      if (connectionOpened) return;

      console.error(
        "Connection timeout. Host was not reached."
      );

      try {
        connection.close();
      } catch (error) {
        console.warn(error);
      }

      showToast(
        "Could not reach the host. Confirm the room code and make sure the host still has the room open.",
        "error"
      );

      resetToLobby();
    }, 20000);

    connection.on("open", () => {
      connectionOpened = true;
      clearTimeout(connectionTimeout);

      console.log(
        "Connected to host successfully:",
        state.hostPeerId
      );

      connection.send({
        type: "JOIN_REQUEST",
        username: state.username,
        roomCode: state.roomCode
      });

      if ($("waitingText")) {
        $("waitingText").textContent =
          `Your request has been sent to room ${state.roomCode}. Waiting for host approval...`;
      }

      setStatus("");
      showScreen("waiting");

      showToast(
        "Join request sent. Waiting for approval."
      );
    });

    connection.on("error", (error) => {
      clearTimeout(connectionTimeout);

      console.error(
        "Guest connection error:",
        error
      );

      showToast(
        "Could not connect to the host.",
        "error"
      );

      resetToLobby();
    });
  } catch (error) {
    console.error("Join room failed:", error);

    setStatus("");

    showToast(
      "Room not found or host is offline.",
      "error"
    );

    resetToLobby();
  } finally {
    if (joinRoomBtn) {
      joinRoomBtn.disabled = false;
    }
  }
}

/* =========================================================
   JOIN REQUEST / ADMIT / REJECT
========================================================= */

function handleJoinRequest(payload, connection) {
  console.log(
    "JOIN REQUEST RECEIVED:",
    payload,
    connection?.peer
  );

  if (!state.isHost) {
    console.warn(
      "Received join request, but this peer is not the host."
    );
    return;
  }

  if (!connection) {
    console.error(
      "Join request has no connection object."
    );
    return;
  }

  state.pendingRequests.set(connection.peer, {
    username: payload.username || "Participant",
    connection
  });

  renderPendingRequests();

  showToast(
    `${payload.username || "Someone"} requested to join.`,
    "success"
  );
}

function admitGuest(peerId) {
  console.log("Admitting guest:", peerId);

  const request = state.pendingRequests.get(peerId);

  if (!request) {
    showToast(
      "This join request is no longer available.",
      "error"
    );
    return;
  }

  if (
    !request.connection ||
    !request.connection.open
  ) {
    state.pendingRequests.delete(peerId);
    renderPendingRequests();

    showToast(
      "The participant disconnected before admission.",
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
        addRemoteVideo(
          peerId,
          remoteStream
        );
      });
    }
  } catch (error) {
    console.error("Admit guest failed:", error);

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
    if (
      request.connection &&
      request.connection.open
    ) {
      request.connection.send({
        type: "JOIN_RESPONSE",
        approved: false
      });
    }
  } catch (error) {
    console.error("Reject message failed:", error);
  }

  state.pendingRequests.delete(peerId);
  renderPendingRequests();

  setTimeout(() => {
    try {
      request.connection?.close();
    } catch (error) {
      console.warn(error);
    }
  }, 500);

  showToast("Request rejected.");
}

function handleJoinResponse(payload) {
  console.log("JOIN RESPONSE RECEIVED:", payload);

  if (!payload.approved) {
    showToast(
      "Your request was rejected by the host.",
      "error"
    );

    resetToLobby();
    return;
  }

  state.participants = Array.isArray(
    payload.participants
  )
    ? payload.participants
    : [];

  addParticipant(
    state.peerId,
    state.username,
    false
  );

  if ($("currentUserName")) {
    $("currentUserName").textContent =
      state.username;
  }

  if ($("roomTitle")) {
    $("roomTitle").textContent =
      `MINGLE Room ${state.roomCode}`;
  }

  if (roomCodeDisplay) {
    roomCodeDisplay.textContent =
      state.roomCode;
  }

  renderParticipants();
  showScreen("app");
  setupAllFeatures();

  showToast(
    "You have been admitted to the room!",
    "success"
  );
}

/* =========================================================
   CHAT
========================================================= */

function setupChat() {
  if (!chatForm) return;

  chatForm.onsubmit = (event) => {
    event.preventDefault();
    sendChatMessage();
  };
}

function sendChatMessage() {
  const text = messageInput?.value.trim();

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

  const element = document.createElement("div");

  element.className =
    message.senderId === state.peerId
      ? "message own-message"
      : "message";

  element.innerHTML = `
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

  messagesContainer.appendChild(element);
  messagesContainer.scrollTop =
    messagesContainer.scrollHeight;
}

/* =========================================================
   TABS
========================================================= */

function setupTabs() {
  const tabButtons =
    document.querySelectorAll(".tab");

  const tabPanels =
    document.querySelectorAll(".tab-panel");

  tabButtons.forEach((button) => {
    button.onclick = () => {
      const tabName = button.dataset.tab;

      tabButtons.forEach((tab) => {
        tab.classList.toggle(
          "active",
          tab === button
        );
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

/* =========================================================
   CAMERA AND MICROPHONE
========================================================= */

async function enableCamera() {
  try {
    if (!state.localStream) {
      state.localStream =
        await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });

      if (localVideo) {
        localVideo.srcObject =
          state.localStream;

        localVideo.play().catch(() => {});
      }

      state.cameraEnabled = true;
      state.micEnabled = true;

      if (cameraBtn) {
        cameraBtn.textContent =
          "Disable Camera";
      }

      if (micBtn) {
        micBtn.textContent = "Disable Mic";
      }

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

    state.localStream
      .getVideoTracks()
      .forEach((track) => {
        track.enabled = !track.enabled;
        state.cameraEnabled = track.enabled;
      });

    if (cameraBtn) {
      cameraBtn.textContent =
        state.cameraEnabled
          ? "Disable Camera"
          : "Enable Camera";
    }

    showToast(
      state.cameraEnabled
        ? "Camera enabled."
        : "Camera disabled."
    );
  } catch (error) {
    console.error("Camera error:", error);

    showToast(
      "Camera permission was denied or unavailable.",
      "error"
    );
  }
}

async function toggleMic() {
  if (!state.localStream) {
    await enableCamera();
    return;
  }

  state.localStream
    .getAudioTracks()
    .forEach((track) => {
      track.enabled = !track.enabled;
      state.micEnabled = track.enabled;
    });

  if (micBtn) {
    micBtn.textContent =
      state.micEnabled
        ? "Disable Mic"
        : "Enable Mic";
  }

  showToast(
    state.micEnabled
      ? "Microphone enabled."
      : "Microphone disabled."
  );
}

function callHost() {
  if (
    !state.peer ||
    !state.localStream ||
    !state.hostPeerId
  ) {
    return;
  }

  const call = state.peer.call(
    state.hostPeerId,
    state.localStream
  );

  state.calls.set(
    state.hostPeerId,
    call
  );

  call.on("stream", (remoteStream) => {
    addRemoteVideo(
      state.hostPeerId,
      remoteStream
    );
  });

  call.on("error", (error) => {
    console.error("Host call error:", error);
  });
}

function callAllParticipants() {
  if (!state.peer || !state.localStream) {
    return;
  }

  state.connections.forEach((connection) => {
    if (!connection.open) return;

    const call = state.peer.call(
      connection.peer,
      state.localStream
    );

    state.calls.set(
      connection.peer,
      call
    );

    call.on("stream", (remoteStream) => {
      addRemoteVideo(
        connection.peer,
        remoteStream
      );
    });

    call.on("error", (error) => {
      console.error(
        "Participant call error:",
        error
      );
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
    addRemoteVideo(
      call.peer,
      remoteStream
    );
  });

  call.on("error", (error) => {
    console.error(
      "Incoming call error:",
      error
    );
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

/* =========================================================
   SHARED CANVAS
========================================================= */

function setupCanvas() {
  const canvas = $("canvas");

  if (!canvas) return;

  state.canvasContext =
    canvas.getContext("2d");

  canvas.onmousedown = (event) => {
    state.drawing = true;

    state.canvasContext.beginPath();
    state.canvasContext.moveTo(
      event.offsetX,
      event.offsetY
    );
  };

  canvas.onmousemove = (event) => {
    if (!state.drawing) return;

    state.canvasContext.lineTo(
      event.offsetX,
      event.offsetY
    );

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

  state.canvasContext.lineTo(
    payload.x,
    payload.y
  );

  state.canvasContext.stroke();
}

/* =========================================================
   SIMPLE GAME
========================================================= */

function setupGame() {
  const gameBoard = $("gameBoard");
  const player = $("player");

  if (!gameBoard || !player) return;

  document.onkeydown = (event) => {
    const key = event.key.toLowerCase();

    const allowedKeys = [
      "w",
      "a",
      "s",
      "d",
      "arrowup",
      "arrowdown",
      "arrowleft",
      "arrowright"
    ];

    if (!allowedKeys.includes(key)) return;

    event.preventDefault();

    if (
      key === "w" ||
      key === "arrowup"
    ) {
      state.gamePosition.y = Math.max(
        0,
        state.gamePosition.y - 3
      );
    }

    if (
      key === "s" ||
      key === "arrowdown"
    ) {
      state.gamePosition.y = Math.min(
        100,
        state.gamePosition.y + 3
      );
    }

    if (
      key === "a" ||
      key === "arrowleft"
    ) {
      state.gamePosition.x = Math.max(
        0,
        state.gamePosition.x - 3
      );
    }

    if (
      key === "d" ||
      key === "arrowright"
    ) {
      state.gamePosition.x = Math.min(
        100,
        state.gamePosition.x + 3
      );
    }

    player.style.left =
      `${state.gamePosition.x}%`;

    player.style.top =
      `${state.gamePosition.y}%`;

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
  const gameBoard = $("gameBoard");

  if (!gameBoard) return;

  let player = document.querySelector(
    `[data-player="${payload.peerId}"]`
  );

  if (!player) {
    player = document.createElement("div");

    player.className = "remote-player";
    player.dataset.player = payload.peerId;

    player.style.position = "absolute";
    player.style.width = "20px";
    player.style.height = "20px";
    player.style.backgroundColor = "#e74c3c";
    player.style.borderRadius = "50%";

    gameBoard.appendChild(player);
  }

  player.style.left = `${payload.x}%`;
  player.style.top = `${payload.y}%`;
}

/* =========================================================
   LEAVE / RESET
========================================================= */

function cancelJoinRequest() {
  if (
    state.connection &&
    state.connection.open
  ) {
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
    try {
      connection.close();
    } catch (error) {
      console.warn(error);
    }
  });

  state.calls.forEach((call) => {
    try {
      call.close();
    } catch (error) {
      console.warn(error);
    }
  });

  resetToLobby();
}

function resetToLobby() {
  if (state.localStream) {
    state.localStream
      .getTracks()
      .forEach((track) => track.stop());

    state.localStream = null;
  }

  if (state.peer) {
    try {
      state.peer.destroy();
    } catch (error) {
      console.warn(error);
    }

    state.peer = null;
  }

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

  if (messagesContainer) {
    messagesContainer.innerHTML = "";
  }

  if (remoteVideos) {
    remoteVideos.innerHTML = "";
  }

  renderParticipants();
  renderPendingRequests();

  setStatus("");
  showScreen("lobby");
}

/* =========================================================
   INITIALIZATION
========================================================= */

function setupAllFeatures() {
  setupChat();
  setupTabs();
  setupMediaControls();
  setupCanvas();
  setupGame();
}

document.addEventListener("DOMContentLoaded", () => {
  createRoomBtn?.addEventListener(
    "click",
    createRoom
  );

  joinRoomBtn?.addEventListener(
    "click",
    joinRoom
  );

  cancelRequestBtn?.addEventListener(
    "click",
    cancelJoinRequest
  );

  leaveRoomBtn?.addEventListener(
    "click",
    leaveRoom
  );

  copyRoomBtn?.addEventListener(
    "click",
    async () => {
      if (!state.roomCode) return;

      try {
        await navigator.clipboard.writeText(
          state.roomCode
        );

        showToast(
          "Room code copied!",
          "success"
        );
      } catch (error) {
        showToast(
          `Copy this room code manually: ${state.roomCode}`
        );
      }
    }
  );

  showScreen("lobby");
});
