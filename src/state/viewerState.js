const state = {
    mangaImages: [],
    globalPanels: [],
    currentPanelIndex: 0,
    viewerSettings: {
        readingDirection: 'RTL',
        mode: 'panel',
        padding: 0,
        zoomMode: 'fit'
    }
};

export function setPanels(panels) {
    state.globalPanels = panels;
    state.currentPanelIndex = 0;
}

export function nextPanel() {
    if (state.currentPanelIndex < state.globalPanels.length - 1) {
        state.currentPanelIndex++;
    }
}

export function prevPanel() {
    if (state.currentPanelIndex > 0) {
        state.currentPanelIndex--;
    }
}

export function toggleMode() {
    state.viewerSettings.mode = state.viewerSettings.mode === 'panel' ? 'page' : 'panel';
}

export function getState() {
    // Return read-only copy (shallow copy is sufficient here)
    return { ...state };
}

export function setViewerSettings(settings) {
    state.viewerSettings = { ...state.viewerSettings, ...settings };
}

export function setMangaImages(images) {
    state.mangaImages = images;
}
