# Test Plan

## Strategy

| Level | Tooling | What it covers |
|---|---|---|
| API integration (automated) | `node:test` + `supertest`, throwaway in-memory MongoDB (`mongodb-memory-server`) per test file | Auth, validation, RBAC, CRUD, Kanban, pagination, search, comments, history, realtime, teams, admin, labels, checklists, notifications, chat over REST and Socket.IO |
| Frontend unit (automated) | Vitest | Date and due-date logic, history parsing, role hierarchy, helpers, API error mapping, @mention parsing, label colours, chat layout (day dividers, "New" line, grouping), link detection |
| Frontend build | `vite build` | Every component compiles |
| Manual / end-to-end | Browser with seeded data | The UI flows below, on desktop and phone widths |

Run everything from the root with `npm test`, or `cd backend && npm test` (43 tests) and `cd frontend && npm test` (19 tests).

## Automated API tests

### `backend/tests/api.test.js` — core flows (14)
| # | Case | Expected |
|---|---|---|
| 1 | First registered user | role = admin; later users = member |
| 2 | Register with bad name / email / password | 400 with field details |
| 3 | Login with correct / wrong password | 200 / 401 |
| 4 | Request without a token | 401 |
| 5 | Create a project | 201, creator is owner |
| 6 | Non-member reads the project | 403 |
| 7 | Viewer reads the project / creates a task | 200 / 403 |
| 8 | Create a task, move it to Review, history logged | 201, status = review, `task.moved` entry |
| 9 | Invalid status / assignee who is not a member | 400 / 400 |
| 10 | Search + pagination + priority filter | total = 5, 2 per page, filter = 1 |
| 11 | Comment as member / viewer | 201 / 403 |
| 12 | Admin bypass and dashboard counts | 200, correct totals |
| 13 | Create a team, add a member, non-lead deletes | 201, 201, 403 |
| 14 | Delete a task as viewer; delete the project as viewer / owner | 403, 403, 204 |

### `backend/tests/features.test.js` — newer features (13)
| # | Case | Expected |
|---|---|---|
| 15 | Live event stream: member vs outsider | Member receives `task.created`; outsider receives nothing |
| 16 | Event stream without a token | 401 |
| 17 | History per changed field | `priority: High → Low`, due date and move entries |
| 18 | `completed_at` | Set on Done, cleared when moved back |
| 19 | Comment permissions | Author edits (marked `updated_at`); others 403; outsider 404; empty body 400; manager deletes |
| 20 | My tasks | Only my tasks, correct tab counts, overdue filter, bad sort 400 |
| 21 | Quick search | Scoped to my projects; wildcards escaped; empty query 400 |
| 22 | Project stats and paginated activity | Totals add up; workload; `limit` respected; outsider 403 |
| 23 | Member changes | Role change and removal recorded; removed member's tasks unassigned; owner can't be removed |
| 24 | Profile | Rename; wrong current password 400; new password works |
| 25 | Admin | Non-admin 403; search; last admin protected; promote works |
| 26 | Team leads | Sole lead can't demote or remove themselves; members can leave; counts update |
| 27 | Malformed JSON | Clean 400 `Malformed JSON body` |

### `backend/tests/collab.test.js` — labels, checklists, notifications (7)
| # | Case | Expected |
|---|---|---|
| 28 | Label permissions | Member creates (201); same name in another case 409; viewer 403; member can't delete (403), manager can (204) |
| 29 | Labels on tasks | Create and update with `labelIds`; history `labels: none → Defect, Design`; `labelId` filter; label from another project 400; deleting a label takes it off tasks |
| 30 | Checklist | Add, tick, rename, remove; `checklist_total` / `checklist_done`; history entries; viewer 403; unknown step 404; empty text 400 |
| 31 | Who gets notified | Added to a project; assigned (not when you assign yourself); comment notifies assignee and creator; `@mention` notifies that member; outsiders are never notified |
| 32 | Read state | Mark one read / unread; mark all read; someone else's notification 404; no token 401 |
| 33 | Live notification push | Only the recipient's event stream receives `{ kind: "notification" }` |
| 34 | Clean-up | Deleting a project removes its notifications; after a task is deleted its notification shows `task: null` |

### `backend/tests/chat.test.js` — project chat (6)
| # | Case | Expected |
|---|---|---|
| 35 | Chat over REST | Member posts (201, trimmed); viewer can read but posting is 403; outsider 403; unknown project 404; empty or > 2000 characters 400; no token 401 |
| 36 | History paging | Oldest first; `before` cursor returns the previous page; `has_more`; `limit` > 100 is 400 |
| 37 | Edit and delete | Author edits (`edited_at` set); others can't edit (403); viewer and outsider can't delete; author and managers can; deleted message 404 |
| 38 | Unread counts | Only other people's messages count; `chat_unread` on the project; read marker never moves back; `last_read_id` returned |
| 39 | Socket.IO | No or bad token refused; outsider can't join; presence lists who joined and updates on leave; messages reach the room (sender gets its `client_id`), never outsiders; viewer send refused; typing reaches others but not the typist; REST posts, edits and deletes are pushed live |
| 41 | Voice messages | Upload as member (201, empty body, waveform clamped to 0–100, `client_id` echoed); appears in history; the audio downloads byte-for-byte with its content type; outsider 403; text message has no audio (404); viewer and outsider can't upload; non-audio type, too long, too short 400; over 3 MB 413; voice can't be edited; deleting the message or the project deletes the audio |
| 42 | Seen by | History returns everyone's read marker (posting counts as reading); reading pushes `chat:seen` to the room; reading the same message again pushes nothing |
| 43 | Removed from chat | Members can't remove people (403); never the owner or yourself (400); non-member 404; a manager can't remove another manager, the owner can; the removed person gets `chat:removed` live, no more messages, 403 on history/posting/socket send, `chat_unread` 0, still a member who can create tasks, not notified by mentions; logged in Activity; added back → `chat:restored` and messages flow again; leaving the project clears the block |
| 40 | Mentions and access | `@mention` creates a `chat` notification (outsiders never); a removed member gets `project:access-lost` and no more messages; deleting the project deletes its chat |

