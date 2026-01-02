const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
	cors: {
		origin: "*",
		methods: ["GET", "POST"],
	},
});
const PORT = 3000;

// === ДОБАВИЛ ЭТУ СТРОКУ ===
app.use(express.static(path.join(__dirname, "public")));

// Структура для відстеження кімнат та їх хостів
const rooms = new Map();

// === ВАШ ИСХОДНЫЙ КОД НИЖЕ БЕЗ ИЗМЕНЕНИЙ ===
io.on("connection", (socket) => {
	console.log(`User connected: ${socket.id}`);

	// --- Логіка Кімнат ---

	socket.on("create_room", (roomId) => {
		if (rooms.has(roomId)) {
			socket.emit("room_error", "Room ID already exists.");
			return;
		}

		socket.join(roomId);
		rooms.set(roomId, { hostId: socket.id, participants: new Set([socket.id]) });
		console.log(`Host ${socket.id} created and joined room: ${roomId}`);
		socket.emit("room_ready", { roomId, isHost: true });
	});

	socket.on("join_room", (roomId) => {
		const roomData = rooms.get(roomId);
		if (!roomData) {
			socket.emit("room_error", "Room does not exist.");
			return;
		}

		socket.join(roomId);
		roomData.participants.add(socket.id);

		// Повідомляємо нового учасника
		socket.emit("room_ready", { roomId, isHost: false });
		// Повідомляємо хосту про нового учасника (для створення Offer)
		io.to(roomData.hostId).emit("participant_joined", { participantId: socket.id });

		console.log(`Participant ${socket.id} joined room: ${roomId}`);
	});

	// --- Логіка Сигналізації WebRTC ---

	socket.on("signal", (data) => {
		const roomData = rooms.get(data.roomId);
		if (!roomData) return;

		data = { roomId, targetId, signalType, data };

		if (data.targetId) {
			// Надсилаємо конкретному піру (від Хоста до Учасника або навпаки)
			io.to(data.targetId).emit("signal", {
				senderId: socket.id,
				...data,
			});
		}
	});

	// --- Обробка відключення ---

	socket.on("disconnect", () => {
		console.log(`User disconnected: ${socket.id}`);

		// Перевіряємо, чи був користувач хостом
		let disconnectedRoomId = null;
		for (const [roomId, roomData] of rooms.entries()) {
			if (roomData.hostId === socket.id) {
				// Хост відключився
				io.to(roomId).emit("host_disconnected", "The host has left the room.");
				rooms.delete(roomId);
				console.log(`Room ${roomId} closed due to host disconnect.`);
				disconnectedRoomId = roomId;
				break;
			} else if (roomData.participants.has(socket.id)) {
				// Учасник відключився
				roomData.participants.delete(socket.id);
				console.log(`Participant ${socket.id} left room ${roomId}.`);
				break;
			}
		}
	});
});

server.listen(PORT, () => {
	console.log(`Server running at http://localhost:${PORT}`);
});
