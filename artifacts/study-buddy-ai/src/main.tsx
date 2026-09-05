import { createRoot } from 'react-dom/client';
import StudyApp from './StudyApp';
import './index.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Offline support remains best-effort when service workers are unavailable.
    });
  });
}

createRoot(document.getElementById('root')!).render(<StudyApp />);
