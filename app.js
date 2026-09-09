"use strict";

const state = {
  peer: null,
  peerId: null,
  hostPeerId: null,
  hostConnection: null,

  roomCode: "",
  username: "",
  isHost: false,

  connections: new Map(),
  pendingRequests: new Map(),
  participants: new Map(),

  messages: [],
  privateMessages: new Map(),
  selectedPrivateUser: null,

  calls: new Map(),
  localStream: null,
  cameraEnabled: false,
  micEnabled: false,

  canvas: null,
  canvasContext: null,
  drawing: false,

  gamePosition: { x: 5, y: 5 },
  remotePlayers: new Map(),

  initialized: false
};

const $ = (id) => document.getElementById(id);

let screens;
let usernameInput;
let roomCodeInput;
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

document.addEventListener("DOMContentLoaded", initializeApp);

function initializeApp() {
  if (state.initialized) return;

  state.initialized = true;

  initializeDOM();
  bindButtons();
  setupTabs();
  updateCallButtons();
}

function initializeDOM() {
  screens = {
    lobby: $("lobby"),
    waiting: $("waiting"),
    app: $("app")
  };

  usernameInput = $("username");
  roomCodeInput = $("roomCode");

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
  $("createRoomBtn")?.addEventListener("click", createRoom);
  $("joinRoomBtn")?.addEventListener("click", joinRoom);
  $("cancelRequestBtn")?.addEventListener("click", cancelJoinRequest);
  $("leaveRoomBtn")?.addEventListener("click", leaveRoom);
  $("copyRoomBtn")?.addEventListener("click", copyRoomCode);

  chatForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    sendChatMessage();
  });

  cameraBtn?.addEventListener("click", toggleCamera);
  micBtn?.addEventListener("click", toggleMic);

  roomCodeInput?.addEventListener("input", () => {
    roomCodeInput.value = roomCodeInput.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  });

  window.addEventListener("beforeunload", cleanupConnections);
}

function getRoomPeerId(roomCode) {
  return `mingle-room-${roomCode}`;
}

function generateRoomCode() {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let index = 0; index < 6; index += 1) {
    code += characters[Math.floor(Math.random() * characters.length)];
  }

  return code;
}

function normalizeName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 24);
}

function normalizeRoomCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

function showScreen(name) {
  Object.values(screens || {}).forEach((screen) => {
    screen?.classList.add("hidden");
  });

  screens?.[name]?.classList.remove("hidden");
}

function setStatus(message) {
  const element = $("lobbyStatus");

  if (element) {
    element.textContent = message;
  }
}

