import React from 'react';
import { createRoot } from 'react-dom/client';
import Reader from './components/Reader.jsx';
import tailwindStyles from './index.css?inline';

let unmountApp = null;

export function mountReactApp(mangaImages, globalPanels) {
    if (unmountApp) unmountApp();

    const host = document.createElement('div');
    host.id = 'panpan-react-host';
    document.body.appendChild(host);

    const shadowRoot = host.attachShadow({ mode: 'open' });
    
    const style = document.createElement('style');
    style.textContent = tailwindStyles;
    shadowRoot.appendChild(style);

    const rootContainer = document.createElement('div');
    shadowRoot.appendChild(rootContainer);

    const root = createRoot(rootContainer);
    root.render(<Reader mangaImages={mangaImages} globalPanels={globalPanels} />);

    unmountApp = () => {
        root.unmount();
        host.remove();
        unmountApp = null;
    };
}

export function unmountReactApp() {
    if (unmountApp) {
        unmountApp();
    }
}
