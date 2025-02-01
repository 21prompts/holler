package main

import (
	"database/sql"
	"log"
	"net/http"
	"sync"

	"encoding/json"

	"os"

	_ "github.com/glebarez/go-sqlite"
	"github.com/gorilla/sessions"
	"github.com/gorilla/websocket"
	"golang.org/x/crypto/bcrypt"
)

type Server struct {
	db       *sql.DB
	upgrader websocket.Upgrader
	clients  sync.Map
	store    *sessions.CookieStore
}

type User struct {
	ID       int64  `json:"id"`
	Username string `json:"username"`
}

type Client struct {
	conn *websocket.Conn
	user User
}

type AuthRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type ParticipantMessage struct {
	Type         string   `json:"type"`
	Participants []string `json:"participants"`
}

type AudioMessage struct {
	Type     string `json:"type"`
	Username string `json:"username"`
	Audio    []byte `json:"audio"`
}

func main() {
	db, err := sql.Open("sqlite", "holler.db")
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	// Initialize tables
	if err := initDB(db); err != nil {
		log.Fatal(err)
	}

	// Use a proper session key or generate one if not set
	sessionKey := os.Getenv("SESSION_KEY")
	if sessionKey == "" {
		sessionKey = "holler-default-key-change-in-production"
	}

	server := &Server{
		db: db,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
		store: sessions.NewCookieStore([]byte(sessionKey)),
	}

	// Configure session store
	server.store.Options = &sessions.Options{
		Path:     "/",
		MaxAge:   86400 * 7, // 7 days
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	}

	// Static files
	http.Handle("/", http.FileServer(http.Dir("static")))

	// API endpoints with CORS middleware
	http.HandleFunc("/api/register", server.corsMiddleware(server.handleRegister))
	http.HandleFunc("/api/login", server.corsMiddleware(server.handleLogin))
	http.HandleFunc("/api/session", server.corsMiddleware(server.checkSession))
	http.HandleFunc("/ws", server.handleWebSocket)
	http.HandleFunc("/api/settings/password", server.corsMiddleware(server.handleChangePassword))
	http.HandleFunc("/api/logout", server.corsMiddleware(server.handleLogout))

	log.Println("Server starting on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}

func initDB(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY,
			username TEXT UNIQUE,
			password_hash BLOB
		);
		CREATE TABLE IF NOT EXISTS audio_messages (
			id INTEGER PRIMARY KEY,
			user_id INTEGER,
			timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
			audio_data BLOB,
			FOREIGN KEY(user_id) REFERENCES users(id)
		);
	`)
	return err
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var auth AuthRequest
	if err := json.NewDecoder(r.Body).Decode(&auth); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	hash := hashPassword(auth.Password)
	result, err := s.db.Exec("INSERT INTO users (username, password_hash) VALUES (?, ?)",
		auth.Username, hash)
	if err != nil {
		http.Error(w, "Username already taken", http.StatusConflict)
		return
	}

	id, _ := result.LastInsertId()
	json.NewEncoder(w).Encode(User{ID: id, Username: auth.Username})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var auth AuthRequest
	if err := json.NewDecoder(r.Body).Decode(&auth); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	var user User
	var hash []byte
	err := s.db.QueryRow("SELECT id, username, password_hash FROM users WHERE username = ?",
		auth.Username).Scan(&user.ID, &user.Username, &hash)
	if err != nil {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	if !checkPasswordHash(auth.Password, hash) {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	// After successful login, create session
	session, _ := s.store.Get(r, "holler-session")
	session.Values["userID"] = user.ID
	session.Values["username"] = user.Username
	session.Save(r, w)

	json.NewEncoder(w).Encode(user)
}

func (s *Server) checkSession(w http.ResponseWriter, r *http.Request) {
	session, err := s.store.Get(r, "holler-session")
	if err != nil {
		http.Error(w, "Session error", http.StatusUnauthorized)
		return
	}

	userID, ok := session.Values["userID"].(int64)
	if !ok {
		http.Error(w, "No session", http.StatusUnauthorized)
		return
	}

	var user User
	err = s.db.QueryRow("SELECT id, username FROM users WHERE id = ?", userID).Scan(&user.ID, &user.Username)
	if err != nil {
		http.Error(w, "Invalid session", http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	username := r.URL.Query().Get("username")
	var user User
	err = s.db.QueryRow("SELECT id, username FROM users WHERE username = ?",
		username).Scan(&user.ID, &user.Username)
	if err != nil {
		conn.Close()
		return
	}

	client := &Client{conn: conn, user: user}
	s.clients.Store(client, true)

	// Broadcast updated participant list when user joins
	s.broadcastParticipants()

	defer func() {
		s.clients.Delete(client)
		// Broadcast updated participant list when user leaves
		s.broadcastParticipants()
	}()

	for {
		messageType, p, err := conn.ReadMessage()
		if err != nil {
			break
		}

		if messageType == websocket.BinaryMessage {
			// Store audio message
			_, err := s.db.Exec("INSERT INTO audio_messages (user_id, audio_data) VALUES (?, ?)",
				user.ID, p)
			if err != nil {
				log.Printf("Error storing audio: %v", err)
				continue
			}

			// Send username as a text message first
			userMsg := map[string]string{
				"type":     "speaker",
				"username": user.Username,
			}
			userJSON, _ := json.Marshal(userMsg)

			// Broadcast to other clients
			s.clients.Range(func(k, v interface{}) bool {
				other := k.(*Client)
				if other != client {
					other.conn.WriteMessage(websocket.TextMessage, userJSON)
					other.conn.WriteMessage(websocket.BinaryMessage, p)
				}
				return true
			})
		}
	}
}

func (s *Server) broadcastParticipants() {
	participants := []string{}
	s.clients.Range(func(k, v interface{}) bool {
		client := k.(*Client)
		participants = append(participants, client.user.Username)
		return true
	})

	message := ParticipantMessage{
		Type:         "participants",
		Participants: participants,
	}

	messageJSON, err := json.Marshal(message)
	if err != nil {
		log.Printf("Error marshaling participants: %v", err)
		return
	}

	s.clients.Range(func(k, v interface{}) bool {
		client := k.(*Client)
		client.conn.WriteMessage(websocket.TextMessage, messageJSON)
		return true
	})
}

func (s *Server) corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", r.Header.Get("Origin"))
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next(w, r)
	}
}

func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	session, _ := s.store.Get(r, "holler-session")
	userID, ok := session.Values["userID"].(int64)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var data struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	var currentHash []byte
	err := s.db.QueryRow("SELECT password_hash FROM users WHERE id = ?", userID).Scan(&currentHash)
	if err != nil || !checkPasswordHash(data.CurrentPassword, currentHash) {
		http.Error(w, "Invalid current password", http.StatusUnauthorized)
		return
	}

	newHash := hashPassword(data.NewPassword)
	_, err = s.db.Exec("UPDATE users SET password_hash = ? WHERE id = ?", newHash, userID)
	if err != nil {
		http.Error(w, "Failed to update password", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	session, _ := s.store.Get(r, "holler-session")
	session.Options.MaxAge = -1
	session.Save(r, w)
	w.WriteHeader(http.StatusOK)
}

func hashPassword(password string) []byte {
	hash, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return hash
}

func checkPasswordHash(password string, hash []byte) bool {
	err := bcrypt.CompareHashAndPassword(hash, []byte(password))
	return err == nil
}