function setText(id, text) {
  const element = $(id);

  if (element) {
    element.textContent = text;
  }
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

function createPeer(peerId = null) {
  return new Promise((resolve, reject) => {
    if (typeof Peer === "undefined") {
      reject(new Error("PeerJS was not loaded."));
      return;
    }

    let settled = false;

    try {
      state.peer = peerId
        ? new Peer(peerId, PEER_CONFIG)
        : new Peer(PEER_CONFIG);
    } catch (error) {
      reject(error);
      return;
    }

    const timeout = setTimeout(() => {
      if (settled) return;

      settled = true;
      reject(new Error("PeerJS connection timed out."));
    }, 20000);

    state.peer.on("open", (id) => {
      state.peerId = id;

      if (!settled) {
        settled = true;
        clearTimeout(timeout);
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

      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(error);
        return;
      }

      if (error.type === "unavailable-id") {
        showToast(
          "That room code is already in use. Create another room.",
          "error"
        );
      } else if (error.type === "peer-unavailable") {
        showToast(
          "Room not found or host is offline.",
          "error"
        );
      } else {
        showToast(
          "Network connection problem. Please try again.",
          "error"
        );
      }
    });
  });
}

function setupConnection(connection) {
  if (!connection || !connection.peer) return;

  const existingConnection = state.connections.get(connection.peer);

  if (existingConnection && existingConnection !== connection) {
    try {
      existingConnection.close();
    } catch {}

    state.connections.delete(connection.peer);
  }

  state.connections.set(connection.peer, connection);

  connection.on("open", () => {
    console.log("Connected to:", connection.peer);
  });

  connection.on("data", (payload) => {
    handlePayload(payload, connection);
  });

  connection.on("close", () => {
    handleConnectionClosed(connection.peer);
  });

  connection.on("error", (error) => {
    console.error("Data connection error:", error);
  });
}

function handleConnectionClosed(peerId) {
  state.connections.delete(peerId);
  state.pendingRequests.delete(peerId);
  state.calls.delete(peerId);

  removeParticipant(peerId);
  removeRemoteVideo(peerId);
  removeRemotePlayer(peerId);

  if (state.isHost) {
    broadcastParticipants();
    renderPendingRequests();
  }

  if (!state.isHost && peerId === state.hostPeerId) {
    showToast("The host left the room.", "error");
    resetToLobby();
  }
}

function sendConnection(connection, payload) {
  if (!connection || !connection.open) {
    return false;
  }

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
  if (state.isHost) {
    handlePayload(payload, {
      peer: state.peerId
    });

    return true;
  }

  return sendConnection(state.hostConnection, payload);
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
      handleParticipantsUpdate(payload);
      break;

    case "CHAT_MESSAGE":
      handleChatMessage(payload, connection);
      break;

    case "PRIVATE_MESSAGE":
      handlePrivateMessage(payload);
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

    case "CANVAS_CLEAR":
      clearCanvas(false);

      if (state.isHost) {
        broadcast(payload, connection.peer);
      }
      break;

    case "GAME_UPDATE":
      handleGameUpdate(payload, connection);
      break;

    default:
      console.warn("Unknown payload:", payload.type);
  }
}

function handleJoinRequest(payload, connection) {
  if (!state.isHost || !connection) return;

  const username = normalizeName(payload.username);

  if (!username) {
    sendConnection(connection, {
      type: "JOIN_RESPONSE",
      approved: false
    });

    return;
  }

  state.pendingRequests.set(connection.peer, {
    username,
    connection
  });

  renderPendingRequests();

  showToast(`${username} requested to join.`, "success");
}

function handleParticipantsUpdate(payload) {
  if (!Array.isArray(payload.participants)) return;

  state.participants.clear();

  payload.participants.forEach((participant) => {
    if (!participant?.id || !participant?.name) return;

    state.participants.set(participant.id, {
      id: participant.id,
      name: participant.name,
      isHost: Boolean(participant.isHost)
    });
  });

  renderParticipants();
}

function handleChatMessage(payload, connection) {
  if (!payload.message) return;

  receiveChatMessage(payload.message);

  if (state.isHost && connection?.peer) {
    broadcast(payload, connection.peer);
  }
}

function handlePrivateMessage(payload) {
  const message = payload.message;

  if (!message) return;

  if (
    message.receiverPeerId !== state.peerId &&
    message.senderPeerId !== state.peerId
  ) {
    return;
  }

  receivePrivateMessage(message);
}

async function createRoom() {
  const username = normalizeName(usernameInput?.value);

  if (!username) {
    showToast("Please enter your name.", "error");
    usernameInput?.focus();
    return;
  }

  await resetConnectionOnly();

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
    console.error("Create room error:", error);
    await resetConnectionOnly();
    setStatus("Could not create room. Please try again.");
    showToast("Could not create room.", "error");
  }
}

async function joinRoom() {
  const username = normalizeName(usernameInput?.value);
  const roomCode = normalizeRoomCode(roomCodeInput?.value);

  if (!username) {
    showToast("Please enter your name.", "error");
    usernameInput?.focus();
    return;
  }

  if (!roomCode) {
    showToast("Please enter a room code.", "error");
    roomCodeInput?.focus();
    return;
  }

  await resetConnectionOnly();

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
        try {
          connection.close();
        } catch {}

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

      showScreen("waiting");
    });
  } catch (error) {
    console.error("Join room error:", error);
    await resetConnectionOnly();
    setStatus("Room not found or host is offline.");
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

  if (!state.participants.has(state.peerId)) {
    addParticipant(state.peerId, state.username, false);
  }

  enterRoom();

  showToast("Welcome to MINGLE!", "success");
}

