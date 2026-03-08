# LetsLol – Copilot Instructions

## Project Vision

LetsLol is a **virtual office web application** where users navigate a 2D space using WASD keys. When two users are in proximity, WebRTC voice chat activates automatically. Users can optionally share their screen with nearby colleagues.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript (Vite) |
| 2D Rendering | PixiJS v8 |
| Real-time signaling | ASP.NET Core SignalR (.NET 10) |
| Peer-to-peer media | WebRTC (browser-native) |
| Backend | ASP.NET Core (.NET 10) |

---

## Architecture Rules

### Frontend — React + PixiJS

- **All React hooks (`useState`, `useRef`, `useCallback`, etc.) must be declared at the top of the component body**, before any `useEffect` calls or conditional logic. Never place a hook after JSX, logic, or another hook's body.
- **PixiJS applications must always be initialized with `app.init()` (async).** Never call `new Application()` and use it synchronously.
- **PixiJS `useEffect` cleanup must guard against the StrictMode double-invoke.** Always use the `cancelled` + `initializedApp` pattern:
  ```ts
  useEffect(() => {
      let initializedApp: Application | null = null;
      let cancelled = false;
      const app = new Application();
      app.init({ ... }).then(() => {
          if (cancelled) { app.destroy(true); return; }
          initializedApp = app;
          // ... mount canvas, add display objects
      });
      return () => {
          cancelled = true;
          if (initializedApp) { initializedApp.destroy(true); initializedApp = null; }
      };
  }, []);
  ```
- **Never call `app.destroy()` unconditionally in cleanup.** `ResizePlugin._cancelResize` is only registered after `init()` resolves; calling destroy before that throws `_cancelResize is not a function`.
- Keep PixiJS game logic (world, entities, input) **outside React state**. Use `useRef` to hold PixiJS objects. React state is only for UI overlays (chat UI, user list, settings).
- The PixiJS canvas should fill the viewport. Use `resizeTo: window` in `app.init()`.

### Movement & World

- Player movement is driven by **WASD keys** and updated every tick via `app.ticker.add()`.
- Player position is a `{ x: number, y: number }` object updated in the game loop.
- Throttle position broadcasts to SignalR to **max once per 50ms** to avoid flooding the server.
- Proximity detection: compute Euclidean distance between local and remote player positions each tick. The threshold for activating voice chat is **200 world units** (configurable via a constant `PROXIMITY_THRESHOLD`).

### SignalR (Signaling)

- The SignalR hub lives at `/hubs/office` on the ASP.NET backend.
- Hub methods: `JoinRoom(roomId)`, `SendOffer(targetId, sdp)`, `SendAnswer(targetId, sdp)`, `SendIceCandidate(targetId, candidate)`, `BroadcastPosition(x, y)`.
- Client-side hub connection must be started once on mount and stopped in cleanup.
- Use `@microsoft/signalr` package on the frontend.

### WebRTC

- Use `RTCPeerConnection` with Google's public STUN: `stun:stun.l.google.com:19302`.
- One `RTCPeerConnection` per remote peer (keyed by connection/user ID).
- **Offer/answer flow**: local player creates offer → sends via SignalR → remote creates answer → sends back → both sides add ICE candidates as they trickle in.
- **Voice**: add audio track from `getUserMedia({ audio: true, video: false })` to each peer connection.
- **Screen share**: use `getDisplayMedia()` and replace the video track on demand; stop sharing restores the previous state.
- **Proximity-gating**: only create/maintain a `RTCPeerConnection` when a peer is within `PROXIMITY_THRESHOLD`. Tear down (`.close()`) and clean up when they move out of range.
- Mute/unmute is handled by toggling `track.enabled`, not by removing the track.

### Backend — ASP.NET Core

- Keep SignalR hub logic thin — it is a **relay only**. No game state lives on the server.
- Player positions can optionally be persisted in memory (a `ConcurrentDictionary`) so late joiners receive the current state on `JoinRoom`.
- CORS must allow the Vite dev server origin (`https://localhost:5173` or the configured port).
- SignalR hub must be mapped in `Program.cs` via `app.MapHub<OfficeHub>("/hubs/office")`.

---

## File & Folder Conventions

```
letslol.client/src/
  game/
    world.ts          # PixiJS Application setup, ticker, stage
    player.ts         # Local player sprite, WASD input
    remotePlayers.ts  # Map of remote player sprites by ID
    proximity.ts      # Distance calculations, PROXIMITY_THRESHOLD
  webrtc/
    peerManager.ts    # RTCPeerConnection map, create/close peer logic
    mediaManager.ts   # getUserMedia, getDisplayMedia, track management
  signalr/
    hubConnection.ts  # SignalR connection singleton
    signalingService.ts # Offer/answer/ICE wiring between SignalR and WebRTC
  components/
    OfficeCanvas.tsx  # Mounts PixiJS canvas, owns game loop useEffect
    VoiceControls.tsx # Mute/unmute, screen share UI overlay
    UserList.tsx      # Who is online / within range

LetsLol.Server/
  Hubs/
    OfficeHub.cs      # SignalR hub
  Models/
    PlayerState.cs    # { string Id, double X, double Y }
```

---

## Key Constants (define in `game/constants.ts`)

```ts
export const PROXIMITY_THRESHOLD = 200;   // world units
export const POSITION_BROADCAST_INTERVAL_MS = 50;
export const STUN_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
];
export const SIGNALR_HUB_URL = '/hubs/office';
```

---

## Do's and Don'ts

### Do
- Use `useRef` for all PixiJS and WebRTC objects inside React components.
- Tear down `RTCPeerConnection` and SignalR listeners when components unmount.
- Validate ICE candidate / SDP messages on the server before relaying.
- Use TypeScript interfaces for all SignalR message shapes.

### Don't
- Don't store PixiJS `Sprite`, `Graphics`, or `Application` in React `useState`.
- Don't call `getUserMedia` or `getDisplayMedia` until the user explicitly grants permission (show a UI prompt first).
- Don't add TURN server credentials in source code — load from environment variables.
- Don't broadcast raw full world state on every tick — send deltas or throttled positions only.
