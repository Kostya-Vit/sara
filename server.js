// server.js - исправленная версия
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

// Настройка CORS для Socket.io
const io = new Server(server, {
	cors: {
		origin: "*",
		methods: ["GET", "POST"],
		credentials: true,
	},
	// Важно для Render
	transports: ["websocket", "polling"],
	allowEIO3: true,
});

const PORT = process.env.PORT || 3000; // Render использует свой порт

// ВАЖНО: Сначала статичные файлы
app.use(express.static(path.join(__dirname, "public")));

// ВАЖНО: Health check endpoint для Render
app.get("/", (req, res) => {
	res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/health", (req, res) => {
	res.status(200).json({
		status: "ok",
		timestamp: Date.now(),
		service: "WebRTC Streaming",
	});
});

app.get("/api/status", (req, res) => {
	res.json({
		server: "running",
		uptime: process.uptime(),
		rooms: rooms ? rooms.size : 0,
	});
});

// Структура для відстеження кімнат та їх хостів
const rooms = new Map();

// === WebSocket события ===
io.on("connection", (socket) => {
	console.log(`✅ User connected: ${socket.id}`);

	// Приветственное сообщение
	socket.emit("welcome", {
		message: "Connected to WebRTC Server",
		socketId: socket.id,
	});

	// --- Логіка Кімнат ---
	socket.on("create_room", (roomId) => {
		const formattedRoomId = roomId.toUpperCase().trim();

		console.log(`📝 Create room request: ${formattedRoomId} from ${socket.id}`);

		if (rooms.has(formattedRoomId)) {
			socket.emit("room_error", "Room ID already exists.");
			return;
		}

		socket.join(formattedRoomId);
		rooms.set(formattedRoomId, {
			hostId: socket.id,
			participants: new Set([socket.id]),
		});

		console.log(`✅ Host ${socket.id} created room: ${formattedRoomId}`);
		socket.emit("room_ready", {
			roomId: formattedRoomId,
			isHost: true,
			message: "Room created successfully",
		});
	});

	socket.on("join_room", (roomId) => {
		const formattedRoomId = roomId.toUpperCase().trim();
		const roomData = rooms.get(formattedRoomId);

		console.log(`👥 Join room request: ${formattedRoomId} from ${socket.id}`);

		if (!roomData) {
			socket.emit("room_error", "Room does not exist.");
			return;
		}

		// Проверяем, что хост онлайн
		const hostSocket = io.sockets.sockets.get(roomData.hostId);
		if (!hostSocket) {
			socket.emit("room_error", "Host is offline.");
			rooms.delete(formattedRoomId);
			return;
		}

		socket.join(formattedRoomId);
		roomData.participants.add(socket.id);

		// Уведомляем участника
		socket.emit("room_ready", {
			roomId: formattedRoomId,
			isHost: false,
			hostId: roomData.hostId,
		});

		// Уведомляем хоста
		io.to(roomData.hostId).emit("participant_joined", {
			participantId: socket.id,
		});

		console.log(`✅ Participant ${socket.id} joined room: ${formattedRoomId}`);
	});

	// --- Логіка Сигналізації WebRTC ---
	socket.on("signal", (data) => {
		const { roomId, targetId, signalType, data: signalData } = data;

		if (!targetId) {
			console.error("❌ No targetId in signal:", data);
			return;
		}

		console.log(`📡 Signal ${signalType} from ${socket.id} to ${targetId}`);

		// Отправляем сигнал целевому клиенту
		io.to(targetId).emit("signal", {
			senderId: socket.id,
			signalType,
			data: signalData,
		});
	});

	// Чат сообщения
	socket.on("chat_message", (data) => {
		const { roomId, message } = data;
		const roomData = rooms.get(roomId);

		if (roomData && roomData.participants.has(socket.id)) {
			io.to(roomId).emit("chat_message", {
				from: socket.id,
				message: message,
				sender: socket.id === roomData.hostId ? "Host" : "Participant",
				timestamp: Date.now(),
			});
		}
	});

	// --- Обробка відключення ---
	socket.on("disconnect", (reason) => {
		console.log(`❌ User disconnected: ${socket.id}, reason: ${reason}`);

		for (const [roomId, roomData] of rooms.entries()) {
			if (roomData.hostId === socket.id) {
				// Хост отключился
				io.to(roomId).emit("host_disconnected", "Host has left the room.");
				rooms.delete(roomId);
				console.log(`❌ Room ${roomId} deleted (host disconnected)`);
				break;
			} else if (roomData.participants.has(socket.id)) {
				// Участник отключился
				roomData.participants.delete(socket.id);
				console.log(`👋 Participant ${socket.id} left room ${roomId}`);

				// Уведомляем хоста
				io.to(roomData.hostId).emit("participant_left", socket.id);
				break;
			}
		}
	});

	// Ошибки
	socket.on("error", (error) => {
		console.error(`❌ Socket error: ${error}`);
	});
});

// Обработка остановки
process.on("SIGTERM", () => {
	console.log("SIGTERM received, shutting down...");
	server.close(() => {
		console.log("Server closed");
		process.exit(0);
	});
});

// ВАЖНО: Слушаем на 0.0.0.0
server.listen(PORT, "0.0.0.0", () => {
	console.log("========================================");
	console.log(`🚀 Server started on port ${PORT}`);
	console.log(`🌐 WebSocket: ws://0.0.0.0:${PORT}`);
	console.log(`📡 Health: http://0.0.0.0:${PORT}/health`);
	console.log(`📊 Status: http://0.0.0.0:${PORT}/api/status`);
	console.log("========================================");
});
