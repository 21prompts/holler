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

	server := &Server{
		db: db,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
		store: sessions.NewCookieStore([]byte(os.Getenv("SESSION_KEY"))),
	}

	// Static files
	http.Handle("/", http.FileServer(http.Dir("static")))

	// API endpoints
	http.HandleFunc("/api/register", server.handleRegister)
	http.HandleFunc("/api/login", server.handleLogin)
	http.HandleFunc("/api/session", server.checkSession)
	http.HandleFunc("/ws", server.handleWebSocket)

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
	session, _ := s.store.Get(r, "holler-session")
	if userID, ok := session.Values["userID"].(int64); ok {
		var user User
		err := s.db.QueryRow("SELECT id, username FROM users WHERE id = ?", userID).Scan(&user.ID, &user.Username)
		if err == nil {
			json.NewEncoder(w).Encode(user)
			return
		}
	}
	http.Error(w, "No session", http.StatusUnauthorized)
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
	defer s.clients.Delete(client)

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

			// Broadcast to other clients
			s.clients.Range(func(k, v interface{}) bool {
				other := k.(*Client)
				if other != client {
					other.conn.WriteMessage(websocket.BinaryMessage, p)
				}
				return true
			})
		}
	}
}

func hashPassword(password string) []byte {
	hash, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return hash
}

func checkPasswordHash(password string, hash []byte) bool {
	err := bcrypt.CompareHashAndPassword(hash, []byte(password))
	return err == nil
}