function enterRoom() {
  setText("displayRoomCode", state.roomCode);
  setText("currentUserName", state.username);
  setText("roomTitle", `MINGLE Room ${state.roomCode}`);
  setText("connectionStatus", "Connected");

  showScreen("app");

  renderParticipants();
  renderPendingRequests();
  setupCanvas();
  setupGame();
  updateCallButtons();

  if (state.isHost) {
    pendingSection?.classList.remove("hidden");
  } else {
    pendingSection?.classList.add("hidden");
  }
}

function admitGuest(peerId) {
  if (!state.isHost) return;

  const request = state.pendingRequests.get(peerId);

  if (!request) return;

  addParticipant(peerId, request.username, false);

  const approved = sendConnection(request.connection, {
    type: "JOIN_RESPONSE",
    approved: true,
    participants: [...state.participants.values()]
  });

  if (!approved) {
    removeParticipant(peerId);
    showToast("Could not admit that participant.", "error");
    return;
  }

  state.pendingRequests.delete(peerId);

  broadcastParticipants();
  renderPendingRequests();

  showToast(`${request.username} admitted.`, "success");
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

  setTimeout(() => {
    try {
      request.connection.close();
    } catch {}
  }, 300);
}

function renderPendingRequests() {
  if (!pendingRequests) return;

  pendingRequests.replaceChildren();

  if (pendingCount) {
    pendingCount.textContent = state.pendingRequests.size;
  }

  if (!state.isHost) {
    pendingSection?.classList.add("hidden");
    return;
  }

  pendingSection?.classList.remove("hidden");

  if (state.pendingRequests.size === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No pending requests";
    pendingRequests.appendChild(empty);
    return;
  }

  state.pendingRequests.forEach((request, peerId) => {
    const card = document.createElement("div");
    card.className = "pending-card";

    const name = document.createElement("strong");
    name.textContent = request.username;

    const description = document.createElement("small");
    description.textContent = "Wants to join your room";

    const actions = document.createElement("div");
    actions.className = "pending-actions";

    const admitButton = document.createElement("button");
    admitButton.className = "admit-btn";
    admitButton.type = "button";
    admitButton.textContent = "Admit";
    admitButton.addEventListener("click", () => admitGuest(peerId));

    const rejectButton = document.createElement("button");
    rejectButton.className = "reject-btn";
    rejectButton.type = "button";
    rejectButton.textContent = "Reject";
    rejectButton.addEventListener("click", () => rejectGuest(peerId));

    actions.append(admitButton, rejectButton);
    card.append(name, description, actions);
    pendingRequests.appendChild(card);
  });
}

function addParticipant(id, name, isHost = false) {
  if (!id || !name) return;

  state.participants.set(id, {
    id,
    name,
    isHost: Boolean(isHost)
  });

  renderParticipants();
}

function removeParticipant(id) {
  state.participants.delete(id);
  renderParticipants();
}

function renderParticipants() {
  if (!participantsList) return;

  participantsList.replaceChildren();

  state.participants.forEach((participant) => {
    const item = document.createElement("div");
    item.className = "participant";

    const avatar = document.createElement("span");
    avatar.className = "avatar";
    avatar.textContent =
      participant.name?.charAt(0)?.toUpperCase() || "?";

    const details = document.createElement("div");

    const name = document.createElement("strong");
    name.textContent = participant.name;

    const role = document.createElement("small");
    role.textContent = participant.isHost ? "Host" : "Participant";

    details.append(name, role);
    item.append(avatar, details);
    participantsList.appendChild(item);
  });

  if (participantCount) {
    participantCount.textContent = state.participants.size;
  }

  renderPrivateUsers();
}

