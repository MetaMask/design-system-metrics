import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { Overview } from './pages/Overview';
import { UntrackedComponents } from './pages/UntrackedComponents';
import './App.css';

const navItems = [
  { to: '/', label: 'Overview' },
  { to: '/untracked', label: 'Untracked Components' },
] as const;

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <nav className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex space-x-6">
            {navItems.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
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
        <Route path="/" element={<Overview />} />
        <Route path="/untracked" element={<UntrackedComponents />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
