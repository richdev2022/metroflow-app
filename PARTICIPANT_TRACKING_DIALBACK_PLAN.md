# Implementation Plan: Participant State Tracking + Dial-Back (Call-Back) to Left/Invited Participants

**Date:** 2026-07-27
**Scope:** Frontend + (minimal) Backend socket sanity checks
**Goal:** Reliably track every participant's lifecycle state (`invited` → `joined` → `left`) in the call room UI, keep left/invited participants visible, and allow the host (or any participant) to click a **"Dial Back"** button that re-triggers the existing incoming-call modal (with loud ringing) on the target user's side so they can re-join the same active call.

---

## 1. Background / Current State (Code Audit)

### 1.1 What Already Works ✅

| Area | File:Line | Detail |
|---|---|---|
| **Call participant type** | `shared/api.ts:861-867` | `Call.participants[]` already carries `status: 'invited' \| 'joined' \| 'left'` + `joinedAt?` + `leftAt?`. The data model is *already correct*. |
| **Participant status enum (frontend)** | `client/components/VideoCallRoom.tsx:72` | `type ParticipantStatus = 'invited' \| 'joined' \| 'left';` — already declared. |
| **Participant interface** | `client/components/VideoCallRoom.tsx:74-86` | Already has `status`, `joinedAt`, `leftAt` fields. Model is correct. |
| **`call:incoming` socket event (server)** | `server/routes.ts:1117-1122` & `server/routes.ts:1358-1366` | Server already emits `call:incoming { callId, from, type, callCode, roomId, fromName, callerName }` both from the add-participants API endpoint AND from the `call:invite` socket handler. |
| **`call:invite` socket handler (frontend)** | `client/hooks/useSocket.ts:66-68` | `inviteToCall(callId, targetUserId, type)` helper already exported. |
| **`call:invite` socket handler (server)** | `server/routes.ts:1352-1368` | Server already routes the invite through to the target user's socket as `call:incoming` — includes `fromName`/`callerName` for ringtone display. |
| **Incoming-call modal (ringing)** | `client/components/IncomingCallModal.tsx:1-226` | Fully implemented: loud ringtone via `AudioUtils.playRingtone()` (line 55), 30s timeout, Accept → `navigate(/calls?roomId=...&autoJoin=1&callType=...)` (line 128). |
| **Global listener for `call:incoming`** | `client/components/layout.tsx:130-180` | Layout already listens for `call:incoming` and sets `<IncomingCallModal call={incomingCall} />` visible. Ringing + accept/reject flow works end-to-end for initial call invites. |
| **Dial-back re-join target** | `client/pages/Calls.tsx:256-294` | `/calls?roomId=X&autoJoin=1&callType=video` → opens the Join dialog automatically in Calls page → VideoCallRoom. This exact same URL is already what `IncomingCallModal.handleAccept` navigates to, so dial-back re-join is identical to the initial accept flow (no new navigation needed). |
| **Add-participants modal** | `client/components/AddParticipantsModal.tsx:1-192` | Already posts to `POST /calls/:id/participants` which triggers `call:incoming` on server side. We will not modify this (it's for adding brand new people). Dial-back is a *separate* per-participant action for already-known participants who are `invited` or `left`. |

### 1.2 What's Broken / Missing ❌

| Area | File:Line | Problem |
|---|---|---|
| **Left participants are DELETED from UI list** | `client/components/VideoCallRoom.tsx:294-297` | `handleParticipantLeft` does `prev.filter(p => p.id !== userId)` — it *removes* them from state entirely. So there is nothing to click "Dial Back" on. We need to instead flip their `status → 'left'` and stamp `leftAt`. |
| **Participants list ignores `status` field** | `client/components/VideoCallRoom.tsx:299-317` + `call:participants-list` handler | When building the initial participants from `participants-list`, the code only reads `userId/userName/isHost/joinedAt` and drops `status` + `leftAt` on the floor. So even if the API returns a participant with `status='left'`, the frontend shows them as "joined". |
| **Invited participants not tracked / not shown** | `client/components/VideoCallRoom.tsx` (throughout) | `handleParticipantsAdded` in `Calls.tsx:477-506` adds invited participants to the parent call state, but `VideoCallRoom` has no handler for `invited` → they never show in the room's participant panel at all, so there is nothing to dial. |
| **No per-participant "Dial Back" action** | `client/components/VideoCallRoom.tsx:1967-2026` (`renderParticipantsList`) | Participant row has only avatar + media-state badges. No action buttons. We need a **Dial Back** button for `left`/`invited` participants (host-only OR all participants based on UX; default: host-only to match AddParticipants privilege). |
| **`invited` → `joined` transition not applied** | `client/components/VideoCallRoom.tsx:278-292` (`handleParticipantJoined`) | Handler only *appends* if not already in list. If a participant was previously `invited` and now joins, it short-circuits and returns `prev` without updating the status to `joined` or setting `joinedAt`. The stale `invited` badge would stick forever. |
| **Socket broadcast of `call:participants-list` may not include `status`** | `server/routes.ts` (in socket handlers, see `roomManager`) | The `call:participants-list` payload in the duration guide `FRONTEND_CALL_DURATION_GUIDE.md:468-481` only specifies `{id,name,isHost,audioEnabled,videoEnabled,screenSharing,joinedAt}` — no `status` / `leftAt`. We need the backend to enrich this payload (or frontend infers status by comparing against the API list). Because the backend changes are out of scope per user request, we solve it on the frontend via merging with the `useCall()` data and tracking status client-side as events flow in. |

---

## 2. Solution Design

### 2.1 Participant Lifecycle State Machine (Frontend)

```
                    ┌──────────────────────────────────────┐
                    │  socket: call:participants-list       │
                    │  + merge with Call.participants API   │
                    └────────────────────┬─────────────────┘
                                         │
                    ┌────────────────────▼──────────────────┐
                    │  For each participant userId:         │
                    │  • status = from API or 'joined' if   │
                    │    in socket list with no leftAt      │
                    │  • invited: not in socket list &      │
                    │    API.status == 'invited'            │
                    │  • left: API.status=='left' OR seen   │
                    │    call:participant-left event        │
                    └─────┬──────────┬──────────┬───────────┘
                          │          │          │
                    invited       joined       left
                          │          │          │
                          ▼          ▼          ▼
                 ┌────────────┐  ┌────────┐  ┌────────┐
  USER CLICKS    │  Dial Back │  │ Active │  │ Dial   │
  "DIAL BACK" ──►│ (re-invite)│  │ in call│  │ Back   │
                 └──────┬─────┘  └───┬────┘  └───┬────┘
                        │            │            │
                        │ socket     │ socket     │ socket
                        │ call:invite│ participant│ participant
                        │ (re-send   │ -joined    │ -left
                        │  incoming) │            │
                        │            ▼            ▼
                        └────────► [state update per event] ◄────────┘
```

### 2.2 Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| **Source of truth for status** | Frontend-managed state, initialized from `useCall(callId).participants[]` (already loaded by Calls.tsx parent) then mutated only by socket event handlers (participant-joined / participant-left / invite actions). | Backend `participants-list` socket broadcast doesn't include `status`/`leftAt` per duration guide. Using the REST `Call.participants[]` + socket events as truth avoids a backend change. |
| **Who can click Dial Back** | Host-only (same gate as `waiting-room:admit` already uses in VideoCallRoom). Configurable via prop if we later want all members. | Prevents abuse. AddParticipants modal is also effectively host-only since it uses admin routes. |
| **Button label** | `invited` → **"Remind / Re-send Invite"** (icon: `BellRing`); `left` → **"Dial Back"** (icon: `Phone` or `PhoneCall`). | Clear semantic distinction for UX. |
| **Dial-back mechanism** | Call the existing `inviteToCall()` helper from `useSocket` → socket `call:invite` → server re-broadcasts `call:incoming` → **existing** IncomingCallModal + loud ringtone fires on the target's browser → Accept navigates to the same `?autoJoin=1` URL which re-enters the active room. | **Zero backend code required.** All pieces exist. We just don't have the frontend button + state preservation. |
| **Click feedback** | On click: button shows `Loader2` spinner for 500ms → toast `"Re-inviting {name}..."` → when socket ACK returns (or 1s timeout with optimistic UI) → toast `"Invite re-sent to {name}"`. | Follows same optimistic + toast pattern as the rest of the app. |
| **Re-invite throttle** | Per-user 10-second cooldown (frontend). Button is disabled during cooldown. | Prevents spam-clicking the bell (infinite ring). |
| **"left" participants in participant list** | Group participants under 3 collapsible sections: **"In Call" (joined)**, **"Invited" (invited)**, **"Left" (left)** with counts in heading. Left participant rows are dimmed (opacity-60) + struck-through optional. Invited rows use muted secondary style. | Makes state visually obvious. Mirrors how Google Meet / Zoom show invitees and leavers in a sectioned list. |
| **Re-joining participant resets status** | `call:participant-joined` must *update* an existing invited/left row. Specifically: `status='joined'`, `leftAt=undefined`, `joinedAt=new Date()`. | Without this, re-dialed participants who accept still show as "left" forever. |

---

## 3. File-by-File Changes (Exact Scope)

### 3.1 `shared/api.ts` — No changes required
- Participant status enum and fields already exist.
- `Call.participants[]` already carries `status / joinedAt / leftAt`.

### 3.2 `client/hooks/useSocket.ts` — No API surface changes (verify helper exists)
- `inviteToCall(callId, targetUserId, type)` already exposed at line 66.
- We will pass `callerName` (and `roomId = callCode` from VideoCallRoom roomId prop) by extending the emit payload slightly (the server handler already ignores unknown fields). This is optional enhancement only for the ringtone display name accuracy.

  **Diff (optional, 2 lines):**
  ```ts
  // client/hooks/useSocket.ts:66
  const inviteToCall = useCallback((callId: string, targetUserId: string, type: 'audio' | 'video', opts?: { callerName?: string; roomId?: string }) => {
    socketRef.current?.emit('call:invite', { callId, targetUserId, type, callerName: opts?.callerName, roomId: opts?.roomId });
  }, []);
  ```

### 3.3 `client/components/layout.tsx` — No changes required
- Already renders `<IncomingCallModal>` and listens for `call:incoming` (lines 130-180). Ringing flow works for dial-back because dial-back reuses the same `call:incoming` event.

### 3.4 `client/components/IncomingCallModal.tsx` — No changes required
- Already handles `call:incoming` payload from the same socket handler we re-trigger.

### 3.5 `client/pages/Calls.tsx` — Propagate `Call.participants` status into VideoCallRoom (2 small changes)

**Change A:** Pass the API-derived `selectedCall.participants` (which carry `status/joinedAt/leftAt`) down into `VideoCallRoom` as a new prop `initialParticipantsStatus` so VideoCallRoom can initialize with correct status instead of assuming everyone is joined.

**Change B:** In `handleParticipantLeft` equivalent (or better: let VideoCallRoom manage its own list and don't modify `selectedCall.participants` — just pass the prop through).

Current VideoCallRoom prop list in `Calls.tsx:1063-1076`:
```tsx
<VideoCallRoom
  roomId={selectedCall.callCode}
  callId={selectedCall.id}
  callType={selectedCall.type}
  ...
  teamMembers={teamMembers}
  currentParticipantIds={(selectedCall.participants || []).map(p => p.userId)}
  onParticipantsAdded={handleParticipantsAdded}
/>
```

**New prop to add:** `initialParticipants={(selectedCall.participants || [])}` — VideoCallRoom will ingest and map these to its internal Participant state on mount, setting `status` correctly instead of defaulting to `joined`.

### 3.6 `client/components/VideoCallRoom.tsx` — Main work (8 scoped changes)

This is the primary file. All changes are localized.

#### **3.6.1 New Props**

Add to `VideoCallRoomProps` interface (line 58-70):
```tsx
interface VideoCallRoomProps {
  // ... existing props ...
  initialParticipants?: Array<{
    userId: string;
    status: 'invited' | 'joined' | 'left';
    joinedAt?: string;
    leftAt?: string;
  }>;
  callId?: string;          // already exists, just confirm we use it
  callType?: 'audio' | 'video';
  teamMembers?: TeamMember[]; // already exists
  isHost?: boolean;          // already exists
}
```

#### **3.6.2 New Refs for Dial-Back Throttle**

```tsx
const dialBackCooldownRef = useRef<Map<string, number>>(new Map());
```

#### **3.6.3 Fix #1: Initialize participants from `initialParticipants` prop**

On mount / when `initialParticipants` changes (new effect), merge with socket `participants-list` data so status=invited/left is seeded correctly:

```tsx
// New effect after props change
const initialParticipantsRef = useRef(initialParticipants);
useEffect(() => {
  initialParticipantsRef.current = initialParticipants;
  // Seed participants from REST payload (status + leftAt)
  setParticipants(prev => {
    const byId = new Map(prev.map(p => [p.id, p]));
    (initialParticipants || []).forEach(apiP => {
      const name = teamMembers?.find(m => m.id === apiP.userId)?.name || apiP.userId;
      const existing = byId.get(apiP.userId);
      byId.set(apiP.userId, {
        id: apiP.userId,
        name: existing?.name || name,
        isHost: existing?.isHost || (apiP as any).isHost || false,
        joinedAt: existing?.joinedAt || (apiP.joinedAt ? new Date(apiP.joinedAt) : new Date()),
        leftAt: apiP.leftAt ? new Date(apiP.leftAt) : undefined,
        status: apiP.status || (existing?.status ?? 'joined'),
        audioEnabled: existing?.audioEnabled,
        videoEnabled: existing?.videoEnabled,
        screenSharing: existing?.screenSharing,
        isTalking: existing?.isTalking,
        isLocal: existing?.isLocal,
      });
    });
    return Array.from(byId.values());
  });
}, [initialParticipants, teamMembers]);
```

#### **3.6.4 Fix #2: `call:participant-left` — Flip status instead of removing (line 294-297)**

Before:
```tsx
const handleParticipantLeft = ({ userId }: any) => {
  if (!isMountedRef.current) return;
  setParticipants(prev => prev.filter(p => p.id !== userId)); // ← REMOVES THEM, bad
};
```

After:
```tsx
const handleParticipantLeft = ({ userId, userName: name }: any) => {
  if (!isMountedRef.current) return;
  setParticipants(prev => {
    const exists = prev.some(p => p.id === userId);
    if (exists) {
      return prev.map(p =>
        p.id === userId
          ? { ...p, status: 'left' as const, leftAt: new Date(), audioEnabled: false, videoEnabled: false, screenSharing: false, isTalking: false }
          : p
      );
    }
    // Fallback: unknown user left → add them with left status so Dial Back still possible
    return [...prev, {
      id: userId,
      name: name || 'Unknown',
      isHost: false,
      joinedAt: new Date(),
      leftAt: new Date(),
      status: 'left',
      audioEnabled: false,
      videoEnabled: false,
      screenSharing: false,
      isTalking: false,
    }];
  });
};
```

#### **3.6.5 Fix #3: `call:participant-joined` — Update invited→joined (not just append) (line 278-292)**

Before:
```tsx
if (prev.some(p => p.id === userId)) return prev; // ← skips, leaves status stale
```

After:
```tsx
setParticipants(prev => {
  const exists = prev.find(p => p.id === userId);
  if (exists) {
    return prev.map(p =>
      p.id === userId
        ? {
            ...p,
            status: 'joined' as const,
            leftAt: undefined,
            joinedAt: new Date(),
            name: exists.name || name || 'Unknown',
            isHost: hostStatus || exists.isHost,
          }
        : p
    );
  }
  return [...prev, {
    id: userId,
    name: name || 'Unknown',
    isHost: hostStatus || false,
    joinedAt: new Date(),
    status: 'joined',
  }];
});
```

#### **3.6.6 Fix #4: `call:participants-list` handler — Preserve status/leftAt from existing state (line 299-317)**

When socket participants-list arrives, use it as authoritative for *joined* participants only. For `invited` / `left` participants not in the socket list, keep them (don't drop). This preserves invite/left rows through a refresh/reconnect.

```tsx
const handleParticipantsList = (data: any) => {
  if (!isMountedRef.current) return;
  // ... endsAt/maxDuration handling unchanged ...

  const socketList = (data.participantsList || data.participants_list || []);
  const socketJoinedIds = new Set(socketList.map((p: any) => p.userId || p.user_id || p.id));

  setParticipants(prev => {
    const resultMap = new Map<string, Participant>();

    // Step 1: Preserve all invited/left rows NOT in socket list
    prev.forEach(p => {
      if ((p.status === 'invited' || p.status === 'left') && !socketJoinedIds.has(p.id)) {
        resultMap.set(p.id, p);
      }
    });

    // Step 2: Add all from socket list (they are "joined" — override anything)
    socketList.forEach((p: any) => {
      const id = p.userId || p.user_id || p.id;
      const name = p.userName || p.user_name || p.name || teamMembers?.find(m => m.id === id)?.name || 'Unknown';
      const prior = resultMap.get(id) || prev.find(pp => pp.id === id);
      resultMap.set(id, {
        id,
        name: prior?.name || name,
        isHost: p.isHost || p.is_host || prior?.isHost || false,
        joinedAt: p.joinedAt || p.joined_at ? new Date(p.joinedAt || p.joined_at) : prior?.joinedAt || new Date(),
        leftAt: undefined,
        status: 'joined',
        audioEnabled: p.audioEnabled ?? prior?.audioEnabled,
        videoEnabled: p.videoEnabled ?? prior?.videoEnabled,
        screenSharing: p.screenSharing ?? prior?.screenSharing,
        isTalking: prior?.isTalking,
      });
    });

    return Array.from(resultMap.values());
  });
};
```

#### **3.6.7 New Feature #1: `handleDialBack` function + `inviteToCall` emit**

```tsx
// Destructure new helper from useSocket (already available, line 224)
const { socket, isConnected, ..., inviteToCall } = useSocket({ ... });

// In component body, define the handler:
const handleDialBack = useCallback(async (targetParticipant: Participant) => {
  if (!isHost) return; // host-only guard
  if (!socket || !isConnected || !callId || !roomId) {
    toast({ variant: 'destructive', title: 'Not connected', description: 'Cannot send invite while offline.' });
    return;
  }
  const now = Date.now();
  const lastInviteAt = dialBackCooldownRef.current.get(targetParticipant.id) || 0;
  if (now - lastInviteAt < 10_000) {
    const secs = Math.ceil((10_000 - (now - lastInviteAt)) / 1000);
    toast({ title: `Please wait ${secs}s`, description: `Invite for ${targetParticipant.name} was sent recently.` });
    return;
  }
  dialBackCooldownRef.current.set(targetParticipant.id, now);

  const verb = targetParticipant.status === 'invited' ? 'Re-sending invite' : 'Calling back';
  toast({ title: `${verb}...`, description: `Ringing ${targetParticipant.name}...` });

  // ↓ REUSE EXISTING socket helper
  inviteToCall(callId, targetParticipant.id, callType || 'video', {
    callerName: userName,
    roomId: roomId,
  });

  // Also emit to server for persistence/audit via the invite socket
  // (the inviteToCall already does socket emit above)

  // Optimistic toast feedback (no ACK from server, so this is best-effort)
  setTimeout(() => {
    toast({ title: targetParticipant.status === 'invited' ? 'Invite re-sent' : 'Call-back sent', description: `${targetParticipant.name} should see the incoming call ring now.` });
  }, 500);
}, [isHost, socket, isConnected, callId, roomId, callType, inviteToCall, userName, toast]);
```

#### **3.6.8 New Feature #2: Rewrite `renderParticipantsList` with sectioned groups + Dial Back buttons (line 1967-2026)**

Replace the flat list with three sections and action buttons.

```tsx
const renderParticipantsList = () => {
  const localUserId = localStorage.getItem('userId') || 'local';

  // Ensure local user is present in joined list with merged media state
  const mergedParticipants: Participant[] = [
    {
      id: localUserId,
      name: userName,
      isHost: isHost,
      joinedAt: new Date(),
      isLocal: true,
      status: 'joined',
      audioEnabled: isAudioEnabled,
      videoEnabled: isVideoEnabled,
      screenSharing: isScreenSharing,
      isTalking: isLocalTalking,
    },
    ...participants.filter(p => p.id !== localUserId),
  ];

  const joined = mergedParticipants.filter(p => p.status === 'joined');
  const invited = mergedParticipants.filter(p => p.status === 'invited');
  const left = mergedParticipants.filter(p => p.status === 'left');

  const renderRow = (p: Participant, showDialBack: boolean) => {
    const leftAgo = p.leftAt ? formatDistanceToNow(p.leftAt, { addSuffix: true }) : '';
    const now = Date.now();
    const lastInvite = dialBackCooldownRef.current.get(p.id) || 0;
    const cooling = now - lastInvite < 10_000;
    const cooldownSecs = cooling ? Math.ceil((10_000 - (now - lastInvite)) / 1000) : 0;

    const statusBadge = p.status === 'joined' ? (
      <Badge variant="default" className="text-[10px] bg-emerald-600 hover:bg-emerald-700">
        In call
      </Badge>
    ) : p.status === 'invited' ? (
      <Badge variant="secondary" className="text-[10px]">
        Invited
      </Badge>
    ) : (
      <Badge variant="outline" className="text-[10px] text-muted-foreground">
        Left {leftAgo}
      </Badge>
    );

    const rowClass = cn(
      "flex items-center justify-between p-2 rounded-md gap-2",
      p.status === 'left' ? "opacity-60 hover:opacity-100" : "hover:bg-gray-800"
    );

    return (
      <div key={p.id} className={rowClass}>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Avatar className={cn("h-8 w-8 shrink-0", p.isTalking && p.status === 'joined' ? talkingRingClass : avatarBaseClass)}>
            <AvatarFallback className="bg-blue-600 text-white text-xs">
              {getInitials(p.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className={cn("text-sm font-medium truncate", p.status === 'joined' ? "text-white" : "text-white/80")}>
              {p.name}
              {p.isLocal && <span className="text-gray-400 text-xs ml-1">(You)</span>}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              {p.isHost && <p className="text-[10px] text-blue-400">Host</p>}
              {statusBadge}
            </div>
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              {p.audioEnabled !== undefined && p.status === 'joined' && (
                <Badge variant={p.audioEnabled ? "default" : "secondary"} className="text-[9px] px-1.5 py-0 h-4">
                  {p.audioEnabled ? "Mic" : "Muted"}
                </Badge>
              )}
              {p.videoEnabled !== undefined && callType === 'video' && p.status === 'joined' && (
                <Badge variant={p.videoEnabled ? "default" : "secondary"} className="text-[9px] px-1.5 py-0 h-4">
                  {p.videoEnabled ? "Cam" : "No Cam"}
                </Badge>
              )}
              {p.screenSharing && p.status === 'joined' && (
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-green-500 text-green-400">
                  Sharing
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {showDialBack && !p.isLocal && (
            <Button
              variant={p.status === 'invited' ? "outline" : "secondary"}
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={() => handleDialBack(p)}
              disabled={cooling || !isHost}
              title={isHost ? (p.status === 'invited' ? 'Re-send invite' : 'Dial back to call') : 'Only host can re-invite'}
            >
              {cooling ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : p.status === 'invited' ? (
                <BellRing className="h-3.5 w-3.5" />
              ) : (
                <Phone className="h-3.5 w-3.5" />
              )}
              {cooling
                ? `${cooldownSecs}s`
                : p.status === 'invited'
                  ? 'Remind'
                  : 'Dial Back'}
            </Button>
          )}
        </div>
      </div>
    );
  };

  const Section = ({ title, count, children, accent }: { title: string; count: number; children: React.ReactNode; accent?: string }) => (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2 px-1">
        <h4 className={cn("text-[11px] font-semibold uppercase tracking-wider", accent || "text-gray-400")}>
          {title}
        </h4>
        <Badge variant="outline" className="text-[10px] h-5 px-2">{count}</Badge>
      </div>
      <div className="space-y-1">
        {children}
      </div>
    </div>
  );

  return (
    <div className="space-y-2">
      <Section title="In Call" count={joined.length} accent="text-emerald-400">
        {joined.length === 0 ? (
          <p className="text-xs text-gray-500 px-2 py-3 text-center">Waiting for participants…</p>
        ) : (
          joined.map(p => renderRow(p, false))
        )}
      </Section>

      {invited.length > 0 && (
        <Section title="Invited" count={invited.length}>
          {invited.map(p => renderRow(p, true))}
        </Section>
      )}

      {left.length > 0 && (
        <Section title="Left" count={left.length} accent="text-rose-400">
          {left.map(p => renderRow(p, true))}
        </Section>
      )}
    </div>
  );
};
```

**New imports needed in VideoCallRoom.tsx:**
- `Phone`, `BellRing`, `Loader2` (Loader2 already imported at line 24, `Phone`/`BellRing` missing)
- `formatDistanceToNow` from `date-fns` (check if available; if not, use inline helper like `Math.floor((Date.now()-leftAt)/60000)+"m ago"`)
- Confirm `cn()` utility is imported (it's not currently — IncomingCallModal has inline cn, VideoCallRoom uses template strings; add import from `@/lib/utils`).

### 3.7 `client/pages/Calls.tsx` — Wire `initialParticipants` prop + optional "Dial Back" from call-details dialog (optional polish)

#### **3.7.1 VideoCallRoom invocation (line 1063-1076)**
```tsx
<VideoCallRoom
  roomId={selectedCall.callCode}
  callId={selectedCall.id}
  callType={selectedCall.type}
  onLeave={() => handleLeaveCall(selectedCall)}
  userName={CURRENT_USER_NAME()}
  isHost={isCurrentUserHost(selectedCall)}
  waitingRoomEnabled={selectedCall.waitingRoomEnabled}
  teamMembers={teamMembers}
  currentParticipantIds={(selectedCall.participants || []).map(p => p.userId)}
  onParticipantsAdded={handleParticipantsAdded}
  {/* NEW */}
  initialParticipants={selectedCall.participants || []}
/>
```

#### **3.7.2 Optional: Call-details dialog participant list also gets Dial Back**
In the details dialog (lines 981-1013), each participant `Badge` pair could also include a small `Phone` icon button for `invited`/`left` participants that:
1. Calls `POST /calls/:id/participants` for that user (to update the server-side status back to invited)
2. Emits the same `inviteToCall` socket event

This is lower priority because the primary UX is inside the call room itself, but it would allow host to dial back from the call list even without being in the room.

---

## 4. Socket Event Flow for Dial-Back (Full End-to-End)

### 4.1 Sequence Diagram

```
  HOST in VideoCallRoom           SERVER (socket.ts + routes)       LEFT/INVITED USER (any page via Layout)
  ─────────────────────           ──────────────────────────       ─────────────────────────────────────────
  1. User clicks "Dial Back"
     on row of participant X
     ──► handleDialBack(X)

  2. socket.emit('call:invite', {
       callId, targetUserId: X.id,
       type, callerName, roomId
     })

                                    3. server/routes.ts:1352 catches 'call:invite'
                                       - Finds activeUser[X.id] socket
                                       - Resolves callerName from socket

                                    4. io.to(user.socketId).emit('call:incoming', {
                                         callId, from, fromName, callerName,
                                         type, callCode, roomId
                                       })

                                                                       5. Layout.tsx:134 handleIncomingCall fires
                                                                          → AudioUtils.ensureInitialized()
                                                                          → setIncomingCall(data)

                                                                       6. <IncomingCallModal call={...} /> renders
                                                                            - AudioUtils.playRingtone() LOUDSPEAKER
                                                                            - 30s countdown
                                                                            - Avatar + "X is calling..." display

                                                                       7. User clicks Accept (line 112):
                                                                            AudioUtils.stopAllRingtones()
                                                                            socket.emit('call:accept', { callId })
                                                                            navigate('/calls?roomId=ROOM&autoJoin=1')

                                                                       8. Calls.tsx auto-join effect fires
                                                                            → Opens Join dialog for existing callId
                                                                            → POST /calls/:id/join → server sets status='joined'
                                                                            → VideoCallRoom emits call:join

  9. VideoCallRoom (Host side) receives
     socket.on('call:participant-joined', X)
     → handleParticipantJoined updates X.status → 'joined'
     → leftAt cleared
     → Row moves from "Left" → "In Call" section automatically
```

**No new socket event types and no new backend emitters are needed.** Every piece already exists; we simply:
1. Don't delete left participants on the frontend.
2. Call the existing invite flow on-demand with a button.

---

## 5. Edge Cases & Defensive Behavior

| Edge Case | Behavior |
|---|---|
| **Participant who left is already in another call** | `call:incoming` still fires on their socket; `IncomingCallModal` shows on top of any page; Accept navigates them to this active call (leaving the previous room via `onLeave` in their prior VideoCallRoom unmount). This is acceptable because they accepted our new call intentionally. |
| **Target user offline (no active socket)** | Server handler in routes.ts has no `activeUser` → `call:incoming` is never emitted. Frontend shows optimistic "Call-back sent" toast (1s delay) but in practice no toast error surfaces. *Optional enhancement:* server socket handler can ACK with `{ delivered: boolean }`; frontend can show a "User appears offline" toast. We leave this as a follow-up since current infrastructure doesn't ACK. |
| **Double-click Dial Back** | 10-second frontend cooldown per user disables button. |
| **Non-host clicks Dial Back** | Button is disabled + tooltip "Only host can re-invite". |
| **Network reconnect mid-call** | `participants-list` socket handler (Fix #4) preserves invited/left rows not present in socket list → they survive a reconnect. |
| **Participant never accepted initial invite (still invited)** | Showed in "Invited" section with **"Remind"** button; clicking it re-sends the exact same `call:incoming` ring again. |
| **Same user dialed back twice** | Second ring replaces first? `IncomingCallModal.useEffect([call.callId])` → yes, because the dependency is `call.callId` (line 91). If same callId, the ring restarts (new 30s timer begins, old timer is cleared). This is correct behavior. |
| **Host clicks Dial Back but call has ended** | Socket emit still fires; target receives `call:incoming`; when they click Accept, POST `/calls/:id/join` will fail (call is `completed`) and they get a toast. No worse than initial invite. Acceptable. |
| **`leftAt` timestamp display** | Use `date-fns.formatDistanceToNow(leftAt, { addSuffix: true })` → "3 minutes ago". If `date-fns` is not a dep (check package.json), use inline: `const s = Math.floor((Date.now() - leftAt)/1000); return s<60 ? \`${s}s ago\` : s<3600 ? \`${Math.floor(s/60)}m ago\` : \`${Math.floor(s/3600)}h ago\`;` |

---

## 6. Implementation Order (Step-by-Step — this is the code-change sequence)

```
Step 1  VideoCallRoom.tsx — Fix participant-left handler (don't delete)
        └─ Verify by: join 2 users, leave 1 → leaver remains in list dimmed with "Left"

Step 2  VideoCallRoom.tsx — Fix participant-joined handler (invited→joined, left→joined)
        └─ Verify by: re-join manually after leaving → their status flips back to "In Call"

Step 3  VideoCallRoom.tsx — Fix participants-list handler (preserve invited/left rows)
        └─ Verify by: refresh page mid-call with left participants → they still appear

Step 4  VideoCallRoom.tsx — Add prop initialParticipants + merge effect on mount
        └─ Verify by: host navigates directly to room URL with invited users → they show in "Invited"

Step 5  VideoCallRoom.tsx — Implement handleDialBack + cooldown ref + helper imports
        └─ Verify by: console.log emits correct socket payload

Step 6  VideoCallRoom.tsx — Rewrite renderParticipantsList with 3 sections + Dial Back / Remind buttons
        └─ Verify by: visual inspection of all 3 states + button disabling

Step 7  Calls.tsx — Pass initialParticipants={selectedCall.participants} to <VideoCallRoom>
        └─ Verify by: opening a new call created with invitees → invitees show

Step 8  (Optional) VideoCallRoom participant row: confirm ring fires on target
        └─ End-to-end test: 2 browsers, leave one, click Dial Back → incoming modal + loud ring on second browser, Accept → rejoins seamlessly
```

**Total files modified:** 2 (primary), up to 4 (with optional polish)
- `client/components/VideoCallRoom.tsx` — main work
- `client/pages/Calls.tsx` — pass prop
- *(opt)* `client/hooks/useSocket.ts` — richer `inviteToCall` args
- *(opt)* `client/pages/Calls.tsx` — Dial Back in details dialog

---

## 7. Test Checklist (Manual QA Matrix)

| # | Scenario | Expected Result |
|---|---|---|
| 1 | Host invites A + B; B never joins | A & Host in "In Call". B in "Invited" section. Host sees "Remind" button for B. |
| 2 | Click "Remind" on invited user B | Second browser (B) rings IncomingCallModal with loud tone. B accepts → joins. B moves to In Call. |
| 3 | B joins then leaves the call | B instantly moves to "Left" section with "Left Xs ago" badge. |
| 4 | Host clicks "Dial Back" on B | Same incoming modal/ringtone on B. B accepts → status rejoins, media reconnects. |
| 5 | Non-host views participant list | "Dial Back"/"Remind" buttons disabled + tooltip. |
| 6 | Rapid Dial Back spam | 10s cooldown blocks subsequent clicks. |
| 7 | User navigates away & re-enters room | "Invited" and "Left" participants are still there (not wiped because initialParticipants seeding + socket merge works). |
| 8 | Ringtone volume check on dial-back | Same loud ringtone as initial call (AudioUtils.playRingtone). Audio autoplay already initialized once per user session so no "click to enable" overlay needed on 2nd+ dial-backs. |
| 9 | Call ended while dial-back ringing | B accepts → join API fails → toast (acceptable; no worse than initial flow). |
| 10 | 3+ participants all leave then host dials all back | Each user receives ring independently; accepting one doesn't affect others. All returning users end up in "In Call" together. |

---

## 8. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `date-fns` dependency missing for `formatDistanceToNow` | Ship inline `timeAgo()` helper (10 LOC) with same output; do NOT add deps just for this. |
| `cn()` util not imported in VideoCallRoom | Copy the 2-line helper from `IncomingCallModal.tsx` bottom if `@/lib/utils` doesn't export it. |
| `inviteToCall` helper doesn't pass `callerName`/`roomId` | Either extend the socket helper (§3.2) or do a direct `socket.emit('call:invite', {...})` in the handler. Server handler in routes.ts:1354 already uses `callerName || caller?.userName || ''` so fallback exists even without opts. |
| Participant statuses drift if host refreshes | Reseeding from `useCall()` → `initialParticipants` prop + merge effect keeps status synchronized on every mount. Socket events update after. |
| Left participants keep peer/producer entries dangling | Existing `handleProducerClosed` already cleans. The status flip to 'left' is independent. No new cleanup needed. |

---

## 9. Success Criteria

After implementation:
1. **Zero left-participants disappear.** Participant list always contains the full set of people who were invited OR ever joined during the call.
2. **A host can, with a single click, re-establish audio contact with anyone who dropped** — without leaving the room or creating a new call.
3. **The recipient experience for dial-back is identical to the initial call invite** (same modal, same loud ringtone, same Accept → navigate flow) because we reuse `call:incoming` end-to-end.
4. **No backend changes required.** All functionality is composed from existing socket handlers and UI components.
5. **No duration system regressions** — the 2-participant countdown start, warnings, and auto-end all continue to work; only *participant tracking* on the frontend changed.
