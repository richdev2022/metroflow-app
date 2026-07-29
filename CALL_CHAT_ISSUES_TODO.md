# Call & Chat Issues - Todo List

## Issues Identified
1. [x] **Audio Context Initialization**: AudioUtils requires user gesture to initialize AudioContext due to browser autoplay policies
2. [x] **Chat Notification Sound**: Chat messages aren't playing notification sounds properly
3. [x] **Call Room Chat Notification Sound**: In-call chat messages may have the same issue
4. [ ] **Local Audio Playback (Echo)**: Check if local audio should be played back (note: usually muted to avoid echo)
5. [x] **Remote Audio Playback**: Remote audio elements weren't explicitly calling .play()

## Steps to Fix
### 1. Audio Context Initialization ✅
- Update AudioUtils to initialize on first user interaction
- Add a way to ensure AudioContext is resumed before playing sounds

### 2. Chat Notification Sound ✅
- Verify AudioUtils.playNotification() is called correctly
- Ensure audio context is initialized before playing
- Test with user gestures

### 3. In-Call Chat Notification Sound ✅
- Check VideoCallRoom.tsx line 1585 where AudioUtils.playNotification() is called
- Apply same audio context initialization fix

### 4. Remote Audio Playback ✅
- Explicitly call .play() on remote audio elements
- Fixed TypeScript error by removing playsInline (only for video elements)

### 5. Local Audio Playback
- Evaluate if users should hear their own voice (usually not recommended due to echo)
- If desired, add a separate local audio element with volume control

## Summary of Fixes
- Updated `client/lib/audio-utils.ts` with improved `ensureInitialized()` method
- Added audio context initialization on first user interaction in both Chat and VideoCallRoom
- Updated remote audio playback in VideoCallRoom to explicitly call .play()
- Added error handling for audio playback failures
- Fixed TypeScript error by removing playsInline from audio element
