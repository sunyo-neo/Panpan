import { extractPanelsFromImage } from './engine/floodFill.js';
import { dynamicSort } from './engine/dynamicSort.js';
import { setPanels, setViewerSettings, setMangaImages, getState } from './state/viewerState.js';
import { launchOverlay, renderCurrent } from './ui/overlay.js';
import { bindKeys } from './ui/keybinds.js';

if (typeof window.panelZoomInjected === 'undefined') {
    window.panelZoomInjected = true;
    console.log("PanPan Content Script Injected Successfully! (Vite Bundled)");

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "START_VIEWER") {
            const settings = request.settings || {};
            if (!settings.readingDirection) settings.readingDirection = 'manga';
            
            setViewerSettings(settings);
            runScanner();
        }
        return true;
    });

    async function runScanner() {
        // Query DOM for images
        const containers = document.querySelectorAll('.page-container img');
        if (containers.length === 0) {
            // Fallback for generic sites
            const allImgs = Array.from(document.querySelectorAll('img')).filter(i => i.width > 200 && i.height > 200);
            if (allImgs.length === 0) return;
            setMangaImages(allImgs.map(i => i.src));
        } else {
            setMangaImages(Array.from(containers).map(i => i.src));
        }

        const state = getState();
        const urls = state.mangaImages;
        let allPanels = [];

        for (const url of urls) {
            const panels = await processImage(url, state.viewerSettings.readingDirection);
            allPanels.push(...panels);
        }

        setPanels(allPanels);
        launchOverlay();
        bindKeys();
        renderCurrent();
    }

    function processImage(url, direction) {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.onload = async () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                const MAX_DIM = 1000;
                const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
                const w = Math.floor(img.width * scale);
                const h = Math.floor(img.height * scale);
                
                canvas.width = w;
                canvas.height = h;
                ctx.drawImage(img, 0, 0, w, h);
                const imgData = ctx.getImageData(0, 0, w, h);
                
                // Pass to engine without DOM
                const rawPanels = await extractPanelsFromImage(imgData, w, h, { scale, ow: img.width, oh: img.height, imgUrl: url });
                const sorted = dynamicSort(rawPanels, direction);
                resolve(sorted);
            };
            img.onerror = () => resolve([]); // Skip on error
            img.src = url;
        });
    }
}
