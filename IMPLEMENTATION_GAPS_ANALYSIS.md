# Implementation Gaps Analysis — Call/Meeting Duration + Join Flow + Waiting Room

**Date:** 2026-07-29
**Scope:** Frontend only (client/) + shared type definitions (shared/api.ts)
**Input Docs Audited:** `FRONTEND_CALL_DURATION_GUIDE.md`, `PARTICIPANT_TRACKING_DIALBACK_PLAN.md`
**Code Audited:**
- `client/components/VideoCallRoom.tsx`
- `client/pages/Calls.tsx`
- `client/pages/Meetings.tsx`
- `client/pages/JoinCall.tsx`
- `client/pages/JoinMeeting.tsx`
- `shared/api.ts`
- `client/lib/meetings-chat-calls.ts`

---

## 0. Executive Summary

| # | Category | Severity | Count of Gaps |
|---|---|---|---|
| 1 | API Payload Types (`shared/api.ts`) | HIGH | 8 missing fields across Call + Meeting |
| 2 | Socket `participants-list` Payload | HIGH | 2 missing status fields |
| 3 | Join Flow — Password + Pre-join API checks | CRITICAL | Meetings.tsx has ZERO join validation (no password, no join API, no status check, no waiting-room routing) |
| 4 | Join Flow — Waiting Room Approval Routing | HIGH | Approval received but no `POST join` call; `isHost: true` hardcoded in Meetings.tsx |
| 5 | Meeting Link Join (`/join/:code`) | HIGH | No call status validation; user can enter a `completed`/`cancelled` call; no maxParticipants check |
| 6 | Countdown Badge Placement (per Guide §5.3) | MEDIUM | Badge exists but missing from top-bar header; styling partially off-spec |
| 7 | `initialParticipants` prop propagation | MEDIUM | `JoinCall.tsx` / `JoinMeeting.tsx` DO NOT pass it; only `Calls.tsx` passes it |

Total: **22 distinct gaps**. Highest ROI fixes are §3 and §4 (join routing without join-API call = users silently fail to be persisted as "joined" in server DB for meetings, and host bypasses waiting room for themselves but no password check exists for non-hosts on scheduled meetings).

---

## 1. Part I — FRONTEND_CALL_DURATION_GUIDE.md Compliance

### 1.1 Shared API Type Gaps (`shared/api.ts`)

Per Guide §11 (Fields Summary) the `POST /api/calls` and `POST /api/meetings` responses (and `GET` equivalents for code-based lookup) MUST return specific fields that the UI relies on. Current `shared/api.ts` interfaces are **missing these fields**:

#### 1.1.1 `Call` Interface (lines 852-877) — MISSING FIELDS

| Guide Field | Expected Type | Found? | Impact |
|---|---|---|---|
| `startedAt` (when countdown began, not when created) | `string \| null` | ⚠️ EXISTS but is `startedAt?: string` — **semantic mismatch**: Guide §11.1 distinguishes `startedAt` (DB creation time?) vs `endedAt` (when duration limit kicks in). The current field carries the wrong semantics. Need **two fields**: |
| — `createdAt` | `string` | ✅ EXISTS at line 868 — OK |
| — `durationStartedAt` (when 2nd user joined → countdown began) | `string \| null` | ❌ MISSING | UI cannot display "Call started 12 minutes ago" countdown-began time independently of call-creation time |
| `endedAt` (auto-kick time; null until ≥2 participants) | `string \| null` | ⚠️ EXISTS line 857 as `endedAt?: string` — OK, but used both for "call finished" and "will end at". Guide uses two semantics: `endedAt` in API = `null` until 2-participants; `Call.status = completed` when call is truly over. **Need to confirm server doesn't set both the same way.** | Low risk; validate once with backend |
| `maxMeetingDuration` | `number \| null` | ✅ EXISTS line 865 — OK |
| `maxParticipants` | `number` | ✅ EXISTS line 864 — OK |
| `isGroupCall` | `boolean` | ✅ EXISTS line 862 — OK |
| `waitingRoomEnabled` | `boolean` | ✅ EXISTS line 866 — OK |
| `recordingEnabled` | `boolean` | ✅ EXISTS line 867 — OK |
| `participants[].joinedAt` | `string?` | ✅ EXISTS line 874 — OK |
| `participants[].leftAt` | `string?` | ✅ EXISTS line 875 — OK |
| `participants[].status` | `'invited'\|'joined'\|'left'` | ✅ EXISTS line 873 — OK |
| **NEW:** `participants[].isHost` | `boolean?` | ❌ MISSING | Needed so VideoCallRoom can render "Host" badge without a 2nd lookup in teamMembers/hostId comparison |
| **NEW:** `participants[].userName` (denormalized name) | `string?` | ❌ MISSING | Socket payload `participants-list` returns names; REST payload does not. Causes FOUC where participant rows show UUID before socket connects. |