function broadcastParticipants() {
  if (!state.isHost) return;

  broadcast({
    type: "PARTICIPANTS_UPDATE",
    participants: [...state.participants.values()]
  });
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((tab) => {
        tab.classList.toggle("active", tab === button);
      });

      document.querySelectorAll(".tab-panel").forEach((panel) => {
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

  if (!text || !state.peerId) return;

  const message = {
    id: `${state.peerId}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)}`,
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
  if (!message || !messagesContainer) return;

  if (state.messages.some((item) => item.id === message.id)) {
    return;
  }

  state.messages.push(message);

  const element = document.createElement("div");
  element.className =
    message.senderId === state.peerId
      ? "message own-message"
      : "message";

  const sender = document.createElement("strong");
  sender.textContent = message.sender || "Participant";

  const text = document.createElement("p");
  text.textContent = message.text || "";

  const time = document.createElement("small");
  time.textContent = message.timestamp || "";

  element.append(sender, text, time);
  messagesContainer.appendChild(element);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function renderPrivateUsers() {
  const container = $("privateUsers");

  if (!container) return;

  container.replaceChildren();

  const otherParticipants = [...state.participants.values()].filter(
    (participant) => participant.id !== state.peerId
  );

  if (otherParticipants.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No other participants are currently in the room.";
    container.appendChild(empty);
    return;
  }

  otherParticipants.forEach((participant) => {
    const button = document.createElement("button");
    button.className = "secondary-btn";
    button.type = "button";
    button.textContent =
      state.selectedPrivateUser === participant.id
        ? `Chatting with ${participant.name}`
        : `Message ${participant.name}`;

    button.addEventListener("click", () => {
      selectPrivateUser(participant.id);
    });

    container.appendChild(button);
  });

  renderPrivateConversation();
}

function selectPrivateUser(peerId) {
  if (!state.participants.has(peerId)) return;

  state.selectedPrivateUser = peerId;
  renderPrivateUsers();
}

function renderPrivateConversation() {
  const container = $("privateUsers");

  if (!container || !state.selectedPrivateUser) return;

  const participant = state.participants.get(state.selectedPrivateUser);

  if (!participant) return;

  const wrapper = document.createElement("div");
  wrapper.className = "private-conversation";

  const title = document.createElement("h4");
  title.textContent = `Private conversation with ${participant.name}`;

  const history = document.createElement("div");
  history.className = "private-history";

  const key = getConversationKey(
    state.peerId,
    state.selectedPrivateUser
  );

  const conversation = state.privateMessages.get(key) || [];

  if (conversation.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No private messages yet.";
    history.appendChild(empty);
  } else {
    conversation.forEach((message) => {
      const item = document.createElement("div");
      item.className =
        message.senderPeerId === state.peerId
          ? "message own-message"
          : "message";

      const sender = document.createElement("strong");
      sender.textContent = message.senderName;

      const text = document.createElement("p");
      text.textContent = message.text;

      const time = document.createElement("small");
      time.textContent = message.timestamp;

      item.append(sender, text, time);
      history.appendChild(item);
    });
  }

  const form = document.createElement("form");
  form.className = "message-form";

  const input = document.createElement("input");
  input.maxLength = 500;
  input.placeholder = `Message ${participant.name}`;
  input.autocomplete = "off";

  const sendButton = document.createElement("button");
  sendButton.className = "primary-btn";
  sendButton.type = "submit";
  sendButton.textContent = "Send";

  form.append(input, sendButton);

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const text = input.value.trim();

    if (!text) return;

    sendPrivateMessage(participant.id, text);
    input.value = "";
    input.focus();
  });

  wrapper.append(title, history, form);
  container.appendChild(wrapper);

  history.scrollTop = history.scrollHeight;
}

function getConversationKey(firstId, secondId) {
  return [firstId, secondId].sort().join("::");
}

function sendPrivateMessage(receiverPeerId, text) {
  if (!receiverPeerId || receiverPeerId === state.peerId) {
    showToast("You cannot message yourself.", "error");
    return;
  }

  if (!state.participants.has(receiverPeerId)) {
    showToast("That participant is no longer in the room.", "error");
    return;
  }

  const message = {
    id: `${state.peerId}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)}`,
    type: "PRIVATE_MESSAGE",
    senderPeerId: state.peerId,
    receiverPeerId,
    senderName: state.username,
    text,
    timestamp: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    })
  };

  receivePrivateMessage(message);

  const directConnection = state.connections.get(receiverPeerId);

  if (directConnection?.open) {
    sendConnection(directConnection, {
      type: "PRIVATE_MESSAGE",
      message
    });
  } else if (state.isHost) {
    const participantConnection = state.connections.get(receiverPeerId);

    sendConnection(participantConnection, {
      type: "PRIVATE_MESSAGE",
      message
    });
  } else {
    sendToHost({
      type: "PRIVATE_MESSAGE",
      message
    });
  }
}

