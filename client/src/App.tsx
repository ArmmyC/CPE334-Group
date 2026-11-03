import { Link, Route, Routes } from 'react-router-dom';
import { HomePage } from './HomePage';

export function App() {
  return (
    <>
      <nav className="navbar navbar-dark bg-dark">
        <div className="container">
          <Link className="navbar-brand" to="/">
            CPE Lab Equipment Borrowing
          </Link>
        </div>
      </nav>
      <main className="container py-4">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="*" element={<p>Page not found.</p>} />
        </Routes>
      </main>
    </>
  );
}
