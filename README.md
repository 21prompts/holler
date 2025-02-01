# holler

Self-hosted Walkie-Talkie for Family and Friends

## Features

- [x] Mobile-first design
- [x] Single-binary web app
- [x] Serve index.html, app.js, and css.js from "static/" dir in project root
- [x] Modern CSS3 and transforms for animating button pushes
- [x] One round PTT button at the bottom of the screen
- [x] Fixed actionBar and statusBar
- [x] SQLite to store usernames and scrypt hashed passwords
- [x] Register with username and password before joining chat
- [x] Record audio when PTT button is tapped or clicked
- [x] Continue recording while the button is pressed
- [x] Send audio (opus, low bit rate) to server when released
- [x] Store incoming message as blob in the database
- [x] Broadcast the clip to all other participants
- [x] Broadcast fresh list to all participants when user joins chat
- [x] Broadcast fresh list to all participants when user leaves chat
- [x] Rounded color-filled svg avatars for chat participants
- [x] User name is displayed below the avatar
- [x] Use colorhash function to derive consistent avatar colors
- [ ] Bounce avatar when participant's message is playing
- [ ] Stop bouncing avatar when participant's message is done playing
- [ ] Enlarge username to 130% when participant is speaking
