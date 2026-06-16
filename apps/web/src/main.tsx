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
        version: string;
        isVersionAtLeast?: (version: string) => boolean;
        initData: string;
        initDataUnsafe: {
          user?: { id: number; username?: string; first_name?: string; last_name?: string };
        };
        close: () => void;
        BackButton: { show: () => void; hide: () => void; onClick: (cb: () => void) => void };
        MainButton: { text: string; show: () => void; hide: () => void; onClick: (cb: () => void) => void };
        CloudStorage?: {
          getItem: (key: string, cb: (err: Error | null, value: string | null) => void) => void;
          setItem: (key: string, value: string, cb?: (err: Error | null, ok: boolean) => void) => void;
        };
        HapticFeedback?: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
          notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
          selectionChanged: () => void;
        };
      };
    };
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
