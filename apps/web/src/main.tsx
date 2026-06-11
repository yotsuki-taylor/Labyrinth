import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';

// Global Telegram WebApp type augmentation
declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        ready: () => void;
        expand: () => void;
        initData: string;
        initDataUnsafe: {
          user?: { id: number; username?: string; first_name?: string; last_name?: string };
        };
        close: () => void;
        BackButton: { show: () => void; hide: () => void; onClick: (cb: () => void) => void };
        MainButton: { text: string; show: () => void; hide: () => void; onClick: (cb: () => void) => void };
      };
    };
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
