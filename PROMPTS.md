# Prompts

# Prompt 1

Let's create a go project which will be a single-binary web app serving an index.html, app.js and css.js from "static/" dir in project root. We will also have a "main.go" for the web server.

I have already executed:

```
go mod init holler
# Added go-sqlite example in main.go
# Added github.com/gorilla/websocket dependency.
go mod tidy
```

It's called "Holler" and it is a push-to-talk app for voice chat over websocket transport. Let's make a clean, neo-skeuomorphic design wih modern css3 and transforms for animating button pushes.

The holler app will be mobile-first and have one round PTT button at the bottom of the screen, within a fixed actionBar. On the top, let's add a fixed statusBar. The content area will contain rounded avatars (placeholder: colorhash of name) of voice chat participants.

The server will use sqlite to store usernames and scrypt hashed passwords. Users must register with username and password before joining chat.

The client will start recording audio when PTT button is tapped or clicked and will continue recording while the button is pressed. Once released, the client will send the audio (opus, low bit rate) to server. The server will store the incoming message as blob in the database and broadcast the clip to all other participants.

## Prompt 1.1

Let's write the pending methods in main.go:

```
http.HandleFunc("/api/register", server.handleRegister)
http.HandleFunc("/api/login", server.handleLogin)
http.HandleFunc("/ws", server.handleWebSocket)
```

And app.js:

```
// ... Additional methods for login, register, and WebSocket handling ...
```

## Prompt 2

We have few issues to address:

- Every time i restart the app it asks for login again. Let's fix this by storing the session in a cookie. Let's ensure we carefully edit the login path so functionality is not broken.
- The app is not responsive. Let's fix this by adding a media query for mobile devices.
- We need to try starting the audio context only after first interaction with the app. We will fix this with two paths:
  - If user is logged in, show a "Start" button in a modal dialog. Here, use the click event to start the audio context.

## Prompt 3

The login and register buttons   have stopped working, let's investogate what happened and fix it.

## Prompt 4

We want to use exponential backoff for reconnecting to the websocket server. Let's implement this in app.js. Display the status of the connection in the statusBar.

The app still demands login after page reload, we need to investigate our code for the cause and fix it.

## Prompt 5

The browser console shows a 401 Unauthorized error when we try to get the session. Let's investigate the cause and fix it.

```
GET
 http://127.0.0.1:8080/api/session
Status
401
Unauthorized
VersionHTTP/1.1
Transferred171 B (11 B size)
Referrer Policystrict-origin-when-cross-origin
DNS ResolutionSystem
```

## Prompt 6

Let's implement the following features:

```
- [ ] Broadcast fresh list to all participants when user joins chat
- [ ] Broadcast fresh list to all participants when user leaves chat
- [ ] Rounded color-filled svg avatars for chat participants
- [ ] User name is displayed below the avatar
- [ ] Use colorhash function to derive consistent avatar colors
```