**Action Items for `shared/api.ts` — Call interface:**
```diff
 export interface Call {
   ...
   startedAt?: string;
   endedAt?: string;
+  durationStartedAt?: string | null;  // when 2+ participants arrived (countdown-began timestamp)
   ...
   participants: Array<{
     id: string;
     userId: string;
     status: 'invited' | 'joined' | 'left';
+    userName?: string;              // denormalized display name for quick render
+    isHost?: boolean;               // per-participant host flag
     joinedAt?: string;
     leftAt?: string;
   }>;
 }
```

#### 1.1.2 `Meeting` Interface (lines 744-770) — MORE SEVERE — MISSING 8 FIELDS

Per Guide §11, Meetings have nearly identical shape to Calls for duration. **Current `Meeting` type is missing duration fields entirely:**

| Guide Field | Expected Type | Found? | Impact |
|---|---|---|---|
| `maxMeetingDuration` | `number \| null` | ❌ MISSING | `JoinMeeting.tsx` cannot pass it down; VideoCallRoom falls back to socket payload. If socket payload also missing → timer never starts. |
| `startTime` (when meeting was scheduled OR created) | `string` | ✅ EXISTS line 748 — OK |
| `endTime` (capped to plan limit per Guide §2) | `string \| null` | ⚠️ EXISTS line 749 as `string` (NOT null). Guide says `endTime: null` for instant meetings until ≥2 participants. **Type is wrong** (should be `string \| null`) because scheduled-meeting cap can differ from plan. | Non-null assertion will break runtime if server returns null for instant meetings. |
| `durationStartedAt` (when 2nd participant joined) | `string \| null` | ❌ MISSING | Same as Call — no "meeting began X ago" display. |
| `endedAt` (auto-kick time from duration system) | `string \| null` | ❌ MISSING | Used by Guide §3.2 participants-list + §4 state machine to detect if "late join" (already running). Without it → timer starts from duration-started socket instead of immediately. |
| `maxParticipants` | `number` | ✅ EXISTS line 758 — OK |
| `waitingRoomEnabled` | `boolean` | ✅ EXISTS line 759 — OK |
| `password` | `string?` | ✅ EXISTS line 757 — OK |
| `isInstant` | `boolean` | ✅ EXISTS line 756 — OK |
| `recordingEnabled` | `boolean` | ✅ EXISTS line 760 — OK |
| `attendees[].status` | `'invited'\|'accepted'\|'declined'\|'tentative'` | ✅ EXISTS line 768 — OK shape |
| **NEW:** `attendees[].joinedAt` | `string?` | ❌ MISSING | `Call.participants` has this; meetings should mirror so `initialParticipants` can seed `joinedAt` correctly |
| **NEW:** `attendees[].leftAt` | `string?` | ❌ MISSING | Same |
| **NEW:** `attendees[].userName` | `string?` | ❌ MISSING | Denormalized name for immediate render without teamMembers fetch |
| **NEW:** `attendees[].isHost` | `boolean?` | ❌ MISSING | Same as Call |
| **NEW:** Add a **mapped participant list mirroring Call semantics** for easy prop pass | — | ❌ MISSING | Meetings.tsx passes `attendees` but VideoCallRoom prop `initialParticipants` expects Call-shape `{ userId, status, joinedAt, leftAt }`. Meetings always needs a transform; we should either add `Meeting.participants[]` alias or require the UI layer to transform (current behavior works but type is wrong). |

**Action Items for `shared/api.ts` — Meeting interface:**
```diff
 export interface Meeting {
   ...
-  endTime: string;                              // ← Guide says null until 2+ participants for instant
+  endTime: string | null;
   startTime: string;
+  endedAt?: string | null;                      // auto-kick timestamp computed by duration system
+  durationStartedAt?: string | null;            // when countdown actually began (2 users joined)
+  maxMeetingDuration?: number | null;           // plan limit (minutes), null = unlimited
   ...
   attendees: Array<{
     id: string;
     userId: string;
     status: 'invited' | 'accepted' | 'declined' | 'tentative';
+    userName?: string;                          // display name
+    isHost?: boolean;                           // host badge without lookup
+    joinedAt?: string;                          // when they actually joined media room
+    leftAt?: string;                            // when they left (for left-section UI)
   }>;
+  // Optional: convenience alias that matches Call.participants shape to avoid per-call transforms
+  participants?: Array<{
+    id: string; userId: string;
+    status: 'invited' | 'joined' | 'left';
+    userName?: string; isHost?: boolean;
+    joinedAt?: string; leftAt?: string;
+  }>;
 }
```