## Manual checklist

**Access**
- [ ] Landing page loads; "Try the demo" and "Get started" go to sign in and register
- [ ] Sign in with a demo account; wrong password shows an error; empty fields show field errors
- [ ] Register a new account; sign out from the user menu

**Dashboard and My tasks**
- [ ] Dashboard numbers match the boards; activity feed links open the task
- [ ] My tasks tabs (Open, Due this week, Overdue, Completed) show the right counts
- [ ] Mark a task done from My tasks, then Undo from the toast

**Board**
- [ ] Drag a card through all four columns; refresh and the order persists
- [ ] Reorder cards inside a column
- [ ] Keyboard: focus a card, Space, arrow keys, Space to drop; Enter opens it
- [ ] Quick add from a column; New task dialog validates an empty title
- [ ] Filter by text, priority and assignee; sort by priority and due date; Clear filters

**List, Overview, Activity**
- [ ] Sort each column; change status and priority inline; change rows per page and page through
- [ ] Overview workload and upcoming deadlines match the board
- [ ] Activity tab paginates and shows before → after changes

**Task panel**
- [ ] Edit title (Escape cancels), status, priority, assignee, due date and description
- [ ] Add, edit and delete a comment; History shows each change
- [ ] Type `@` in a comment: members are suggested, arrows and Enter pick one, the mention is highlighted after posting
- [ ] Add labels from the panel, create a new label by typing its name; the card shows them; filter the board by label
- [ ] Add checklist steps (Enter keeps the cursor in the field), tick and rename them; the card shows `1/3`
- [ ] Copy link opens the same task in a new tab

**Members, settings, teams**
- [ ] Add a member with a role, change the role, remove them (their tasks become unassigned)
- [ ] Rename the project; delete it as owner (managers see the button disabled)
- [ ] Settings → Labels: add, rename, recolour and delete a label (the confirmation says how many tasks use it)
- [ ] Create a team, add and remove members, change roles; the only lead cannot step down
- [ ] Create a project for a team; all team members are added

**Roles**
- [ ] As **victor** (viewer): no New task, no Add task, cards don't drag, task panel is read-only, no Settings tab
- [ ] As **victor**, open a project you're not in: "You don't have access to this project"
- [ ] As **admin**: Users page lists everyone; promote and demote; you can't demote yourself

**Project chat**
- [ ] Chat tab: day dividers, a red "New" line above unread messages, quick follow-ups from the same person grouped
- [ ] Send with Enter, new line with Shift + Enter; `@` suggests members; links are clickable
- [ ] In a second browser as Leo: "Leo is typing…" appears, then the message; the People panel shows Leo online
- [ ] On the Board tab, a new chat message shows a blue count on the Chat tab; opening Chat clears it
- [ ] Edit and delete your own message (hover); as a manager, delete someone else's
- [ ] Voice message: tap the mic (the browser asks for the microphone once); the red dot, timer and live level meter move; others see "… is typing"; Stop shows a preview you can play; Send posts it; Esc or the bin discards it
- [ ] Play a voice message: the waveform fills as it plays, click it to jump, change speed 1× / 1.5× / 2×; starting another one pauses the first
- [ ] Block the microphone in the browser and tap the mic: a clear message explains how to allow it
- [ ] Seen by: when Leo reads the chat, his avatar moves to the last message he saw; your messages get a double tick; click the avatars to see "Seen by" and "Not seen yet"
- [ ] As a manager, People panel → ⋯ on a member → Remove from chat: they move to "Removed from chat"; in their browser the chat locks live ("You were removed from this chat") while the board still works; **Add back** unlocks it live
- [ ] People panel → ⋯ → Remove from project asks for confirmation and removes them from the project entirely
- [ ] A manager doesn't get the ⋯ menu on other managers or the owner; the owner does on managers
- [ ] As **victor** (viewer): the chat is readable, the composer says viewers can't post
- [ ] Stop the API while chatting: the header says "Reconnecting…"; messages sent meanwhile show "Not sent · Retry"

**Appearance**
- [ ] The moon button next to the bell (and the user menu) switches to dark mode; the sun switches back; Profile → Appearance offers Light, Dark and System
- [ ] Reload in dark mode: no white flash; the landing page has its own toggle

**Realtime**
- [ ] Open the same board in two browsers (two accounts); a move in one appears in the other within a second
- [ ] A comment added in one browser appears in the other's open task panel
- [ ] The sidebar shows "Live updates on"
- [ ] As Leo, mention Maya in a comment: Maya gets a toast with **Open**, the bell count and the tab title go up by one
- [ ] With that task already open, Maya gets no toast and the notification is marked read
- [ ] Bell panel: All / Unread, open an item (it becomes read and opens the task), Mark all as read, Show older

**General**
- [ ] Ctrl + K finds projects and tasks; arrows and Enter open a result; Escape closes
- [ ] Press **C** anywhere to create a task (inside a project, the dialog is already set to that project)
- [ ] Phone width (375 px): menu button opens the sidebar; pages fit without sideways scrolling (the board scrolls by design)
- [ ] Swagger UI loads at `/api/docs`; "Authorize" with a token and "Try it out" work
- [ ] No errors in the browser console

## Exit criteria

All automated tests pass, the frontend builds, the manual checklist is complete, and the console has no errors.
