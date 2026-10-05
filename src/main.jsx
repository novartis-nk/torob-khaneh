import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import Landing from './landing/Landing.jsx';
import SafarApp from './safar/SafarApp.jsx';
import './styles.css';
const pathname = location.pathname.replace(/\/$/, '') || '/';
// Preserve housing links shared before the introduction of the landing page.
const legacyHousing =
  pathname === '/' &&
  [...new URLSearchParams(location.search).keys()].some((key) =>
    [
      'q',
      'maxDeposit',
      'maxRent',
      'minArea',
      'bedrooms',
      'maxMetro',
      'rate',
      'districts',
      'sort',
      'parking',
      'elevator',
      'balcony',
    ].includes(key),
  );
if (legacyHousing) history.replaceState(null, '', `/khaneh${location.search}${location.hash}`);
const Page =
  pathname === '/safar' ? SafarApp : pathname === '/khaneh' || legacyHousing ? App : Landing;
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Page />
  </React.StrictMode>,
);
