/* =========================================================
   MINGLE - Complete Application Script
   GitHub Pages + PeerJS + Chat + Video + Join Approval
   ========================================================= */

"use strict";

/* =========================================================
   STATE
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
  calls: new Map(),

  localStream: null,
  cameraEnabled: false,
  micEnabled: false,

  canvasContext: null,
  drawing: false,

  gamePosition: {
    x: 50,
    y: 50
  }
};

/* =========================================================
   DOM REFERENCES
========================================================= */

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

/* =========================================================
   PEERJS CONFIGURATION
========================================================= */

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

/* =========================================================
   INITIALIZATION
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  initializeDOM();
  bindMainButtons();

  console.log("MINGLE initialized successfully.");
});

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
    copyRoomBtn.onclick = copyRoomCode;
  }
}

/* =========================================================
   HELPERS
========================================================= */

function getRoomPeerId(code) {
  return `mingle-room-${code.toUpperCase().trim()}`;
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

function setText(id, value) {
  const element = $(id);

  if (element) {
    element.textContent = value;
  }
}

async function copyRoomCode() {
  if (!state.roomCode) return;

  try {
    await navigator.clipboard.writeText(state.roomCode);
    showToast("Room code copied!", "success");
  } catch {
    const input = document.createElement("input");

    input.value = state.roomCode;
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();

    showToast("Room code copied!", "success");
  }
}

/* =========================================================
   PEERJS CORE
========================================================= */

function createPeer(customId = null) {
  return new Promise((resolve, reject) => {
    if (typeof Peer === "undefined") {
      reject(
        new Error(
          "PeerJS is missing. Load PeerJS before app.js."
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

      console.log("PEER OPENED:", id);

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
      console.error("PEERJS ERROR:", error);

      if (!settled) {
        clearTimeout(timeout);
        settled = true;
        reject(error);
        return;
      }

      if (error.type === "unavailable-id") {
        showToast(
          "That room code is already active. Try again.",
          "error"
        );
      } else if (error.type === "peer-unavailable") {
        showToast(
          "Room not found or host is offline.",
          "error"
        );
      } else {
        showToast(
          "Network connection problem occurred.",
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
    console.log("DATA RECEIVED:", payload);

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
      "DATA CONNECTION ERROR:",
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

/* =========================================================
   PAYLOAD HANDLING
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

    default:
      console.warn(
        "Unknown payload type:",
        payload.type
      );
  }
}

/* =========================================================
   ROOM CREATION
========================================================= */

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

    setText("displayRoomCode", state.roomCode);
    setText("currentUserName", state.username);
    setText(
      "roomTitle",
      `MINGLE Room ${state.roomCode}`
    );

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
    console.error("CREATE ROOM ERROR:", error);

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

/* =========================================================
   JOIN ROOM
========================================================= */

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

    const timeout = setTimeout(() => {
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
      clearTimeout(timeout);

      console.log(
        "CONNECTED TO HOST:",
        state.hostPeerId
      );

      connection.send({
        type: "JOIN_REQUEST",
        username: state.username,
        roomCode: state.roomCode
      });

      setText(
        "waitingText",
        `Your request has been sent to room ${state.roomCode}. Waiting for approval...`
      );

      setStatus("");
      showScreen("waiting");
    });

    connection.on("error", (error) => {
      clearTimeout(timeout);

      console.error(
        "JOIN CONNECTION ERROR:",
        error
      );

      showToast(
        "Could not connect to room host.",
        "error"
      );

      resetToLobby();
    });
  } catch (error) {
    console.error("JOIN ROOM ERROR:", error);

    setStatus("");

    showToast(
      "Room not found or host is offline.",
      "error"
    );

    resetToLobby();
  }
}

/* =========================================================
   JOIN REQUEST HANDLING
========================================================= */

function handleJoinRequest(payload, connection) {
  console.log(
    "JOIN REQUEST RECEIVED:",
    payload,
    connection?.peer
  );

  if (!state.isHost) {
    console.warn(
      "Received join request but current user is not host."
    );

    return;
  }

  if (!connection) {
    console.error(
      "Join request has no connection."
    );

    return;
  }

  if (!connection.open) {
    console.warn(
      "Join request connection is not open."
    );

    return;
  }

  const username =
    String(
      payload.username || "Unknown participant"
    ).trim();

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

/* =========================================================
   PENDING REQUESTS UI
========================================================= */

function renderPendingRequests() {
  if (!pendingRequests) {
    console.error(
      "Missing #pendingRequests in index.html"
    );

    return;
  }

  pendingRequests.innerHTML = "";

  if (pendingCount) {
    pendingCount.textContent =
      state.pendingRequests.size;
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

  state.pendingRequests.forEach(
    (request, peerId) => {
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
    }
  );

  pendingRequests
    .querySelectorAll(".admit-btn")
    .forEach((button) => {
      button.onclick = () => {
        admitGuest(button.dataset.peer);
      };
    });

  pendingRequests
    .querySelectorAll(".reject-btn")
    .forEach((button) => {
      button.onclick = () => {
        rejectGuest(button.dataset.peer);
      };
    });
}

/* =========================================================
   ADMIT / REJECT
========================================================= */

function admitGuest(peerId) {
  const request = state.pendingRequests.get(peerId);

  if (!request) {
    showToast(
      "This request is no longer available.",
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
        addRemoteVideo(
          peerId,
          remoteStream
        );
      });
    }
  } catch (error) {
    console.error(
      "ADMIT GUEST ERROR:",
      error
    );

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
    console.error(
      "REJECT GUEST ERROR:",
      error
    );
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

function handleJoinResponse(payload) {
  if (!payload.approved) {
    showToast(
      "Your request was declined by the host.",
      "error"
    );

    resetToLobby();
    return;
  }

  state.participants =
    payload.participants || [];

  if (
    !state.participants.some(
      (participant) =>
        participant.id === state.peerId
    )
  ) {
    state.participants.push({
      id: state.peerId,
      name: state.username,
      isHost: false
    });
  }

  setText(
    "currentUserName",
    state.username
  );

  setText(
    "roomTitle",
    `MINGLE Room ${state.roomCode}`
  );

  setText(
    "displayRoomCode",
    state.roomCode
  );

  renderParticipants();

  showScreen("app");
  setupAllFeatures();

  showToast(
    "Welcome to MINGLE!",
    "success"
  );
}

/* =========================================================
   PARTICIPANTS
========================================================= */

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
  state.participants =
    state.participants.filter(
      (participant) =>
        participant.id !== id
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
          participant.name
            ?.charAt(0)
            ?.toUpperCase() || "?"
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
  if (!messageInput) return;

  const text = messageInput.value.trim();

  if (!text) return;

  const message = {
    id: Date.now(),
    sender: state.username,
    senderId: state.peerId,
    text,
    timestamp: new Date().toLocaleTimeString(
      [],
      {
        hour: "2-digit",
        minute: "2-digit"
      }
    )
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
  if (!messagesContainer || !message) {
    return;
  }

  state.messages.push(message);

  const messageElement =
    document.createElement("div");

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

  messagesContainer.appendChild(
    messageElement
  );

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
      const tabName =
        button.dataset.tab;

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
        micBtn.textContent =
          "Disable Mic";
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
    console.error(
      "MEDIA ERROR:",
      error
    );

    showToast(
      "Camera permission denied or device not found.",
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
}

function callAllParticipants() {
  if (
    !state.peer ||
    !state.localStream
  ) {
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
}

function addRemoteVideo(peerId, stream) {
  if (!remoteVideos) return;

  let video = document.querySelector(
    `video[data-peer="${peerId}"]`
  );

  if (!video) {
    const wrapper =
      document.createElement("div");

    wrapper.className = "video-card";
    wrapper.dataset.peer = peerId;

    video = document.createElement("video");

    video.autoplay = true;
    video.playsInline = true;
    video.dataset.peer = peerId;

    const label =
      document.createElement("span");

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

    if (!allowedKeys.includes(key)) {
      return;
    }

    event.preventDefault();

    if (
      key === "w" ||
      key === "arrowup"
    ) {
      state.gamePosition.y =
        Math.max(
          0,
          state.gamePosition.y - 3
        );
    }

    if (
      key === "s" ||
      key === "arrowdown"
    ) {
      state.gamePosition.y =
        Math.min(
          100,
          state.gamePosition.y + 3
        );
    }

    if (
      key === "a" ||
      key === "arrowleft"
    ) {
      state.gamePosition.x =
        Math.max(
          0,
          state.gamePosition.x - 3
        );
    }

    if (
      key === "d" ||
      key === "arrowright"
    ) {
      state.gamePosition.x =
        Math.min(
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
    player =
      document.createElement("div");

    player.className =
      "remote-player";

    player.dataset.player =
      payload.peerId;

    player.style.position =
      "absolute";

    player.style.width =
      "20px";

    player.style.height =
      "20px";

    player.style.backgroundColor =
      "#e74c3c";

    player.style.borderRadius =
      "50%";

    gameBoard.appendChild(player);
  }

  player.style.left =
    `${payload.x}%`;

  player.style.top =
    `${payload.y}%`;
}

/* =========================================================
   LEAVE AND RESET
========================================================= */

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
    try {
      connection.close();
    } catch (error) {
      console.error(error);
    }
  });

  resetToLobby();
}

function resetToLobby() {
  if (state.localStream) {
    state.localStream
      .getTracks()
      .forEach((track) => {
        track.stop();
      });

    state.localStream = null;
  }

  state.connections.forEach((connection) => {
    try {
      connection.close();
    } catch {
      // Ignore closed connections
    }
  });

  if (state.peer) {
    try {
      state.peer.destroy();
    } catch {
      // Ignore destroyed peer
    }
  }

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

  state.cameraEnabled = false;
  state.micEnabled = false;

  if (messagesContainer) {
    messagesContainer.innerHTML = "";
  }

  if (remoteVideos) {
    remoteVideos.innerHTML = "";
  }

  if (pendingRequests) {
    pendingRequests.innerHTML =
      '<p class="empty-state">No pending requests</p>';
  }

  if (pendingCount) {
    pendingCount.textContent = "0";
  }

  if (participantCount) {
    participantCount.textContent = "0";
  }

  setStatus("");
  showScreen("lobby");
}

/* =========================================================
   FEATURE SETUP
========================================================= */

function setupAllFeatures() {
  setupChat();
  setupTabs();
  setupMediaControls();
  setupCanvas();
  setupGame();
}
