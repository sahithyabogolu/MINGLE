# 🍷 MINGLE

**MINGLE** is a private, interactive social space designed to help people connect, communicate, and collaborate in one place.

Instead of switching between multiple apps, MINGLE brings group chat, private conversations, video calls, voice calls, shared activities, and multiplayer experiences into a single dark-maroon interface.

## ✨ Features

* Create and join rooms using room codes
* Separate human-readable room codes and internal PeerJS IDs
* Host-controlled admission system
* Pending guest requests
* Admit or Reject participants
* Waiting screen for guests
* Real-time group chat
* Private chat between participants
* Video and voice communication
* Shared canvas
* Synchronized game area
* Live participant list
* Copyable room codes
* Responsive dark-maroon interface
* Wine-glass MINGLE branding

## 🔐 Room Admission

MINGLE is designed around host-controlled access.

1. A host creates a room.
2. A guest enters the room code.
3. The guest sends a join request.
4. The host receives the request.
5. The host chooses **Admit** or **Reject**.
6. Only admitted guests can access the room.

Pending guests cannot access private room content before approval.

## 🎨 Design

MINGLE uses a dark-maroon visual identity with:

* Deep maroon backgrounds
* Wine-toned cards and panels
* Soft pink accents
* Rounded components
* Minimal, polished interface
* Wine-glass logo

The design focuses on creating a warm, private, and comfortable digital meeting space.

## 🛠️ Technologies

* HTML
* CSS
* JavaScript
* PeerJS
* WebRTC
* GitHub Pages

PeerJS is used for peer discovery and direct peer-to-peer communication. WebRTC powers browser-based video and voice communication.

## 🚀 Getting Started

Clone or download the project:

```bash
git clone https://github.com/YOUR-USERNAME/MINGLE.git
```

Open the project folder and launch:

```text
index.html
```

The project can also be deployed using GitHub Pages.

## 📁 Project Structure

```text
MINGLE/
├── index.html
├── style.css
├── app.js
└── README.md
```

## ⚠️ Current MVP Limitation

The current frontend MVP uses a host-based PeerJS connection model. The host must remain online while the room is active.

For fully persistent room-code discovery, host presence tracking, and reliable admission across disconnected sessions, a real-time backend such as Firebase Realtime Database can be added in a future version.

## 🌱 Future Improvements

* Persistent room registry
* Firebase-based room discovery
* User authentication
* Room password protection
* File sharing
* Screen sharing
* Message history
* Notifications
* More multiplayer games
* Improved private-chat routing
* Persistent canvas state
* Room moderation controls

## 👩‍💻 Author

Created by **Sahithya Bogolu and Yukti Mittal**.

MINGLE is built as an interactive project focused on making online communication more connected, collaborative, and enjoyable.
