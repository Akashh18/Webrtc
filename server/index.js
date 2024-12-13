const fs = require("fs");
const { Server } = require("socket.io");
const https = require("https");

const server = https.createServer({
  key: fs.readFileSync("./192.168.137.1-key.pem"),
  cert: fs.readFileSync("./192.168.137.1.pem"),
});

const io = new Server(server, {
  cors: {
    origin: "*", // Update to your React app's IP address or domain
    methods: ["GET", "POST"],
  },
});

server.listen(8000, "0.0.0.0", () => {
  console.log("Server running on https://192.168.137.1:8000");
});

const emailToSocketIdMap = new Map();
const socketidToEmailMap = new Map();
const roomsToClientsMap = new Map(); // Store clients per room

io.on("connection", (socket) => {
  console.log("socket Connected", socket.id);

  socket.on("room:join", (data) => {
    console.log(data);
    const { email, room } = data;

    // Ensure the room and email are valid
    if (!email || !room) {
      return socket.emit("error", { message: "Invalid email or room" });
    }

    // Check if the room already exists and limit to 2 members
    if (roomsToClientsMap.has(room)) {
      const clientsInRoom = roomsToClientsMap.get(room);
      if (clientsInRoom.size >= 2) {
        return socket.emit("error", {
          message: "Room already has two members. Cannot join.",
        });
      }
    }

    // Add the user to the room
    socket.join(room);

    // Update maps for email and socket ID relationships
    emailToSocketIdMap.set(email, socket.id);
    socketidToEmailMap.set(socket.id, email);

    // Create a new room if it doesn't exist and add the client
    if (!roomsToClientsMap.has(room)) {
      roomsToClientsMap.set(room, new Set());
    }
    roomsToClientsMap.get(room).add(socket.id);

    const clients = Array.from(roomsToClientsMap.get(room));
    console.log(clients);

    // Emit a 'room:join' event to the joining user
    io.to(socket.id).emit("room:join", data);

    // Emit a 'user:joined' event to the room
    io.to(room).emit("user:joined", {
      email,
      id: socket.id,
    });

    // Emit the updated list of users in the room to everyone in the room
    io.to(room).emit("room:users", {
      users: clients.map((clientId) => ({
        id: clientId,
        email: socketidToEmailMap.get(clientId),
      })),
    });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected", socket.id);
    const email = socketidToEmailMap.get(socket.id);
    const room = Array.from(roomsToClientsMap.keys()).find((room) =>
      roomsToClientsMap.get(room).has(socket.id)
    );

    // Remove user from the maps
    if (room) {
      roomsToClientsMap.get(room).delete(socket.id);
      if (roomsToClientsMap.get(room).size === 0) {
        roomsToClientsMap.delete(room);
      }
    }
    emailToSocketIdMap.delete(email);
    socketidToEmailMap.delete(socket.id);
  });

  socket.on("user:call", ({ to, offer }) => {
    io.to(to).emit("incomming:call", {
      from: socket.id,
      offer,
    });
    console.log(`Call initiated from ${socket.id} to ${to}`);
  });

  socket.on("call:accepted", ({ to, ans }) => {
    io.to(to).emit("call:accepted", {
      from: socket.id,
      ans,
    });
    console.log(`Call accepted by ${socket.id} for ${to}`);
  });

  socket.on("ice-candidate", ({ to, candidate }) => {
    console.log(`Relaying ICE candidate to ${to}:`, candidate);
    io.to(to).emit("ice-candidate", { from: socket.id, candidate });
  });

  socket.on("peer:nego:needed", ({ to, offer }) => {
    console.log("peer:nego:needed", to);
    io.to(to).emit("peer:nego:needed", { from: socket.id, offer });
  });

  socket.on("peer:nego:done", ({ to, ans }) => {
    console.log("peer:nego:done", to);
    io.to(to).emit("peer:nego:final", { from: socket.id, ans });
  });
});