function receivePrivateMessage(message) {
  const key = getConversationKey(
    message.senderPeerId,
    message.receiverPeerId
  );

  if (!state.privateMessages.has(key)) {
    state.privateMessages.set(key, []);
  }

  const conversation = state.privateMessages.get(key);

  if (conversation.some((item) => item.id === message.id)) {
    return;
  }

  conversation.push(message);

  if (
    state.selectedPrivateUser === message.senderPeerId ||
    state.selectedPrivateUser === message.receiverPeerId
  ) {
    renderPrivateConversation();
  } else {
    showToast(`New private message from ${message.senderName}`, "success");
  }
}

async function toggleCamera() {
  try {
    if (!state.localStream) {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

      state.localStream = stream;
      state.cameraEnabled = stream.getVideoTracks().length > 0;
      state.micEnabled = stream.getAudioTracks().length > 0;

      if (localVideo) {
        localVideo.srcObject = stream;
        localVideo.muted = true;
        await localVideo.play().catch(() => {});
      }

      updateCallButtons();

      state.participants.forEach((participant) => {
        if (participant.id !== state.peerId) {
          startCall(participant.id);
        }
      });

      showToast("Camera and microphone enabled.", "success");
      return;
    }

    const videoTrack = state.localStream.getVideoTracks()[0];

    if (!videoTrack) {
      showToast("No camera track is available.", "error");
      return;
    }

    videoTrack.enabled = !videoTrack.enabled;
    state.cameraEnabled = videoTrack.enabled;

    updateCallButtons();
  } catch (error) {
    console.error("Camera error:", error);
    showToast(
      "Camera permission was denied or the camera is unavailable.",
      "error"
    );
  }
}

async function toggleMic() {
  try {
    if (!state.localStream) {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true
      });

      state.localStream = stream;
      state.micEnabled = stream.getAudioTracks().length > 0;
      state.cameraEnabled = false;

      if (localVideo) {
        localVideo.srcObject = stream;
        localVideo.muted = true;
      }

      updateCallButtons();

      state.participants.forEach((participant) => {
        if (participant.id !== state.peerId) {
          startCall(participant.id);
        }
      });

      showToast("Microphone enabled.", "success");
      return;
    }

    const audioTrack = state.localStream.getAudioTracks()[0];

    if (!audioTrack) {
      showToast("No microphone track is available.", "error");
      return;
    }

    audioTrack.enabled = !audioTrack.enabled;
    state.micEnabled = audioTrack.enabled;

    updateCallButtons();
  } catch (error) {
    console.error("Microphone error:", error);
    showToast(
      "Microphone permission was denied or the microphone is unavailable.",
      "error"
    );
  }
}

function updateCallButtons() {
  if (cameraBtn) {
    cameraBtn.textContent = state.cameraEnabled
      ? "Disable Camera"
      : "Enable Camera";
  }

  if (micBtn) {
    micBtn.textContent = state.micEnabled
      ? "Disable Mic"
      : "Enable Mic";
  }
}

