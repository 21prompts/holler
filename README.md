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
- [ ] Broadcast username to others when user joins chat
- [ ] Broadcast username to others when user leaves chat
- [ ] Broadcast username along with audio clip
- [ ] Rounded color-filled svg avatars for voice chat participants
- [ ] User name is displayed below the avatar
- [ ] Use colorhash for consistent avatar colors
- [ ] Bounce avatar when participant's message is playing
- [ ] Stop bouncing avatar when participant's message is done playing
- [ ] Enlarge username to 130% when participant is speaking
