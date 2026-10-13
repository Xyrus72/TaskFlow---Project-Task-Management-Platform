# Product Demo Script (about 8 minutes)

**Setup:** `npm run seed`, then `npm run dev`. Open http://localhost:5173 in one browser window. For the realtime step, open a second private window.

1. **Landing page** — scroll through: the board preview, roles table and API example. Click **Try the demo**.
2. **Sign in** — show the field validation by submitting the empty form, then click the **Maya Manager** demo account.
3. **Dashboard** — open tasks, due this week, overdue and completed this week; status and priority breakdowns; project progress; the live activity feed. Point out "Live updates on" in the sidebar and the red count on the bell (also in the browser tab title).
4. **Notifications** — open the bell: Noah mentioned Maya on *Accessibility review*. Click it: it is marked read and the task opens.
5. **My tasks** — switch between Open, Due this week and Overdue. Tick a task as done, then press **Undo** in the toast.
6. **Board** — open *Website Redesign*. Drag *Homepage hero section* from In Progress to Review, reorder a card inside a column, and quick-add a task at the bottom of To Do. Point out the label chips and the checklist progress (`1/3`) on the cards.
7. **Filters** — search "page", filter priority = High, assignee = Leo, label = Design, then **Clear filters**. Change the sort to Due date.
8. **Task panel** — open a task: change the assignee and due date, add a label (type a new name to create one), tick a checklist step and add another, edit the description. Write a comment that mentions `@Leo`, then open **History** to show before → after values. Press **Copy link**.
9. **List view** — sort by priority, change a status inline, switch to 10 rows per page and page through.
10. **Overview** — completion, workload per person and upcoming deadlines.
11. **Realtime** — in the private window sign in as **leo@taskflow.dev** and open the same board. Move a card as Leo; it moves on Maya's screen within a second. Add a comment as Leo while Maya has that task open. Then, as Leo, mention `@Maya Manager` on a different task: a toast with **Open** pops up for Maya.
12. **Project chat** — as Maya, open the **Chat** tab: unread messages sit under the red "New" line and Zara's mention of Maya is highlighted. As Leo, open the same project's Chat and start typing: Maya sees "Leo is typing…" and Leo shows as online in the People panel. Send replies both ways (mention `@Leo Developer`), then tap the mic, record a few seconds, preview it and send: Leo can play it with the waveform and speed control. Once Leo has read it, his avatar appears under it and your message shows a double tick; click the avatars for "Seen by". Finally, in the People panel open ⋯ on Leo → **Remove from chat**: his window locks the chat live while his board keeps working; **Add back** unlocks it. Switch Maya to the Board and send another message as Leo: the Chat tab shows an unread count.
13. **Members and roles** — Members tab: explain owner, manager, member and viewer. Add Priya as a viewer, make her a member, then remove her.
14. **Settings** — rename, recolour and delete a label; the confirmation says how many tasks use it.
15. **Teams** — open *Product Engineering*, add a member, show that the only lead can't step down, then create a project for the team (everyone joins automatically).
16. **Quick search, shortcuts and dark mode** — press **Ctrl + K**, type "design", and open a task with Enter. Press **C** to open the New task dialog. Then switch to **Dark mode** from the user menu (Profile → Appearance also offers System).
17. **Viewer** — sign out, sign in as **victor@taskflow.dev**. The board is read-only: no New task, cards don't drag, the task panel is locked, and the chat can be read but not posted to. Open */projects/2*: "You don't have access to this project".
18. **Admin** — sign in as **admin@taskflow.dev**, open **Users**, promote someone to admin and back.
19. **API** — open http://localhost:4000/api/docs, click **Authorize** with a token from `POST /auth/login`, run `GET /projects/1/tasks` and `GET /projects/1/messages`. The Socket.IO events are listed at the top of the page.
20. **Database** — open MongoDB Compass (or `mongosh`) on `mongodb://127.0.0.1:27017` and show the `taskflow` database: `users`, `teams` and `projects` with their embedded `members` and `labels`, `tasks` with their `checklist`, `comments`, `activities`, `notifications`, `chatmessages` and `chatreads`. Point out that a project document holds its members, and that every history entry stores the before → after change.
21. **Tests** — run `npm test`: 43 API and Socket.IO tests (each file runs against its own throwaway MongoDB) and 19 frontend unit tests pass.
