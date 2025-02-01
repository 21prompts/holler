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

## Prompt 7

Let's implement the following features:

```
- [ ] We want to preserve current functionality, and add the following:
- [ ] Bounce avatar when participant's message is playing
- [ ] Stop bouncing avatar when participant's message is done playing
- [ ] Enlarge username to 130% when participant is speaking
```

## Prompt 8

Error playing audio: DOMException: The media resource indicated by the src attribute or assigned media provider object was not suitable.

Let's ensure we preserve the binary chunks integrity.

## Prompt 9

Let's focus on the UI:

- On mobile, the names are getting cut off.
- On mobile, the PTT button should be larger.
- Let's revisit the stylesheet and add light and dark themes.
- Let's keep the fresh look, but add a bit of skeuomorphism to the design.

## Prompt 10

- Let's add the same avatar as in user list next to the username in toolbar.
- Pressing the avatar or username should open context menu with options: "Change Avatar", "Change Username", "Change Password", "Logout".
- Implement the context menu with the above options and ensure they work as expected in frontend and backend.

## Prompt 11

- The icon next to username in toolbar should be resized appropriately.
- When a username is changed, broadcast the change to all participants.

## Prompt 12

- The svg avatar is too big for the toolbar and overflows. Let's fix this.
- Add a colored, glowing led-like indicator next to connection status and change color to red when connection is lost, yellow when reconnecting and steady green when connected.

## Prompt 13

- Next, let's focus on the participant list UI
- Add a "Mute" button next to each participant's name.
- Add required functionality to mute and unmute participants.
- Indicate muted participants with a red "Muted" mic icon emoji next to their name
- Finally, review the animations and prefer smooth animations that don''t change the layout of the page.

## Prompt 14

- Remove the feature to change username from frontend and backend.
- Instead of a different emoji to indicate muted user, keep the mute button visible and change its color to red when muted - it should be usable on mobile as well.

## Prompt 15

Let's add a "Catch up" view to show chronological list of recent 10 messages. Each message should have the avatar of the sender, the username. When clicked, use the same websocket connection to play the message, highlighting the avatar of the sender. Take a 500ms pause before playing the next message until the latest message is played or the user stops the playback.

## Prompt 16

- List the catch up messages in reverse chronological order. The latest message should be at the bottom.
- Add a "Play" button to start playing the catch up messages.
- Display humanized time of the message in the catch up view.
- Add a "Stop" button to stop the playback.
- Also play the message when the user clicks on the name or avatar in the participant list.

## Prompt 17

Let's review our stylesheet and ensure we have a consistent design across the app. We want to ensure the app looks good on mobile and desktop. Keep the light and dark themes and ensure the app is responsive. The login and register pages should also be responsive and have the same theme as the main app.

## Prompt 18

Before the start button modal is displayed, there's a flash of controls below. Let's fix this by ensuring the controls are hidden until the audio context is started.

## Prompt 19

Go through the code, markup and config files I've added in context carefully:

- main.go
- static/index.html
- static/app.js
- static/app.css
- Procfile
- Caddyfile

Make notes about the features we have implemented so far and document them in README.md.

Also add a section below on how to compile the app and run it locally.
