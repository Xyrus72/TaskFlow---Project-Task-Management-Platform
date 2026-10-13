# API Reference

Interactive docs (Swagger UI): **http://localhost:4000/api/docs** · raw OpenAPI 3 spec: `/api/openapi.json`

Base URL: `/api` · Auth: `Authorization: Bearer <JWT>` on every route except `/auth/register`, `/auth/login`, `/health`, the docs, and `/events` (which takes `?token=`).

## Conventions

- JSON in and out. Ids are numbers. Due dates are `YYYY-MM-DD`; timestamps are ISO 8601 in UTC (`2026-10-06T14:03:11.000Z`).
- **Errors:** `{ "error": "message", "details": { "field": ["message", ...] } }`. `details` is present for validation errors.
- **Status codes:** `400` validation or rule violation · `401` missing or invalid token · `403` role does not allow it · `404` not found · `409` conflict (duplicate email or label name).
- **Pagination:** list endpoints return `{ "data": [...], "pagination": { "page", "limit", "total", "pages" } }` and accept `page` and `limit`.
- **Search** is case-insensitive and matches the text literally (special characters such as `%`, `.` or `*` have no special meaning).

## Roles (RBAC)

| Permission | Minimum project role |
|---|---|
| Read a project, its tasks, comments, history, stats | viewer |
| Create / update / move tasks, comment, post in the project chat, edit checklists, create and edit labels | member |
| Delete tasks, edit the project, manage members, delete labels, delete anyone's chat messages | manager |
| Delete the project | owner |

Workspace `admin` users are treated as owner on every project. Team management needs the team `lead` role (or admin). Members can edit or delete **their own** comments; managers can delete anyone's.

## Endpoints

### Auth and profile
| Method | Path | Body / query | Notes |
|---|---|---|---|
| POST | /auth/register | `name`, `email`, `password` (≥ 6) | First user becomes admin. `201 { token, user }` |
| POST | /auth/login | `email`, `password` | `200 { token, user }` |
| GET | /auth/me | | Current user |
| PATCH | /auth/me | `name` | Rename yourself |
| POST | /auth/password | `currentPassword`, `newPassword` | `204`; `400` if the current password is wrong |

### Dashboard and search
| Method | Path | Notes |
|---|---|---|
| GET | /dashboard | `totals` (projects, teams, tasks, open, completed, overdue, dueSoon, completedThisWeek, myOpen), `byStatus`, `byPriority` (open only), `myTasks`, `projectProgress`, `activity` |
| GET | /search?q= | `{ projects, tasks }` limited to what you can access |

### Users and teams
| Method | Path | Who |
|---|---|---|
| GET | /users?search= | Anyone (directory for pickers) |
| GET | /teams | Your teams (admins see all), with `member_count`, `project_count`, `my_role` |
| POST | /teams | Anyone; you become lead |
| GET | /teams/:id | Members; includes `members`, `projects`, `can_manage` |
| PATCH | /teams/:id | Lead |
| DELETE | /teams/:id | Lead. Projects stay, without a team |
| POST | /teams/:id/members `{ userId, role }` | Lead. Adds, or changes the role if already a member |
| PATCH | /teams/:id/members/:userId `{ role }` | Lead. A team always keeps at least one lead |
| DELETE | /teams/:id/members/:userId | Lead, or yourself to leave |

### Projects and members
| Method | Path | Who |
|---|---|---|
| GET | /projects?search=&teamId=&sort=name\|created_at\|task_count\|progress&order=&page=&limit= | Paginated; projects you belong to (admins: all) |
| POST | /projects `{ name, description?, teamId? }` | Anyone; you become owner; team members join as members |
| GET | /projects/:id | viewer+. Includes `members`, `labels`, `my_role`, task counts, `chat_unread` and `chat_blocked` (people removed from the chat) |
| PATCH | /projects/:id `{ name?, description?, teamId? }` | manager+. Changes are written to history |
| DELETE | /projects/:id | owner |
| GET | /projects/:id/members | viewer+ |
| POST | /projects/:id/members `{ userId, role }` | manager+. Adds (`201`) or changes role (`200`). The owner's role is fixed |
| DELETE | /projects/:id/members/:userId | manager+. Their open tasks become unassigned |
| GET | /projects/:id/activity?page=&limit= | viewer+. Paginated, newest first |
| GET | /projects/:id/stats | viewer+. Totals, status and priority breakdown, workload per person, upcoming deadlines |

