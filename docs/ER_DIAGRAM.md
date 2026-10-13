# ER Diagram (MongoDB data model)

TaskFlow stores its data in **MongoDB** through **Mongoose** schemas (`backend/src/models.js`). Ten collections hold the entities. Team and project memberships, a project's labels and a task's checklist are **embedded** in their parent document because they are small and always read together with it.

```mermaid
erDiagram
  USERS ||--o{ TEAM_MEMBER : "is"
  TEAMS ||--|{ TEAM_MEMBER : "embeds members[]"
  TEAMS |o--o{ PROJECTS : groups
  USERS ||--o{ PROJECTS : owns
  USERS ||--o{ PROJECT_MEMBER : "is"
  PROJECTS ||--|{ PROJECT_MEMBER : "embeds members[]"
  PROJECTS ||--o{ TASKS : contains
  USERS |o--o{ TASKS : "assigned to"
  USERS |o--o{ TASKS : creates
  TASKS ||--o{ COMMENTS : has
  USERS |o--o{ COMMENTS : writes
  PROJECTS ||--o{ ACTIVITIES : logs
  TASKS |o--o{ ACTIVITIES : "history of"
  USERS |o--o{ ACTIVITIES : performs
  PROJECTS ||--o{ LABEL : "embeds labels[]"
  TASKS }o--o{ LABEL : "tagged with labelIds[]"
  TASKS ||--o{ CHECKLIST_ITEM : "embeds checklist[]"
  USERS ||--o{ NOTIFICATIONS : receives
  USERS |o--o{ NOTIFICATIONS : "caused by (actor)"
  PROJECTS ||--o{ NOTIFICATIONS : about
  TASKS |o--o{ NOTIFICATIONS : about
  PROJECTS ||--o{ CHAT_MESSAGES : "has a chat"
  USERS ||--o{ CHAT_MESSAGES : writes
  CHAT_MESSAGES ||--o| VOICE_CLIPS : "audio of a voice message"
  USERS ||--o{ CHAT_READS : "has read up to"
  PROJECTS ||--o{ CHAT_READS : tracks

  USERS {
    number _id PK
    string name
    string email UK "unique index, lowercase"
    string passwordHash "bcrypt"
    string role "admin | member"
    date createdAt
  }
  TEAMS {
    number _id PK
    string name
    string description
    number createdBy FK
    date createdAt
    array members "embedded TEAM_MEMBER[]"
  }
  TEAM_MEMBER {
    number userId FK
    string role "lead | member"
  }
  PROJECTS {
    number _id PK
    string name
    string description
    number teamId FK "nullable"
    number ownerId FK
    date createdAt
    array members "embedded PROJECT_MEMBER[]"
    array labels "embedded LABEL[]"
    array chatBlocked "user ids removed from the project chat"
  }
  LABEL {
    number id "unique within the project"
    string name "max 30, unique per project"
    string color "gray | red | orange | amber | green | teal | blue | purple | pink"
  }
  PROJECT_MEMBER {
    number userId FK
    string role "owner | manager | member | viewer"
  }
  TASKS {
    number _id PK
    number projectId FK
    string title
    string description
    string status "todo | in_progress | review | done"
    string priority "low | medium | high | urgent"
    number assigneeId FK "nullable"
    string dueDate "YYYY-MM-DD, nullable"
    number position "order within a column"
    number createdBy FK
    date createdAt
    date updatedAt
    date completedAt "set when status becomes done"
    array labelIds "ids of the project's labels"
    array checklist "embedded CHECKLIST_ITEM[]"
  }
  CHECKLIST_ITEM {
    number id
    string text "max 200"
    boolean done
  }
  COMMENTS {
    number _id PK
    number taskId FK
    number projectId FK "denormalised for permission checks"
    number userId FK
    string body
    date createdAt
    date updatedAt "set when edited"
  }
  ACTIVITIES {
    number _id PK
    number projectId FK
    number taskId FK "nullable"
    number userId FK
    string action "e.g. task.moved"
    string details "e.g. priority: Medium → High"
    date createdAt
  }
  CHAT_MESSAGES {
    number _id PK
    number projectId FK
    number userId FK
    string body "max 2000, empty for voice"
    object voice "nullable: mime, duration, size, waveform[]"
    date createdAt
    date editedAt "nullable"
  }
  VOICE_CLIPS {
    number _id PK "= the message id"
    number projectId FK
    string mime "audio/webm, audio/ogg, audio/mp4 …"
    binary data "the recording, max 3 MB"
  }
  CHAT_READS {
    string _id PK "projectId:userId"
    number projectId FK
    number userId FK
    number lastReadId "newest message read"
  }
  NOTIFICATIONS {
    number _id PK
    number userId FK "recipient"
    number actorId FK "who caused it"
    string type "assigned | comment | mention | added | chat"
    number projectId FK
    number taskId FK "nullable"
    string text "comment text, task title or project name"
    date readAt "null while unread"
    date createdAt
  }
```

