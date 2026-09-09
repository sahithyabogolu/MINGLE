"use strict";

const state = {
  peer: null,
  peerId: null,
  hostPeerId: null,
  roomCode: "",
  username: "",
  isHost: false,

  hostConnection: null,
  connections: new Map(),
  pendingRequests: new Map(),
  participants: new Map(),
  messages: [],
  calls: new Map(),

  localStream: null,
  cameraEnabled: false,
  micEnabled: false,

  canvas: null,
  canvasContext: null,
  drawing: false,

  gamePosition: { x: 5, y: 5 },
  remotePlayers: new Map()
};

const $ = (id) => document.getElementById(id);

let screens = {};
let usernameInput;
let roomCodeInput;
let createRoomBtn;
let joinRoomBtn;
let cancelRequestBtn;
let leaveRoomBtn;
let copyRoomBtn;
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

const PEER_CONFIG = {
  host: "0.peerjs.com",
  port: 443,
  path: "/",
  secure: true,
  debug: 1,
  config: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun.cloudflare.com:3478" }
    ]
  }
};

document.addEventListener("DOMContentLoaded", () => {
  initializeDOM();
  bindButtons();
  setupTabs();
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
  leaveRoomBtn = $("leaveRoomBtn");
  copyRoomBtn = $("copyRoomBtn");

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

function bindButtons() {
  createRoomBtn?.addEventListener("click", createRoom);
  joinRoomBtn?.addEventListener("click", joinRoom);
  cancelRequestBtn?.addEventListener("click", cancelJoinRequest);
  leaveRoomBtn?.addEventListener("click", leaveRoom);
  copyRoomBtn?.addEventListener("click", copyRoomCode);

  chatForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    sendChatMessage();
  });

  cameraBtn?.addEventListener("click", toggleCamera);
  micBtn?.addEventListener("click", toggleMic);
}

function getRoomPeerId(roomCode) {
  return `mingle-room-${roomCode}`;
}

function generateRoomCode() {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let i = 0; i < 6; i++) {
    code += characters[Math.floor(Math.random() * characters.length)];
  }

  return code;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showScreen(name) {
  Object.values(screens).forEach((screen) => {
    screen?.classList.add("hidden");
  });

  screens[name]?.classList.remove("hidden");
}

function showToast(message, type = "info") {
  if (!toastElement) return;

  toastElement.textContent = message;
  toastElement.className = `toast show ${type}`;

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toastElement.classList.remove("show");
  }, 3500);
}

function setStatus(message) {
  const status = $("lobbyStatus");
  if (status) status.textContent = message;
}

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function createPeer(peerId = null) {
  return new Promise((resolve, reject) => {
    if (typeof Peer === "undefined") {
      reject(new Error("PeerJS is not loaded."));
      return;
    }

    let finished = false;

    try {
      state.peer = peerId
        ? new Peer(peerId, PEER_CONFIG)
        : new Peer(PEER_CONFIG);
    } catch (error) {
      reject(error);
      return;
    }

    const timeout = setTimeout(() => {
      if (!finished) {
        finished = true;
        reject(new Error("PeerJS connection timed out."));
      }
    }, 20000);

    state.peer.on("open", (id) => {
      clearTimeout(timeout);
      state.peerId = id;

      if (!finished) {
        finished = true;
        resolve(id);
      }
    });

    state.peer.on("connection", (connection) => {
      setupConnection(connection);
    });

    state.peer.on("call", handleIncomingCall);

    state.peer.on("disconnected", () => {
      if (state.peer && !state.peer.destroyed) {
        state.peer.reconnect();
      }
    });

    state.peer.on("error", (error) => {
      console.error("PeerJS error:", error);

      if (!finished) {
        clearTimeout(timeout);
        finished = true;
        reject(error);
        return;
      }

      if (error.type === "unavailable-id") {
        showToast("That room code is already in use.", "error");
      } else if (error.type === "peer-unavailable") {
        showToast("Room not found or host is offline.", "error");
      } else {
        showToast("Network connection problem.", "error");
      }
    });
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
    state.calls.delete(connection.peer);

    removeParticipant(connection.peer);
    removeRemoteVideo(connection.peer);
    renderPendingRequests();

    if (state.isHost) {
      broadcastParticipants();
    } else if (connection.peer === state.hostPeerId) {
      showToast("The host left the room.", "error");
      resetToLobby();
    }
  });

  connection.on("error", (error) => {
    console.error("Connection error:", error);
  });
}

