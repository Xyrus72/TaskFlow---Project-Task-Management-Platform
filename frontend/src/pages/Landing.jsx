import { Link } from 'react-router-dom';
import {
  ArrowRight, Check, CircleCheck, History, ListTodo, Minus, Moon, Radio, Search, SlidersHorizontal, BookOpen, Sun,
} from 'lucide-react';
import { useDocumentTitle } from '../hooks';
import { useIsDark, useTheme } from '../theme';
import { Avatar, Logo, PriorityIcon, RoleBadge, StatusIcon } from '../components';

/** Small static board used as an illustration on the landing and sign-in pages. */
export function MiniBoard() {
  const cols = [
    { status: 'todo', title: 'To Do', cards: [['Write SEO copy', 'medium', 'Priya Patel'], ['Pricing page layout', 'high', 'Zara Designer']] },
    { status: 'in_progress', title: 'In Progress', cards: [['Homepage hero section', 'urgent', 'Leo Developer', true], ['Header and navigation', 'high', 'Leo Developer']] },
    { status: 'done', title: 'Done', cards: [['Audit site pages', 'medium', 'Noah Tester'], ['Create moodboard', 'low', 'Zara Designer']] },
  ];
  return (
    <div className="mini-board">
      {cols.map((c) => (
        <div key={c.status} className="mini-col">
          <div className="mc-head"><StatusIcon status={c.status} size={13} />{c.title}</div>
          {c.cards.map(([title, priority, who, lift]) => (
            <div key={title} className={`mini-card ${lift ? 'lift' : ''}`}>
              {title}
              <div className="mc-meta"><PriorityIcon priority={priority} size={14} /><Avatar name={who} size="xs" /></div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function MembersVisual() {
  const people = [['Maya Manager', 'owner'], ['Leo Developer', 'manager'], ['Zara Designer', 'member'], ['Victor Viewer', 'viewer']];
  return (
    <div className="mini-panel">
      <div className="card-header"><div><h3>Members</h3><p>Website Redesign</p></div></div>
      {people.map(([name, role]) => (
        <div key={name} className="member-row"><Avatar name={name} size="md" /><div className="who"><div className="name">{name}</div></div><RoleBadge role={role} /></div>
      ))}
    </div>
  );
}

function DashboardVisual() {
  const bars = [['Urgent', 2, '#f04438'], ['High', 5, '#f79009'], ['Medium', 6, '#2e90fa'], ['Low', 3, '#98a2b3']];
  return (
    <>
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
        {[['Open', '16', ''], ['Due this week', '7', ''], ['Overdue', '2', 'red']].map(([l, v, tone]) => (
          <div key={l} className="mini-panel stat-card" style={{ padding: 14, marginTop: 0 }}>
            <div className="stat-top" style={{ fontSize: 12 }}>{l}</div><div className={`stat-value ${tone}`} style={{ fontSize: 24, marginTop: 4 }}>{v}</div>
          </div>
        ))}
      </div>
      <div className="mini-panel" style={{ marginTop: 10, padding: 16 }}>
        <div className="bar-list">
          {bars.map(([l, v, c]) => (
            <div key={l} className="bar-item"><div className="bar-head"><span>{l}</span><span className="val">{v}</span></div><div className="bar-track"><span style={{ width: `${(v / 6) * 100}%`, background: c }} /></div></div>
          ))}
        </div>
      </div>
    </>
  );
}

function HistoryVisual() {
  return (
    <div className="mini-panel" style={{ padding: '6px 18px' }}>
      <div className="comment"><Avatar name="Maya Manager" size="md" /><div><div className="c-head"><b>Maya Manager</b><span className="time">2h ago</span></div><div className="c-body">Can we make sure the headline still reads well on small phones?</div></div></div>
      <div className="comment"><Avatar name="Leo Developer" size="md" /><div><div className="c-head"><b>Leo Developer</b><span className="time">1h ago</span></div><div className="c-body">Yes, it stacks under the video below 900px.</div></div></div>
      <div className="timeline" style={{ padding: '12px 0 14px', borderTop: '1px solid var(--border)' }}>
        <div className="timeline-item"><span className="ti-icon"><ArrowRight /></span><div><b>Leo</b> moved this task <span className="time">· 3h ago</span><div className="feed-change">To Do <ArrowRight className="arrow" width={12} /> In Progress</div></div></div>
        <div className="timeline-item"><span className="ti-icon"><SlidersHorizontal /></span><div><b>Maya</b> changed the priority <span className="time">· 2d ago</span><div className="feed-change">High <ArrowRight className="arrow" width={12} /> Urgent</div></div></div>
      </div>
    </div>
  );
}

function FeatureRow({ title, text, points, visual, flip }) {
  return (
    <div className={`feature-row ${flip ? 'flip' : ''}`}>
      <div className="fr-text">
        <h3>{title}</h3>
        <p>{text}</p>
        <ul>{points.map((p) => <li key={p}><CircleCheck aria-hidden />{p}</li>)}</ul>
      </div>
      <div className="fr-visual">{visual}</div>
    </div>
  );
}

const ROLE_ROWS = [
  ['View tasks, comments and history', [1, 1, 1, 1]],
  ['Create, edit and move tasks', [0, 1, 1, 1]],
  ['Comment on tasks', [0, 1, 1, 1]],
  ['Delete tasks', [0, 0, 1, 1]],
  ['Add members and change roles', [0, 0, 1, 1]],
  ['Edit project details', [0, 0, 1, 1]],
  ['Delete the project', [0, 0, 0, 1]],
];

function ThemeButton() {
  const dark = useIsDark();
  const setTheme = useTheme((s) => s.setTheme);
  const Icon = dark ? Sun : Moon;
  return (
    <button type="button" className="btn btn-ghost btn-icon" onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Light mode' : 'Dark mode'}><Icon aria-hidden /></button>
  );
}

export default function Landing() {
  useDocumentTitle();
  return (
    <div className="landing">
      <header className="l-nav">
        <div className="l-container">
          <Logo />
          <nav className="l-links" aria-label="Sections">
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#roles">Roles</a>
            <a href="#api">API</a>
          </nav>
          <div className="actions">
            <ThemeButton />
            <Link to="/login" className="btn btn-ghost">Sign in</Link>
            <Link to="/register" className="btn btn-primary">Get started</Link>
          </div>
        </div>
      </header>

      <section className="l-hero">
        <div className="l-container">
          <div>
            <span className="l-eyebrow"><span className="tag">New</span>Boards now update live for everyone</span>
            <h1>Plan projects, assign work and <span className="accent">ship on time</span>.</h1>
            <p className="lead">TaskFlow gives your team a shared Kanban board, clear roles for every project and a dashboard that shows what needs attention today.</p>
            <div className="cta">
              <Link to="/register" className="btn btn-primary btn-xl">Get started free<ArrowRight /></Link>
              <Link to="/login" className="btn btn-secondary btn-xl">Try the demo</Link>
            </div>
            <div className="note">
              <span><Check />Demo accounts included</span>
              <span><Check />Nothing to install</span>
              <span><Check />Documented REST API</span>
            </div>
          </div>
          <div className="browser" aria-hidden>
            <div className="browser-bar"><i /><i /><i /><span className="url">taskflow.app/projects/website-redesign</span></div>
            <div className="hero-frame"><video className="hero-video" src="/hero.mp4" autoPlay muted loop playsInline preload="auto" /></div>
          </div>
        </div>
      </section>

      <section className="l-section" id="features">
        <div className="l-container">
          <div className="l-head center">
            <div className="l-kicker">Features</div>
            <h2>Everything a small team needs to stay on track</h2>
            <p>Projects, people and progress in one tidy workspace. No setup, no clutter.</p>
          </div>
          <FeatureRow
            title="A board your whole team understands"
            text="Every project gets a Kanban board with four clear stages. Drag cards to update them, and everyone sees the change straight away."
            points={['Drag cards between To Do, In Progress, Review and Done', 'Sort by hand, by priority or by due date', 'Add a task from any column in one line']}
            visual={<MiniBoard />}
          />
          <FeatureRow flip
            title="Control who can change what"
            text="Give each person the right access to each project. Group people into teams to share a project with everyone at once."
            points={['Owner, manager, member and viewer roles per project', 'Teams with leads who manage membership', 'Workspace admins can open every project']}
            visual={<MembersVisual />}
          />
          <FeatureRow
            title="Know what’s late before it’s a problem"
            text="The dashboard pulls together open work, upcoming deadlines and progress across all of your projects."
            points={['Overdue and due-this-week counts', 'Progress and workload for every project', 'A personal list of your open tasks']}
            visual={<DashboardVisual />}
          />
          <FeatureRow flip
            title="Every decision stays with the task"
            text="Discuss work right on the task. TaskFlow records each change, so you can always see who did what and when."
            points={['Comments you can edit or delete', 'History of status, assignee, priority and date changes', 'Updates from teammates appear instantly']}
            visual={<HistoryVisual />}
          />
        </div>
      </section>

      <section className="l-section alt">
        <div className="l-container">
          <div className="l-head center"><div className="l-kicker">And more</div><h2>Small details that save time</h2></div>
          <div className="feature-grid">
            {[
              [Search, 'Quick search', 'Press Ctrl + K to jump to any project or task.'],
              [SlidersHorizontal, 'Filters and sorting', 'Narrow any board or list by text, priority or assignee.'],
              [ListTodo, 'My tasks', 'Everything assigned to you across projects, with one-click done.'],
              [Radio, 'Live updates', 'Boards, dashboards and open tasks refresh as your team works.'],
              [History, 'Activity history', 'A paginated record of every change in a project.'],
              [BookOpen, 'REST API and docs', 'A documented JSON API with interactive Swagger docs.'],
            ].map(([Icon, title, text]) => (
              <div key={title} className="feature-card">
                <div className="fc-icon"><Icon aria-hidden /></div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="l-section" id="how">
        <div className="l-container">
          <div className="l-head center"><div className="l-kicker">How it works</div><h2>Up and running in three steps</h2></div>
          <div className="steps">
            {[
              ['Create a team', 'Add the people you work with. Leads manage who is in the team.'],
              ['Start a project', 'Everyone in the team joins as a member. Adjust roles per person.'],
              ['Track the work', 'Add tasks, assign them and move them across the board until they’re done.'],
            ].map(([title, text], i) => (
              <div key={title} className="step"><span className="num">{i + 1}</span><h3>{title}</h3><p>{text}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="l-section alt" id="roles">
        <div className="l-container">
          <div className="l-head center">
            <div className="l-kicker">Roles and permissions</div>
            <h2>The right access for every person</h2>
            <p>Permissions are checked on the server for every request, not just hidden in the interface.</p>
          </div>
          <div className="card table-wrap" style={{ maxWidth: 880, margin: '0 auto' }}>
            <table className="table roles-table">
              <thead><tr><th>What they can do</th><th>Viewer</th><th>Member</th><th>Manager</th><th>Owner</th></tr></thead>
              <tbody>
                {ROLE_ROWS.map(([label, flags]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    {flags.map((f, i) => <td key={i}>{f ? <Check className="yes" aria-label="Yes" /> : <Minus className="no" aria-label="No" />}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="l-section" id="api">
        <div className="l-container feature-row">
          <div className="fr-text">
            <div className="l-kicker">For developers</div>
            <h3 style={{ marginTop: 10 }}>A clean REST API behind every screen</h3>
            <p>Everything you can do in TaskFlow you can do over HTTP: JSON in and out, validation with clear error messages, pagination on every list and a live event stream.</p>
            <ul>
              <li><CircleCheck aria-hidden />JWT authentication</li>
              <li><CircleCheck aria-hidden />Search, filter, sort and paginate tasks</li>
              <li><CircleCheck aria-hidden />Interactive OpenAPI documentation</li>
            </ul>
            <a href="/api/docs" target="_blank" rel="noreferrer" className="btn btn-secondary btn-lg" style={{ marginTop: 24 }}>Open the API docs<ArrowRight /></a>
          </div>
          <div className="code-card" aria-label="Example API request and response">
            <div className="cc-bar"><span className="method">GET</span>/api/projects/1/tasks?status=in_progress&amp;sort=priority</div>
            <pre>{'{\n  '}<span className="k">"data"</span>{': [\n    {\n      '}<span className="k">"id"</span>: <span className="n">1</span>{',\n      '}<span className="k">"title"</span>: <span className="s">"Homepage hero section"</span>{',\n      '}<span className="k">"status"</span>: <span className="s">"in_progress"</span>{',\n      '}<span className="k">"priority"</span>: <span className="s">"urgent"</span>{',\n      '}<span className="k">"assignee_name"</span>: <span className="s">"Leo Developer"</span>{',\n      '}<span className="k">"due_date"</span>: <span className="s">"2026-10-07"</span>{',\n      '}<span className="k">"comment_count"</span>: <span className="n">3</span>{'\n    }\n  ],\n  '}<span className="k">"pagination"</span>{': { '}<span className="k">"page"</span>: <span className="n">1</span>, <span className="k">"limit"</span>: <span className="n">100</span>, <span className="k">"total"</span>: <span className="n">2</span>, <span className="k">"pages"</span>: <span className="n">1</span>{' }\n}'}</pre>
          </div>
        </div>
      </section>

      <section className="l-cta">
        <div className="l-container">
          <div className="box">
            <div>
              <h2>See it with real data</h2>
              <p>Sign in with a demo account and explore projects that are already under way.</p>
            </div>
            <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
              <Link to="/login" className="btn btn-xl btn-white">Try the demo</Link>
              <Link to="/register" className="btn btn-xl btn-outline-white">Create an account</Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="l-footer">
        <div className="l-container">
          <Logo />
          <span>© {new Date().getFullYear()} TaskFlow. Built with React, Express and MongoDB.</span>
          <nav aria-label="Footer">
            <a href="#features">Features</a>
            <a href="#roles">Roles</a>
            <a href="/api/docs" target="_blank" rel="noreferrer">API docs</a>
            <Link to="/login">Sign in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
