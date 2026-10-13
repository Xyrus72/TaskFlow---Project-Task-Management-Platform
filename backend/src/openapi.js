// OpenAPI 3 specification served at /api/docs (Swagger UI) and /api/openapi.json
const ref = (n) => ({ $ref: `#/components/schemas/${n}` });
const json = (schema) => ({ content: { 'application/json': { schema } } });
const body = (schema) => ({ required: true, ...json(schema) });
const idParam = (name, description) => ({ name, in: 'path', required: true, schema: { type: 'integer' }, description });
const q = (name, schema, description) => ({ name, in: 'query', schema, description });
const ok = (schema, d = 'OK') => ({ description: d, ...json(schema) });
const list = (item) => ({ type: 'object', properties: { data: { type: 'array', items: ref(item) } } });
const paged = (item) => ({ type: 'object', properties: { data: { type: 'array', items: ref(item) }, pagination: ref('Pagination') } });
const err = (d) => ({ description: d, ...json(ref('Error')) });
const E = {
  400: err('Validation failed — `details` maps each field to its messages'),
  401: err('Missing or invalid token'),
  403: err('Your role does not allow this (RBAC)'),
  404: err('Not found'),
};
const errs = (...codes) => Object.fromEntries(codes.map((c) => [c, E[c]]));
const none = { 204: { description: 'No content' } };