function sendConnection(connection, payload) {
  if (!connection || !connection.open) return false;

  try {
    connection.send(payload);
    return true;
  } catch (error) {
    console.error("Send error:", error);
    return false;
  }
}

function broadcast(payload, exceptPeerId = null) {
  state.connections.forEach((connection, peerId) => {
    if (peerId !== exceptPeerId) {
      sendConnection(connection, payload);
    }
  });
}

function sendToHost(payload) {
  sendConnection(state.hostConnection, payload);
}

function handlePayload(payload, connection) {
  if (!payload?.type) return;

  switch (payload.type) {
    case "JOIN_REQUEST":
      if (state.isHost) {
        state.pendingRequests.set(connection.peer, {
          username: payload.username,
          connection
        });

        renderPendingRequests();

        showToast(
          `${payload.username} requested to join.`,
          "success"
        );
      }
      break;

    case "JOIN_RESPONSE":
      handleJoinResponse(payload);
      break;

    case "PARTICIPANTS_UPDATE":
      state.participants.clear();

      (payload.participants || []).forEach((participant) => {
        state.participants.set(participant.id, participant);
      });

      renderParticipants();
      break;

    case "CHAT_MESSAGE":
      receiveChatMessage(payload.message);

      if (state.isHost) {
        broadcast(payload, connection.peer);
      }
      break;

    case "REJECTED":
      showToast("Your request was rejected.", "error");
      resetToLobby();
      break;

    case "CANCEL_REQUEST":
      if (state.isHost) {
        state.pendingRequests.delete(connection.peer);
        renderPendingRequests();
      }
      break;

    case "CANVAS_START":
    case "CANVAS_DRAW":
    case "CANVAS_END":
      handleCanvasPayload(payload, connection);
      break;

    case "GAME_UPDATE":
      updateRemoteGame(payload);

      if (state.isHost) {
        broadcast(payload, connection.peer);
      }
      break;
  }
}

