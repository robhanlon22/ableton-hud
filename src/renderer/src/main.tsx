import { createRoot } from 'react-dom/client';
import { HudApp } from './app/hud-app';
import './index.css';

createRoot(document.getElementById('root') as HTMLElement).render(<HudApp />);
