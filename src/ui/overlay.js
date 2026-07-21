let overlayHost = null;
let shadow = null;

export function launchOverlay(initialState) {
    if (overlayHost) return;

    overlayHost = document.createElement('div');
    overlayHost.id = "panel-zoom-extension-host";
    overlayHost.style.cssText = "position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 2147483647; background: #000000;";
    
    shadow = overlayHost.attachShadow({mode: 'closed'});
    
    shadow.innerHTML = 
        "<style>" +
            ".viewer-container {" +
                "display: flex; flex-direction: column; align-items: center; justify-content: center;" +
                "width: 100vw; height: 100vh; position: relative; background-color: #000;" +
            "}" +
            ".image-wrapper {" +
                "position: relative; overflow: hidden;" +
                "transition: transform 0.3s ease, width 0.3s ease-out, height 0.3s ease-out;" +
            "}" +
            ".manga-image {" +
                "position: absolute; max-width: none !important; max-height: none !important;" +
                "transition: transform 0.3s ease-out, left 0.3s ease-out, top 0.3s ease-out, width 0.3s ease-out, height 0.3s ease-out;" +
            "}" +
            ".top-bar {" +
                "position: absolute; top: 20px; left: 50%; transform: translateX(-50%);" +
                "color: white; font-family: sans-serif; z-index: 20;" +
                "background: rgba(0,0,0,0.5); padding: 10px; border-radius: 10px;" +
            "}" +
        "</style>" +
        "<div class='viewer-container'>" +
            "<div class='top-bar'>" +
                "<span id='counter'>Panel 1 / 1</span>" +
            "</div>" +
            "<div class='image-wrapper' id='pz-wrapper'>" +
                "<img id='main-display' class='manga-image' src='' draggable='false'>" +
            "</div>" +
        "</div>";

    document.body.appendChild(overlayHost);
    renderCurrent(initialState);
}

export function renderCurrent(state) {
    if (!overlayHost || !shadow) return;
    if (state.globalPanels.length === 0) return;

    const p = state.globalPanels[state.currentPanelIndex];
    if (!p) return;

    const counter = shadow.getElementById('counter');
    if (counter) {
        counter.textContent = "Panel " + (state.currentPanelIndex + 1) + " / " + state.globalPanels.length;
    }

    const wrapperEl = shadow.getElementById('pz-wrapper');
    const mainImg = shadow.getElementById('main-display');

    if (mainImg.src !== p.url) {
        mainImg.src = p.url;
    }

    if (state.viewerSettings.mode === 'page') {
        const viewW = window.innerWidth;
        const viewH = window.innerHeight;
        const scale = Math.min((viewW * 0.95) / p.ow, (viewH * 0.95) / p.oh);
        wrapperEl.style.width = (p.ow * scale) + "px"; 
        wrapperEl.style.height = (p.oh * scale) + "px";
        mainImg.style.width = "100%"; 
        mainImg.style.height = "100%";
        mainImg.style.left = "0px"; 
        mainImg.style.top = "0px";
    } else {
        const viewW = window.innerWidth;
        const viewH = window.innerHeight;
        const margin = 0.05; // 5% padding
        const targetW = viewW * (1 - margin);
        const targetH = viewH * (1 - margin);

        const scale = Math.min(targetW / p.width, targetH / p.height);

        wrapperEl.style.width = (p.width * scale) + "px"; 
        wrapperEl.style.height = (p.height * scale) + "px";
        mainImg.style.width = (p.ow * scale) + "px"; 
        mainImg.style.height = (p.oh * scale) + "px";
        mainImg.style.left = (-p.x * scale) + "px"; 
        mainImg.style.top = (-p.y * scale) + "px";
    }
}