async function createRoom() {
  const username = usernameInput?.value.trim();

  if (!username) {
    showToast("Please enter your name.", "error");
    return;
  }

  state.username = username;
  state.roomCode = generateRoomCode();
  state.hostPeerId = getRoomPeerId(state.roomCode);
  state.isHost = true;

  setStatus("Creating room...");

  try {
    await createPeer(state.hostPeerId);

    addParticipant(state.peerId, state.username, true);

    enterRoom();

    showToast(
      `Room created. Share code: ${state.roomCode}`,
      "success"
    );
  } catch (error) {
    console.error(error);
    resetToLobby();
    showToast("Could not create room.", "error");
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
    showToast("Please enter a room code.", "error");
    return;
  }

  state.username = username;
  state.roomCode = roomCode;
  state.hostPeerId = getRoomPeerId(roomCode);
  state.isHost = false;

  setStatus("Connecting to host...");

  try {
    await createPeer();

    const connection = state.peer.connect(state.hostPeerId, {
      reliable: true,
      serialization: "json"
    });

    state.hostConnection = connection;
    setupConnection(connection);

    const timeout = setTimeout(() => {
      if (!connection.open) {
        connection.close();
        resetToLobby();
        showToast("Host is unreachable.", "error");
      }
    }, 20000);

    connection.on("open", () => {
      clearTimeout(timeout);

      sendConnection(connection, {
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
  } catch (error) {
    console.error(error);
    resetToLobby();
    showToast("Room not found or host is offline.", "error");
  }
}

function handleJoinResponse(payload) {
  if (!payload.approved) {
    showToast("The host rejected your request.", "error");
    resetToLobby();
    return;
  }

  state.participants.clear();

  (payload.participants || []).forEach((participant) => {
    state.participants.set(participant.id, participant);
  });

  addParticipant(state.peerId, state.username, false);

  enterRoom();

  showToast("Welcome to MINGLE!", "success");
}

function enterRoom() {
  setText("displayRoomCode", state.roomCode);
  setText("currentUserName", state.username);
  setText("roomTitle", `MINGLE Room ${state.roomCode}`);

  showScreen("app");

  renderParticipants();
  renderPendingRequests();
  setupCanvas();
  setupGame();

  if (state.isHost) {
    pendingSection?.classList.remove("hidden");
  } else {
    pendingSection?.classList.add("hidden");
  }
}

function admitGuest(peerId) {
  if (!state.isHost) return;

  const request = state.pendingRequests.get(peerId);

  if (!request || !request.connection?.open) {
    state.pendingRequests.delete(peerId);
    renderPendingRequests();
    showToast("Participant disconnected.", "error");
    return;
  }

  addParticipant(peerId, request.username, false);

  sendConnection(request.connection, {
    type: "JOIN_RESPONSE",
    approved: true,
    participants: [...state.participants.values()]
  });

  state.pendingRequests.delete(peerId);

  broadcastParticipants();
  renderPendingRequests();

  showToast(`${request.username} admitted.`, "success");

  if (state.localStream) {
    startCall(peerId);
  }
}

function rejectGuest(peerId) {
  const request = state.pendingRequests.get(peerId);
  if (!request) return;

  sendConnection(request.connection, {
    type: "JOIN_RESPONSE",
    approved: false
  });

  state.pendingRequests.delete(peerId);
  renderPendingRequests();

  setTimeout(() => request.connection?.close(), 300);

  showToast("Request rejected.");
}

function renderPendingRequests() {
  if (!pendingRequests) return;

  pendingRequests.innerHTML = "";

  if (pendingCount) {
    pendingCount.textContent = state.pendingRequests.size;
  }

  if (!state.isHost) {
    pendingSection?.classList.add("hidden");
    return;
  }

  pendingSection?.classList.remove("hidden");

  if (state.pendingRequests.size === 0) {
    pendingRequests.innerHTML =
      '<p class="empty-state">No pending requests</p>';
    return;
  }

  state.pendingRequests.forEach((request, peerId) => {
    const card = document.createElement("div");
    card.className = "pending-card";

    card.innerHTML = `
      <strong>${escapeHtml(request.username)}</strong>
      <small>Wants to join your room</small>
      <div class="pending-actions">
        <button class="admit-btn" type="button">Admit</button>
        <button class="reject-btn" type="button">Reject</button>
      </div>
    `;

    card.querySelector(".admit-btn").onclick = () => {
      admitGuest(peerId);
    };

    card.querySelector(".reject-btn").onclick = () => {
      rejectGuest(peerId);
    };

    pendingRequests.appendChild(card);
  });
}

function addParticipant(id, name, isHost = false) {
  state.participants.set(id, {
    id,
    name,
    isHost
  });

  renderParticipants();
}

function removeParticipant(id) {
  state.participants.delete(id);
  renderParticipants();
}

function renderParticipants() {
  if (!participantsList) return;

  participantsList.innerHTML = "";

  state.participants.forEach((participant) => {
    const item = document.createElement("div");
    item.className = "participant";

    item.innerHTML = `
      <span class="avatar">
        ${escapeHtml(participant.name?.charAt(0)?.toUpperCase() || "?")}
      </span>
      <div>
        <strong>${escapeHtml(participant.name)}</strong>
        <small>${participant.isHost ? "Host" : "Participant"}</small>
      </div>
    `;

    participantsList.appendChild(item);
  });

  if (participantCount) {
    participantCount.textContent = state.participants.size;
  }

  renderPrivateUsers();
}

function broadcastParticipants() {
  broadcast({
    type: "PARTICIPANTS_UPDATE",
    participants: [...state.participants.values()]
  });
}

function setupTabs() {
  const buttons = document.querySelectorAll(".tab");
  const panels = document.querySelectorAll(".tab-panel");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      buttons.forEach((item) => {
        item.classList.toggle("active", item === button);
      });

      panels.forEach((panel) => {
        panel.classList.toggle(
          "active",
          panel.id === `${button.dataset.tab}Tab`
        );
      });
    });
  });
}

function sendChatMessage() {
  const text = messageInput?.value.trim();
  if (!text) return;

  const message = {
    id: `${state.peerId}-${Date.now()}`,
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

  if (state.messages.some((item) => item.id === message.id)) {
    return;
  }

  state.messages.push(message);

  const element = document.createElement("div");
  element.className =
    message.senderId === state.peerId
      ? "message own-message"
      : "message";

  element.innerHTML = `
    <strong>${escapeHtml(message.sender)}</strong>
    <p>${escapeHtml(message.text)}</p>
    <small>${escapeHtml(message.timestamp)}</small>
  `;

  messagesContainer.appendChild(element);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function toggleCamera() {
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
        state.connections.forEach((_, peerId) => {
          startCall(peerId);
        });
      } else {
        startCall(state.hostPeerId);
      }

      showToast("Camera and microphone enabled.", "success");
      return;
    }

    const track = state.localStream.getVideoTracks()[0];

    if (track) {
      track.enabled = !track.enabled;
      state.cameraEnabled = track.enabled;
      cameraBtn.textContent = track.enabled
        ? "Disable Camera"
        : "Enable Camera";
    }
  } catch (error) {
    console.error(error);
    showToast("Camera permission was denied.", "error");
  }
}