### 1.2 Socket Event Payload Gaps

#### 1.2.1 Socket `call:participants-list` / `meeting:participants-list`

Per Guide §11.3 the shape should be:
```typescript
{
  participants: Array<{
    id: string; name: string; isHost: boolean;
    audioEnabled: boolean; videoEnabled: boolean; screenSharing: boolean;
    joinedAt: ISO;
  }>;
  endsAt: ISO | null;
  maxMeetingDuration: number | null;
}
```

**Current state in VideoCallRoom.tsx line 496-558 (`handleParticipantsList`):**
- ✅ Reads `endsAt` → OK
- ✅ Reads `maxMeetingDuration` → OK
- ✅ Reads `participantsList.participants_list.participants` with names, isHost, joinedAt, audio/video/screen → OK for joined users
- ❌ **MISSING per-participant `status` field** (Guide says participants-list payload only includes *joined* participants in socket list anyway; UI infers invited/left via REST merge. This is EXPLICITLY CALLED OUT in PARTICIPANT_TRACKING_DIALBACK_PLAN.md §1.2 item 6 as OK. **No action needed** — frontend status tracking via `initialParticipants` + socket events is the agreed design. So this is not a gap.)
- ✅ `screenSharing` per participant — already handled (line 551)
- ⚠️ **Missing:** `status` field in socket payload would be nice-to-have but not required per Dial-Back plan §2.1 decision tree.

**Verdict on socket payloads:** No critical missing fields for duration system. Frontend correctly derives status via REST-socket hybrid model. (Good — this area was already implemented well by the Dial-Back plan.)

### 1.3 Countdown UI Placement & Styling Gaps (Guide §5.3)

Guide §5.3 shows a `CountdownBadge` component with these behaviors:
- ✅ `waiting` state → "⏳ Waiting for participants…" banner (line 2716-2736 — **already implemented**)
- ✅ `running` → format `hh:mm:ss` or `mm:ss`
- ✅ 5-min warning pulse (toast fires on guide line 615-624; **already implemented** in both socket handler + defensive local timer)
- ✅ 1-min sticky banner (line 2739-2758 — **already implemented**, nice gradient + red pulse)
- ✅ `isUrgent/isWarning` color classes applied to badge logic (lines 366-367 → CountdownDisplay carries these, but **see below**)
- ❌ **Missing:** Badge not placed in the TOP HEADER / top-bar of the call. Currently we only display banners (waiting banner at top, 1-min sticky at top) but do not show the small persistent inline countdown badge next to call title / participant count in a header row.
- ❌ **Missing:** No progress-bar or `percentUsed` (calculated line 364) rendered anywhere in UI. The `percentUsed` is computed but unused — good for a small linear bar inside the countdown badge or above it.

**Verdict:** Minor cosmetic gap. Badge+warnings work functionally; just missing a persistent compact countdown display location (should live next to participant count + recording indicator). Currently the only always-visible countdown is inside 1-min warning banner which only appears at ≤60 seconds.

### 1.4 Duration Hook Compliance (Guide §5.2)

Line 193-433 in VideoCallRoom.tsx implements `DurationState` + derived `CountdownDisplay` manually (inlined hook pattern rather than extracted `useCallDuration`). **Functionally complete**:
- ✅ participants-list → running/waiting state
- ✅ waiting-for-participants handler (line 561-568)
- ✅ duration-started handler (line 570-595)
- ✅ duration-active handler (line 597-610)
- ✅ countdown-warning handler (line 612-640)
- ✅ Local defensive teardown at `totalMs <= 0` with 15s safety buffer (line 406-422) — **better than spec, good**

**Verdict on §5.2:** 100% compliant — nicely done. This is already one of the better-implemented sections.

---

## 2. Part II — Join Flow & Waiting Room + Meeting Info Approval Gaps (CRITICAL)

This is the user's second concern: **"the system isn't checking meeting information to determine user is waiting on room until approval before entering a room, and other controls."**

The audit confirms TWO SEVERE broken flows:

