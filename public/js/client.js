// === ВАШ РАБОЧИЙ КОД БЕЗ ИЗМЕНЕНИЙ ===
const configuration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
const socket = io();
let ROOM_ID;
let peerConnection;
let dataChannel;
let HOST_ID;
let isFullscreen = false;
let onlineCount = 1;

// === НОВЫЕ ПЕРЕМЕННЫЕ ===
let controlsTimeout;
let controlsVisible = true;
let videoStartTime = Date.now();
let fakeProgress = 0;
let miniChatUnreadCount = 0;
let miniChatVisible = false;
let videoHeightFixed = false;

// === ОБНОВЛЕННЫЕ ФУНКЦИИ ===

function updateStatus(status, type = "info") {
	const desktopStatus = document.getElementById("desktopStatus");
	const mobileStatus = document.getElementById("mobileStatus");

	if (desktopStatus) desktopStatus.textContent = status;
	if (mobileStatus) {
		mobileStatus.innerHTML = `<i class="fas fa-signal"></i> ${status}`;
		if (type === "error") {
			mobileStatus.style.color = "#ef4444";
		} else if (type === "success") {
			mobileStatus.style.color = "#10b981";
		} else {
			mobileStatus.style.color = "#94a3b8";
		}
	}
}

function updateRoomId(roomId) {
	const desktopRoomId = document.getElementById("desktopRoomId");
	const mobileRoomId = document.getElementById("mobileRoomId");

	if (desktopRoomId) desktopRoomId.textContent = roomId;
	if (mobileRoomId) mobileRoomId.textContent = roomId;
}

function updateOnlineCount(count) {
	onlineCount = count;
	const text = count === 1 ? "1 онлайн" : `${count} онлайн`;
	const onlineCountEl = document.getElementById("onlineCount");
	if (onlineCountEl) onlineCountEl.textContent = text;
}

function showRoomInterface() {
	document.getElementById("connectScreen").classList.add("hidden");
	document.getElementById("roomContent").classList.remove("hidden");
	const mobileHeader = document.querySelector(".mobile-header");
	if (mobileHeader) mobileHeader.classList.remove("hidden");

	// Показываем контролы на короткое время
	showVideoControls();
	startProgressTimer();
	adjustVideoHeight();
}

// Управление отображением видео контролов
function showVideoControls() {
	const controls = document.getElementById("videoControls");
	if (!controls) return;

	controls.classList.add("visible");
	controlsVisible = true;

	clearTimeout(controlsTimeout);
	controlsTimeout = setTimeout(() => {
		if (isFullscreen && controlsVisible) {
			controls.classList.remove("visible");
			controlsVisible = false;
		}
	}, 3000);
}

function hideVideoControls() {
	if (isFullscreen && controlsVisible) {
		const controls = document.getElementById("videoControls");
		if (controls) {
			controls.classList.remove("visible");
			controlsVisible = false;
		}
	}
}

