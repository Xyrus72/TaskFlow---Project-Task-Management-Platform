import { useState } from 'react';
import { History } from 'lucide-react';
import { useFetch, useLiveEvents } from '../../hooks';
import { EmptyState, ErrorState, Pagination, Skeleton } from '../../components';
import { FeedItem } from '../../activity';

/** Full, paginated activity history of a project (newest first, live on page 1). */
export default function ActivityTab({ projectId }) {
  const [page, setPage] = useState(1);
  const { data, error, reload } = useFetch(`/projects/${projectId}/activity`, { page, limit: 20 });
  useLiveEvents(() => { if (page === 1) reload({ silent: true }); }, { filter: (e) => e.projectId === projectId });
  if (error) return <div className="card"><ErrorState error={error} onRetry={reload} /></div>;
  return (
    <section className="card">
      <div className="card-header"><div><h2>Activity</h2><p>Every change to tasks, comments and members in this project</p></div></div>
      {!data && <div className="feed">{[0, 1, 2, 3].map((i) => <div key={i} className="feed-item"><Skeleton w={28} h={28} r={14} /><div className="grow"><Skeleton w="60%" /><Skeleton w="20%" h={10} style={{ marginTop: 8 }} /></div></div>)}</div>}
      {data?.data.length === 0 && <EmptyState small icon={History} title="No activity yet">Changes to this project will be listed here.</EmptyState>}
      {data?.data.length > 0 && (
        <>
          <div className="feed">{data.data.map((a) => <FeedItem key={a.id} a={a} />)}</div>
          <Pagination page={data.pagination.page} pages={data.pagination.pages} total={data.pagination.total} limit={data.pagination.limit} onPage={setPage} noun="events" />
        </>
      )}
    </section>
  );
}
