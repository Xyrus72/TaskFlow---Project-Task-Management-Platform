import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, ArrowDown, Check, CheckCheck, Clock, Ellipsis, Eye, Lock, MessageSquareOff, MessageSquarePlus, MessagesSquare, Mic, Pencil,
  RotateCcw, SendHorizontal, Square, Trash2, UserMinus, X,
} from 'lucide-react';
import { api } from '../../api';
import { useAuth, toast, confirmDialog } from '../../store';
import { sendTyping, useChat } from '../../chat';
import { Avatar, Button, Menu, Popover, ProjectIcon, Skeleton, Spinner } from '../../components';
import { MentionTextarea } from '../../mentions';
import { canRecord, MAX_VOICE_SECONDS, useRecorder, VoicePlayer } from '../../voice';
import {
  atLeast, fmtDateTime, fmtDuration, fmtTime, groupMessages, plural, PROJECT_ROLES, splitLinks, splitMentions, typingText,
} from '../../utils';

/** Message text with highlighted @mentions and clickable links. */
function RichText({ text, members }) {
  return splitMentions(text, members).map((p, i) => (p.mention
    ? <span key={i} className="mention">{p.text}</span>
    : splitLinks(p.text).map((l, j) => (l.href
      ? <a key={`${i}.${j}`} href={l.href} target="_blank" rel="noopener noreferrer" className="link">{l.text}</a>
      : l.text))));
}

/** Grows with its content up to a maximum height, and re-measures when its width changes. */
function useAutosize(ref, value, max = 160) {
  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [ref, max]);
  useLayoutEffect(fit, [fit, value]);
  const el = ref.current;
  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    let width = el.clientWidth;
    const ro = new ResizeObserver(() => { if (el.clientWidth !== width) { width = el.clientWidth; fit(); } });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, fit]);
}

