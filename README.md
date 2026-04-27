# Multitask

> Final bachelor project for the Multimedia Technology and Design.

A collaborative project management web app built for students and indie development groups. Each workspace is a self-contained project with a shared Kanban board, a rich-text notation page, and a graph/mindmap editor — all synced in real time across collaborators.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React + Vite |
| Backend | Node.js + Express |
| Database | SQLite |
| Rich Text | TipTap |
| Sync | Local Storage (browser) → Server DB, distributed updates |

---

## Features

### Workspaces
- One workspace = one project
- Each workspace contains three pages: **Notation**, **Kanban**, and **Graph**
- Workspaces can be assigned **categories** for organisation
- Dashboard gives an overview of all accessible workspaces, filterable by:
  - Category
  - Owned by you
  - Owned by others (workspaces you've been invited to)
- Access is strictly limited — you can only see workspaces you **created** or were **explicitly invited to**
- Invitations are sent using a user's email as their ID, but the invite itself is **in-app** (dashboard subbar), not sent to their actual email inbox

### Notation Page (TipTap)
- Full rich-text editor implementation
- Supports all standard formatting (bold, italic, headings, lists, links, etc.)
- No spell check (intentional)

### Kanban Page
- Multiple boards per workspace, organised in **tabs**
- Tabs are **color-coded** and **named**
- Lists can be **stacked vertically** within a board
- Tasks support:
  - Custom colors
  - Checkboxes
  - Description text
  - Due dates
  - Drag and drop reordering

### Graph Editor *(in development)*
- Self-made editor (Excalidraw-inspired, not a dependency)
- Intended use: **mindmaps** for project planning

### UI / Navigation
- Every page (Notation, Kanban, Graph) has a **context-sensitive subbar** relevant to that page
- The Dashboard also has a subbar with workspace-level actions (e.g. invite pop-ups)

### User System
- User accounts with email login
- Users can set a **custom display name** to replace their email wherever their name appears
- Users control what personal information is visible to others

### Sync
- Local Storage in the browser acts as a local cache
- Changes sync up to the server DB
- Server distributes updates to collaborators

---

## Running Locally

Requires **two terminal windows** open simultaneously. Run `npm install` in both folders before starting.

**Terminal 1 — Client**
```bash
cd client
npm install
npm run dev
```

**Terminal 2 — Server**
```bash
cd server
npm install
node server.mjs
```

> Vite is used to bridge TipTap with React on the client side.
