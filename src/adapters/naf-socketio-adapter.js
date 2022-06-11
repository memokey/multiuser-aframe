/* global NAF, io */

/**
 * SocketIO Adapter (socketio)
 * networked-scene: serverURL needs to be ws://localhost:8080 when running locally
 */
class SocketioAdapter {
  constructor() {
    this.app = "default";
    this.room = "default";
    this.occupantListener = null;
    this.myRoomJoinTime = null;
    this.myId = null;

    this.occupants = {}; // id -> joinTimestamp
    this.connectedClients = [];

    this.serverTimeRequests = 0;
    this.timeOffsets = [];
    this.avgTimeOffset = 0;
  }

  setServerUrl(wsUrl) {
    this.wsUrl = wsUrl;
  }

  setApp(appName) {
    this.app = appName;
  }

  setRoom(roomName) {
    this.room = roomName;
  }

  setWebRtcOptions(options) {
    // No WebRTC support
  }

  setServerConnectListeners(successListener, failureListener) {
    this.connectSuccess = successListener;
    this.connectFailure = failureListener;
  }

  setRoomOccupantListener(occupantListener) {
    this.occupantListener = occupantListener;
  }

  setDataChannelListeners(openListener, closedListener, messageListener) {
    this.openListener = openListener;
    this.closedListener = closedListener;
    this.messageListener = messageListener;
  }

  connect() {
    const self = this;

    this.updateTimeOffset()
    .then(() => {
      window.socket.on("connect", () => {
        NAF.log.write("User connected", window.socket.id);
      });
      self.myId = window.socket.id;
      self.joinRoom();
      window.isReady = true;
      window.socket.on("connectSuccess", (data) => {
        const { joinedTime, curRoom } = data;

        self.myRoomJoinTime = joinedTime;
        self.setRoom(curRoom);
        NAF.log.write("Successfully joined room", self.room, "at server time", joinedTime);

        self.connectSuccess(self.myId);
      });

      window.socket.on("error", err => {
        console.error("Socket connection failure", err);
        self.connectFailure();
      });

      window.socket.on("occupantsChanged", data => {
        const { occupants } = data;
        NAF.log.write('occupants changed', data);
        self.receivedOccupants(occupants);
      });

      function receiveData(packet) {
        const from = packet.from;
        const type = packet.type;
        const data = packet.data;
        const name = packet.name;
        const avatarUrl = packet.avatarUrl;
        self.messageListener(from, type, data, name, avatarUrl);
      }

      window.socket.on("send", receiveData);
      window.socket.on("broadcast", receiveData);
    })
  }

  joinRoom() {
    // NAF.log.write("Joining room", this.room);
    // window.socket.emit("joinRoom", { room: this.room });
  }

  receivedOccupants(occupants) {
    delete occupants[this.myId];
    this.occupants = occupants;
    this.occupantListener(occupants);
  }

  shouldStartConnectionTo(client) {
    return true;
  }

  startStreamConnection(remoteId) {
    this.connectedClients.push(remoteId);
    this.openListener(remoteId);
  }

  closeStreamConnection(clientId) {
    this.connectedClients = this.connectedClients.filter(c => c != clientId);
    this.closedListener(clientId);
  }

  getConnectStatus(clientId) {
    var connected = this.connectedClients.indexOf(clientId) != -1;

    if (connected) {
      return NAF.adapters.IS_CONNECTED;
    } else {
      return NAF.adapters.NOT_CONNECTED;
    }
  }

  sendData(to, type, data) {
    this.sendDataGuaranteed(to, type, data);
  }

  sendDataGuaranteed(to, type, data) {
    const packet = {
      from: this.myId,
      to,
      type,
      data,
      sending: true,
    };

    if (window.socket) {
      window.socket.emit("send", packet);
    } else {
      NAF.log.warn('SocketIO socket not created yet');
    }
  }

  broadcastData(type, data) {
    this.broadcastDataGuaranteed(type, data);
  }

  broadcastDataGuaranteed(type, data) {
    const packet = {
      from: this.myId,
      type,
      data,
      broadcasting: true
    };

    window.myPosition = data;

    if (window.socket) {
      window.socket.emit("broadcast", packet);
    } else {
      NAF.log.warn('SocketIO socket not created yet');
    }
  }

  getMediaStream(clientId) {
    // Do not support WebRTC
  }

  updateTimeOffset() {
    const clientSentTime = Date.now() + this.avgTimeOffset;

    return fetch(document.location.href, { method: "GET", cache: "no-cache" })
      .then(res => {
        var precision = 1000;
        var serverReceivedTime = new Date(res.headers.get("Date")).getTime() + (precision / 2);
        var clientReceivedTime = Date.now();
        var serverTime = serverReceivedTime + ((clientReceivedTime - clientSentTime) / 2);
        var timeOffset = serverTime - clientReceivedTime;

        this.serverTimeRequests++;

        if (this.serverTimeRequests <= 10) {
          this.timeOffsets.push(timeOffset);
        } else {
          this.timeOffsets[this.serverTimeRequests % 10] = timeOffset;
        }

        this.avgTimeOffset = this.timeOffsets.reduce((acc, offset) => acc += offset, 0) / this.timeOffsets.length;

        if (this.serverTimeRequests > 10) {
          setTimeout(() => this.updateTimeOffset(), 5 * 60 * 1000); // Sync clock every 5 minutes.
        } else {
          this.updateTimeOffset();
        }
      });
  }

  getServerTime() {
    return new Date().getTime() + this.avgTimeOffset;
  }

  disconnect() {
    self.room = "default";
    // window.socket.disconnect();
  }
}

// NAF.adapters.register("socketio", SocketioAdapter);

module.exports = SocketioAdapter;
