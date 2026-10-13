# TaskFlow — Project and Task Management Platform

TaskFlow is a lightweight project management tool for small teams. Teams share projects, each project has a Kanban board (To Do → In Progress → Review → Done), people get a role per project, and everything that changes is recorded and pushed to everyone's screen live.

```
project_and_task_management_Platform/
├── backend/    Node.js + Express 5 REST API · MongoDB (Mongoose) · JWT · Zod · Swagger · Server-Sent Events · Socket.IO
├── frontend/   React 18 + Vite · React Router · Zustand · dnd-kit · Socket.IO client · lucide icons · plain CSS design system (light and dark)
└── docs/       API reference, ER diagram, architecture, test plan, demo script, Git workflow
```

## Features

| Requirement | What you get | Where |
|---|---|---|
| Team and member management | Create teams, add people by search, lead/member roles, leave a team, a team always keeps a lead | **Teams** page, team page |
| Project creation and project-level permissions | Projects optionally belong to a team (its members join automatically); owner / manager / member / viewer per project | **Projects**, project **Members** and **Settings** tabs |
| Tasks with assignee, priority and due date | Create from a dialog, a board column or the **C** shortcut; edit every field inline in the task panel; labels and a checklist of steps per task | Board, task panel |
| Kanban states | Drag and drop between and within the four columns (mouse, touch and keyboard), optimistic updates with rollback | Project **Board** |
| Comments and activity history | Comments you can edit or delete, with `@name` mentions; every change recorded with before → after values; project-wide activity feed | Task panel, project **Activity** tab, dashboard |
| Search, filtering and sorting | Board and list filters (text, priority, assignee, label), sortable list columns, Ctrl + K search across projects and tasks, **My tasks** tabs | Board, List, My tasks, search palette |
| Dashboard with statistics | Open / due-this-week / overdue / completed-this-week, status and priority breakdowns, project progress, workload per person | **Dashboard**, project **Overview** tab |
| Role-based permissions | Enforced on the server for every request; the UI hides what you can't do | Everywhere |
| REST API and documentation | 55 operations plus Socket.IO events, consistent errors and pagination, interactive Swagger UI | `/api/docs`, [docs/API.md](docs/API.md) |
| Real-time project data | Server-Sent Events: boards, dashboards, feeds and open tasks refresh when teammates make changes | "Live updates on" in the sidebar |

### Collaboration features

Kept to what teams use every day in tools like Jira, Asana and Trello:

- **Notifications.** You hear about tasks assigned to you, comments on tasks you created or are assigned to, `@mentions` and being added to a project. There's a bell with an unread count, a panel with All / Unread, a toast when one arrives live, and the count in the browser tab title. Opening one takes you straight to the task. Your own actions never notify you.
- **@mentions.** Type `@` in a comment to pick a project member. Mentions are highlighted and notify that person.
- **Checklists.** Break a task into steps, tick them off, rename or remove them. Progress (`2/5`) shows on board cards and in the list.
- **Project chat.** Every project has a **Chat** tab: a real-time conversation for the whole project over Socket.IO, with **voice messages** (record, preview, send; waveform playback with seeking and 1×/1.5×/2× speed), **seen by** (read receipts with avatars and a who-has-seen-it list), managers and admins can **remove someone from the chat** (they keep the project) or from the project, "is typing…", who's online, an unread count on the tab, a "New" line, `@mentions` that notify, clickable links, editing and deleting. Viewers can read but not post.
- **Labels.** Each project has its own coloured labels (Bug, Design, Blocked…). Create them on the fly from a task, filter the board and list by label, and rename, recolour or delete them in project **Settings**.

Also included: **dark mode** (the moon button next to the bell, or Profile → Appearance: Light, Dark or System), **My tasks** across all projects with one-click done and undo, profile and password change, admin user management, responsive layout down to phone width, loading skeletons, empty states, toasts and confirmation dialogs.

## Tech stack

