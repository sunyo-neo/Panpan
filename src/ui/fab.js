import { setViewerSettings } from '../state/viewerState.js';

let fabElement = null;
let scanCallback = null;

export function initFAB(runScannerCallback) {
    scanCallback = runScannerCallback;
    
    chrome.storage.local.get('isPanpanEnabled', ({ isPanpanEnabled }) => {
        if (isPanpanEnabled) {
            injectFAB();
        }
    });

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.isPanpanEnabled !== undefined) {
            const isEnabled = changes.isPanpanEnabled.newValue;
            if (isEnabled) {
                injectFAB();
            } else {
                removeFAB();
            }
        }
    });
}

function injectFAB() {
    if (document.getElementById('panpan-fab-container')) return;
    
    fabElement = document.createElement('div');
    fabElement.id = 'panpan-fab-container';
    
    const shadowRoot = fabElement.attachShadow({ mode: 'open' });
    
    const style = document.createElement('style');
    style.textContent = `
        :host {
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 999999;
        }
        .panpan-fab {
            width: 56px;
            height: 56px;
            border-radius: 50%;
            border: none;
            cursor: pointer;
            background-color: var(--panpan-primary, #4f46e5);
            color: #ffffff;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease;
            display: flex;
            justify-content: center;
            align-items: center;
            font-size: 24px;
        }
        @media (prefers-color-scheme: dark) {
            .panpan-fab {
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
            }
        }
        .panpan-fab:hover {
            transform: scale(1.1);
            box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
        }
    `;
    
    const button = document.createElement('button');
    button.className = 'panpan-fab';
    button.innerHTML = '📖';
    
    button.addEventListener('click', () => {
        chrome.storage.local.get('savedSettings', (data) => {
            const payload = data.savedSettings || {};
            const mappedSettings = {
                readingDirection: payload.direction || payload.readingDirection || 'RTL',
                padding: payload.padding !== undefined ? payload.padding : 0,
                zoomMode: payload.zoomMode || 'fit'
            };
            setViewerSettings(mappedSettings);
            if (scanCallback) scanCallback();
        });
    });
    
    shadowRoot.appendChild(style);
    shadowRoot.appendChild(button);
    document.body.appendChild(fabElement);
}

function removeFAB() {
    if (fabElement) {
        fabElement.remove();
        fabElement = null;
    }
}
