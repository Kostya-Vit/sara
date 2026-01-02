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

	const userAgent = socket.handshake.headers["user-agent"] || "";
	const isMobile = /mobile/i.test(userAgent);

	// Отправляем оптимизированную конфигурацию для мобильных
	socket.emit("config", {
		iceServers: getIceServers(isMobile),
		isMobile: isMobile,
	});

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
		console.log("📨 Получен сигнал:", data);

		// Проверяем, что данные корректны
		if (!data || !data.signalType) {
			console.error("❌ Некорректные данные сигнала:", data);
			return;
		}

		handleSignal(data).catch((error) => {
			console.error("❌ Ошибка обработки сигнала:", error);
		});
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

function getIceServers(isMobile = false) {
	const iceServers = [
		{ urls: "stun:stun.l.google.com:19302" },
		{ urls: "stun:stun1.l.google.com:19302" },
		{ urls: "stun:stun2.l.google.com:19302" },
		{ urls: "stun:stun3.l.google.com:19302" },
		{ urls: "stun:stun4.l.google.com:19302" },
		{ urls: "stun:stun.voiparound.com" },
		{ urls: "stun:stun.voipbuster.com" },
		{ urls: "stun:stun.voipstunt.com" },
	];

	// Для мобильных добавляем дополнительные серверы
	if (isMobile) {
		iceServers.push(
			{ urls: "turn:turn.bistri.com:80?transport=udp" },
			{ urls: "turn:turn.bistri.com:80?transport=tcp" },
			{
				urls: "turn:turn.anyfirewall.com:443?transport=tcp",
				username: "webrtc",
				credential: "webrtc",
			}
		);
	}

	return iceServers;
}

server.listen(PORT, "0.0.0.0", () => {
	console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
	console.log(`🌐 WebSocket server ready at ws://0.0.0.0:${PORT}`);
});