const STATUS = { type: 'string', enum: ['todo', 'in_progress', 'review', 'done'] };
const PRIORITY = { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] };
const COLOR = { type: 'string', enum: ['gray', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'purple', 'pink'] };
const LABEL_IDS = { type: 'array', maxItems: 10, items: { type: 'integer' }, description: 'Label ids from this project' };
const pageParams = [q('page', { type: 'integer', minimum: 1, default: 1 }), q('limit', { type: 'integer', minimum: 1 }, 'Page size')];
const taskFilters = [
  q('search', { type: 'string' }, 'Matches title or description'),
  q('priority', PRIORITY),
  q('labelId', { type: 'integer' }, 'Only tasks with this label'),
  q('due', { type: 'string', enum: ['overdue', 'week', 'none'] }, 'overdue = past due and not done; week = due in the next 7 days; none = no due date'),
  q('order', { type: 'string', enum: ['asc', 'desc'], default: 'asc' }),
];

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'TaskFlow API',
    version: '2.0.0',
    description: `REST API for the TaskFlow project and task management platform.

**Authentication** — get a JWT from \`POST /auth/login\` (demo: \`admin@taskflow.dev\` / \`password123\`) and send \`Authorization: Bearer <token>\`. Click **Authorize** above to try requests here.

**Roles (RBAC)** — project roles are \`viewer\` (read) < \`member\` (create/update tasks, comment) < \`manager\` (delete tasks, manage members, edit project) < \`owner\` (delete project). Team roles are \`lead\` and \`member\`. Global \`admin\` users bypass project checks.

**Errors** — \`{ "error": "message", "details": { "field": ["message"] } }\`.

**Pagination** — list endpoints return \`{ data: [...], pagination: { page, limit, total, pages } }\`.

**Realtime** — \`GET /events?token=<jwt>\` is a Server-Sent Events stream. Each message is \`{ projectId, taskId, userId, action, at }\` for projects you can see, or \`{ kind: "notification", userId, at }\` when you get a new notification.

**Project chat (Socket.IO)** — connect with \`io({ auth: { token } })\` on the same host. Client → server: \`project:join\` (projectId, ack), \`project:leave\`, \`chat:send\` ({ projectId, body, clientId }, ack → \`{ message }\` or \`{ error }\`), \`chat:typing\` ({ projectId }), \`chat:read\` ({ projectId, messageId }, ack → \`{ unread }\`). Server → client: \`chat:message\`, \`chat:updated\`, \`chat:deleted\`, \`chat:typing\`, \`chat:seen\` ({ projectId, userId, last_read_id }), \`chat:removed\` / \`chat:restored\` ({ projectId }), \`presence\` ({ projectId, userIds }), \`project:access-lost\`. The REST endpoints under **Chat** use the same rules and also push to connected clients.

**Notifications** — you are notified when someone assigns you a task, comments on a task you created or are assigned to, mentions you in a comment (\`@Full Name\`) or adds you to a project. Your own actions never notify you.`,
  },
  servers: [{ url: '/api' }],
  security: [{ bearer: [] }],
  tags: ['Auth', 'Dashboard', 'Search', 'Teams', 'Users', 'Projects', 'Members', 'Tasks', 'Labels', 'Checklist', 'Comments', 'Chat', 'Notifications', 'Activity', 'Realtime', 'Admin'].map((name) => ({ name })),
  components: {
    securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Error: { type: 'object', properties: { error: { type: 'string' }, details: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } } } },
      User: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' }, email: { type: 'string' }, role: { type: 'string', enum: ['admin', 'member'] }, created_at: { type: 'string' } } },
      AdminUser: { allOf: [ref('User'), { type: 'object', properties: { team_count: { type: 'integer' }, project_count: { type: 'integer' }, open_tasks: { type: 'integer' } } }] },
      AuthResponse: { type: 'object', properties: { token: { type: 'string' }, user: ref('User') } },
      Pagination: { type: 'object', properties: { page: { type: 'integer' }, limit: { type: 'integer' }, total: { type: 'integer' }, pages: { type: 'integer' } } },
      Member: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' }, email: { type: 'string' }, role: { type: 'string' } } },
      Team: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, name: { type: 'string' }, description: { type: 'string' },
          member_count: { type: 'integer' }, project_count: { type: 'integer' }, my_role: { type: 'string', enum: ['lead', 'member'], nullable: true },
          can_manage: { type: 'boolean' }, members: { type: 'array', items: ref('Member') },
          projects: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' }, task_count: { type: 'integer' }, done_count: { type: 'integer' } } } },
        },
      },
      Project: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, name: { type: 'string' }, description: { type: 'string' },
          team_id: { type: 'integer', nullable: true }, team_name: { type: 'string', nullable: true },
          owner_id: { type: 'integer' }, owner_name: { type: 'string' },
          task_count: { type: 'integer' }, done_count: { type: 'integer' }, overdue_count: { type: 'integer' }, member_count: { type: 'integer' },
          my_role: { type: 'string', enum: ['owner', 'manager', 'member', 'viewer'] }, members: { type: 'array', items: ref('Member') },
          labels: { type: 'array', items: ref('Label') },
          chat_unread: { type: 'integer', description: 'Chat messages from other people you have not read yet' },
          chat_blocked: { type: 'array', items: { type: 'integer' }, description: 'Members a manager removed from the project chat' },
        },
      },
      ChatMessage: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, project_id: { type: 'integer' },
          user: { type: 'object', nullable: true, properties: { id: { type: 'integer' }, name: { type: 'string' } } },
          body: { type: 'string', maxLength: 2000 }, created_at: { type: 'string' }, edited_at: { type: 'string', nullable: true },
          client_id: { type: 'string', description: 'Echo of the clientId you sent, so you can replace your optimistic copy' },
          voice: {
            type: 'object', nullable: true, description: 'Set for voice messages (body is then empty)',
            properties: { duration: { type: 'number' }, waveform: { type: 'array', items: { type: 'integer' } }, mime: { type: 'string' }, size: { type: 'integer' }, url: { type: 'string', example: '/api/messages/42/audio' } },
          },
        },
      },
      Label: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string', maxLength: 30 }, color: COLOR, task_count: { type: 'integer', description: 'Only in GET /projects/{projectId}/labels' } } },
      ChecklistItem: { type: 'object', properties: { id: { type: 'integer' }, text: { type: 'string', maxLength: 200 }, done: { type: 'boolean' } } },
      Notification: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, type: { type: 'string', enum: ['assigned', 'comment', 'mention', 'added', 'chat'], description: 'chat = you were @mentioned in a project chat' }, read: { type: 'boolean' },
          text: { type: 'string', description: 'Comment text for comment/mention, task title for assigned, project name for added' },
          actor: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' } } },
          project: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' } } },
          task: { type: 'object', nullable: true, description: 'null for "added" or when the task was deleted', properties: { id: { type: 'integer' }, title: { type: 'string' } } },
          created_at: { type: 'string' },
        },
      },
      Task: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, project_id: { type: 'integer' }, project_name: { type: 'string' },
          title: { type: 'string' }, description: { type: 'string' }, status: STATUS, priority: PRIORITY,
          assignee_id: { type: 'integer', nullable: true }, assignee_name: { type: 'string', nullable: true },
          due_date: { type: 'string', format: 'date', nullable: true }, position: { type: 'number' },
          comment_count: { type: 'integer' }, created_by: { type: 'integer' }, creator_name: { type: 'string' },
          label_ids: { type: 'array', items: { type: 'integer' } }, labels: { type: 'array', items: ref('Label') },
          checklist: { type: 'array', items: ref('ChecklistItem') }, checklist_total: { type: 'integer' }, checklist_done: { type: 'integer' },
          created_at: { type: 'string' }, updated_at: { type: 'string' }, completed_at: { type: 'string', nullable: true },
        },
      },
      TaskInput: {
        type: 'object', required: ['title'],
        properties: { title: { type: 'string', maxLength: 200 }, description: { type: 'string' }, status: STATUS, priority: PRIORITY, assigneeId: { type: 'integer', nullable: true }, dueDate: { type: 'string', example: '2026-12-31', nullable: true }, labelIds: LABEL_IDS },
      },
      TaskUpdate: {
        type: 'object', description: 'Send only the fields you want to change. Changing status or position moves the card on the board.',
        properties: { title: { type: 'string' }, description: { type: 'string' }, status: STATUS, priority: PRIORITY, assigneeId: { type: 'integer', nullable: true }, dueDate: { type: 'string', nullable: true }, position: { type: 'number' }, labelIds: LABEL_IDS },
      },
      Comment: { type: 'object', properties: { id: { type: 'integer' }, task_id: { type: 'integer' }, user_id: { type: 'integer' }, user_name: { type: 'string' }, body: { type: 'string' }, created_at: { type: 'string' }, updated_at: { type: 'string', nullable: true } } },
      Activity: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, project_id: { type: 'integer' }, task_id: { type: 'integer', nullable: true }, task_title: { type: 'string', nullable: true },
          action: { type: 'string', example: 'task.updated', description: 'project.created|updated, task.created|moved|assigned|updated|deleted, comment.added|edited|deleted, checklist.added|completed|removed, member.added|role_changed|removed' },
          details: { type: 'string', example: 'priority: Medium → High' }, user_name: { type: 'string' }, created_at: { type: 'string' },
        },
      },
      Stats: {
        type: 'object',
        properties: {
          totals: { type: 'object', properties: { tasks: { type: 'integer' }, open: { type: 'integer' }, completed: { type: 'integer' }, overdue: { type: 'integer' }, dueSoon: { type: 'integer' }, completedThisWeek: { type: 'integer' } } },
          byStatus: { type: 'object', additionalProperties: { type: 'integer' } },
          byPriority: { type: 'object', additionalProperties: { type: 'integer' }, description: 'Open tasks only' },
        },
      },
    },
  },
  paths: {
    '/auth/register': { post: { tags: ['Auth'], security: [], summary: 'Create an account (the first user becomes admin)', requestBody: body({ type: 'object', required: ['name', 'email', 'password'], properties: { name: { type: 'string' }, email: { type: 'string' }, password: { type: 'string', minLength: 6 } } }), responses: { 201: ok(ref('AuthResponse'), 'Created'), 409: err('Email already registered'), ...errs(400) } } },
    '/auth/login': { post: { tags: ['Auth'], security: [], summary: 'Sign in', requestBody: body({ type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', example: 'admin@taskflow.dev' }, password: { type: 'string', example: 'password123' } } }), responses: { 200: ok(ref('AuthResponse')), ...errs(400, 401) } } },
    '/auth/me': {
      get: { tags: ['Auth'], summary: 'Current user', responses: { 200: ok({ type: 'object', properties: { user: ref('User') } }), ...errs(401) } },
      patch: { tags: ['Auth'], summary: 'Update your name', requestBody: body({ type: 'object', required: ['name'], properties: { name: { type: 'string' } } }), responses: { 200: ok({ type: 'object', properties: { user: ref('User') } }), ...errs(400, 401) } },
    },
    '/auth/password': { post: { tags: ['Auth'], summary: 'Change your password', requestBody: body({ type: 'object', required: ['currentPassword', 'newPassword'], properties: { currentPassword: { type: 'string' }, newPassword: { type: 'string', minLength: 6 } } }), responses: { ...none, ...errs(400, 401) } } },

    '/dashboard': { get: { tags: ['Dashboard'], summary: 'Workspace statistics, your open tasks, project progress and recent activity', responses: { 200: ok({ allOf: [ref('Stats'), { type: 'object', properties: { myTasks: { type: 'array', items: ref('Task') }, projectProgress: { type: 'array', items: { type: 'object' } }, activity: { type: 'array', items: ref('Activity') } } }] }), ...errs(401) } } },
    '/search': { get: { tags: ['Search'], summary: 'Search projects and tasks you can access', parameters: [q('q', { type: 'string' }, 'Search text (required)')], responses: { 200: ok({ type: 'object', properties: { projects: { type: 'array', items: ref('Project') }, tasks: { type: 'array', items: ref('Task') } } }), ...errs(400, 401) } } },
    '/users': { get: { tags: ['Users'], summary: 'User directory (for member and assignee pickers)', parameters: [q('search', { type: 'string' })], responses: { 200: ok(list('User')), ...errs(401) } } },

    '/teams': {
      get: { tags: ['Teams'], summary: 'List your teams (admins see all)', responses: { 200: ok(list('Team')), ...errs(401) } },
      post: { tags: ['Teams'], summary: 'Create a team (you become its lead)', requestBody: body({ type: 'object', required: ['name'], properties: { name: { type: 'string' }, description: { type: 'string' } } }), responses: { 201: ok(ref('Team'), 'Created'), ...errs(400, 401) } },
    },
    '/teams/{id}': {
      get: { tags: ['Teams'], parameters: [idParam('id')], summary: 'Team with members and projects', responses: { 200: ok(ref('Team')), ...errs(401, 403, 404) } },
      patch: { tags: ['Teams'], parameters: [idParam('id')], summary: 'Rename or describe a team (lead)', requestBody: body({ type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } } }), responses: { 200: ok(ref('Team')), ...errs(400, 401, 403, 404) } },
      delete: { tags: ['Teams'], parameters: [idParam('id')], summary: 'Delete a team (lead). Its projects are kept without a team.', responses: { ...none, ...errs(401, 403, 404) } },
    },
    '/teams/{id}/members': { post: { tags: ['Teams'], parameters: [idParam('id')], summary: 'Add a member or change their role (lead)', requestBody: body({ type: 'object', required: ['userId'], properties: { userId: { type: 'integer' }, role: { type: 'string', enum: ['lead', 'member'] } } }), responses: { 200: ok(ref('Team'), 'Role changed'), 201: ok(ref('Team'), 'Member added'), ...errs(400, 401, 403, 404) } } },
    '/teams/{id}/members/{userId}': {
      patch: { tags: ['Teams'], parameters: [idParam('id'), idParam('userId')], summary: 'Change a member’s team role (lead). A team always keeps one lead.', requestBody: body({ type: 'object', required: ['role'], properties: { role: { type: 'string', enum: ['lead', 'member'] } } }), responses: { 200: ok(ref('Team')), ...errs(400, 401, 403, 404) } },
      delete: { tags: ['Teams'], parameters: [idParam('id'), idParam('userId')], summary: 'Remove a member (lead) or leave the team (yourself)', responses: { 200: ok(ref('Team')), ...errs(400, 401, 403, 404) } },
    },

    '/projects': {
      get: { tags: ['Projects'], summary: 'List projects you can access', parameters: [q('search', { type: 'string' }), q('teamId', { type: 'integer' }), ...pageParams, q('sort', { type: 'string', enum: ['name', 'created_at', 'task_count', 'progress'] }), q('order', { type: 'string', enum: ['asc', 'desc'] })], responses: { 200: ok(paged('Project')), ...errs(400, 401) } },
      post: { tags: ['Projects'], summary: 'Create a project (you become owner; team members join automatically)', requestBody: body({ type: 'object', required: ['name'], properties: { name: { type: 'string' }, description: { type: 'string' }, teamId: { type: 'integer', nullable: true } } }), responses: { 201: ok(ref('Project'), 'Created'), ...errs(400, 401, 403, 404) } },
    },
    '/projects/{projectId}': {
      get: { tags: ['Projects'], parameters: [idParam('projectId')], summary: 'Project with members and your role (viewer+)', responses: { 200: ok(ref('Project')), ...errs(401, 403, 404) } },
      patch: { tags: ['Projects'], parameters: [idParam('projectId')], summary: 'Edit name, description or team (manager+)', requestBody: body({ type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, teamId: { type: 'integer', nullable: true } } }), responses: { 200: ok(ref('Project')), ...errs(400, 401, 403, 404) } },
      delete: { tags: ['Projects'], parameters: [idParam('projectId')], summary: 'Delete a project and its tasks (owner)', responses: { ...none, ...errs(401, 403, 404) } },
    },
    '/projects/{projectId}/stats': { get: { tags: ['Projects'], parameters: [idParam('projectId')], summary: 'Project statistics, workload per person and upcoming deadlines', responses: { 200: ok(ref('Stats')), ...errs(401, 403, 404) } } },
    '/projects/{projectId}/members': {
      get: { tags: ['Members'], parameters: [idParam('projectId')], summary: 'Project members and their roles', responses: { 200: ok(list('Member')), ...errs(401, 403, 404) } },
      post: { tags: ['Members'], parameters: [idParam('projectId')], summary: 'Add a member or change their project role (manager+)', requestBody: body({ type: 'object', required: ['userId'], properties: { userId: { type: 'integer' }, role: { type: 'string', enum: ['manager', 'member', 'viewer'] } } }), responses: { 200: ok(ref('Project'), 'Role changed'), 201: ok(ref('Project'), 'Member added'), ...errs(400, 401, 403, 404) } },
    },
    '/projects/{projectId}/members/{userId}': { delete: { tags: ['Members'], parameters: [idParam('projectId'), idParam('userId')], summary: 'Remove a member (manager+); their open tasks become unassigned', responses: { 200: ok(ref('Project')), ...errs(400, 401, 403, 404) } } },
    '/projects/{projectId}/labels': {
      get: { tags: ['Labels'], parameters: [idParam('projectId')], summary: 'The project’s labels with how many tasks use each (viewer+)', responses: { 200: ok(list('Label')), ...errs(401, 403, 404) } },
      post: { tags: ['Labels'], parameters: [idParam('projectId')], summary: 'Create a label (member+). Names are unique per project, at most 30 labels.', requestBody: body({ type: 'object', required: ['name'], properties: { name: { type: 'string', maxLength: 30 }, color: COLOR } }), responses: { 201: ok(ref('Label'), 'Created'), 409: err('A label with that name already exists'), ...errs(400, 401, 403, 404) } },
    },
    '/projects/{projectId}/labels/{labelId}': {
      patch: { tags: ['Labels'], parameters: [idParam('projectId'), idParam('labelId')], summary: 'Rename or recolour a label (member+)', requestBody: body({ type: 'object', properties: { name: { type: 'string', maxLength: 30 }, color: COLOR } }), responses: { 200: ok(ref('Label')), 409: err('A label with that name already exists'), ...errs(400, 401, 403, 404) } },
      delete: { tags: ['Labels'], parameters: [idParam('projectId'), idParam('labelId')], summary: 'Delete a label and take it off every task (manager+)', responses: { ...none, ...errs(401, 403, 404) } },
    },
    '/projects/{projectId}/activity': { get: { tags: ['Activity'], parameters: [idParam('projectId'), ...pageParams], summary: 'Project activity history, newest first', responses: { 200: ok(paged('Activity')), ...errs(401, 403, 404) } } },

    '/projects/{projectId}/tasks': {
      get: { tags: ['Tasks'], summary: 'List a project’s tasks with search, filters, sorting and pagination', parameters: [idParam('projectId'), ...taskFilters, q('status', STATUS), q('assigneeId', { type: 'integer' }, '0 = unassigned'), q('sort', { type: 'string', enum: ['position', 'created_at', 'updated_at', 'due_date', 'priority', 'title', 'status', 'assignee'], default: 'position' }), ...pageParams], responses: { 200: ok(paged('Task')), ...errs(400, 401, 403, 404) } },
      post: { tags: ['Tasks'], parameters: [idParam('projectId')], summary: 'Create a task (member+)', requestBody: body(ref('TaskInput')), responses: { 201: ok(ref('Task'), 'Created'), ...errs(400, 401, 403, 404) } },
    },
    '/tasks/mine': { get: { tags: ['Tasks'], summary: 'Tasks assigned to you across all your projects', parameters: [q('status', { type: 'string', enum: ['open', 'all', 'todo', 'in_progress', 'review', 'done'], default: 'open' }), ...taskFilters, q('sort', { type: 'string', enum: ['due_date', 'priority', 'updated_at', 'created_at', 'title', 'project', 'status'], default: 'due_date' }), ...pageParams], responses: { 200: ok({ allOf: [paged('Task'), { type: 'object', properties: { counts: { type: 'object', properties: { open: { type: 'integer' }, overdue: { type: 'integer' }, week: { type: 'integer' }, done: { type: 'integer' } } } } }] }), ...errs(400, 401) } } },
    '/tasks/{id}': {
      get: { tags: ['Tasks'], parameters: [idParam('id')], summary: 'A task, plus your permissions on it (can_edit, can_delete, can_comment)', responses: { 200: ok(ref('Task')), ...errs(401, 403, 404) } },
      patch: { tags: ['Tasks'], parameters: [idParam('id')], summary: 'Update or move a task (member+). Each changed field is written to the history.', requestBody: body(ref('TaskUpdate')), responses: { 200: ok(ref('Task')), ...errs(400, 401, 403, 404) } },
      delete: { tags: ['Tasks'], parameters: [idParam('id')], summary: 'Delete a task (manager+)', responses: { ...none, ...errs(401, 403, 404) } },
    },
    '/tasks/{id}/checklist': { post: { tags: ['Checklist'], parameters: [idParam('id')], summary: 'Add a step to the task’s checklist (member+, at most 50). Returns the updated task.', requestBody: body({ type: 'object', required: ['text'], properties: { text: { type: 'string', maxLength: 200 } } }), responses: { 201: ok(ref('Task'), 'Created'), ...errs(400, 401, 403, 404) } } },
    '/tasks/{id}/checklist/{itemId}': {
      patch: { tags: ['Checklist'], parameters: [idParam('id'), idParam('itemId')], summary: 'Edit a step or tick it off (member+). Returns the updated task.', requestBody: body({ type: 'object', properties: { text: { type: 'string', maxLength: 200 }, done: { type: 'boolean' } } }), responses: { 200: ok(ref('Task')), ...errs(400, 401, 403, 404) } },
      delete: { tags: ['Checklist'], parameters: [idParam('id'), idParam('itemId')], summary: 'Remove a step (member+). Returns the updated task.', responses: { 200: ok(ref('Task')), ...errs(401, 403, 404) } },
    },
    '/tasks/{id}/comments': {
      get: { tags: ['Comments'], parameters: [idParam('id')], summary: 'Comments on a task, oldest first', responses: { 200: ok(list('Comment')), ...errs(401, 403, 404) } },
      post: { tags: ['Comments'], parameters: [idParam('id')], summary: 'Add a comment (member+). `@Full Name` mentions notify those project members.', requestBody: body({ type: 'object', required: ['body'], properties: { body: { type: 'string', maxLength: 2000 } } }), responses: { 201: ok(ref('Comment'), 'Created'), ...errs(400, 401, 403, 404) } },
    },
    '/comments/{commentId}': {
      patch: { tags: ['Comments'], parameters: [idParam('commentId')], summary: 'Edit your own comment', requestBody: body({ type: 'object', required: ['body'], properties: { body: { type: 'string' } } }), responses: { 200: ok(ref('Comment')), ...errs(400, 401, 403, 404) } },
      delete: { tags: ['Comments'], parameters: [idParam('commentId')], summary: 'Delete a comment (author or manager+)', responses: { ...none, ...errs(401, 403, 404) } },
    },
    '/tasks/{id}/activity': { get: { tags: ['Activity'], parameters: [idParam('id')], summary: 'History of a single task, newest first', responses: { 200: ok(list('Activity')), ...errs(401, 403, 404) } } },

    '/projects/{projectId}/messages': {
      get: { tags: ['Chat'], parameters: [idParam('projectId'), q('before', { type: 'integer' }, 'Only messages older than this id (load older history)'), q('limit', { type: 'integer', minimum: 1, maximum: 100, default: 50 })], summary: 'Chat history, oldest first (viewer+)', responses: { 200: ok({ type: 'object', properties: { data: { type: 'array', items: ref('ChatMessage') }, has_more: { type: 'boolean' }, last_read_id: { type: 'integer' }, reads: { type: 'object', additionalProperties: { type: 'integer' }, description: 'userId → newest message id they have seen ("Seen by")' } } }), ...errs(400, 401, 403, 404) } },
      post: { tags: ['Chat'], parameters: [idParam('projectId')], summary: 'Post a message (member+; viewers can only read). `@Full Name` mentions notify. Same as the `chat:send` socket event.', requestBody: body({ type: 'object', required: ['body'], properties: { body: { type: 'string', maxLength: 2000 }, clientId: { type: 'string' } } }), responses: { 201: ok(ref('ChatMessage'), 'Created'), ...errs(400, 401, 403, 404) } },
    },
    '/projects/{projectId}/messages/voice': {
      post: {
        tags: ['Chat'], parameters: [idParam('projectId'), q('duration', { type: 'number', minimum: 0.5, maximum: 120 }, 'Length in seconds (required)'), q('waveform', { type: 'string' }, 'Up to 64 comma-separated levels 0–100 for drawing the bars'), q('clientId', { type: 'string' })],
        summary: 'Send a voice message (member+). The body is the raw recording, up to 3 MB and 2 minutes.',
        requestBody: { required: true, content: { 'audio/webm': { schema: { type: 'string', format: 'binary' } }, 'audio/ogg': { schema: { type: 'string', format: 'binary' } }, 'audio/mp4': { schema: { type: 'string', format: 'binary' } } } },
        responses: { 201: ok(ref('ChatMessage'), 'Created'), 413: err('Recording larger than 3 MB'), ...errs(400, 401, 403, 404) },
      },
    },
    '/projects/{projectId}/chat/removed': { post: { tags: ['Chat'], parameters: [idParam('projectId')], summary: 'Remove a member from the project chat; they keep the project (manager+; only the owner or an admin can remove a manager; never the owner)', requestBody: body({ type: 'object', required: ['userId'], properties: { userId: { type: 'integer' } } }), responses: { ...none, ...errs(400, 401, 403, 404) } } },
    '/projects/{projectId}/chat/removed/{userId}': { delete: { tags: ['Chat'], parameters: [idParam('projectId'), idParam('userId')], summary: 'Add a member back to the project chat (same rules)', responses: { ...none, ...errs(400, 401, 403, 404) } } },
    '/messages/{id}/audio': { get: { tags: ['Chat'], parameters: [idParam('id')], summary: 'The recording of a voice message (viewer+)', responses: { 200: { description: 'The audio, with its original content type' }, ...errs(401, 403, 404) } } },
    '/projects/{projectId}/messages/read': { post: { tags: ['Chat'], parameters: [idParam('projectId')], summary: 'Move your read marker forward (it never moves back)', requestBody: body({ type: 'object', required: ['messageId'], properties: { messageId: { type: 'integer' } } }), responses: { 200: ok({ type: 'object', properties: { unread: { type: 'integer' } } }), ...errs(400, 401, 403, 404) } } },
    '/messages/{id}': {
      patch: { tags: ['Chat'], parameters: [idParam('id')], summary: 'Edit your own text message (voice messages can’t be edited)', requestBody: body({ type: 'object', required: ['body'], properties: { body: { type: 'string', maxLength: 2000 } } }), responses: { 200: ok(ref('ChatMessage')), ...errs(400, 401, 403, 404) } },
      delete: { tags: ['Chat'], parameters: [idParam('id')], summary: 'Delete your own message, or anyone’s as a manager', responses: { ...none, ...errs(401, 403, 404) } },
    },

    '/notifications': { get: { tags: ['Notifications'], summary: 'Your notifications, newest first', parameters: [q('unread', { type: 'boolean' }, 'Only unread ones'), q('page', { type: 'integer', minimum: 1, default: 1 }), q('limit', { type: 'integer', minimum: 1, maximum: 50, default: 20 })], responses: { 200: ok({ allOf: [paged('Notification'), { type: 'object', properties: { unread_count: { type: 'integer' } } }] }), ...errs(400, 401) } } },
    '/notifications/read-all': { post: { tags: ['Notifications'], summary: 'Mark all your notifications as read', responses: { 200: ok({ type: 'object', properties: { unread_count: { type: 'integer' } } }), ...errs(401) } } },
    '/notifications/{id}': { patch: { tags: ['Notifications'], parameters: [idParam('id')], summary: 'Mark one notification as read or unread', requestBody: body({ type: 'object', required: ['read'], properties: { read: { type: 'boolean' } } }), responses: { 200: ok({ allOf: [ref('Notification'), { type: 'object', properties: { unread_count: { type: 'integer' } } }] }), ...errs(400, 401, 404) } } },

    '/events': { get: { tags: ['Realtime'], security: [], summary: 'Server-Sent Events stream of changes in your projects', parameters: [q('token', { type: 'string' }, 'Your JWT (EventSource cannot send headers)')], responses: { 200: { description: 'text/event-stream; each `data:` line is `{ projectId, taskId, userId, action, at }` or `{ kind: "notification", userId, at }`' }, ...errs(401) } } },

    '/admin/users': { get: { tags: ['Admin'], summary: 'All users with team, project and open-task counts (admin)', parameters: [q('search', { type: 'string' }), ...pageParams], responses: { 200: ok(paged('AdminUser')), ...errs(401, 403) } } },
    '/admin/users/{id}': { patch: { tags: ['Admin'], parameters: [idParam('id')], summary: 'Change a user’s workspace role (admin). The last admin cannot be demoted.', requestBody: body({ type: 'object', required: ['role'], properties: { role: { type: 'string', enum: ['admin', 'member'] } } }), responses: { 200: ok(ref('AdminUser')), ...errs(400, 401, 403, 404) } } },
  },
};
