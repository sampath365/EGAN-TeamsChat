# EGAN Pulse

**Advanced team collaboration — chat, threaded conversations, live meetings with screen sharing, tasks, files, notes and role-based access control.**

A Teams-class workspace built as a standalone product: a React 18 + TypeScript front-end and a Node realtime back-end (Express + WebSocket + WebRTC signalling). No external services are required — it runs with one command.

---

## Why it is more than a Teams clone

| Teams feature | Pulse |
|---|---|
| Channel chat | ✅ Channels, private channels, unread counts, per-channel topics |
| Threads | ✅ Inline thread panel with reply counts |
| Reactions | ✅ Quick reactions + full emoji picker, live for everyone |
| Mentions | ✅ `@` autocomplete, highlighted, notifies the person |
| Edit / delete | ✅ Author-only edit; delete any with the right permission |
| Files | ✅ Per-channel file library with upload progress |
| Wiki / notes | ✅ Per-channel markdown notes with a sidebar of pages |
| Meetings | ✅ Audio + video + **screen sharing**, participant tiles, in-call chat |
| Tasks | ✅ Kanban board with drag-and-drop, assignees, priorities, due dates, checklists |
| Access control | ✅ Owner / Admin / Member / Guest roles + 10 granular permissions |
| Invites | ✅ Expiring invite links with a role baked in |
| Search | ✅ `⌘K` command palette across channels, messages, people and tasks |
| Presence | ✅ Live online indicators over WebSocket |
| Notifications | ✅ Real-time toast + notification centre |

**Extras Teams does not have out of the box:**
- Zero-config demo workspace seeded on first boot
- Per-member permission overrides on top of the role baseline
- Guest role that can read but not write
- Copy-paste meeting invite links that work without a calendar integration
- Single-binary deploy — the API serves the built front-end with `--serve-dist`

---

## Quick start

```bash
npm install
npm run dev          # API on :4100 + Vite on :12000
```

Open <http://localhost:12000>.

### Demo accounts

Seeded on first boot (`SEED_DEMO=1`, the default):

| Email | Password | Role |
|---|---|---|
| `aarav@egan.in` | `pulse1234` | Owner |
| `priya@egan.in` | `pulse1234` | Admin |
| `rohit@egan.in` | `pulse1234` | Member |

Sign in as two different accounts in two browser profiles to see realtime chat, presence and meeting signalling between them.

### Production

```bash
npm run build
npm run serve        # one process: API + static front-end on :4100
```

---

## Features in detail

### Chat
- Markdown: **bold**, *italic*, `code`, fenced blocks, lists, quotes, links
- Emoji-only messages render jumbo
- Optimistic send with a "not sent" state on failure
- Grouped consecutive messages by the same author within 5 minutes
- Day dividers, hover action bar, copy / reply / pin / edit / delete

### Threads
Click **Reply in thread** on any message to open the side panel. Replies notify the parent author. The Threads page aggregates every active thread.

### Meetings & screen sharing
- WebRTC mesh (up to ~8 participants comfortably), STUN-only by default
- **Screen sharing** via `getDisplayMedia`, swapped into the outgoing video track so peers see it instantly without renegotiating the call
- Grid / spotlight layouts, mute, camera toggle, raise hand, in-call chat
- Join from a link: `/#/meeting/<callId>`
- Audio-only fallback when the camera is blocked

> For production across strict NATs, add a TURN server to `ICE_SERVERS` in `src/pages/MeetingPage.tsx`.

### Tasks
Kanban with drag-and-drop between columns, priorities, due dates with overdue detection, tags, checklists and assignees. Task changes broadcast to the whole team live.

### Access control
Roles are ranked: `guest < member < admin < owner`.

| Permission | Baseline role |
|---|---|
| `channel.manage` | admin |
| `member.invite` | admin |
| `member.manage` | admin |
| `meeting.host` | member |
| `meeting.moderate` | admin |
| `task.manage` | member |
| `file.upload` | member |
| `note.edit` | member |
| `message.deleteAny` | admin |
| `team.settings` | owner |

A member can be granted any permission individually on top of their role, from **People → Manage**.

---

## Architecture

```
EGAN-TeamsChat/
├── server/
│   ├── index.mjs        # Express REST + WebSocket + WebRTC signalling
│   ├── store.mjs        # JSON persistence, password hashing, signed tokens
│   ├── seed.mjs         # demo workspace
│   └── access.mjs       # roles, permissions, channel visibility
├── src/
│   ├── context/AppContext.tsx   # auth, realtime socket, all data state
│   ├── components/              # Sidebar, Composer, MessageList, palette, UI kit
│   ├── pages/                   # Login, Home, Channel, Tasks, Meetings, People…
│   └── lib/                     # API client, types, utils
└── scripts/dev.mjs      # runs API + Vite together
```

**Persistence** is a single JSON file (`data/pulse.json`) written atomically with a debounce. It is deliberately simple so the app runs anywhere with no database; the store module is the only place that touches disk, so swapping in Postgres means replacing four functions.

**Realtime** is one WebSocket per user. The server maps `userId → sockets` and broadcasts message, presence, typing, task and call events. Meeting signalling uses the same socket with `meeting.*` messages, so no separate signalling server is needed.

**Security notes**
- Passwords are hashed with `scrypt` and verified with `timingSafeEqual`
- Tokens are HMAC-SHA256 signed with an expiry — set `AUTH_SECRET` in production
- Markdown is escaped before any tag is re-introduced, so message content cannot inject HTML
- Uploads are capped at 25 MB and served with immutable caching

---

## Configuration

Copy `.env.example` to `.env`:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4100` | API port |
| `AUTH_SECRET` | `dev-only-change-me` | Token signing key — **change in production** |
| `DATA_DIR` | `./data` | JSON store + uploads location |
| `SEED_DEMO` | `1` | Seed the demo workspace on first boot |
| `CORS_ORIGIN` | same-origin | Comma-separated allowed origins |

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API + Vite dev server together |
| `npm run dev:api` | API only |
| `npm run dev:web` | Vite only |
| `npm run typecheck` | TypeScript, no emit |
| `npm run build` | Typecheck + production bundle |
| `npm run serve` | API serving the built front-end |

---

## Known limitations

- WebRTC is a peer mesh with public STUN only — add TURN for restrictive networks
- The JSON store is single-process; run one API instance
- No email delivery for invites (links are copied and shared)
- Meeting recording is not implemented (tracked as a task in the demo board)

---

## License

Proprietary — © EGAN Technologies.