async function toggleMic() {
  if (!state.localStream) {
    await toggleCamera();
    return;
  }

  const track = state.localStream.getAudioTracks()[0];

  if (track) {
    track.enabled = !track.enabled;
    state.micEnabled = track.enabled;

    micBtn.textContent = track.enabled
      ? "Disable Mic"
      : "Enable Mic";
  }
}

function startCall(peerId) {
  if (!state.localStream || !state.peer || !peerId) return;

  if (state.calls.has(peerId)) return;

  const call = state.peer.call(peerId, state.localStream);
  state.calls.set(peerId, call);

  call.on("stream", (stream) => {
    addRemoteVideo(peerId, stream);
  });

  call.on("close", () => {
    state.calls.delete(peerId);
    removeRemoteVideo(peerId);
  });
}

function handleIncomingCall(call) {
  if (!call) return;

  call.answer(state.localStream || undefined);
  state.calls.set(call.peer, call);

  call.on("stream", (stream) => {
    addRemoteVideo(call.peer, stream);
  });

  call.on("close", () => {
    state.calls.delete(call.peer);
    removeRemoteVideo(call.peer);
  });
}

function addRemoteVideo(peerId, stream) {
  if (!remoteVideos) return;

  let wrapper = remoteVideos.querySelector(
    `[data-peer="${CSS.escape(peerId)}"]`
  );

  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.className = "video-card";
    wrapper.dataset.peer = peerId;

    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;

    const label = document.createElement("span");
    label.textContent =
      state.participants.get(peerId)?.name || "Participant";

    wrapper.appendChild(video);
    wrapper.appendChild(label);
    remoteVideos.appendChild(wrapper);
  }

  const video = wrapper.querySelector("video");
  video.srcObject = stream;
  video.play().catch(() => {});
}

function removeRemoteVideo(peerId) {
  remoteVideos
    ?.querySelector(`[data-peer="${CSS.escape(peerId)}"]`)
    ?.remove();
}

function setupCanvas() {
  const canvas = $("canvas");
  if (!canvas || canvas.dataset.ready === "true") return;

  canvas.dataset.ready = "true";
  state.canvas = canvas;
  state.canvasContext = canvas.getContext("2d");

  canvas.addEventListener("pointerdown", (event) => {
    state.drawing = true;

    const point = getCanvasPoint(event);

    state.canvasContext.beginPath();
    state.canvasContext.moveTo(point.x, point.y);

    sendCanvasPayload({
      type: "CANVAS_START",
      x: point.x,
      y: point.y
    });
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!state.drawing) return;

    const point = getCanvasPoint(event);

    drawCanvasPoint(point.x, point.y);

    sendCanvasPayload({
      type: "CANVAS_DRAW",
      x: point.x,
      y: point.y
    });
  });

  canvas.addEventListener("pointerup", endCanvasDrawing);
  canvas.addEventListener("pointerleave", endCanvasDrawing);
}

function getCanvasPoint(event) {
  const rect = state.canvas.getBoundingClientRect();

  return {
    x: ((event.clientX - rect.left) / rect.width) *
      state.canvas.width,
    y: ((event.clientY - rect.top) / rect.height) *
      state.canvas.height
  };
}

function drawCanvasPoint(x, y) {
  if (!state.canvasContext) return;

  state.canvasContext.lineWidth = 3;
  state.canvasContext.lineCap = "round";
  state.canvasContext.strokeStyle = "#7b2348";

  state.canvasContext.lineTo(x, y);
  state.canvasContext.stroke();
}

function endCanvasDrawing() {
  if (!state.drawing) return;

  state.drawing = false;

  sendCanvasPayload({
    type: "CANVAS_END"
  });
}

function sendCanvasPayload(payload) {
  if (state.isHost) {
    broadcast(payload);
  } else {
    sendToHost(payload);
  }
}