### Labels
| Method | Path | Who |
|---|---|---|
| GET | /projects/:id/labels | viewer+. `{ id, name, color, task_count }` in creation order |
| POST | /projects/:id/labels `{ name, color? }` | member+. Name ≤ 30 characters and unique in the project (case-insensitive, `409` otherwise); at most 30 labels. `color` is one of `gray`, `red`, `orange`, `amber`, `green`, `teal`, `blue`, `purple`, `pink` |
| PATCH | /projects/:id/labels/:labelId `{ name?, color? }` | member+ |
| DELETE | /projects/:id/labels/:labelId | manager+. The label is taken off every task |

### Tasks
| Method | Path | Who |
|---|---|---|
| GET | /projects/:id/tasks | viewer+. Query: `search`, `status`, `priority`, `assigneeId` (`0` = unassigned), `labelId`, `due` (`overdue`\|`week`\|`none`), `sort` (`position`, `created_at`, `updated_at`, `due_date`, `priority`, `title`, `status`, `assignee`), `order`, `page`, `limit` (≤ 500) |
| POST | /projects/:id/tasks `{ title, description?, status?, priority?, assigneeId?, dueDate?, labelIds? }` | member+. The assignee must be a project member; labels must belong to the project (≤ 10) |
| GET | /tasks/mine | Your assigned tasks across projects. Query: `status` (`open` default, `all`, or a status), `search`, `priority`, `due`, `sort` (`due_date`, `priority`, `updated_at`, `created_at`, `title`, `project`, `status`), `page`, `limit`. Adds `counts: { open, overdue, week, done }` |
| GET | /tasks/:id | viewer+. Adds `my_role`, `can_edit`, `can_delete`, `can_comment` |
| PATCH | /tasks/:id | member+. Any task field plus `position` and `labelIds`. Each changed field gets its own history entry; reaching **Done** sets `completed_at` |
| DELETE | /tasks/:id | manager+ |

Every task includes `label_ids`, `labels` (`{ id, name, color }`), `checklist` (`{ id, text, done }`), `checklist_total` and `checklist_done`.

### Checklist
| Method | Path | Who |
|---|---|---|
| POST | /tasks/:id/checklist `{ text }` | member+. At most 50 steps of ≤ 200 characters. `201` with the updated task |
| PATCH | /tasks/:id/checklist/:itemId `{ text?, done? }` | member+. Returns the updated task. Ticking a step off is written to the history |
| DELETE | /tasks/:id/checklist/:itemId | member+. Returns the updated task |

### Comments and history
| Method | Path | Who |
|---|---|---|
| GET | /tasks/:id/comments | viewer+ |
| POST | /tasks/:id/comments `{ body }` | member+. `@Full Name` mentions of project members notify them |
| PATCH | /comments/:id `{ body }` | The author |
| DELETE | /comments/:id | The author, or manager+ |
| GET | /tasks/:id/activity | viewer+. History of one task, newest first |

History `action` values: `project.created`, `project.updated`, `task.created`, `task.moved`, `task.assigned`, `task.updated`, `task.deleted`, `comment.added`, `comment.edited`, `comment.deleted`, `checklist.added`, `checklist.completed`, `checklist.removed`, `member.added`, `member.role_changed`, `member.removed`, `member.chat_removed`, `member.chat_restored`. Field changes use the `details` format `field: before → after`, for example `priority: Medium → High`.

### Project chat
| Method | Path | Who |
|---|---|---|
| GET | /projects/:id/messages?before=&limit= | viewer+. Oldest first, `limit` ≤ 100 (default 50). Pass the oldest id you have as `before` to load older messages. Returns `{ data, has_more, last_read_id, reads }`, where `reads` maps each user id to the newest message they've seen (for "Seen by") |
| POST | /projects/:id/messages `{ body, clientId? }` | member+ (viewers can read but not post). `body` ≤ 2000 characters. `@Full Name` mentions send a `chat` notification. `201` with the message |
| POST | /projects/:id/messages/voice?duration=&waveform=&clientId= | member+. Voice message: the request body is the raw recording (`Content-Type: audio/webm`, `audio/ogg`, `audio/mp4`, `audio/mpeg`, `audio/aac` or `audio/wav`), up to 3 MB (`413` above) and 2 minutes. `waveform` is up to 64 comma-separated levels 0–100. `201` with the message |
| GET | /messages/:id/audio | viewer+. The recording, with its original content type |
| POST | /projects/:id/messages/read `{ messageId }` | viewer+. Moves your read marker forward (never back). Returns `{ unread }` |
| POST | /projects/:id/chat/removed `{ userId }` | manager+. Removes a member from the chat only: they keep the project and its tasks but get `403` on every chat endpoint and stop receiving chat events. The owner can't be removed; only the owner (or an admin) can remove a manager; not yourself. Logged as `member.chat_removed` |
| DELETE | /projects/:id/chat/removed/:userId | Same rules. Adds them back (`member.chat_restored`) |
| PATCH | /messages/:id `{ body }` | The author. Sets `edited_at`. Voice messages can't be edited |
| DELETE | /messages/:id | The author, or manager+ |

