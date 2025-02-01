class HollerApp {
    constructor() {
        this.ws = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.audioContext = null;
        this.checkSession();
    }

    async checkSession() {
        try {
            const response = await fetch('/api/session');
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

    setupUI() {
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

        this.loginButton = document.getElementById('loginButton');
        this.registerButton = document.getElementById('registerButton');

        this.loginButton.addEventListener('click', () => this.login());
        this.registerButton.addEventListener('click', () => this.register());

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

        this.ws.onopen = () => {
            document.getElementById('status').textContent = 'Connected';
        };

        this.ws.onclose = () => {
            document.getElementById('status').textContent = 'Disconnected';
        };

        this.ws.onmessage = async (event) => {
            if (event.data instanceof Blob) {
                const audio = new Audio(URL.createObjectURL(event.data));
                await audio.play();
            }
        };
    }

    addParticipant(username) {
        const div = document.createElement('div');
        div.className = 'participant';
        div.style.backgroundColor = this.getUserColor(username);
        div.textContent = username[0].toUpperCase();
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
        this.setupUI();
        this.connectWebSocket(user.username);
    }
}

window.addEventListener('load', () => {
    window.app = new HollerApp();
});