An eleventh collection, `counters`, issues the numeric ids (`{ _id: "tasks", seq: 34 }`), including the ids of labels and checklist items.

## Design notes

- **Readable numeric ids.** Documents use small sequential numbers as `_id` (issued atomically by the `counters` collection) rather than ObjectIds, so URLs stay short (`/projects/1?task=12`) and the API is identical to the earlier SQL version.
- **Embedded vs referenced.** Memberships, labels (≤ 30 per project) and checklist steps (≤ 50 per task) are small, bounded and always needed with their parent, so they are embedded. Adding a project and its members is one atomic write, and loading a board needs no extra queries for labels or checklist progress. Tasks, comments, activity entries, notifications and chat messages grow without limit and are paginated, so they live in their own collections and reference their project.
- **Two levels of roles.** `users.role` is the workspace role (admins bypass project checks). `teams.members[].role` controls who manages a team. `projects.members[].role` controls what someone can do inside one project.
- **Validation.** Mongoose schemas enforce required fields, lengths and enum values (status, priority, roles). Zod validates the same rules at the API boundary and returns per-field messages.
- **Deletes.** MongoDB has no foreign keys, so the API removes dependants explicitly. Deleting a project removes its tasks, comments, activity, notifications and chat. Deleting a label takes it off every task (`$pull`). Deleting a team keeps its projects (`teamId` becomes `null`). Deleting a task removes its comments and keeps its history entries with `taskId: null`, so the project feed still shows "deleted …". Notifications about a deleted task stay readable and show the task as gone. Removing someone from a project unassigns their tasks there.
- **Ordering.** `position` is a fractional number, so a card can be placed between two others by taking the midpoint, without renumbering the column.
- **History.** Every change writes one `activities` document per changed field, with before and after values in `details`, and publishes a realtime event.
- **Seen by** reuses the chat read markers: a message has been seen by everyone whose `lastReadId` is at least its id, so no per-message receipt documents are needed. **Removed from chat** is a list of user ids on the project (`chatBlocked`), cleared when someone leaves the project.
- **Voice messages** keep their audio in a separate `voice_clips` document (same id as the message), so loading chat history never pulls megabytes of audio; only the duration and a 40-bar waveform travel with the message. The audio is downloaded once, when someone presses play.
- **Chat read markers** (`chat_reads`) store one number per person and project, the newest message they've read, so the unread badge is a single count query (`_id > lastReadId` and not written by you). Markers only move forward (`$max`). Chat history is paged with an id cursor (`before`) rather than page numbers, so new messages arriving don't shift older pages.
- **Notifications** are written for the recipient only (never the actor), and only for people who are still project members. A label or member can't be added twice even under concurrent requests: the update itself carries the condition (`labels: { $not: { $elemMatch: … } }`).
- **Indexes.** `users.email` (unique); `teams.members.userId` and `projects.members.userId` (membership lookups); `projects.teamId`; `tasks(projectId, status, position)` for boards; `tasks(assigneeId, status)` for My tasks; `comments(taskId)`; `activities(projectId, createdAt)` and `activities(taskId, createdAt)` for feeds; `notifications(userId, createdAt)` and `notifications(userId, readAt)` for the bell; `chatmessages(projectId, _id)` for chat history and unread counts.