A message is `{ id, project_id, user: { id, name }, body, voice, created_at, edited_at }`. `voice` is `null` for text, or `{ duration, waveform, mime, size, url }` for a voice message (then `body` is empty). Every change is pushed live to everyone who has the project open.

#### Socket.IO events

Connect to the API host with `io({ auth: { token: "<JWT>" } })` (the dev server proxies `/socket.io`). A connection without a valid token is refused.

| Direction | Event | Payload | Notes |
|---|---|---|---|
| client → server | `project:join` | `projectId`, ack | viewer+. Ack `{ ok, role }` or `{ error }`. The web app joins while a project page is open, on any tab |
| client → server | `project:leave` | `projectId` | |
| client → server | `chat:send` | `{ projectId, body, clientId }`, ack | Same rules as `POST /projects/:id/messages`. Ack `{ message }` or `{ error, details }` |
| client → server | `chat:typing` | `{ projectId }` | Sent at most every few seconds while typing |
| client → server | `chat:read` | `{ projectId, messageId }`, ack | Ack `{ unread }` |
| server → client | `chat:message` | message (+ `client_id` for the sender) | New message in a joined project |
| server → client | `chat:updated` / `chat:deleted` | message / `{ id, project_id }` | |
| server → client | `chat:typing` | `{ projectId, user: { id, name } }` | Sent to everyone except the person typing |
| server → client | `chat:seen` | `{ projectId, userId, last_read_id }` | Someone's read marker moved forward; update "Seen by" |
| server → client | `chat:removed` / `chat:restored` | `{ projectId }` | A manager removed you from this chat, or added you back. Your open tabs leave or rejoin the room automatically |
| server → client | `presence` | `{ projectId, userIds }` | Who has the project open, sent whenever someone joins or leaves |
| server → client | `project:access-lost` | `{ projectId }` | You were removed from the project (or it was deleted) and have left its room |

### Notifications
| Method | Path | Notes |
|---|---|---|
| GET | /notifications?unread=&page=&limit= | Yours, newest first (`limit` ≤ 50). Adds `unread_count`. Each item: `{ id, type, read, text, actor, project, task, created_at }` |
| POST | /notifications/read-all | Marks all of yours as read |
| PATCH | /notifications/:id `{ read }` | Mark one as read or unread. `404` if it isn't yours |

`type` is `assigned` (someone assigned you a task), `comment` (a comment on a task you created or are assigned to), `mention` (`@Your Name` in a comment), `chat` (`@Your Name` in a project chat) or `added` (you were added to a project). Only current project members (and admins) are notified, never the person who made the change. `task` is `null` for `added` and `chat`, or once the task has been deleted.

### Realtime
| Method | Path | Notes |
|---|---|---|
| GET | /events?token=JWT | Server-Sent Events. Project changes arrive as `{ projectId, taskId, userId, action, at }`, sent only to people who can see that project; new notifications as `{ kind: "notification", userId, at }`, sent only to that person. The browser reconnects automatically |

### Admin
| Method | Path | Who |
|---|---|---|
| GET | /admin/users?search=&page=&limit= | Admin. Users with team, project and open-task counts |
| PATCH | /admin/users/:id `{ role }` | Admin. The last admin cannot be demoted |

## Example

```http
GET /api/projects/1/tasks?status=in_progress&sort=priority&order=desc
Authorization: Bearer eyJhbGciOi...
```

```json
{
  "data": [
    {
      "id": 1,
      "title": "Homepage hero section",
      "status": "in_progress",
      "priority": "urgent",
      "assignee_id": 3,
      "assignee_name": "Leo Developer",
      "due_date": "2026-10-07",
      "comment_count": 3,
      "label_ids": [2, 3],
      "labels": [{ "id": 2, "name": "Design", "color": "purple" }, { "id": 3, "name": "Frontend", "color": "blue" }],
      "checklist": [{ "id": 4, "text": "Desktop layout", "done": true }, { "id": 5, "text": "Mobile layout", "done": false }],
      "checklist_total": 2,
      "checklist_done": 1,
      "project_name": "Website Redesign"
    }
  ],
  "pagination": { "page": 1, "limit": 100, "total": 2, "pages": 1 }
}
```
