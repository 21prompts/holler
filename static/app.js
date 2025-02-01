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

        document.getElementById('startButton').addEventListener('click', () => {
            this.initializeAudio();
            document.getElementById('startModal').style.display = 'none';
        });
    }

    async initializeAudio() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await this.audioContext.resume();
    }

    async startRecording() {
        if (!this.audioContext) {
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

        this.ws.onopen = () => {
            this.updateStatus('Connected');
            this.reconnectAttempts = 0; // Reset attempts on successful connection
        };

        this.ws.onclose = () => {
            this.updateStatus('Disconnected');
            this.scheduleReconnect();
        };

        this.ws.onerror = (error) => {
            this.updateStatus('Connection Error');
            console.error('WebSocket error:', error);
        };

        this.ws.onmessage = async (event) => {
            if (event.data instanceof Blob) {
                const audio = new Audio(URL.createObjectURL(event.data));
                await audio.play();
            } else {
                try {
                    const message = JSON.parse(event.data);
                    if (message.type === 'participants') {
                        this.updateParticipants(message.participants);
                    }
                } catch (e) {
                    console.error('Failed to parse message:', e);
                }
            }
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
        document.getElementById('status').textContent = status;
    }

    updateParticipants(participants) {
        const container = document.getElementById('participants');
        container.innerHTML = '';
        this.participants = new Set(participants);

        participants.forEach(username => {
            this.addParticipant(username);
        });
    }

    createSVGAvatar(username) {
        const color = this.getUserColor(username);
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'participant-avatar');
        svg.setAttribute('viewBox', '0 0 60 60');

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
        text.setAttribute('font-size', '24');
        text.textContent = username[0].toUpperCase();

        svg.appendChild(circle);
        svg.appendChild(text);
        return svg;
    }

    addParticipant(username) {
        const div = document.createElement('div');
        div.className = 'participant';

        const avatar = this.createSVGAvatar(username);
        div.appendChild(avatar);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'participant-name';
        nameSpan.textContent = username;
        div.appendChild(nameSpan);

        document.getElementById('participants').appendChild(div);
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
        document.getElementById('username').textContent = user.username;
        document.getElementById('authOverlay').style.display = 'none';
        document.getElementById('startModal').style.display = 'flex';
        this.setupAppUI();  // Only set up app UI after login
        this.connectWebSocket(user.username);
    }
}

window.addEventListener('load', () => {
    window.app = new HollerApp();
});
