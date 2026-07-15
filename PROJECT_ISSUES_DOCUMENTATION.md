# Metroflow App - Issues Documentation
## Introduction
This document tracks the status of issues and features in the Metroflow app as of July 14, 2026.
---
## 1. VideoCallRoom Component Issues (COMPLETED)
### Location: `client/components/VideoCallRoom.tsx`
✅ **Fixed Issues**:
- Now tracks separate `localAudioProducer` and `localVideoProducer` instead of overwriting a single `localProducer`
- Added proper waiting‑room socket handlers
- Added recording event listeners and controls
- Added screen‑sharing implementation with socket events
- Uses `joinMeeting` and `leaveMeeting` from `useSocket.ts`
---
## 2. Chat Issues (COMPLETED)
### Location: `client/pages/Chat.tsx`
✅ **Fixed Issues**:
- Now uses `useSocket.ts` for real‑time chat updates
- Added user‑presence indicators
- Added presence event listeners
- Added `chat:message` listeners
---
## 3. Server Files are Mocks (Backend Integration)
### Location: `server/routes.ts`, `server/storage.ts`
Note: The server files are mocks for local development and should be replaced with your existing backend API as per project requirements.
---
## Summary
All frontend issues listed above are now fixed!
