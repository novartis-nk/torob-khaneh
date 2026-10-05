import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import SafarApp from './safar/SafarApp.jsx';
import './styles.css';
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {location.pathname.replace(/\/$/, '') === '/safar' ? <SafarApp /> : <App />}
  </React.StrictMode>,
);