// Таймер для прогресс-бара
function startProgressTimer() {
	setInterval(() => {
		const videoPlaceholder = document.getElementById("videoPlaceholder");
		if (videoPlaceholder && videoPlaceholder.classList.contains("hidden")) {
			const elapsed = Date.now() - videoStartTime;
			const hours = Math.floor(elapsed / 3600000);
			const minutes = Math.floor((elapsed % 3600000) / 60000);
			const seconds = Math.floor((elapsed % 60000) / 1000);

			const timeString =
				hours > 0
					? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
							.toString()
							.padStart(2, "0")}`
					: `${minutes.toString().padStart(2, "0")}:${seconds
							.toString()
							.padStart(2, "0")}`;

			const timeDisplay = document.getElementById("timeDisplay");
			if (timeDisplay) timeDisplay.textContent = timeString;

			// Имитация прогресса
			fakeProgress = (fakeProgress + 0.1) % 100;
			const progress = document.getElementById("progress");
			if (progress) progress.style.width = fakeProgress + "%";
		}
	}, 100);
}

// Адаптация высоты видео
function adjustVideoHeight() {
	const video = document.getElementById("remote-video");
	const videoContainer = document.querySelector(".video-container");

	if (!video || !videoContainer) return;

	// Сбрасываем фиксированную высоту при ресайзе
	if (videoHeightFixed && !isFullscreen) {
		videoContainer.style.height = "";
		videoHeightFixed = false;
	}

	// Только для мобильных и когда видео загружено
	if (window.innerWidth <= 767 && video.videoWidth && video.videoHeight) {
		const aspectRatio = video.videoHeight / video.videoWidth;
		const containerWidth = videoContainer.clientWidth;
		const calculatedHeight = containerWidth * aspectRatio;

		// Ограничиваем максимальную высоту
		const maxHeight = window.innerHeight * 0.7;
		const finalHeight = Math.min(calculatedHeight, maxHeight);

		videoContainer.style.height = finalHeight + "px";
		videoHeightFixed = true;
	}
}

// Полноэкранный режим
function toggleFullscreen() {
	const videoSection = document.querySelector(".video-section");
	if (!videoSection) return;

	if (!isFullscreen) {
		// Вход в полноэкранный режим
		if (videoSection.requestFullscreen) {
			videoSection.requestFullscreen();
		} else if (videoSection.webkitRequestFullscreen) {
			videoSection.webkitRequestFullscreen();
		} else if (videoSection.mozRequestFullScreen) {
			videoSection.mozRequestFullScreen();
		}
		isFullscreen = true;

		// Показываем кнопку чата
		const toggleBtn = document.getElementById("miniChatToggleBtn");
		if (toggleBtn) {
			setTimeout(() => {
				toggleBtn.classList.add("visible");
			}, 300);
		}

		showVideoControls();
	} else {
		// Выход из полноэкранного режима
		exitFullscreen();
	}
}

function exitFullscreen() {
	if (document.exitFullscreen) {
		document.exitFullscreen();
	} else if (document.webkitExitFullscreen) {
		document.webkitExitFullscreen();
	} else if (document.mozCancelFullScreen) {
		document.mozCancelFullScreen();
	}
	isFullscreen = false;

	// Скрываем чат и кнопку
	closeMiniChat();
	const toggleBtn = document.getElementById("miniChatToggleBtn");
	if (toggleBtn) toggleBtn.classList.remove("visible");
}

// Управление мини-чатом
function toggleMiniChat() {
	if (!isFullscreen) return;

	const miniChat = document.getElementById("miniChat");
	const toggleBtn = document.getElementById("miniChatToggleBtn");

	if (!miniChatVisible) {
		// Открываем чат
		miniChat.classList.add("visible");
		toggleBtn.classList.add("active");
		toggleBtn.innerHTML = '<i class="fas fa-times"></i>';
		miniChatVisible = true;

		// Сбрасываем счетчик непрочитанных
		miniChatUnreadCount = 0;
		updateUnreadBadge();

		// Фокус на поле ввода
		setTimeout(() => {
			const input = document.getElementById("miniChatInput");
			if (input) input.focus();
		}, 100);
	} else {
		// Закрываем чат
		miniChat.classList.remove("visible");
		toggleBtn.classList.remove("active");
		toggleBtn.innerHTML = '<i class="fas fa-comment"></i>';
		miniChatVisible = false;
	}
}

function closeMiniChat() {
	const miniChat = document.getElementById("miniChat");
	const toggleBtn = document.getElementById("miniChatToggleBtn");

	if (miniChat) {
		miniChat.classList.remove("visible");
		miniChatVisible = false;
	}

	if (toggleBtn) {
		toggleBtn.classList.remove("active");
		toggleBtn.innerHTML = '<i class="fas fa-comment"></i>';
	}
}

// === ОБНОВЛЕННЫЙ ФУНКЦИОНАЛ ЧАТА ===

function sendMessage() {
	const messageInput = document.getElementById("chat-input");
	const message = messageInput.value.trim();
	if (message === "" || !dataChannel || dataChannel.readyState !== "open") return;

	dataChannel.send(JSON.stringify({ type: "chat", message, sender: "Participant" }));
	displayMessage(message, "local", "Я");
	displayMiniChatMessage(message, "local", "Я");
	messageInput.value = "";
	messageInput.focus();
}

function sendMiniChatMessage() {
	const input = document.getElementById("miniChatInput");
	if (!input) return;

	const message = input.value.trim();
	if (!message || !dataChannel || dataChannel.readyState !== "open") return;

	// Отправляем сообщение
	dataChannel.send(
		JSON.stringify({
			type: "chat",
			message,
			sender: "Participant",
		})
	);

	// Показываем свое сообщение
	displayMiniChatMessage(message, "local", "Я");
	displayMessage(message, "local", "Я");

	// Очищаем поле ввода
	input.value = "";
	input.focus();
}

function displayMiniChatMessage(text, type, sender = "Хост") {
	const messagesDiv = document.getElementById("miniChatMessages");
	if (!messagesDiv) return;

	// Убираем сообщение о загрузке если оно есть
	const loadingMsg = messagesDiv.querySelector(".system");
	if (loadingMsg && loadingMsg.innerHTML.includes("fa-spinner")) {
		loadingMsg.remove();
	}

	// Создаем сообщение
	const msg = document.createElement("div");
	msg.className = `mini-message ${type}`;

	const time = new Date().toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});

	msg.innerHTML = `
        ${type !== "system" ? `<div class="mini-message-sender">${sender}</div>` : ""}
        <div class="mini-message-text">${text}</div>
        <div class="mini-message-time">${time}</div>
    `;

	messagesDiv.appendChild(msg);
	messagesDiv.scrollTop = messagesDiv.scrollHeight;

	// Увеличиваем счетчик непрочитанных если чат закрыт
	if (!miniChatVisible && type === "remote") {
		miniChatUnreadCount++;
		updateUnreadBadge();
	}
}

function updateUnreadBadge() {
	const badge = document.getElementById("miniUnreadBadge");
	if (badge) {
		if (miniChatUnreadCount > 0) {
			badge.textContent = miniChatUnreadCount > 99 ? "99+" : miniChatUnreadCount.toString();
			badge.classList.remove("hidden");
		} else {
			badge.textContent = "0";
			badge.classList.add("hidden");
		}
	}
}

function displayMiniChatMessage(text, type, sender = "Хост") {
	const messagesDiv = document.getElementById("miniChatMessages");
	if (!messagesDiv) return;

	const loadingMsg = messagesDiv.querySelector(".system");
	if (loadingMsg && loadingMsg.innerHTML.includes("fa-spinner")) {
		loadingMsg.remove();
	}

	const msg = document.createElement("div");
	msg.className = `mini-message ${type}`;

	const time = new Date().toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});

	msg.innerHTML = `
    ${type !== "system" ? `<div class="mini-message-sender">${sender}</div>` : ""}
    <div class="mini-message-text">${text}</div>
    <div class="mini-message-time">${time}</div>
    `;

	messagesDiv.appendChild(msg);
	messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Обновленная функция для отображения системных сообщений
function displaySystemMessage(text) {
	displayMessage(text, "system");
	displayMiniChatMessage(text, "system");
}

// === ОРИГИНАЛЬНЫЙ КОД (с адаптацией) ===

async function createPeerConnection(hostId) {
	peerConnection = new RTCPeerConnection(configuration);
	HOST_ID = hostId;

	peerConnection.ontrack = (event) => {
		const remoteVideo = document.getElementById("remote-video");
		if (remoteVideo && remoteVideo.srcObject !== event.streams[0]) {
			remoteVideo.srcObject = event.streams[0];
			console.log("Remote stream added.");
			const videoPlaceholder = document.getElementById("videoPlaceholder");
			if (videoPlaceholder) videoPlaceholder.classList.add("hidden");
			updateStatus("Трансляція активна", "success");
			videoStartTime = Date.now();

			// Обновляем высоту видео после загрузки
			setTimeout(adjustVideoHeight, 500);
		}
	};

	peerConnection.ondatachannel = (event) => {
		dataChannel = event.channel;
		dataChannel.onopen = () => {
			console.log("Data Channel is open!");
			displaySystemMessage("Чат підключено");
		};
		dataChannel.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				if (data.type === "chat") {
					// Отображаем сообщение в основном чате
					displayMessage(data.message, "remote", "Хост");

					// И в мини-чате
					displayMiniChatMessage(data.message, "remote", "Хост");
				}
			} catch (e) {
				console.error("Error parsing chat message:", e);
			}
		};
	};

	peerConnection.onicecandidate = ({ candidate }) => {
		if (candidate) {
			socket.emit("signal", {
				roomId: ROOM_ID,
				targetId: HOST_ID,
				signalType: "ice",
				data: candidate,
			});
		}
	};

	peerConnection.onconnectionstatechange = () => {
		console.log("Состояние соединения:", peerConnection.connectionState);
		if (
			peerConnection.connectionState === "disconnected" ||
			peerConnection.connectionState === "failed"
		) {
			updateStatus("Втрачено зв'язок", "error");
			displaySystemMessage("Втрачено зв'язок з трансляцією");
		}
	};

	return peerConnection;
}

async function handleSignal(data) {
	const { senderId, signalType, data: signalData } = data;

	if (signalType === "sdp" && signalData.type === "offer") {
		if (!peerConnection) {
			await createPeerConnection(senderId);
		}
		updateStatus("Підключення до трансляції...");

		await peerConnection.setRemoteDescription(new RTCSessionDescription(signalData));

		const answer = await peerConnection.createAnswer();
		await peerConnection.setLocalDescription(answer);

		socket.emit("signal", {
			roomId: ROOM_ID,
			targetId: senderId,
			signalType: "sdp",
			data: peerConnection.localDescription,
		});
	} else if (signalType === "ice") {
		if (peerConnection) {
			await peerConnection.addIceCandidate(new RTCIceCandidate(signalData));
		}
	}
}

function joinRoom() {
	const roomIdInput = document.getElementById("roomIdInput");
	if (!roomIdInput) return;

	ROOM_ID = roomIdInput.value.trim().toUpperCase();
	if (!ROOM_ID) {
		showConnectError("Будь ласка, введіть ID кімнати.");
		return;
	}

	updateStatus("Підключення...");
	socket.emit("join_room", ROOM_ID);
	showConnectStatus("Підключення до кімнати...");
}

function showConnectStatus(message) {
	const statusDiv = document.getElementById("connectStatus");
	if (statusDiv) {
		statusDiv.textContent = message;
		statusDiv.className = "status-message";
	}
}

function showConnectError(message) {
	const statusDiv = document.getElementById("connectStatus");
	if (statusDiv) {
		statusDiv.textContent = message;
		statusDiv.className = "status-message error";
	}
}

// === НАСТРОЙКА СОБЫТИЙ ===

// Инициализация обработчиков событий
function initEventListeners() {
	const roomIdInput = document.getElementById("roomIdInput");
	if (roomIdInput) {
		roomIdInput.addEventListener("keypress", (e) => {
			if (e.key === "Enter") joinRoom();
		});
	}

	const chatInput = document.getElementById("chat-input");
	if (chatInput) {
		chatInput.addEventListener("keypress", (e) => {
			if (e.key === "Enter") sendMessage();
		});
	}

	// Клик по видео для показа/скрытия контролов
	const videoSection = document.querySelector(".video-section");
	if (videoSection) {
		videoSection.addEventListener("click", (e) => {
			if (
				e.target.id !== "progressBar" &&
				!e.target.closest(".control-btn") &&
				!e.target.closest(".mini-chat") &&
				!e.target.closest(".mini-chat-toggle-btn")
			) {
				if (controlsVisible) {
					hideVideoControls();
				} else {
					showVideoControls();
				}
			}
		});

		// Касание на мобильных
		videoSection.addEventListener("touchstart", (e) => {
			if (
				e.target.id !== "progressBar" &&
				!e.target.closest(".control-btn") &&
				!e.target.closest(".mini-chat") &&
				!e.target.closest(".mini-chat-toggle-btn")
			) {
				showVideoControls();
			}
		});

		// Движение мыши в области видео
		videoSection.addEventListener("mousemove", () => {
			if (isFullscreen) {
				showVideoControls();
			}
		});
	}

	// Прогресс-бар
	const progressBar = document.getElementById("progressBar");
	if (progressBar) {
		progressBar.addEventListener("click", (e) => {
			const rect = e.target.getBoundingClientRect();
			const pos = (e.clientX - rect.left) / rect.width;
			const progress = document.getElementById("progress");
			if (progress) progress.style.width = pos * 100 + "%";
			fakeProgress = pos * 100;
		});
	}

	// Кнопки
	const fullscreenBtn = document.getElementById("fullscreenBtn");
	if (fullscreenBtn) {
		fullscreenBtn.addEventListener("click", toggleFullscreen);
	}

	const audioBtn = document.getElementById("audioBtn");
	if (audioBtn) {
		audioBtn.addEventListener("click", () => {
			const video = document.getElementById("remote-video");
			if (video) {
				video.muted = !video.muted;
				audioBtn.classList.toggle("active", !video.muted);
				audioBtn.innerHTML = video.muted
					? '<i class="fas fa-volume-mute"></i>'
					: '<i class="fas fa-volume-up"></i>';
			}
		});
	}

	const reconnectBtn = document.getElementById("reconnectBtn");
	if (reconnectBtn) {
		reconnectBtn.addEventListener("click", () => {
			if (socket && ROOM_ID) {
				socket.emit("join_room", ROOM_ID);
				updateStatus("Перепідключення...");
				displaySystemMessage("Перепідключення...");
			}
		});
	}

	const miniChatToggleBtn = document.getElementById("miniChatToggleBtn");
	if (miniChatToggleBtn) {
		miniChatToggleBtn.addEventListener("click", toggleMiniChat);
	}

	const miniChatClose = document.getElementById("miniChatClose");
	if (miniChatClose) {
		miniChatClose.addEventListener("click", closeMiniChat);
	}

	const miniChatInput = document.getElementById("miniChatInput");
	if (miniChatInput) {
		miniChatInput.addEventListener("keypress", (e) => {
			if (e.key === "Enter") {
				sendMiniChatMessage();
			}
		});
	}

	// Обработка выхода из полноэкранного режима
	document.addEventListener("fullscreenchange", handleFullscreenChange);
	document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
	document.addEventListener("mozfullscreenchange", handleFullscreenChange);

	// Обработка выхода из полноэкранного режима
	document.addEventListener("fullscreenchange", () => {
		isFullscreen = !!document.fullscreenElement;
		const miniChatToggle = document.getElementById("miniChatToggleBtn");

		if (!isFullscreen) {
			if (miniChatToggle) miniChatToggle.classList.remove("visible");
			closeMiniChat();
			setTimeout(adjustVideoHeight, 100);
		} else {
			if (miniChatToggle) miniChatToggle.classList.add("visible");
		}
	});

	// Ресайз окна
	let resizeTimeout;
	window.addEventListener("resize", () => {
		clearTimeout(resizeTimeout);
		resizeTimeout = setTimeout(adjustVideoHeight, 250);
	});
}

function handleFullscreenChange() {
	const isFullscreenNow = !!(
		document.fullscreenElement ||
		document.webkitFullscreenElement ||
		document.mozFullScreenElement
	);

	isFullscreen = isFullscreenNow;

	const toggleBtn = document.getElementById("miniChatToggleBtn");

	if (isFullscreenNow) {
		// Вошли в полноэкранный режим
		if (toggleBtn) {
			setTimeout(() => {
				toggleBtn.classList.add("visible");
			}, 300);
		}
	} else {
		// Вышли из полноэкранного режима
		if (toggleBtn) toggleBtn.classList.remove("visible");
		closeMiniChat();
	}
}

// === ОБРАБОТЧИКИ SOCKET.IO ===

socket.on("connect", () => {
	console.log("Connected to signaling server.");
});

socket.on("room_error", (msg) => {
	showConnectError(`Помилка: ${msg}`);
	updateStatus("Помилка підключення", "error");
});

socket.on("room_ready", () => {
	showRoomInterface();
	updateRoomId(ROOM_ID);
	updateStatus("Підключено до кімнати");
	updateOnlineCount(2);
	displaySystemMessage("Ви підключилися до кімнати");
});

socket.on("signal", handleSignal);

socket.on("host_disconnected", (msg) => {
	showConnectError("Хост відключився");
	updateStatus("Хост відключився", "error");
	displaySystemMessage("Хост завершив трансляцію");
	setTimeout(() => {
		location.reload();
	}, 3000);
});

socket.on("participant_joined", () => {
	updateOnlineCount(onlineCount + 1);
	displaySystemMessage("Новий глядач приєднався");
});

socket.on("participant_left", () => {
	updateOnlineCount(Math.max(1, onlineCount - 1));
	displaySystemMessage("Глядач вийшов");
});

// === ИНИЦИАЛИЗАЦИЯ ===

window.addEventListener("load", () => {
	const roomIdInput = document.getElementById("roomIdInput");
	if (roomIdInput) roomIdInput.focus();

	const mobileHeader = document.querySelector(".mobile-header");
	if (mobileHeader && window.innerWidth <= 767) {
		mobileHeader.classList.add("hidden");
	}

	// Инициализируем обработчики событий
	initEventListeners();

	if (
		document.fullscreenElement ||
		document.webkitFullscreenElement ||
		document.mozFullScreenElement
	) {
		isFullscreen = true;
		const toggleBtn = document.getElementById("miniChatToggleBtn");
		if (toggleBtn) toggleBtn.classList.add("visible");
	}

	// Автоматически показываем контролы при загрузке
	setTimeout(() => {
		if (document.getElementById("roomContent").classList.contains("hidden")) {
			showVideoControls();
		}
	}, 1000);
});

// Слушаем загрузку видео для корректного расчета высоты
const videoObserver = new MutationObserver((mutations) => {
	mutations.forEach((mutation) => {
		if (mutation.attributeName === "src" || mutation.attributeName === "srcObject") {
			setTimeout(adjustVideoHeight, 500);
		}
	});
});

// Запускаем observer после загрузки DOM
document.addEventListener("DOMContentLoaded", () => {
	const remoteVideo = document.getElementById("remote-video");
	if (remoteVideo) {
		videoObserver.observe(remoteVideo, {
			attributes: true,
			attributeFilter: ["src", "srcObject"],
		});
	}
});