### 2.1 Broken Flow A: `Meetings.tsx` — "Join Meeting" button bypasses EVERYTHING

In `Meetings.tsx` lines 264-267:
```typescript
const openMeetingRoom = (meeting: Meeting) => {
  setSelectedMeeting(meeting);
  setIsMeetingRoomOpen(true);
};
```

Then lines 961-970 VideoCallRoom invocation:
```tsx
<VideoCallRoom
  roomId={selectedMeeting.meetingCode}
  meetingId={selectedMeeting.id}
  onLeave={() => setIsMeetingRoomOpen(false)}
  userName={localStorage.getItem("userName") || "User"}
  isHost={true}                            // ← HARDCODED. EVERYONE IS HOST.
  waitingRoomEnabled={selectedMeeting.waitingRoomEnabled}
  teamMembers={teamMembers}
  currentParticipantIds={(selectedMeeting.attendees ?? []).map(a => a.userId)}
  // ❌ NO initialParticipants prop passed
  // ❌ NO password prop / password prompt
  // ❌ NO POST /meetings/:id/join was called
/>
```

**This is catastrophically broken. Let's enumerate:**

| # | Issue | Severity | What user sees vs what server sees |
|---|---|---|---|
| 2.1.1 | **`isHost={true}` hardcoded for ALL users clicking Join Meeting** | CRITICAL | A random team member clicks "Join Meeting" → UI treats them as host. They see Admit All/Deny controls in waiting room, Dial Back buttons with host-only enabled, recording controls. But the server-side socket handlers **probably** use `isHost` from socket join payload (VideoCallRoom line 794-801 passes local `isHost` in `joinOpts`). So at SOCKET layer, random user claims host. If server socket handler trusts `joinOpts.isHost` (as it likely does per Guide §3.1 join payload), **this is an AUTHORITY ESCALATION BUG — any meeting attendee can claim host.** |
| 2.1.2 | **NO password check whatsoever for Meetings** | CRITICAL | In `Calls.tsx` line 343-388 there is `handleJoinCall` that checks `call.password` → prompts with password dialog → submits `POST /calls/:id/join` with password. In Meetings, a meeting with `password !== undefined` will be entered with zero password check. User skips straight to media room, and VideoCallRoom's `requiresPassword` state (line 212) only fires if socket emits `room:passwordRequired` (line 2074). Two problems: (a) server may not emit that event if the join-API call is the gating mechanism, and (b) user can already see the call room chrome behind the password dialog while media is being negotiated in the background (device initialized line 1021, transports created 1096). So they hear audio before password is submitted. |
| 2.1.3 | **NO `POST /meetings/:id/join` REST call before mounting VideoCallRoom** | CRITICAL | `Calls.tsx` calls `joinCall.mutateAsync({ callId, password })` at line 353 which hits `POST /calls/:id/join`. This tells the server: (a) update participant status → `'joined'` in DB, (b) check password, (c) check maxParticipants, (d) return enriched call with `maxMeetingDuration`, `endedAt`, etc. Meetings flow skips this step entirely. The socket-only join (`joinMeeting` helper line 805) probably only handles socket room state, not REST DB status update. Result: **meeting.attendees[].status never becomes `'accepted'`/`'joined'` in DB; backend thinks they never joined; reports/dashboards will be wrong; maxParticipants enforcement is socket-only and may not match server. Also, the `applyJoinAck` at line 761-793 runs but may not receive `maxMeetingDuration` because the server didn't enrich via join API.** |
| 2.1.4 | **NO meeting-status validation (is it completed/cancelled?)** | HIGH | If a meeting has `status = 'completed'` or `'cancelled'`, `openMeetingRoom` will still mount VideoCallRoom. The user will try to connect, mediasoup device init may fail (if server closed the room), or worse succeed and create orphan resources. No friendly "This meeting has ended" screen. |
| 2.1.5 | **NO scheduled-meeting "not started yet" check** | MEDIUM | Meeting with `status = 'scheduled'` and `startTime` 2 hours in future → user allowed straight into room. Should show "Meeting starts in 2h. You can wait in lobby or join early if host allows." (Lobby/waiting room does activate if `waitingRoomEnabled=true`, but no banner explaining "start time hasn't arrived" vs "waiting for host approval". |
| 2.1.6 | **NO maxParticipants pre-check** | MEDIUM | Meeting reached plan `maxParticipants`? User not informed — they see media loading then possibly a socket rejection or silent failure. Join API call would surface this with a 400 + error code. |
| 2.1.7 | **NO `initialParticipants` prop passed** | MEDIUM | `VideoCallRoom` expects this (prop defined line 92; `Calls.tsx` passes it line 1312). Without it, invited/leftover state from REST attendees is lost. The room has to rely entirely on socket updates, which only include *joined* participants (per §1.2 Dial-Back plan hybrid design). So invitees won't show in Invited section inside Meetings path until they join. |
| 2.1.8 | **NO non-host waiting-room routing in Meetings path** | HIGH | VideoCallRoom line 209 sets `isInWaitingRoom = !isHost && waitingRoomEnabled`. But since `isHost = true` is HARDCODED (2.1.1), **waiting room NEVER triggers in Meetings path.** Non-host attendees who click "Join Meeting" are treated as hosts, bypass waiting room, and enter the full media room with admit/deny controls. Nobody waits. This is likely exactly the bug the user reported: "system isn't checking meeting information to determine user is waiting on room until approval". |

### 2.2 Broken Flow B: `Calls.tsx` — `handleOpenCallRoom` partial fix exists, but 1 remaining gap

For comparison, Calls.tsx has a much better flow:

```typescript
// Line 390-399
const handleOpenCallRoom = useCallback(
  (call: Call) => {
    if (!isCurrentUserHost(call) && !isCurrentUserJoined(call)) {
      handleJoinCall(call);        // ← triggers password dialog + POST /join
      return;
    }
    setSelectedCall(call);
    setIsJoinDialogOpen(true);     // ← opens room directly
  },
  [...]
);
```

Still has ONE gap:
| # | Issue | Severity | Detail |
|---|---|---|---|
| 2.2.1 | **Host does NOT re-verify password/status via join-API if they left and rejoin** | LOW | Host opens room → `isCurrentUserHost` returns true → skips `handleJoinCall` → no join-API refresh. If call was cancelled/completed while host was away, they will see VideoCallRoom mount and then fail when socket doesn't connect. Better to always hit join API if `status !== 'ongoing'`. |

### 2.3 Broken Flow C: `JoinCall.tsx` / `JoinMeeting.tsx` — Link-based Entry

These pages handle public share-links (`/join-call/:callCode`, `/join-meeting/:meetingCode`). More issues:

#### 2.3.1 JoinCall.tsx (lines 1-145):

| # | Issue | Severity | Detail |
|---|---|---|---|
| 2.3.1.1 | Password check is CLIENT-SIDE ONLY (lines 61-81) | CRITICAL | `handlePasswordSubmit` compares `password !== call.password` in React state. Anyone can F12 → step over → `setShowPasswordInput(false)`. The password check MUST go server-side via the join API. This is a **security vulnerability**: you can bypass call password with trivial client manipulation. |
| 2.3.1.2 | NO `POST /calls/:id/join` call BEFORE mounting VideoCallRoom | HIGH | User enters link → password is "verified" client-side → VideoCallRoom mounts directly. Same server-sync issue as 2.1.3 (attendee status never written, maxMeetingDuration not enriched, maxParticipants not checked). |
| 2.3.1.3 | NO call status validation before VideoCallRoom | HIGH | Completed/cancelled calls mount VideoCallRoom as if still active. `call.status` is fetched (line 28) but never checked in render gate. |
| 2.3.1.4 | `isHost` derived only from `hostId` match | MEDIUM | OK, but what about `coHostId`? Call.coHostId (line 860) exists but isn't considered — a co-host clicking the join link gets treated as non-host (would enter waiting room even though they're co-host). |
| 2.3.1.5 | **NO `initialParticipants` prop passed** (line 130-140 VideoCallRoom mount) | MEDIUM | Same as 2.1.7 — Invited/Left section not populated from REST list; uses empty array fallback. |
| 2.3.1.6 | **NO maxParticipants warning before entry** | LOW | If the call is full, user will find out after media starts connecting (or socket rejects) — poor UX. |

