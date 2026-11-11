import { useEffect, useState } from 'react';
import App from './App.jsx';
import ShoutoutAdmin from './components/ShoutoutAdmin.jsx';

function isAdminRoute() {
  return window.location.hash.replace(/^#\/?/, '').toLowerCase() === 'admin';
}

export default function Root() {
  const [adminRoute, setAdminRoute] = useState(isAdminRoute);

  useEffect(() => {
    const handleHashChange = () => setAdminRoute(isAdminRoute());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return adminRoute ? <ShoutoutAdmin /> : <App />;
}