function Message({ item, me, members, canModerate, seenCount = 0 }) {
  const { m, compact } = item;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(m.body);
  const [busy, setBusy] = useState(false);
  const editRef = useRef(null);
  useAutosize(editRef, editing ? text : '');
  const mine = m.user?.id === me.id;
  const voice = !!m.voice;
  const mentionsMe = !mine && !voice && m.body.toLowerCase().includes(`@${me.name.toLowerCase()}`);
  const name = m.user?.name || 'Deleted user';

  const save = async () => {
    const body = text.trim();
    if (!body) { toast('A message cannot be empty', 'error'); return; }
    if (body === m.body) { setEditing(false); return; }
    setBusy(true);
    try { useChat.getState().update(await api(`/messages/${m.id}`, { method: 'PATCH', body: { body } })); setEditing(false); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const remove = async () => {
    const ok = await confirmDialog({
      title: voice ? 'Delete this voice message?' : 'Delete this message?', message: 'It will be removed for everyone in the project.', confirmLabel: 'Delete', danger: true,
    });
    if (!ok) return;
    try { await api(`/messages/${m.id}`, { method: 'DELETE' }); useChat.getState().remove(m.id, m.project_id); }
    catch (e) { toast(e.message, 'error'); }
  };

  // Time (and for your own messages, whether it was delivered) sits in the bubble's bottom corner.
  const metaText = `${m.edited_at ? 'edited · ' : ''}${fmtTime(m.created_at)}`;
  const status = mine && (m.failed ? <AlertCircle aria-label="Not sent" /> : m.pending ? <Clock aria-label="Sending" />
    : seenCount > 0 ? <CheckCheck className="seen" aria-label={`Seen by ${plural(seenCount, 'person', 'people')}`} /> : <Check aria-label="Sent" />);

  return (
    <div className={`cm ${mine ? 'mine' : 'theirs'} ${compact ? '' : 'first'} ${m.pending ? 'pending' : ''} ${m.failed ? 'failed' : ''} ${mentionsMe ? 'for-me' : ''}`}>
      {!mine && <div className="cm-avatar">{!compact && <Avatar name={name} size="md" />}</div>}
      <div className="cm-col">
        {!mine && !compact && <div className="cm-name">{name}</div>}
        {editing ? (
          <div className="cm-edit">
            <MentionTextarea ref={editRef} className="textarea" rows={1} value={text} onChange={setText} members={members.filter((x) => x.id !== me.id)}
              autoFocus maxLength={2000} aria-label="Edit message"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); save(); }
                if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); setText(m.body); }
              }} />
            <div className="row" style={{ marginTop: 6 }}>
              <span className="hint grow">Enter to save · Escape to cancel</span>
              <Button size="sm" onClick={() => { setEditing(false); setText(m.body); }}>Cancel</Button>
              <Button size="sm" variant="primary" loading={busy} onClick={save}>Save</Button>
            </div>
          </div>
        ) : (
          <div className="cm-line">
            <div className={`bubble ${voice ? 'is-voice' : ''}`} title={fmtDateTime(m.created_at)}>
              {voice ? <VoicePlayer voice={m.voice} onColor={mine && !m.failed} /> : (
                <>
                  <RichText text={m.body} members={members} />
                  <span className="meta-space" aria-hidden>{metaText}{mine && '___'}</span>
                </>
              )}
              <span className="meta">{metaText}{status}</span>
            </div>
            {!m.pending && (mine || canModerate) && (
              <div className="cm-actions">
                {mine && !voice && <Button variant="ghost" size="sm" icon={Pencil} onClick={() => { setText(m.body); setEditing(true); }} aria-label="Edit message" title="Edit" />}
                <Button variant="ghost" size="sm" icon={Trash2} onClick={remove} aria-label="Delete message" title="Delete" />
              </div>
            )}
          </div>
        )}
        {m.failed && (
          <div className="cm-failed" role="alert">
            {m.failed}.
            <button type="button" onClick={() => useChat.getState().deliver(m)}><RotateCcw aria-hidden />Retry</button>
            <button type="button" onClick={() => useChat.getState().discard(m.client_id)}><X aria-hidden />Remove</button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Small avatars under the last message each person has read (like Messenger).
 * Click them for the full list: who has seen this message and who hasn't yet.
 */
function SeenRow({ m, here, readers, reads }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef(null);
  const others = readers.filter((r) => r.id !== m.user?.id);
  const seen = others.filter((r) => (reads[r.id] || 0) >= m.id);
  const notYet = others.filter((r) => (reads[r.id] || 0) < m.id);
  return (
    <div className="cm-seen-row">
      <button ref={anchor} type="button" className="cm-seen" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog"
        aria-label={`Seen by ${here.map((r) => r.name).join(', ')}`} title={`Seen by ${here.map((r) => r.name).join(', ')}`}>
        {here.slice(0, 5).map((r) => <Avatar key={r.id} name={r.name} size="xs" title={`${r.name} has seen up to here`} />)}
        {here.length > 5 && <span className="more">+{here.length - 5}</span>}
      </button>
      <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} align="end" minWidth={230} className="seen-pop">
        <h4><span>Seen by</span><span>{seen.length}</span></h4>
        {seen.length ? <ul>{seen.map((r) => <li key={r.id}><Avatar name={r.name} size="xs" />{r.name}<CheckCheck className="when" width={14} height={14} aria-hidden /></li>)}</ul>
          : <div className="empty">No one yet</div>}
        {notYet.length > 0 && (
          <>
            <h4><span>Not seen yet</span><span>{notYet.length}</span></h4>
            <ul>{notYet.map((r) => <li key={r.id}><Avatar name={r.name} size="xs" />{r.name}</li>)}</ul>
          </>
        )}
      </Popover>
    </div>
  );
}

/** Mic → recording (live level meter, timer) → preview → send. */
function Recorder({ rec, onSend }) {
  const recording = rec.state === 'recording' || rec.state === 'starting';
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); rec.discard(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rec]);
  const send = async () => onSend(recording ? await rec.stop() : rec.clip);

  return (
    <div className="recorder" role="group" aria-label={recording ? 'Recording a voice message' : 'Voice message preview'}>
      <button type="button" className="round-btn danger" onClick={rec.discard} aria-label="Discard recording" title="Discard (Esc)"><Trash2 aria-hidden /></button>
      {recording ? (
        <>
          <span className="rec-status" aria-live="polite"><span className="rec-dot" />{fmtDuration(rec.elapsed)}</span>
          <span className="rec-meter" aria-hidden>
            {rec.levels.map((l, i) => <span key={i} style={{ height: `${Math.max(12, Math.round(l * 100))}%` }} />)}
          </span>
          <span className="rec-limit">max {fmtDuration(MAX_VOICE_SECONDS)}</span>
          <button type="button" className="round-btn" onClick={rec.stop} aria-label="Stop and listen" title="Stop and listen"><Square aria-hidden style={{ fill: 'currentColor', width: 14, height: 14 }} /></button>
        </>
      ) : rec.clip && <VoicePlayer voice={{ duration: rec.clip.duration, waveform: rec.clip.waveform, localUrl: rec.clip.url }} />}
      <button type="button" className="round-btn primary" onClick={send} disabled={rec.state === 'starting'} aria-label="Send voice message" title="Send"><SendHorizontal aria-hidden /></button>
    </div>
  );
}