#### 2.3.2 JoinMeeting.tsx (lines 1-144):

Same shape as JoinCall, **all 6 issues above apply identically**:
- ❌ Password client-side only (line 65 `if (password !== meeting.password)`)
- ❌ No `POST /meetings/:id/join`
- ❌ No meeting.status validation before mount
- ❌ `isHost` only checks `hostId`, ignores `coHostId`
- ❌ No `initialParticipants` passed
- ❌ No maxParticipants pre-check

### 2.4 VideoCallRoom Internal Gaps (Waiting Room & Admit Flow)

VideoCallRoom has the waiting room UI & socket handlers, but the flow has gaps:

| # | Issue | Severity | Detail |
|---|---|---|---|
| 2.4.1 | After `waiting-room:admitted` fires, user skips join-API POST | HIGH | Flow: Non-host enters call → waiting room → `handleAdmitted` (line 2097-2101) sets `isInWaitingRoom = false`. **Then useEffect dependency at line 739 re-evaluates** because `isInWaitingRoom` changed. Dep array line 829 includes it. Good. So the socket `joinCall` / `joinMeeting` at lines 803-808 fires. Media starts. **BUT:** The REST-level `POST /calls/:id/join` or `POST /meetings/:id/join` is **NEVER called for this user.** The server was told via socket "this user is in room", but DB row for participant status stays `'invited'`. Backend duration/cron will not see them as joined → countdown never starts if this user is the 2nd participant (they join via socket; countdown-start logic probably checks socket room size, so this might work at media layer but DB status is wrong forever. Reporting corrupt. |
| 2.4.2 | Socket emit `waiting-room:request` line 749 uses `socketRoomId` (meetingId/callId) but no `password` parameter | HIGH | If the call requires password AND waiting room AND user entered via JoinCall.tsx (which "verified" client-side), the password never reaches waiting-room admit handler. Host admits them, they get in, but password validation never happened server-side. In practice this means password+waitingRoom combination has 0 server checks (password done client, then waiting room bypasses any server password gate). |
| 2.4.3 | Waiting room state on waiting-room side: NO "host not yet joined" distinction | MEDIUM | When waiting room user is in UI, they see "Please wait for the host to admit you". But if host is not in the call (host hasn't started it yet), user should see a **different** message: "Host has not yet started the meeting. You will be admitted automatically when they arrive." Currently no way to distinguish; spinner would spin forever. |
| 2.4.4 | `handleAdmitted` (line 2097) sets `isInWaitingRoom = false` regardless of whether the admitted event is for THIS user or another room ID | MEDIUM | Guard clause `if (!data || data.roomId === roomId)` is wrong, should be `===` only. If `data` is undefined/null → admitted anyway. If another call on same socket fires admitted (unlikely but possible for multi-tab), → wrong room releases. Should be: `if (data && data.roomId === socketRoomId)` |

### 2.5 Password Handling Architecture — Summary of Security Issues

Three different password implementations, all inconsistent:

| Path | Password check location | Is it secure? |
|---|---|---|
| `Calls.tsx` → `handleJoinCall` | ✅ Server side — `POST /calls/:id/join { password }` returned error code `PASSWORD_REQUIRED` / `INVALID_PASSWORD` (lines 369-375 handled with retry dialog) | ✅ Secure |
| `JoinCall.tsx` → `handlePasswordSubmit` | ❌ **Client side only** — `password !== call.password` (lines 61-81) | ❌ Trivially bypassable |
| `JoinMeeting.tsx` → `handlePasswordSubmit` | ❌ **Client side only** — same pattern | ❌ Trivially bypassable |
| `Meetings.tsx` → `openMeetingRoom` | ❌ **No password check at all** | ❌ None |
| `VideoCallRoom` → `verifyPassword` socket | Socket emit `room:verifyPassword` → server reply (lines 1736-1757) | ⚠️ Socket-based server check. Reasonable BUT only fires if `requiresPassword` state set, which requires server to emit `room:passwordRequired` event (line 2074). That event may not fire if the gating is actually done at REST join layer instead of socket. |

**Action:** Standardize all 4 entry paths on the Calls.tsx secure pattern:
1. Always call `POST /calls/:id/join { password }` or `POST /meetings/:id/join { password }`
2. Let server return 400 with error codes
3. Frontend shows dialog on error, opens room on 200
4. VideoCallRoom internal socket password verification becomes DEFENSE-IN-DEPTH fallback only, not the primary gate.

---

## 3. Summary Table of All Gaps

### 3.1 Type / Payload Gaps (shared/api.ts)

| ID | File | Field | Severity |
|---|---|---|---|
| T-1 | shared/api.ts Call interface | + `durationStartedAt?: string \| null` | MEDIUM |
| T-2 | shared/api.ts Call.participants[] | + `userName?: string` | MEDIUM |
| T-3 | shared/api.ts Call.participants[] | + `isHost?: boolean` | LOW |
| T-4 | shared/api.ts Meeting interface | ⚠️ Fix `endTime: string \| null` (non-null → nullable) | HIGH (breaks runtime) |
| T-5 | shared/api.ts Meeting interface | + `endedAt?: string \| null` | HIGH (late-join detection broken) |
| T-6 | shared/api.ts Meeting interface | + `durationStartedAt?: string \| null` | MEDIUM |
| T-7 | shared/api.ts Meeting interface | + `maxMeetingDuration?: number \| null` | HIGH (timer never starts if socket missing) |
| T-8 | shared/api.ts Meeting.attendees[] | + `userName?`, `isHost?`, `joinedAt?`, `leftAt?` | MEDIUM |

### 3.2 Join Flow / Security / Waiting Room Gaps

| ID | File | Issue | Severity |
|---|---|---|---|
| J-1 | Meetings.tsx openMeetingRoom | `isHost={true}` HARDCODED — host authority escalation | **CRITICAL** |
| J-2 | Meetings.tsx openMeetingRoom | No password check for protected meetings | **CRITICAL** |
| J-3 | Meetings.tsx openMeetingRoom | No `POST /meetings/:id/join` REST call before mounting room | **CRITICAL** (DB status wrong, maxDuration not synced) |
| J-4 | Meetings.tsx openMeetingRoom | No meeting.status (completed/cancelled) gate before mount | HIGH |
| J-5 | Meetings.tsx openMeetingRoom | Waiting room never activates (direct consequence of J-1) | **CRITICAL** (user-reported bug) |
| J-6 | Meetings.tsx VideoCallRoom mount | No `initialParticipants` passed | MEDIUM |
| J-7 | Meetings.tsx openMeetingRoom | No maxParticipants check; no scheduled-time validation | MEDIUM |
| J-8 | JoinCall.tsx handlePasswordSubmit | **CLIENT-SIDE ONLY password check** | **CRITICAL (security)** |
| J-9 | JoinCall.tsx render | No `POST /calls/:id/join` before VideoCallRoom | HIGH |
| J-10 | JoinCall.tsx render | No `call.status` validation before room mount | HIGH |
| J-11 | JoinCall.tsx / JoinMeeting.tsx | `isHost` does not include `coHostId` equality check | MEDIUM |
| J-12 | JoinCall.tsx VideoCallRoom mount | No `initialParticipants` passed | MEDIUM |
| J-13 | JoinMeeting.tsx | Same J-8 through J-12 — all mirror | ALL same severities |
| J-14 | VideoCallRoom after waiting-room:admitted | No REST join call after admission → DB status not synced | HIGH (reporting/duration integrity) |
| J-15 | VideoCallRoom handleAdmitted guard | `if (!data \|\| data.roomId === roomId)` — wrong boolean (should be `&& data && ===`) | MEDIUM |
| J-16 | VideoCallRoom waiting room UI | "host not yet in room" state not distinguishable from "host hasn't admitted yet" | MEDIUM |

### 3.3 Countdown UI Gaps (Minor)

| ID | File | Issue | Severity |
|---|---|---|---|
| UI-1 | VideoCallRoom.tsx render (call room) | No always-visible compact countdown badge (only banners). Guide §5.3 badge not placed. | MEDIUM |
| UI-2 | VideoCallRoom.tsx render (call room) | `percentUsed` (calculated line 364) not rendered — could be a thin progress bar in header | LOW |

---

## 4. Recommended Implementation Order (Priority Stack)

Implement **IN THIS ORDER** to unblock user-reported issues first:

### Phase 0 — Fix the user-visible bug "waiting room never activates for meetings"
1. **J-1 + J-5:** Replace hardcoded `isHost={true}` in Meetings.tsx 966 with `isCurrentUserHost(meeting)` helper (same pattern as Calls.tsx uses `isCurrentUserHost(selectedCall)` line 1304). Create helper in Meetings.tsx:
   ```tsx
   const currentUserId = localStorage.getItem('userId');
   const isCurrentUserHost = (m: Meeting) => m.hostId === currentUserId || m.coHostId === currentUserId;
   ```
2. **J-2 + J-3 + J-4 + J-6 + J-7:** Rewrite `openMeetingRoom` in Meetings.tsx to mirror `Calls.tsx handleJoinCall` flow. Steps:
   - If password-protected and non-host → show password dialog
   - Call `POST /meetings/:id/join { password }` via new `useJoinMeeting` mutation (analogous to `useJoinCall` line 216 in meetings-chat-calls.ts)
   - Validate returned status=ongoing and maxParticipants not exceeded
   - Enrich `selectedMeeting` with the join response (maxMeetingDuration now populated)
   - Pass `initialParticipants={transformedAttendees}` (transform Meeting.attendees → Call.participants shape since VideoCallRoom expects it, or add alias per T-8)
   - THEN open dialog

### Phase 1 — Fix security vulnerabilities (password bypass)
3. **J-8 + J-9 + J-10 + J-12:** Rewrite `JoinCall.tsx` handle flow. Remove client-side password compare. Always call `joinCall.mutateAsync({ callId, password })` (use the existing `useJoinCall` hook from meetings-chat-calls.ts). Open room only on success. Add `call.status === 'ongoing'` check before mount; otherwise show "Call ended" screen. Pass `initialParticipants={call.participants}`.
4. **J-13 (same fixes for JoinMeeting.tsx):** Mirror. Need `useJoinMeeting` mutation (TBD analog to `useJoinCall`). Add `meeting.status === 'ongoing' || meeting.status === 'scheduled'` gate with start-time warning.

### Phase 2 — Fix DB integrity / waiting room after-admission
5. **J-14:** After `waiting-room:admitted` fires, we need to kick off the REST join-call in VideoCallRoom or a parent. Options: (a) Emit callback via new prop `onAdmittedNeedRestJoin` so parent Calls/JoinCall pages call join API. Or (b) do it directly in VideoCallRoom using api client with callId/meetingId context. Option (b) simpler and matches the current architecture where socket events already trigger side effects.
6. **J-15:** Fix the boolean guard in `handleAdmitted` line 2097.

### Phase 3 — Type fixes (prevent future bugs)
7. **T-1 through T-8:** Update `shared/api.ts` types. Start with T-4, T-5, T-7 (nullable endTime, endedAt, maxMeetingDuration on Meeting — these cause runtime bugs or missing features). Then T-1/T-6 (durationStartedAt — nice for UI). Then T-2/T-3/T-8 (denormalized names/statuses for fewer lookups).

### Phase 4 — Waiting room UX polish
8. **J-16:** Add "host presence" detection by tracking whether host userId is present in the `participants` list of status='joined'. Show different copy:
   - Host not present → "Host has not yet joined. You'll be admitted automatically once they start the meeting."
   - Host present but not admitted → "Please wait — the host has been notified and will admit you shortly."

### Phase 5 — Countdown UI polish (Low priority, cosmetic)
9. **UI-1 + UI-2:** Place a small CountdownBadge in a sticky header row (above participant grid but below the 1-min banner area if visible). Show `timeRemaining` always, colorized by isWarning/isUrgent. Above it a 1px progress bar of width `percentUsed * 100%`.

---

## 5. Files to Change (Scope Estimate)

| Phase | Files Changed | Estimated Lines |
|---|---|---|
| Phase 0 | `client/pages/Meetings.tsx` (only) | ~220 lines (new password dialog + reorder join flow, same structure as Calls.tsx already has) |
| Phase 1 | `client/pages/JoinCall.tsx`, `client/pages/JoinMeeting.tsx`, add `useJoinMeeting` to `client/lib/meetings-chat-calls.ts` | ~140 lines |
| Phase 2 | `client/components/VideoCallRoom.tsx` (add admitted→join flow) | ~50 lines |
| Phase 3 | `shared/api.ts` | ~40 lines (type additions only; no runtime code) |
| Phase 4 | `client/components/VideoCallRoom.tsx` waiting room render | ~30 lines |
| Phase 5 | `client/components/VideoCallRoom.tsx` header render | ~40 lines |
| **Total** | **6 files** | **≈ 520 lines of changes** |

---

## 6. Dial-Back Plan Status Check (Quick Reference)

Per `PARTICIPANT_TRACKING_DIALBACK_PLAN.md` §3.x — this implementation appears to already be complete or near-complete in VideoCallRoom.tsx based on lines 318-344 (initialParticipants merge), 439-494 (joined/left handlers with status flip, not remove), 496-558 (participants-list handler preserving invited/left), 864-904 (handleDialBack with cooldown), 2363-2521 (sectioned renderParticipantsList with In Call / Invited / Left + Dial Back/Remind buttons). The remaining items from that plan appear to be Calls.tsx → `initialParticipants` prop which is wired (line 1312), and optional Meetings.tsx equivalent which is missing due to the J-6 gap we just found.

**Verdict on Dial-Back:** Implementation done except in Meetings path where initialParticipants isn't yet passed (fixed in Phase 0 J-6). No other dial-back work needed.

---

**End of Report.** Review and approve before proceeding to implementation.
