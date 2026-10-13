import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks';

export default function NotFound() {
  useDocumentTitle('Page not found');
  return (
    <div className="page notfound">
      <div>
        <div className="code">404</div>
        <h1>We couldn’t find that page</h1>
        <p>The link may be broken, or the page may have been removed.</p>
        <div className="row" style={{ justifyContent: 'center', marginTop: 24 }}>
          <Link to="/" className="btn btn-primary">Go to dashboard</Link>
          <Link to="/projects" className="btn btn-secondary">View projects</Link>
        </div>
      </div>
    </div>
  );
}
