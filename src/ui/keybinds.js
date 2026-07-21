import { nextPanel, prevPanel, getState } from '../state/viewerState.js';
import { renderCurrent } from './overlay.js';

export function handleKeydown(event) {
    const state = getState();
    const isRTL = state.viewerSettings.readingDirection === 'RTL' || state.viewerSettings.readingDirection === 'manga';
    
    switch(event.key) {
        case 'ArrowRight':
        case 'd':
            isRTL ? prevPanel() : nextPanel();
            renderCurrent();
            break;
        case 'ArrowLeft':
        case 'a':
            isRTL ? nextPanel() : prevPanel();
            renderCurrent();
            break;
    }
}

export function bindKeys() {
    window.addEventListener('keydown', handleKeydown);
}

export function unbindKeys() {
    window.removeEventListener('keydown', handleKeydown);
}
