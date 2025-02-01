class HollerApp {
    constructor() {
        this.ws = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.audioContext = null;
        this.setupAuthUI();  // Set up auth UI immediately
        this.checkSession();
        this.reconnectAttempts = 0;
        this.maxReconnectDelay = 30000; // Max 30 seconds
        this.participants = new Set();
        this.currentSpeaker = null;
        this.setupContextMenu();
        this.mutedUsers = new Set();
        this.isPlayingCatchUp = false;
        this.setupCatchUpUI();
        this.audioInitialized = false;
    }

    async checkSession() {
        try {
            const response = await fetch('/api/session', {
                credentials: 'include' // Add this to include cookies
            });
            if (response.ok) {
                const user = await response.json();
                this.onLoginSuccess(user);
            } else {
                document.getElementById('authOverlay').style.display = 'flex';
            }
        } catch (err) {
            console.error('Session check error:', err);
            document.getElementById('authOverlay').style.display = 'flex';
        }
    }

    setupAuthUI() {
        this.loginButton = document.getElementById('loginButton');
        this.registerButton = document.getElementById('registerButton');

        this.loginButton.addEventListener('click', () => this.login());
        this.registerButton.addEventListener('click', () => this.register());
    }

    setupAppUI() {
        this.pttButton = document.getElementById('pttButton');
        this.pttButton.addEventListener('mousedown', () => this.startRecording());
        this.pttButton.addEventListener('mouseup', () => this.stopRecording());
        this.pttButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startRecording();
        });
        this.pttButton.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.stopRecording();
        });

        document.getElementById('startButton').addEventListener('click', async () => {
            await this.initializeAudio();
            document.getElementById('startModal').style.display = 'none';
        });
    }

    async initializeAudio() {
        if (this.audioInitialized) return;

        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            await this.audioContext.resume();
            this.audioInitialized = true;

            // Show main content and action bar only after audio is initialized
            document.getElementById('participants').style.display = 'grid';
            document.getElementById('actionBar').style.display = 'flex';

            // Update layout
            document.body.classList.add('app-ready');
        } catch (err) {
            console.error('Error initializing audio:', err);
            alert('Failed to initialize audio. Please try again.');
        }
    }

    async startRecording() {
        if (!this.audioInitialized) {
            await this.initializeAudio();
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus',
                bitsPerSecond: 12000
            });

            this.mediaRecorder.ondataavailable = (e) => {
                this.audioChunks.push(e.data);
            };

            this.mediaRecorder.start();
            this.pttButton.classList.add('active');
        } catch (err) {
            console.error('Error accessing microphone:', err);
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
            this.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm;codecs=opus' });
                this.sendAudio(audioBlob);
                this.audioChunks = [];
            };
            this.pttButton.classList.remove('active');
        }
    }

    async sendAudio(blob) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(blob);
        }
    }

    async login() {
        const username = document.getElementById('usernameInput').value;
        const password = document.getElementById('passwordInput').value;

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include', // Add this to include cookies
                body: JSON.stringify({ username, password })
            });

            if (response.ok) {
                const user = await response.json();
                this.onLoginSuccess(user);
            } else {
                alert('Login failed');
            }
        } catch (err) {
            console.error('Login error:', err);
        }
    }

    async register() {
        const username = document.getElementById('usernameInput').value;
        const password = document.getElementById('passwordInput').value;

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (response.ok) {
                alert('Registration successful! Please login.');
            } else {
                alert('Registration failed');
            }
        } catch (err) {
            console.error('Registration error:', err);
        }
    }

    connectWebSocket(username) {
        this.ws = new WebSocket(`ws://${location.host}/ws?username=${username}`);
        this.updateStatus('Connecting...');
        let currentSpeaker = null;

        this.ws.onopen = () => {
            this.updateStatus('Connected');
            this.reconnectAttempts = 0;
        };

        this.ws.onmessage = async (event) => {
            if (event.data instanceof Blob) {
                // Handle binary audio data
                if (currentSpeaker) {
                    await this.playAudioMessage(event.data, currentSpeaker);
                    currentSpeaker = null;
                }
            } else {
                try {
                    const message = JSON.parse(event.data);
                    switch (message.type) {
                        case 'participants':
                            this.updateParticipants(message.participants);
                            break;
                        case 'speaker':
                            currentSpeaker = message.username;
                            break;
                    }
                } catch (e) {
                    console.error('Failed to parse message:', e);
                }
            }
        };

        this.ws.onclose = () => {
            this.updateStatus('Disconnected');
            this.scheduleReconnect();
        };

        this.ws.onerror = (error) => {
            this.updateStatus('Connection Error');
            console.error('WebSocket error:', error);
        };
    }

    scheduleReconnect() {
        if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
            this.updateStatus(`Reconnecting in ${Math.round(delay / 1000)}s...`);

            setTimeout(() => {
                this.reconnectAttempts++;
                this.connectWebSocket(document.getElementById('username').textContent);
            }, delay);
        }
    }

    updateStatus(status) {
        const statusEl = document.getElementById('status');
        const statusLed = document.getElementById('statusLed');
        statusEl.textContent = status;

        // Remove all status classes
        statusLed.classList.remove('connected', 'disconnected', 'connecting');

        // Add appropriate class based on status
        if (status === 'Connected') {
            statusLed.classList.add('connected');
        } else if (status === 'Disconnected') {
            statusLed.classList.add('disconnected');
        } else {
            statusLed.classList.add('connecting');
        }
    }

    updateParticipants(participants) {
        const container = document.getElementById('participants');
        container.innerHTML = '';
        this.participants = new Set(participants);

        participants.forEach(username => {
            this.addParticipant(username);
        });
    }

    createSVGAvatar(username, isToolbar = false) {
        const color = this.getUserColor(username);
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', isToolbar ? 'toolbar-avatar' : 'participant-avatar');
        svg.setAttribute('viewBox', '0 0 60 60');
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', '30');
        circle.setAttribute('cy', '30');
        circle.setAttribute('r', '30');
        circle.setAttribute('fill', color);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', '30');
        text.setAttribute('y', '38');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('fill', 'white');
        text.setAttribute('font-size', isToolbar ? '24' : '28');
        text.textContent = username[0].toUpperCase();

        svg.appendChild(circle);
        svg.appendChild(text);
        return svg;
    }

    addParticipant(username) {
        const div = document.createElement('div');
        div.className = 'participant';
        if (this.mutedUsers.has(username)) {
            div.classList.add('muted');
        }

        const avatar = this.createSVGAvatar(username);
        div.appendChild(avatar);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'participant-name';
        nameSpan.textContent = username;
        div.appendChild(nameSpan);

        const muteButton = document.createElement('button');
        muteButton.className = 'mute-button';
        muteButton.innerHTML = '🔇';
        muteButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMute(username);
        });
        div.appendChild(muteButton);

        // Add click listener for the whole participant card
        div.addEventListener('click', async () => {
            if (!this.mutedUsers.has(username)) {
                const response = await fetch('/api/messages/recent');
                const messages = await response.json();
                const lastMessage = messages.find(msg => msg.username === username);
                if (lastMessage) {
                    this.playMessage(lastMessage.id, username);
                }
            }
        });

        document.getElementById('participants').appendChild(div);
    }

    toggleMute(username) {
        if (this.mutedUsers.has(username)) {
            this.mutedUsers.delete(username);
        } else {
            this.mutedUsers.add(username);
        }

        // Update UI
        const container = document.getElementById('participants');
        const elements = container.getElementsByClassName('participant');
        for (const element of elements) {
            const nameEl = element.querySelector('.participant-name');
            if (nameEl && nameEl.textContent === username) {
                element.classList.toggle('muted');
                break;
            }
        }
    }

    getUserColor(username) {
        let hash = 0;
        for (let i = 0; i < username.length; i++) {
            hash = username.charCodeAt(i) + ((hash << 5) - hash);
        }
        const h = hash % 360;
        return `hsl(${h}, 70%, 50%)`;
    }

    onLoginSuccess(user) {
        this.updateUserInfo(user);
        document.getElementById('authOverlay').style.display = 'none';

        // Hide main content and action bar initially
        document.getElementById('participants').style.display = 'none';
        document.getElementById('actionBar').style.display = 'none';

        document.getElementById('startModal').style.display = 'flex';
        this.setupAppUI();
        this.connectWebSocket(user.username);
    }

    setParticipantSpeaking(username, isSpeaking) {
        const participants = document.getElementById('participants');
        const elements = participants.getElementsByClassName('participant');

        for (const element of elements) {
            const nameEl = element.querySelector('.participant-name');
            if (nameEl && nameEl.textContent === username) {
                if (isSpeaking) {
                    element.classList.add('speaking');
                } else {
                    element.classList.remove('speaking');
                }
                break;
            }
        }
    }

    async playAudioMessage(blob, username) {
        if (this.mutedUsers.has(username)) {
            return; // Skip playing audio for muted users
        }

        const audio = new Audio();
        const url = URL.createObjectURL(blob);

        try {
            this.setParticipantSpeaking(username, true);

            return new Promise((resolve, reject) => {
                audio.src = url;

                audio.onended = () => {
                    this.setParticipantSpeaking(username, false);
                    URL.revokeObjectURL(url);
                    resolve();
                };

                audio.onerror = (e) => {
                    console.error('Audio playback error:', e);
                    this.setParticipantSpeaking(username, false);
                    URL.revokeObjectURL(url);
                    reject(e);
                };

                audio.play().catch(err => {
                    console.error('Error playing audio:', err);
                    this.setParticipantSpeaking(username, false);
                    URL.revokeObjectURL(url);
                    reject(err);
                });
            });
        } catch (err) {
            console.error('Error setting up audio:', err);
            this.setParticipantSpeaking(username, false);
            URL.revokeObjectURL(url);
            throw err;
        }
    }

    setupContextMenu() {
        const userInfo = document.getElementById('userInfo');
        const contextMenu = document.getElementById('contextMenu');

        userInfo.addEventListener('click', (e) => {
            e.stopPropagation();
            contextMenu.classList.toggle('visible');
        });

        document.addEventListener('click', () => {
            contextMenu.classList.remove('visible');
        });

        contextMenu.addEventListener('click', async (e) => {
            const action = e.target.dataset.action;
            if (!action) return;

            switch (action) {
                case 'changeAvatar':
                    await this.changeAvatar();
                    break;
                case 'changePassword':
                    await this.changePassword();
                    break;
                case 'logout':
                    await this.logout();
                    break;
            }
        });
    }

    async changePassword() {
        const currentPassword = prompt('Enter current password:');
        const newPassword = prompt('Enter new password:');
        if (!currentPassword || !newPassword) return;

        try {
            const response = await fetch('/api/settings/password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    currentPassword,
                    newPassword
                })
            });

            if (response.ok) {
                alert('Password changed successfully');
            } else {
                alert('Failed to change password');
            }
        } catch (err) {
            console.error('Error:', err);
        }
    }

    async logout() {
        try {
            await fetch('/api/logout', {
                method: 'POST',
                credentials: 'include'
            });
            window.location.reload();
        } catch (err) {
            console.error('Error:', err);
        }
    }

    updateUserInfo(user) {
        document.getElementById('username').textContent = user.username;
        const avatar = this.createSVGAvatar(user.username, true);
        const toolbarAvatar = document.getElementById('toolbarAvatar');
        toolbarAvatar.innerHTML = '';
        toolbarAvatar.appendChild(avatar);
    }

    setupCatchUpUI() {
        const catchUpButton = document.getElementById('catchUpButton');
        const modal = document.getElementById('catchUpModal');
        const closeButton = document.getElementById('closeCatchUp');
        const playButton = document.getElementById('playCatchUp');
        const stopButton = document.getElementById('stopCatchUp');

        catchUpButton.addEventListener('click', () => {
            this.loadRecentMessages();
            modal.style.display = 'flex';
        });

        closeButton.addEventListener('click', () => {
            modal.style.display = 'none';
            this.stopCatchUp();
        });

        playButton.addEventListener('click', () => {
            this.startCatchUp();
            playButton.style.display = 'none';
            stopButton.style.display = 'inline-block';
        });

        stopButton.addEventListener('click', () => {
            this.stopCatchUp();
            stopButton.style.display = 'none';
            playButton.style.display = 'inline-block';
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
                this.stopCatchUp();
            }
        });
    }

    humanizeTime(timestamp) {
        const now = new Date();
        const date = new Date(timestamp);
        const diff = now - date;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
            return `${days}d ago`;
        } else if (hours > 0) {
            return `${hours}h ago`;
        } else if (minutes > 0) {
            return `${minutes}m ago`;
        } else {
            return 'just now';
        }
    }

    async loadRecentMessages() {
        try {
            const response = await fetch('/api/messages/recent');
            const messages = await response.json();

            const messagesList = document.getElementById('messagesList');
            messagesList.innerHTML = '';

            // Reverse the array to show latest messages at the bottom
            messages.reverse().forEach(msg => {
                const div = document.createElement('div');
                div.className = 'message-item';
                div.dataset.messageId = msg.id;

                const avatar = this.createSVGAvatar(msg.username);
                avatar.style.width = '40px';
                avatar.style.height = '40px';

                const info = document.createElement('div');
                info.className = 'message-info';

                const username = document.createElement('div');
                username.className = 'message-username';
                username.textContent = msg.username;

                const time = document.createElement('div');
                time.className = 'message-time';
                time.textContent = this.humanizeTime(msg.timestamp);
                time.title = new Date(msg.timestamp).toLocaleString(); // Full timestamp on hover

                info.appendChild(username);
                info.appendChild(time);

                div.appendChild(avatar);
                div.appendChild(info);

                div.addEventListener('click', () => this.playMessage(msg.id, msg.username));
                messagesList.appendChild(div);
            });

            // Scroll to bottom to show latest messages
            messagesList.scrollTop = messagesList.scrollHeight;
        } catch (err) {
            console.error('Error loading messages:', err);
        }
    }

    async playMessage(messageId, username) {
        if (this.isPlayingCatchUp || this.mutedUsers.has(username)) {
            return;
        }

        const items = document.getElementsByClassName('message-item');
        Array.from(items).forEach(item => {
            item.classList.remove('playing');
            if (item.dataset.messageId === messageId.toString()) {
                item.classList.add('playing');
            }
        });

        try {
            const response = await fetch(`/api/messages/audio?id=${messageId}`);
            const blob = await response.blob();
            await this.playAudioMessage(blob, username);
        } catch (err) {
            console.error('Error playing message:', err);
        } finally {
            Array.from(items).forEach(item => item.classList.remove('playing'));
        }
    }

    async startCatchUp() {
        if (this.isPlayingCatchUp) {
            return;
        }

        this.isPlayingCatchUp = true;
        const messagesList = document.getElementById('messagesList');
        const items = Array.from(messagesList.getElementsByClassName('message-item'));

        for (let i = 0; i < items.length && this.isPlayingCatchUp; i++) {
            const item = items[i];
            const msgId = item.dataset.messageId;
            const username = item.querySelector('.message-username').textContent;

            if (!this.mutedUsers.has(username)) {
                items.forEach(it => it.classList.remove('playing'));
                item.classList.add('playing');

                // Ensure the playing message is visible
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

                try {
                    const response = await fetch(`/api/messages/audio?id=${msgId}`);
                    const blob = await response.blob();
                    await this.playAudioMessage(blob, username);
                    await new Promise(resolve => setTimeout(resolve, 500)); // 500ms pause
                } catch (err) {
                    console.error('Error playing message:', err);
                }
            }
        }

        this.isPlayingCatchUp = false;
        items.forEach(item => item.classList.remove('playing'));

        // Reset UI
        document.getElementById('stopCatchUp').style.display = 'none';
        document.getElementById('playCatchUp').style.display = 'inline-block';
    }
}

window.addEventListener('load', () => {
    window.app = new HollerApp();
});
