import { useEffect } from 'react';
import { HashRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { Overview } from './pages/Overview';
import { UntrackedComponents } from './pages/UntrackedComponents';
import './App.css';

const navItems = [
  { to: '/migration', label: 'Migration', title: 'MMDS Migration Metrics' },
  { to: '/adoption', label: 'Adoption', title: 'MMDS Adoption Metrics' },
] as const;

function DocumentTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const match = navItems.find(({ to }) => pathname.startsWith(to));
    document.title = match?.title ?? 'MMDS Metrics';
  }, [pathname]);
  return null;
}

function App() {
  return (
    <HashRouter>
      <DocumentTitle />
      <nav className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex space-x-6">
            {navItems.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `inline-flex items-center border-b-2 px-1 py-4 text-sm font-medium transition-colors ${
                    isActive
                      ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </div>
        </div>
      </nav>

      <Routes>
        <Route path="/migration" element={<Overview />} />
        <Route path="/adoption" element={<UntrackedComponents />} />
        {/* Back-compat redirects for previous URLs */}
        <Route path="/" element={<Navigate to="/migration" replace />} />
        <Route path="/untracked" element={<Navigate to="/adoption" replace />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