| Area | What we used | Why |
|---|---|---|
| Frontend framework | **React 18** with **Vite 6** | Component UI with fast dev server, hot reload and route-level code splitting |
| Routing | **React Router 6** | Pages, nested project tabs, deep links like `/projects/1?task=5` |
| State | **Zustand 5** | Small stores for auth, the board, notifications, chat and theme |
| Drag and drop | **dnd-kit** (core, sortable, utilities) | Kanban board with mouse, touch and keyboard support |
| Icons | **lucide-react** | Consistent line icons |
| Styling | **Plain CSS** with design tokens (CSS variables) | One white-and-blue design system with a dark theme, no CSS framework |
| Font | **Plus Jakarta Sans** (Google Fonts) | |
| Backend | **Node.js 20+** and **Express 5** | REST API; async errors reach one error handler |
| Database | **MongoDB** with **Mongoose 9** | Documents with embedded members, labels and checklists |
| Dev database | **mongodb-memory-server** | Embedded MongoDB for `npm run dev` and a throwaway database per test file |
| Validation | **Zod** | Every request body and query checked, with per-field error messages |
| Auth | **JSON Web Tokens** (`jsonwebtoken`) and **bcryptjs** | Stateless sign-in, hashed passwords |
| Permissions | Custom **RBAC** middleware | Owner / manager / member / viewer per project, admin per workspace |
| Realtime updates | **Server-Sent Events** | Boards, dashboards and notifications refresh live |
| Chat | **Socket.IO 4** (server and client) | Messages, typing, presence, read receipts, voice messages |
| Voice messages | Browser **MediaRecorder** and **Web Audio** APIs | Recording, live level meter, waveform |
| API docs | **OpenAPI 3** with **swagger-ui-express** | Interactive docs at `/api/docs` |
| Backend tests | **node:test**, **supertest**, **socket.io-client** | API and live-socket integration tests |
| Frontend tests | **Vitest** | Unit tests for helpers |
| Tooling | **concurrently** | Runs database, API and website with one command |

## Requirements

- **Node.js 20 or newer** (tested on Node 24).
- **MongoDB** — any of these:
  - nothing at all: `npm run dev` starts an embedded MongoDB for development (the first start downloads the official MongoDB server once, about 600 MB);
  - a MongoDB you installed yourself, listening on `localhost:27017`;
  - a hosted database such as MongoDB Atlas: set `MONGODB_URI` (see below).

## Getting started

```bash
npm run setup     # installs root, backend and frontend dependencies
npm run seed      # loads the demo workspace (resets the database)
npm run dev       # MongoDB on :27017, API on http://localhost:4000, app on http://localhost:5173
```

Open **http://localhost:5173**. The sign-in page has one-click demo accounts.

Prefer separate terminals? `cd backend && npm run db` (skip if you have your own MongoDB), `cd backend && npm run dev`, and `cd frontend && npm run dev` (Vite proxies `/api` to port 4000).

### Demo accounts (password `password123`)

| Email | Workspace role | Good for showing |
|---|---|---|
| admin@taskflow.dev | admin | Sees every project, **Users** admin page |
| maya@taskflow.dev | member | Owner of *Website Redesign* and *Mobile App v2*, lead of *Product Engineering* |
| leo@taskflow.dev | member | Manager on *Mobile App v2*, owner of *Internal Tools* |
| zara@taskflow.dev | member | Member on several projects, manager on *Q4 Holiday Campaign* |
| victor@taskflow.dev | member | **Viewer** on *Website Redesign*: everything is read-only |
| noah@taskflow.dev | member | QA member with a mix of tasks |
| priya@taskflow.dev | member | Member on *Q4 Holiday Campaign* |

On a fresh database (no seed), the first account you register becomes the admin.

## Scripts

| Where | Command | Does |
|---|---|---|
| root | `npm run dev` | Runs MongoDB (embedded), API and app together |
| root | `npm test` | Backend + frontend tests |
| root | `npm run build` | Production build of the frontend |
| backend | `npm run db` | Embedded development MongoDB on port 27017 (data in `backend/data/mongo`) |
| backend | `npm run seed` | Reset and load demo data (starts the embedded MongoDB for the duration if none is running) |
| backend | `npm test` | 43 API and Socket.IO integration tests (`node:test` + supertest, throwaway in-memory MongoDB) |
| frontend | `npm test` | 19 unit tests (Vitest) |

## Configuration (backend)

| Variable | Default |
|---|---|
| `PORT` | `4000` |
| `JWT_SECRET` | `dev-secret-change-me` (**set your own in production**) |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/taskflow` (for Atlas: `mongodb+srv://user:password@cluster.mongodb.net/taskflow`) |
| `MONGO_PORT` | `27017` (port used by `npm run db`, and by the default `MONGODB_URI`) |
| `MONGO_DATA_DIR` | `backend/data/mongo` (where `npm run db` keeps its data) |

## Documentation

- [API reference](docs/API.md), plus interactive Swagger UI at http://localhost:4000/api/docs
- [ER diagram](docs/ER_DIAGRAM.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Test plan](docs/TEST_PLAN.md)
- [Product demo script](docs/DEMO.md)
- [Git branching strategy](docs/GIT_WORKFLOW.md)