function startCall(peerId) {
  if (!state.localStream || !state.peer || !peerId) return;
  if (peerId === state.peerId) return;

  const participant = state.participants.get(peerId);

  if (!participant) return;

  const existingCall = state.calls.get(peerId);

  if (existingCall) {
    try {
      existingCall.close();
    } catch {}

    state.calls.delete(peerId);
  }

  const call = state.peer.call(peerId, state.localStream);

  if (!call) return;

  state.calls.set(peerId, call);

  call.on("stream", (stream) => {
    addRemoteVideo(peerId, stream);
  });

  call.on("close", () => {
    if (state.calls.get(peerId) === call) {
      state.calls.delete(peerId);
      removeRemoteVideo(peerId);
    }
  });

  call.on("error", (error) => {
    console.error("Outgoing call error:", error);
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

  call.on("stream", (stream) => {
    addRemoteVideo(call.peer, stream);
  });

  call.on("close", () => {
    if (state.calls.get(call.peer) === call) {
      state.calls.delete(call.peer);
      removeRemoteVideo(call.peer);
    }
  });

  call.on("error", (error) => {
    console.error("Incoming call error:", error);
  });
}

function addRemoteVideo(peerId, stream) {
  if (!remoteVideos || !stream) return;

  let wrapper = [...remoteVideos.children].find(
    (child) => child.dataset.peer === peerId
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

    wrapper.append(video, label);
    remoteVideos.appendChild(wrapper);
  }

  const video = wrapper.querySelector("video");
  video.srcObject = stream;
  video.play().catch(() => {});
}

function removeRemoteVideo(peerId) {
  if (!remoteVideos) return;

  [...remoteVideos.children]
    .filter((child) => child.dataset.peer === peerId)
    .forEach((child) => child.remove());
}

function setupCanvas() {
  const canvas = $("canvas");

  if (!canvas || canvas.dataset.ready === "true") return;

  canvas.dataset.ready = "true";
  state.canvas = canvas;
  state.canvasContext = canvas.getContext("2d");

  canvas.style.touchAction = "none";

  canvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();

    state.drawing = true;

    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {}

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

    event.preventDefault();

    const point = getCanvasPoint(event);

    drawCanvasPoint(point.x, point.y);

    sendCanvasPayload({
      type: "CANVAS_DRAW",
      x: point.x,
      y: point.y
    });
  });

  canvas.addEventListener("pointerup", endCanvasDrawing);
  canvas.addEventListener("pointercancel", endCanvasDrawing);
  canvas.addEventListener("pointerleave", endCanvasDrawing);
}

function getCanvasPoint(event) {
  if (!state.canvas) {
    return { x: 0, y: 0 };
  }

  const rect = state.canvas.getBoundingClientRect();

  return {
    x: ((event.clientX - rect.left) / rect.width) * state.canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * state.canvas.height
  };
}

function drawCanvasPoint(x, y) {
  if (!state.canvasContext) return;

  state.canvasContext.lineWidth = 3;
  state.canvasContext.lineCap = "round";
  state.canvasContext.lineJoin = "round";
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

  if (state.isHost && connection?.peer) {
    broadcast(payload, connection.peer);
  }
}

function clearCanvas(announce = true) {
  if (!state.canvas || !state.canvasContext) return;

  state.canvasContext.clearRect(
    0,
    0,
    state.canvas.width,
    state.canvas.height
  );

  if (announce) {
    const payload = {
      type: "CANVAS_CLEAR"
    };

    if (state.isHost) {
      broadcast(payload);
    } else {
      sendToHost(payload);
    }
  }
}

function setupGame() {
  const gameBoard = $("gameBoard");
  const player = $("player");

  if (!gameBoard || !player || gameBoard.dataset.ready === "true") {
    return;
  }

  gameBoard.dataset.ready = "true";

  document.addEventListener("keydown", handleGameKeydown);
}

function handleGameKeydown(event) {
  const gameBoard = $("gameBoard");
  const player = $("player");

  if (!gameBoard || !player) return;

  const key = event.key.toLowerCase();

  const movementKeys = [
    "w",
    "a",
    "s",
    "d",
    "arrowup",
    "arrowdown",
    "arrowleft",
    "arrowright"
  ];

  if (!movementKeys.includes(key)) return;

  if (document.activeElement?.tagName === "INPUT") return;

  if (screens?.app?.classList.contains("hidden")) return;

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
}

function handleGameUpdate(payload, connection) {
  updateRemoteGame(payload);

  if (state.isHost && connection?.peer) {
    broadcast(payload, connection.peer);
  }
}