/** Real-time project chat with text and voice messages. Everyone in the project can read it; members and above can post. */
export default function ProjectChat({ project, onProjectChange }) {
  const me = useAuth((s) => s.user);
  const { messages, hasMore, lastReadId, online, typing, connected, reads, blockedLive } = useChat();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [below, setBelow] = useState(0); // new messages under the visible area
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const stick = useRef(true); // keep the view pinned to the newest message
  const restore = useRef(null); // scroll position to keep while older messages are prepended
  const firstPaint = useRef(true);
  const lastTyping = useRef(0);
  const count = useRef(0);
  const rec = useRecorder();
  useAutosize(inputRef, draft);

  const canPost = atLeast(project.my_role, 'member');
  const canModerate = atLeast(project.my_role, 'manager');
  const isOwner = project.my_role === 'owner'; // admins count as owner
  const blockedIds = project.chat_blocked || [];
  const blocked = blockedLive ?? blockedIds.includes(me.id);
  const members = project.members;
  const chatMembers = members.filter((m) => !blockedIds.includes(m.id));
  const items = useMemo(() => groupMessages(messages || [], { lastReadId, meId: me.id }), [messages, lastReadId, me.id]);

  // "Seen by": everyone else in the chat, placed under the newest message their read marker reaches.
  const readers = useMemo(() => chatMembers.filter((m) => m.id !== me.id), [chatMembers, me.id]);
  const seenAt = useMemo(() => {
    const sent = (messages || []).filter((m) => !m.pending);
    const out = {};
    for (const r of readers) {
      const upTo = reads[r.id] || 0;
      let target = null;
      for (let i = sent.length - 1; i >= 0; i--) if (sent[i].id <= upTo) { target = sent[i]; break; }
      if (target && target.user?.id !== r.id) (out[target.id] ||= []).push(r);
    }
    return out;
  }, [messages, readers, reads]);
  const seenCount = (m) => readers.filter((r) => r.id !== m.user?.id && (reads[r.id] || 0) >= m.id).length;

  // On screen: load the history once, mark it read, and keep marking while the tab is visible.
  useEffect(() => {
    const chat = useChat.getState();
    chat.open(project.id, project.chat_unread); // child effects run before the project page's, so select the project here too
    chat.setViewing(true);
    if (chat.messages === null && !blocked) chat.load().catch(setError);
    const onVisible = () => { if (document.visibilityState === 'visible') useChat.getState().markRead(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { useChat.getState().setViewing(false); document.removeEventListener('visibilitychange', onVisible); };
  }, [project.id, blocked]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (messages && document.visibilityState === 'visible') useChat.getState().markRead(); }, [messages]);

  // Scrolling: start at the "New" line (or the bottom), keep older pages in place, follow new messages when at the bottom.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || !messages) return;
    const added = messages.length - count.current;
    count.current = messages.length;
    if (restore.current) {
      el.scrollTop = el.scrollHeight - restore.current.height + restore.current.top;
      restore.current = null;
    } else if (firstPaint.current) {
      firstPaint.current = false;
      // Unread messages that don't all fit: start at the "New" line so nothing is skipped.
      const marker = el.querySelector('.chat-new');
      const markerTop = marker ? marker.offsetTop - el.offsetTop : 0;
      if (marker && el.scrollHeight - markerTop > el.clientHeight) { el.scrollTop = markerTop - 16; stick.current = false; } else el.scrollTop = el.scrollHeight;
    } else if (stick.current || messages.at(-1)?.user?.id === me.id) {
      el.scrollTop = el.scrollHeight;
    } else if (added > 0) {
      setBelow((n) => n + added);
    }
  }, [messages, me.id]);

  // Keep the newest message in view when the list changes size (window resize, phone keyboard, composer growing).
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => { if (stick.current) el.scrollTop = el.scrollHeight; });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onScroll = async () => {
    const el = listRef.current;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (stick.current) setBelow(0);
    if (el.scrollTop < 120 && hasMore && !loadingOlder) {
      setLoadingOlder(true);
      restore.current = { height: el.scrollHeight, top: el.scrollTop };
      try { await useChat.getState().loadOlder(); } catch (e) { restore.current = null; toast(e.message, 'error'); }
      setLoadingOlder(false);
    }
  };
  const toBottom = () => {
    const el = listRef.current;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setBelow(0);
  };

  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    if (body.length > 2000) { toast('Keep messages under 2000 characters', 'error'); return; }
    setDraft('');
    stick.current = true;
    useChat.getState().send(body);
    inputRef.current?.focus();
  };
  const sendVoice = (clip) => {
    if (!clip) return;
    if (clip.duration < 0.6) { toast('That recording was too short', 'info'); rec.discard(); return; }
    stick.current = true;
    useChat.getState().sendVoice(clip);
    rec.reset();
  };
  const onDraft = (value) => {
    setDraft(value);
    if (value.trim() && Date.now() - lastTyping.current > 2500) { lastTyping.current = Date.now(); sendTyping(project.id); }
  };
  // While recording, others see "… is typing" too.
  useEffect(() => {
    if (rec.state !== 'recording') return undefined;
    sendTyping(project.id);
    const t = setInterval(() => sendTyping(project.id), 2500);
    return () => clearInterval(t);
  }, [rec.state, project.id]);

  const onlineMembers = chatMembers.filter((m) => online.includes(m.id));
  const offlineMembers = chatMembers.filter((m) => !online.includes(m.id));
  const removedMembers = members.filter((m) => blockedIds.includes(m.id));

  // Moderation (managers, the owner, admins): the owner can't be touched, and only the owner can act on a manager.
  const canActOn = (m) => canModerate && m.id !== me.id && m.role !== 'owner' && (m.role !== 'manager' || isOwner);
  const refresh = () => api(`/projects/${project.id}`).then(onProjectChange).catch(() => {});
  const removeFromChat = async (m) => {
    const ok = await confirmDialog({
      title: `Remove ${m.name} from the chat?`, confirmLabel: 'Remove from chat', danger: true,
      message: `${m.name.split(' ')[0]} stays in ${project.name} and keeps working on its tasks, but can’t read or post in this chat until you add them back.`,
    });
    if (!ok) return;
    try { await api(`/projects/${project.id}/chat/removed`, { method: 'POST', body: { userId: m.id } }); toast(`${m.name} was removed from the chat`); refresh(); }
    catch (e) { toast(e.message, 'error'); }
  };
  const addBack = async (m) => {
    try { await api(`/projects/${project.id}/chat/removed/${m.id}`, { method: 'DELETE' }); toast(`${m.name} can use the chat again`); refresh(); }
    catch (e) { toast(e.message, 'error'); }
  };
  const removeFromProject = async (m) => {
    const ok = await confirmDialog({
      title: `Remove ${m.name} from ${project.name}?`, confirmLabel: 'Remove from project', danger: true,
      message: 'They lose access to the project, its tasks and its chat. Their open tasks become unassigned.',
    });
    if (!ok) return;
    try { onProjectChange(await api(`/projects/${project.id}/members/${m.id}`, { method: 'DELETE' })); toast(`${m.name} was removed from the project`); }
    catch (e) { toast(e.message, 'error'); }
  };
  const typingNames = Object.entries(typing).filter(([id]) => Number(id) !== me.id).map(([, name]) => name.split(' ')[0]);
  const person = (m, on) => (
    <li key={m.id} className={on ? '' : 'away'} title={on ? `${m.name} is online` : m.name}>
      <span className="presence-avatar"><Avatar name={m.name} size="sm" /><span className={`presence ${on ? 'on' : ''}`} /></span>
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="name truncate">{m.name}{m.id === me.id && <span className="faint"> (you)</span>}</span>
        <span className="role">{PROJECT_ROLES[m.role]?.label}</span>
      </span>
      {canActOn(m) && (
        <Menu align="end"
          trigger={(p) => <Button variant="ghost" size="sm" icon={Ellipsis} className="person-menu" aria-label={`Manage ${m.name}`} title="Manage" {...p} />}
          items={[
            { label: 'Remove from chat', icon: MessageSquareOff, onSelect: () => removeFromChat(m) },
            { divider: true },
            { label: 'Remove from project', icon: UserMinus, danger: true, onSelect: () => removeFromProject(m) },
          ]} />
      )}
    </li>
  );

  return (
    <section className="card chat" aria-label="Project chat">
      <div className="chat-pane">
        <header className="chat-header">
          <ProjectIcon id={project.id} name={project.name} size={36} />
          <div className="titles">
            <h2 className="truncate">{project.name}</h2>
            <p>
              {blocked ? <><Lock width={13} height={13} aria-hidden />You don’t have access to this chat</> : connected
                ? <><span className="live-dot" />{plural(members.length, 'member')} · {onlineMembers.length} online</>
                : <><span className="live-dot off" /><span className="chat-offline">Reconnecting…</span></>}
            </p>
          </div>
          {onlineMembers.length > 0 && (
            <div className="chat-online" title={`Online: ${onlineMembers.map((m) => m.name).join(', ')}`}>
              <span className="avatar-stack">{onlineMembers.slice(0, 5).map((m) => <Avatar key={m.id} name={m.name} size="sm" />)}</span>
            </div>
          )}
        </header>

        {blocked ? (
          <div className="chat-locked" role="status">
            <span className="chat-locked-icon"><Lock aria-hidden /></span>
            <b>You were removed from this chat</b>
            <p>A project manager removed you from the {project.name} chat. You’re still in the project and can keep working on its tasks.</p>
          </div>
        ) : (
        <>
        <div className="chat-list" ref={listRef} onScroll={onScroll} role="log" aria-live="polite" aria-label="Messages">
          {error && <div className="chat-empty"><b>Couldn’t load the chat</b><span>{error.message}</span><Button size="sm" onClick={() => { setError(null); useChat.getState().load().catch(setError); }}>Try again</Button></div>}
          {!error && messages === null && (
            <div className="stack" style={{ padding: '24px 0' }}>
              {[60, 40, 52].map((w, i) => (
                <div key={i} className="row" style={{ gap: 10, alignItems: 'flex-start', flexDirection: i === 1 ? 'row-reverse' : 'row' }}>
                  {i !== 1 && <Skeleton w={32} h={32} r={16} />}<Skeleton w={`${w}%`} h={40} r={16} />
                </div>
              ))}
            </div>
          )}
          {messages?.length === 0 && (
            <div className="chat-empty">
              <span className="chat-empty-icon"><MessagesSquare aria-hidden /></span>
              <b>No messages yet</b>
              <span>{canPost ? 'Say hello to the team, or tap the mic to record a voice message.' : 'Messages from the team will show up here.'}</span>
            </div>
          )}
          {messages?.length > 0 && (
            <div className="chat-start">
              {loadingOlder ? <Spinner size={16} /> : hasMore ? <span>Scroll up for older messages</span> : (
                <>
                  <ProjectIcon id={project.id} name={project.name} size={44} />
                  <b>{project.name}</b>
                  <span>This is the beginning of the project chat. Everyone in the project can read it.</span>
                </>
              )}
            </div>
          )}
          {items.map((it) => (it.type === 'day'
            ? <div key={it.key} className="chat-day"><span>{it.label}</span></div>
            : it.type === 'new'
              ? <div key="new" className="chat-new">New</div>
              : (
                <div key={it.key}>
                  <Message item={it} me={me} members={members} canModerate={canModerate} seenCount={it.m.user?.id === me.id ? seenCount(it.m) : 0} />
                  {seenAt[it.m.id] && <SeenRow m={it.m} here={seenAt[it.m.id]} readers={readers} reads={reads} />}
                </div>
              )))}
        </div>

        <div className="chat-footer">
          {typingNames.length > 0 && (
            <div className="chat-typing" aria-live="polite"><span className="dots" aria-hidden><i /><i /><i /></span>{typingText(typingNames)}</div>
          )}
          {below > 0 && (
            <button type="button" className="chat-jump" onClick={toBottom}><ArrowDown aria-hidden />{below === 1 ? '1 new message' : `${below} new messages`}</button>
          )}
          {!canPost ? (
            <div className="chat-readonly"><Eye aria-hidden />You can read this chat. Viewers can’t post messages.</div>
          ) : rec.state !== 'idle' ? (
            <Recorder rec={rec} onSend={sendVoice} />
          ) : (
            <>
              <div className="chat-input">
                <MentionTextarea ref={inputRef} rows={1} value={draft} onChange={onDraft} members={members.filter((m) => m.id !== me.id)}
                  placeholder={`Message ${project.name}`} maxLength={2000} aria-label="Write a message"
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }} />
                {draft.trim() || !canRecord()
                  ? <button type="button" className="round-btn primary" onClick={submit} disabled={!draft.trim()} aria-label="Send message" title="Send (Enter)"><SendHorizontal aria-hidden /></button>
                  : <button type="button" className="round-btn" onClick={rec.start} aria-label="Record a voice message" title="Record a voice message"><Mic aria-hidden /></button>}
              </div>
              <div className="chat-hint">Enter to send · Shift + Enter for a new line · @ to mention · mic for a voice message</div>
            </>
          )}
        </div>
        </>
        )}
      </div>

      <aside className="chat-people" aria-label="People in this project">
        <div className="people-scroll">
          {onlineMembers.length > 0 && <><h3>Online — {onlineMembers.length}</h3><ul>{onlineMembers.map((m) => person(m, true))}</ul></>}
          {offlineMembers.length > 0 && <><h3>Offline — {offlineMembers.length}</h3><ul>{offlineMembers.map((m) => person(m, false))}</ul></>}
          {canModerate && removedMembers.length > 0 && (
            <>
              <h3>Removed from chat — {removedMembers.length}</h3>
              <ul>
                {removedMembers.map((m) => (
                  <li key={m.id} className="removed" title={`${m.name} can’t use this chat`}>
                    <Avatar name={m.name} size="sm" />
                    <span className="grow" style={{ minWidth: 0 }}><span className="name truncate">{m.name}</span><span className="role">{PROJECT_ROLES[m.role]?.label}</span></span>
                    {canActOn(m) && <Button variant="ghost" size="sm" icon={MessageSquarePlus} onClick={() => addBack(m)} title="Add back to the chat">Add back</Button>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </aside>
    </section>
  );
}