function handleCanvasPayload(payload, connection) {
  if (!state.canvasContext) return;

  if (payload.type === "CANVAS_START") {
    state.canvasContext.beginPath();
    state.canvasContext.moveTo(payload.x, payload.y);
  }

  if (payload.type === "CANVAS_DRAW") {
    drawCanvasPoint(payload.x, payload.y);
  }

  if (payload.type === "CANVAS_END") {
    state.canvasContext.closePath();
  }

  if (state.isHost) {
    broadcast(payload, connection.peer);
  }
}

function setupGame() {
  const gameBoard = $("gameBoard");
  const player = $("player");

  if (!gameBoard || !player || gameBoard.dataset.ready === "true") {
    return;
  }

  gameBoard.dataset.ready = "true";

  document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();

    if (
      !["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"]
        .includes(key)
    ) {
      return;
    }

    event.preventDefault();

    if (key === "w" || key === "arrowup") {
      state.gamePosition.y = Math.max(0, state.gamePosition.y - 3);
    }

    if (key === "s" || key === "arrowdown") {
      state.gamePosition.y = Math.min(92, state.gamePosition.y + 3);
    }

    if (key === "a" || key === "arrowleft") {
      state.gamePosition.x = Math.max(0, state.gamePosition.x - 3);
    }

    if (key === "d" || key === "arrowright") {
      state.gamePosition.x = Math.min(92, state.gamePosition.x + 3);
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
  });
}

function updateRemoteGame(payload) {
  const gameBoard = $("gameBoard");
  if (!gameBoard || payload.peerId === state.peerId) return;

  let player = state.remotePlayers.get(payload.peerId);

  if (!player) {
    player = document.createElement("div");
    player.className = "remote-player";

    Object.assign(player.style, {
      position: "absolute",
      width: "22px",
      height: "22px",
      borderRadius: "50%",
      background: "#ed91ad",
      border: "2px solid white"
    });

    gameBoard.appendChild(player);
    state.remotePlayers.set(payload.peerId, player);
  }

  player.style.left = `${payload.x}%`;
  player.style.top = `${payload.y}%`;
}

function renderPrivateUsers() {
  const container = $("privateUsers");
  if (!container) return;

  container.innerHTML = "";

  state.participants.forEach((participant) => {
    if (participant.id === state.peerId) return;

    const button = document.createElement("button");
    button.textContent = `Message ${participant.name}`;
    button.className = "secondary-btn";

    button.onclick = () => {
      messageInput.value = `@${participant.name} `;
      messageInput.focus();
    };

    container.appendChild(button);
  });
}

async function copyRoomCode() {
  if (!state.roomCode) return;

  try {
    await navigator.clipboard.writeText(state.roomCode);
    showToast("Room code copied.", "success");
  } catch {
    const temporaryInput = document.createElement("input");
    temporaryInput.value = state.roomCode;
    document.body.appendChild(temporaryInput);
    temporaryInput.select();
    document.execCommand("copy");
    temporaryInput.remove();

    showToast("Room code copied.", "success");
  }
}

function cancelJoinRequest() {
  sendToHost({
    type: "CANCEL_REQUEST",
    username: state.username
  });

  resetToLobby();
}

function leaveRoom() {
  if (state.isHost) {
    broadcast({ type: "REJECTED" });
  }

  resetToLobby();
}

function resetToLobby() {
  state.localStream?.getTracks().forEach((track) => track.stop());

  state.connections.forEach((connection) => {
    try {
      connection.close();
    } catch {}
  });

  state.calls.forEach((call) => {
    try {
      call.close();
    } catch {}
  });

  try {
    state.peer?.destroy();
  } catch {}

  state.peer = null;
  state.peerId = null;
  state.hostPeerId = null;
  state.hostConnection = null;

  state.roomCode = "";
  state.username = "";
  state.isHost = false;

  state.connections.clear();
  state.pendingRequests.clear();
  state.participants.clear();
  state.messages = [];
  state.calls.clear();
  state.remotePlayers.clear();

  state.localStream = null;
  state.cameraEnabled = false;
  state.micEnabled = false;

  if (messagesContainer) messagesContainer.innerHTML = "";
  if (remoteVideos) remoteVideos.innerHTML = "";
  if (pendingRequests) pendingRequests.innerHTML = "";
  if (participantsList) participantsList.innerHTML = "";

  if (cameraBtn) cameraBtn.textContent = "Enable Camera";
  if (micBtn) micBtn.textContent = "Enable Mic";

  if (pendingCount) pendingCount.textContent = "0";
  if (participantCount) participantCount.textContent = "0";

  setStatus("");
  showScreen("lobby");
}