function updateRemoteGame(payload) {
  const gameBoard = $("gameBoard");

  if (!gameBoard || !payload.peerId || payload.peerId === state.peerId) {
    return;
  }

  let remotePlayer = state.remotePlayers.get(payload.peerId);

  if (!remotePlayer) {
    remotePlayer = document.createElement("div");
    remotePlayer.className = "remote-player";
    remotePlayer.dataset.peer = payload.peerId;
    gameBoard.appendChild(remotePlayer);
    state.remotePlayers.set(payload.peerId, remotePlayer);
  }

  remotePlayer.style.left = `${payload.x}%`;
  remotePlayer.style.top = `${payload.y}%`;
}

function removeRemotePlayer(peerId) {
  const player = state.remotePlayers.get(peerId);

  if (player) {
    player.remove();
  }

  state.remotePlayers.delete(peerId);
}

async function copyRoomCode() {
  if (!state.roomCode) return;

  try {
    await navigator.clipboard.writeText(state.roomCode);
  } catch {
    const temporaryInput = document.createElement("input");
    temporaryInput.value = state.roomCode;
    document.body.appendChild(temporaryInput);
    temporaryInput.select();
    document.execCommand("copy");
    temporaryInput.remove();
  }

  setText("copyStatus", "Copied!");
  showToast("Room code copied.", "success");

  setTimeout(() => {
    setText("copyStatus", "");
  }, 2500);
}

function cancelJoinRequest() {
  sendToHost({
    type: "CANCEL_REQUEST"
  });

  resetToLobby();
}

function leaveRoom() {
  if (state.isHost) {
    broadcast({
      type: "REJECTED"
    });
  }

  resetToLobby();
}

async function resetConnectionOnly() {
  stopLocalMedia();

  state.calls.forEach((call) => {
    try {
      call.close();
    } catch {}
  });

  state.connections.forEach((connection) => {
    try {
      connection.close();
    } catch {}
  });

  try {
    state.peer?.destroy();
  } catch {}

  state.peer = null;
  state.peerId = null;
  state.hostPeerId = null;
  state.hostConnection = null;

  state.connections.clear();
  state.pendingRequests.clear();
  state.participants.clear();
  state.calls.clear();
  state.remotePlayers.forEach((player) => player.remove());
  state.remotePlayers.clear();

  state.localStream = null;
  state.cameraEnabled = false;
  state.micEnabled = false;

  updateCallButtons();
}

function stopLocalMedia() {
  if (!state.localStream) return;

  state.localStream.getTracks().forEach((track) => {
    track.stop();
  });

  state.localStream = null;

  if (localVideo) {
    localVideo.srcObject = null;
  }
}

function cleanupConnections() {
  stopLocalMedia();

  state.calls.forEach((call) => {
    try {
      call.close();
    } catch {}
  });

  state.connections.forEach((connection) => {
    try {
      connection.close();
    } catch {}
  });

  try {
    state.peer?.destroy();
  } catch {}
}

function resetToLobby() {
  resetConnectionOnly();

  state.roomCode = "";
  state.username = "";
  state.isHost = false;

  state.messages = [];
  state.privateMessages.clear();
  state.selectedPrivateUser = null;
  state.gamePosition = { x: 5, y: 5 };

  if (messagesContainer) {
    messagesContainer.replaceChildren();

    const welcome = document.createElement("div");
    welcome.className = "message system";

    const text = document.createElement("p");
    text.textContent = "Welcome to MINGLE. Start the conversation.";

    welcome.appendChild(text);
    messagesContainer.appendChild(welcome);
  }

  if (remoteVideos) {
    remoteVideos.replaceChildren();
  }

  if (pendingRequests) {
    pendingRequests.replaceChildren();
  }

  if (participantsList) {
    participantsList.replaceChildren();
  }

  if ($("privateUsers")) {
    $("privateUsers").replaceChildren();
  }

  setText("displayRoomCode", "------");
  setText("currentUserName", "");
  setText("roomTitle", "MINGLE Room");
  setText("connectionStatus", "Disconnected");
  setText("copyStatus", "");
  setText("lobbyStatus", "");

  if (participantCount) {
    participantCount.textContent = "0";
  }

  if (pendingCount) {
    pendingCount.textContent = "0";
  }

  pendingSection?.classList.add("hidden");

  showScreen("lobby");
}
