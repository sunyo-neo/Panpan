if (typeof window.panelZoomInjected === 'undefined') {
    window.panelZoomInjected = true;
    console.log("  PanPan Content Script Injected Successfully!");

    let mangaImages = [];
    let globalPanels = [];
    let currentPanelIndex = 0;
    let overlayHost = null;
    let viewerSettings = { padding: 5, showAdjacent: true, direction: "manga", debug: false, hybridMode: false, zoomMode: "dynamic" };
    let isProcessingBackground = false;
    let isFullPageMode = false;
    
    let pzViewerSettings = viewerSettings;
    let pzPerf = { 
        totalSlicingTime: 0, pagesProcessed: 0, lastRenderTime: 0, memEstimate: "N/A",
        crossPageNavCount: 0, crossPageNavTotalMs: 0,
        samePageNavCount: 0, samePageNavTotalMs: 0,
        staleLoadCallbacks: 0,
        lockBlockCount: 0, lockTimeoutCount: 0,
        droppedFrames: 0
    };
    let pzTelemetry = {}; // Stores raw coordinate data for debugging
    let pzPageData = {};  // Caches raw extracted boxes for quick re-sorting

    // Shared arrays for flood fill to minimize garbage collection pressure
    let sharedVisited = null;
    let sharedStackX = null;
    let sharedStackY = null;

    function dynamicSort(boxes, direction) {
        if (boxes.length <= 1) return boxes;

        // 1. Recursive XY-Cut: Try Horizontal Cut (Tier Break)
        let ySorted = [...boxes].sort((a, b) => a.sy - b.sy);
        let yCutIndex = -1;
        let maxEy = ySorted[0].ey;
        
        for (let i = 1; i < ySorted.length; i++) {
            // If the next panel starts lower than the highest bottom-edge seen so far, we have a clear horizontal gutter
            if (ySorted[i].sy > maxEy + 5) { // 5px tolerance for scan tilt
                yCutIndex = i;
                break;
            }
            maxEy = Math.max(maxEy, ySorted[i].ey);
        }

        if (yCutIndex !== -1) {
            let topGroup = ySorted.slice(0, yCutIndex);
            let bottomGroup = ySorted.slice(yCutIndex);
            return [...dynamicSort(topGroup, direction), ...dynamicSort(bottomGroup, direction)];
        }

        // 2. Recursive XY-Cut: Try Vertical Cut (Column Break)
        let xSorted = [...boxes].sort((a, b) => a.sx - b.sx);
        let xCutIndex = -1;
        let maxEx = xSorted[0].ex;
        
        for (let i = 1; i < xSorted.length; i++) {
            // If the next panel starts further right than the furthest right-edge seen so far, we have a clear vertical gutter
            if (xSorted[i].sx > maxEx + 5) {
                xCutIndex = i;
                break;
            }
            maxEx = Math.max(maxEx, xSorted[i].ex);
        }

        if (xCutIndex !== -1) {
            let leftGroup = xSorted.slice(0, xCutIndex);
            let rightGroup = xSorted.slice(xCutIndex);
            
            // Respect reading direction when processing columns
            if (direction === "manga") {
                return [...dynamicSort(rightGroup, direction), ...dynamicSort(leftGroup, direction)];
            } else {
                return [...dynamicSort(leftGroup, direction), ...dynamicSort(rightGroup, direction)];
            }
        }

        // 3. Fallback Heuristic: If overlapping heavily without clear gutters, use spatial coordinates
        return boxes.sort((a, b) => {
            const overlap = Math.max(0, Math.min(a.ey, b.ey) - Math.max(a.sy, b.sy));
            const minH = Math.min(a.ey - a.sy, b.ey - b.sy);

            // 1. Check vertical overlap. If it's less than 40% of the smallest panel, they are on different vertical levels.
            if (overlap < minH * 0.4) {
                return a.sy - b.sy; // Top-to-bottom wins
            }

            // 2. If they overlap significantly, check if one starts substantially higher 
            // (e.g., A is top-left, B is middle-right -> A should still come first)
            const yDiff = a.sy - b.sy;
            if (yDiff < -minH * 0.5) return -1; // A starts much higher, read A first
            if (yDiff > minH * 0.5) return 1;   // B starts much higher, read B first

            // 3. Otherwise, they are effectively in the same visual row. Use horizontal reading direction.
            if (direction === "manga") {
                return b.sx - a.sx; // Right-to-Left
            } else {
                return a.sx - b.sx; // Left-to-Right
            }
        });
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "START_VIEWER") {
            viewerSettings = request.settings;
            if (!viewerSettings.zoomMode) {
                viewerSettings.zoomMode = 'dynamic';
            }
            pzViewerSettings = viewerSettings;
            
            if (overlayHost) {
                applySettingsUpdate(); // Re-sort and re-render without scanning again
            } else {
                runScanner();
            }
        } else if (request.action === "GET_PROBE_DATA") {
            sendResponse({
                currentSettings: pzViewerSettings || null,
                performanceMetrics: pzPerf || "No metrics yet"
            });
        }
        return true;
    });

    function applySettingsUpdate() {
        // Rebuild globalPanels from cached pzPageData to apply new Direction instantly
        const currentUrl = globalPanels[currentPanelIndex]?.url;
        globalPanels = [];

        for (let i = 0; i < mangaImages.length; i++) {
            const imgUrl = mangaImages[i];
            const data = pzPageData[imgUrl];
            if (!data) continue;

            if (data.rawBoxes.length === 0) {
                globalPanels.push({ sx: 0, sy: 0, sw: data.ow, sh: data.oh, ow: data.ow, oh: data.oh, url: imgUrl });
            } else {
                const sortedBoxes = dynamicSort([...data.rawBoxes], viewerSettings.direction);
                for (const p of sortedBoxes) {
                    globalPanels.push({
                        sx: Math.floor(p.sx / data.scale), sy: Math.floor(p.sy / data.scale),
                        sw: Math.floor((p.ex - p.sx) / data.scale), sh: Math.floor((p.ey - p.sy) / data.scale),
                        ow: data.ow, oh: data.oh, url: imgUrl
                    });
                }
            }
        }

        // Attempt to keep user on the same page when sorting updates
        if (currentUrl) {
            const newIdx = globalPanels.findIndex(p => p.url === currentUrl);
            if (newIdx !== -1) currentPanelIndex = newIdx;
        }

        if (overlayHost) {
            const shadow = overlayHost.shadowRoot;
            const showAdj = viewerSettings.showAdjacent === true || viewerSettings.showAdjacent === "true";
            const wrapperEl = shadow.getElementById('pz-wrapper');
            if (wrapperEl) {
                wrapperEl.style.overflow = showAdj ? 'visible' : 'hidden';
                wrapperEl.style.boxShadow = showAdj ? 'none' : '0 10px 40px rgba(0,0,0,0.8)';
            }
            
            const debugBtn = shadow.getElementById('copy-telemetry-btn');
            if (debugBtn) {
                debugBtn.style.display = viewerSettings.debug ? 'inline-block' : 'none';
            }
            renderCurrent();
        }
    }

    function runScanner() {
        const containers = document.querySelectorAll('.page-container');
        const totalPages = containers.length;
        if (totalPages === 0) return; // Silent exit if no pages

        document.body.style.overflow = 'hidden';
        
        const scanUI = document.createElement('div');
        scanUI.style.cssText = `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(9, 9, 11, 0.85); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); z-index: 2147483647; display: flex; flex-direction: column; align-items: center; justify-content: center;`;
        scanUI.innerHTML = `
            <style>
                @keyframes pulse-ring {
                    0% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.7); }
                    70% { transform: scale(1); box-shadow: 0 0 0 20px rgba(139, 92, 246, 0); }
                    100% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(139, 92, 246, 0); }
                }
                .pz-spinner {
                    width: 40px; height: 40px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #8b5cf6, #3b82f6);
                    animation: pulse-ring 2s infinite;
                    margin-bottom: 16px;
                }
                .pz-scan-text {
                    font-family: 'Outfit', sans-serif;
                    color: #fafafa;
                    font-size: 18px;
                    font-weight: 500;
                    letter-spacing: 1px;
                }
            </style>
            <div class="pz-spinner"></div>
            <div id="pz-scan-text" class="pz-scan-text">PANPAN SCANNING: 0 / ${totalPages}</div>
        `;
        document.body.appendChild(scanUI);

        mangaImages = new Array(totalPages).fill(null);
        let timeoutCounter = 0;
        
        const scanInterval = setInterval(() => {
            let allFound = true;
            let nextToFind = -1;
            let foundCount = 0;

            containers.forEach((container, index) => {
                if (mangaImages[index]) { foundCount++; } 
                else {
                    allFound = false;
                    const img = container.querySelector('img');
                    if (img && img.src) { mangaImages[index] = img.src; foundCount++; timeoutCounter = 0; } 
                    else if (nextToFind === -1) { nextToFind = index; }
                }
            });

            document.getElementById('pz-scan-text').textContent = `PANPAN SCANNING: ${foundCount} / ${totalPages}`;

            if (allFound || timeoutCounter > 50) { 
                clearInterval(scanInterval);
                mangaImages = mangaImages.filter(src => src !== null);
                document.getElementById('pz-scan-text').textContent = "SLICING PAGES...";
                startProcessing(scanUI);
            } else {
                containers[nextToFind].scrollIntoView({ behavior: 'instant', block: 'center' });
                timeoutCounter++;
            }
        }, 100);
    }

    async function startProcessing(scanUI) {
        globalPanels = [];
        pzPerf.totalSlicingTime = 0;
        pzPerf.pagesProcessed = 0;

        const firstPagePanels = await extractPanelsFromImage(mangaImages[0]);
        globalPanels.push(...firstPagePanels);
        
        scanUI.remove();
        launchOverlay();

        isProcessingBackground = true;
        for (let i = 1; i < mangaImages.length; i++) {
            const panels = await extractPanelsFromImage(mangaImages[i]);
            globalPanels.push(...panels);
        }
        isProcessingBackground = false;
        
        const loader = document.getElementById('bg-loader');
        if (loader) loader.style.display = 'none';
    }

    function extractPanelsFromImage(imgUrl) {
        return new Promise((resolve) => {
            const startTime = performance.now();
            const img = new Image();

            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                
                const MAX_DIM = 1000; 
                const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
                const w = Math.floor(img.width * scale);
                const h = Math.floor(img.height * scale);
                
                canvas.width = w; canvas.height = h;
                ctx.drawImage(img, 0, 0, w, h);
                const imgData = ctx.getImageData(0, 0, w, h);
                const data = imgData.data;
                
                const lum = new Uint8Array(w * h);
                for (let i = 0; i < w * h; i++) {
                    lum[i] = 0.299 * data[i*4] + 0.587 * data[i*4+1] + 0.114 * data[i*4+2];
                }
                
                let lightVotes = 0;
                let darkVotes = 0;
                const stepX = Math.max(1, Math.floor(w / 25));
                const stepY = Math.max(1, Math.floor(h / 25));

                function castVote(index) {
                    lum[index] > 128 ? lightVotes++ : darkVotes++;
                }

                for (let x = 0; x < w; x += stepX) {
                    castVote(x); // Top
                    castVote((h - 1) * w + x); // Bottom
                }
                for (let y = 0; y < h; y += stepY) {
                    castVote(y * w); // Left
                    castVote(y * w + (w - 1)); // Right
                }
                const bgLum = darkVotes > lightVotes ? 0 : 255;
                const INK_TOL = 25; 
                
                const isInk = new Uint8Array(w * h);
                for (let i = 0; i < w * h; i++) {
                    isInk[i] = Math.abs(lum[i] - bgLum) > INK_TOL ? 1 : 0;
                }

                const requiredSize = w * h;
                if (!sharedVisited || sharedVisited.length < requiredSize) {
                    sharedVisited = new Uint8Array(requiredSize);
                    sharedStackX = new Int32Array(requiredSize);
                    sharedStackY = new Int32Array(requiredSize);
                } else {
                    sharedVisited.fill(0, 0, requiredSize);
                }
                const visited = sharedVisited;
                const stackX = sharedStackX;
                const stackY = sharedStackY;
                const rawBoxes = [];
                const discardedBoxes = []; // NEW: Track failed shapes for debugging
                
                for (let y = 0; y < h; y++) {
                    for (let x = 0; x < w; x++) {
                        const idx = y * w + x;
                        if (!visited[idx] && isInk[idx] === 1) {
                            let minX = x, maxX = x, minY = y, maxY = y;
                            let stackPtr = 0;

                            stackX[stackPtr] = x;
                            stackY[stackPtr] = y;
                            stackPtr++;
                            visited[idx] = 1;
                            let area = 0;

                            while (stackPtr > 0) {
                                stackPtr--;
                                const cx = stackX[stackPtr];
                                const cy = stackY[stackPtr];
                                area++;

                                if (cx < minX) minX = cx;
                                if (cx > maxX) maxX = cx;
                                if (cy < minY) minY = cy;
                                if (cy > maxY) maxY = cy;

                                const neighbors = [ [cx+1, cy], [cx-1, cy], [cx, cy+1], [cx, cy-1] ];
                                for(let n=0; n<4; n++) {
                                    const nx = neighbors[n][0], ny = neighbors[n][1];
                                    if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                                        const nidx = ny * w + nx;
                                        if (!visited[nidx] && isInk[nidx] === 1) {
                                            visited[nidx] = 1;
                                            stackX[stackPtr] = nx;
                                            stackY[stackPtr] = ny;
                                            stackPtr++;
                                        }
                                    }
                                }
                            }
                            
                            const boxWidth = maxX - minX;
                            const boxHeight = maxY - minY;
                            const boxArea = boxWidth * boxHeight;
                            const pageArea = w * h;

                            // A valid panel must not wrap the entire page margin
                            const isNotEntirePage = boxArea < (pageArea * 0.95);
                            
                            // Rule 1: Ink Dense (Original rule: high raw pixel count. Great for dark, detailed panels)
                            const isInkDense = area > (pageArea * 0.005);
                            
                            // Rule 2: Sparse but Structurally Large (Great for open-top borders, white skies, simple art)
                            // Requires physical bounding box > 1.5% of page.
                            // The connected ink must be at least the length of the longest edge of the box 
                            // (ensures it's a continuous structural line like a U-shape frame, not scattered dust).
                            const isPhysicallyLarge = boxArea > (pageArea * 0.015) && area > Math.max(boxWidth, boxHeight);

                            if ((isInkDense || isPhysicallyLarge) && isNotEntirePage) {
                                rawBoxes.push({ sx: minX, sy: minY, ex: maxX, ey: maxY });
                            } else if (boxArea > (pageArea * 0.0002)) {
                                // Save noticeably sized blobs that were discarded for visual debug overlay
                                let rejectReason = "Too Small / Sparse";
                                if (!isNotEntirePage) rejectReason = "Too Large (Page Bounds)";
                                
                                discardedBoxes.push({ 
                                    sx: Math.floor(minX / scale), sy: Math.floor(minY / scale), 
                                    sw: Math.floor(boxWidth / scale), sh: Math.floor(boxHeight / scale), 
                                    reason: rejectReason
                                });
                            }
                        }
                    }
                }

                const validBoxes = [];
                for (let i = 0; i < rawBoxes.length; i++) {
                    let isInside = false;
                    const bA = rawBoxes[i];
                    
                    for (let j = 0; j < rawBoxes.length; j++) {
                        if (i === j) continue;
                        const bB = rawBoxes[j];
                        
                        // Check if bA is 100% contained within bB (with a tiny 2px tolerance)
                        if (bA.sx >= bB.sx - 2 && bA.ex <= bB.ex + 2 && 
                            bA.sy >= bB.sy - 2 && bA.ey <= bB.ey + 2) {
                            isInside = true;
                            
                            // Log the discarded bubble/art asset to the visual debugger
                            discardedBoxes.push({ 
                                sx: Math.floor(bA.sx / scale), sy: Math.floor(bA.sy / scale), 
                                sw: Math.floor((bA.ex - bA.sx) / scale), sh: Math.floor((bA.ey - bA.sy) / scale), 
                                reason: "Contained / Bubble"
                            });
                            break;
                        }
                    }
                    
                    // Only keep boxes that are NOT fully trapped inside another box
                    if (!isInside) validBoxes.push(bA);
                }

                const panels = [];

                if (validBoxes.length === 0) {
                    panels.push({ sx: 0, sy: 0, sw: img.width, sh: img.height, ow: img.width, oh: img.height, url: imgUrl });
                    pzPageData[imgUrl] = { scale: scale, ow: img.width, oh: img.height, rawBoxes: [] };
                } else {
                    pzPageData[imgUrl] = {
                        scale: scale,
                        ow: img.width,
                        oh: img.height,
                        rawBoxes: JSON.parse(JSON.stringify(validBoxes)) // Cache the filtered boxes
                    };

                    const sortedBoxes = dynamicSort([...validBoxes], viewerSettings.direction);

                    for (const p of sortedBoxes) {
                        panels.push({
                            sx: Math.floor(p.sx / scale), sy: Math.floor(p.sy / scale),
                            sw: Math.floor((p.ex - p.sx) / scale), sh: Math.floor((p.ey - p.sy) / scale),
                            ow: img.width, oh: img.height, url: imgUrl
                        });
                    }
                }
                
                if (viewerSettings.debug) {
                    pzTelemetry[imgUrl] = {
                        imageDimensions: { w, h, scale, ow: img.width, oh: img.height },
                        bgLum: bgLum,
                        votes: { lightVotes, darkVotes },
                        rawBoxes: JSON.parse(JSON.stringify(rawBoxes)),
                        discardedBoxes: discardedBoxes,
                        finalPanels: JSON.parse(JSON.stringify(panels))
                    };
                }

                pzPerf.totalSlicingTime += (performance.now() - startTime);
                pzPerf.pagesProcessed++;
                if (performance.memory) pzPerf.memEstimate = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + " MB";
                
                resolve(panels);
            };
            img.src = imgUrl;
        });
    }

    function launchOverlay() {
        if (overlayHost) return;

        overlayHost = document.createElement('div');
        overlayHost.id = "panel-zoom-extension-host";
        overlayHost.style.cssText = `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 2147483647; background: #000000;`;
        
        const shadow = overlayHost.attachShadow({mode: 'closed'});
        const showAdj = viewerSettings.showAdjacent === true || viewerSettings.showAdjacent === "true";
        
        shadow.innerHTML = `
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap');
                
                :host {
                    /* Background System */
                    --bg-base: #000000;
                    --bg-surface: rgba(24, 24, 27, 0.65);
                    --bg-elevated: rgba(39, 39, 42, 0.8);
                    
                    /* Brand Colors */
                    --primary-solid: #6366f1;
                    --primary-gradient-start: #8b5cf6;
                    --primary-gradient-end: #3b82f6;
                    --primary-gradient: linear-gradient(135deg, var(--primary-gradient-start), var(--primary-gradient-end));
                    
                    /* Semantic Colors */
                    --color-success: #10b981;
                    --color-warning: #f59e0b;
                    --color-error: #ef4444;
                    
                    /* Typography Scale */
                    --text-primary: #fafafa;
                    --text-secondary: #a1a1aa;
                    --text-muted: #71717a;
                    
                    --font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    --font-size-micro: 0.625rem;  /* 10px */
                    --font-size-sm: 0.75rem;      /* 12px */
                    --font-size-base: 0.875rem;   /* 14px */
                    --font-size-lg: 1rem;         /* 16px */
                    
                    /* Spacing System */
                    --space-1: 0.25rem;   /* 4px */
                    --space-2: 0.5rem;    /* 8px */
                    --space-3: 0.75rem;   /* 12px */
                    --space-4: 1rem;      /* 16px */
                    --space-6: 1.5rem;    /* 24px */
                    
                    /* Border Radius */
                    --radius-sm: 6px;
                    --radius-md: 12px;
                    --radius-lg: 16px;
                    --radius-pill: 9999px;
                    
                    /* Effects */
                    --shadow-ambient: 0 4px 20px rgba(0, 0, 0, 0.4);
                    --glass-border: 1px solid rgba(255, 255, 255, 0.08);
                    --transition-fast: 0.2s ease-out;
                    --transition-normal: 0.3s ease-out;
                }

                * { user-select: none; -webkit-user-select: none; }
                .viewer-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    width: 100vw;
                    height: 100vh;
                    position: relative;
                    background-color: var(--bg-base);
                }
                .image-wrapper {
                    position: relative;
                    overflow: ${showAdj ? 'visible' : 'hidden'};
                    box-shadow: ${showAdj ? 'none' : '0 10px 40px rgba(0,0,0,0.8)'};
                    visibility: hidden;
                    transition: transform 0.3s ease, box-shadow 0.3s ease, width 0.3s ease-out, height 0.3s ease-out;
                    will-change: transform, width, height;
                }
                .image-wrapper.is-buffer-mode {
                    transform: scale(0.95);
                    box-shadow: 0 0 40px rgba(139, 92, 246, 0.3);
                }
                .manga-image {
                    position: absolute;
                    max-width: none !important;
                    max-height: none !important;
                    will-change: transform, left, top, width, height, opacity;
                    transform: translateZ(0);
                    transition: transform 0.3s ease-out, left 0.3s ease-out, top 0.3s ease-out, width 0.3s ease-out, height 0.3s ease-out, opacity 0.2s ease-out;
                }
                .nav-zone {
                    position: absolute;
                    top: 0;
                    height: 100%;
                    width: 30%;
                    z-index: 10;
                    transition: background var(--transition-normal);
                }
                .nav-left {
                    left: 0;
                }
                .nav-left:hover {
                    background: linear-gradient(to right, rgba(255, 255, 255, 0.05), transparent);
                    cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0px 2px 4px rgba(0,0,0,0.8));"><polyline points="15 18 9 12 15 6"></polyline></svg>') 16 16, pointer;
                }
                .nav-right {
                    right: 0;
                }
                .nav-right:hover {
                    background: linear-gradient(to left, rgba(255, 255, 255, 0.05), transparent);
                    cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0px 2px 4px rgba(0,0,0,0.8));"><polyline points="9 18 15 12 9 6"></polyline></svg>') 16 16, pointer;
                }
                
                .top-bar {
                    position: absolute;
                    top: 24px;
                    left: 50%;
                    transform: translateX(-50%) translateY(-20px);
                    padding: 8px 24px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 24px;
                    color: var(--text-primary);
                    font-family: var(--font-family);
                    background: var(--bg-surface);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: var(--glass-border);
                    border-radius: 24px;
                    z-index: 20;
                    opacity: 0;
                    visibility: hidden;
                    transition: opacity var(--transition-normal), transform var(--transition-normal), visibility var(--transition-normal);
                    box-shadow: var(--shadow-ambient);
                    white-space: nowrap;
                }
                .viewer-container:hover .top-bar {
                    opacity: 1;
                    visibility: visible;
                    transform: translateX(-50%) translateY(0);
                }
                
                .close-btn, .full-page-btn, .copy-tel-btn {
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    color: var(--text-primary);
                    padding: 6px 14px;
                    border-radius: var(--radius-pill);
                    cursor: pointer;
                    font-family: var(--font-family);
                    font-size: var(--font-size-sm);
                    font-weight: 600;
                    transition: background var(--transition-fast), border-color var(--transition-fast), transform var(--transition-fast);
                    margin-left: 6px;
                }
                .close-btn {
                    background: rgba(239, 68, 68, 0.15);
                    border-color: rgba(239, 68, 68, 0.3);
                }
                .close-btn:hover {
                    background: rgba(239, 68, 68, 0.4);
                    border-color: rgba(239, 68, 68, 0.6);
                    transform: translateY(-1px);
                }
                .full-page-btn {
                    background: rgba(59, 130, 246, 0.15);
                    border-color: rgba(59, 130, 246, 0.3);
                }
                .full-page-btn:hover {
                    background: rgba(59, 130, 246, 0.4);
                    border-color: rgba(59, 130, 246, 0.6);
                    transform: translateY(-1px);
                }
                .copy-tel-btn {
                    background: rgba(139, 92, 246, 0.15);
                    border-color: rgba(139, 92, 246, 0.3);
                }
                .copy-tel-btn:hover {
                    background: rgba(139, 92, 246, 0.4);
                    border-color: rgba(139, 92, 246, 0.6);
                    transform: translateY(-1px);
                }
                
                .counter {
                    font-size: var(--font-size-base);
                    font-family: var(--font-family);
                    color: var(--text-secondary);
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .counter span {
                    color: var(--text-primary);
                    font-weight: 600;
                }
                
                .loading-spinner {
                    position: absolute;
                    top: 24px;
                    right: 24px;
                    display: none;
                    align-items: center;
                    gap: 8px;
                    color: var(--text-primary);
                    font-family: var(--font-family);
                    font-size: var(--font-size-sm);
                    font-weight: 500;
                    background: var(--bg-surface);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: var(--glass-border);
                    border-radius: var(--radius-pill);
                    padding: 8px 16px;
                    box-shadow: var(--shadow-ambient);
                    z-index: 30;
                }
                .spinner-icon {
                    width: 14px;
                    height: 14px;
                    border: 2px solid rgba(255, 255, 255, 0.1);
                    border-top-color: var(--primary-solid);
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                
                .helper-text {
                    position: absolute;
                    bottom: 24px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: var(--bg-surface);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: var(--glass-border);
                    padding: 8px 18px;
                    border-radius: var(--radius-pill);
                    color: var(--text-primary);
                    font-size: var(--font-size-base);
                    font-family: var(--font-family);
                    pointer-events: none;
                    z-index: 20;
                    box-shadow: var(--shadow-ambient);
                    transition: opacity var(--transition-normal), visibility var(--transition-normal);
                    opacity: 0;
                    visibility: hidden;
                }
                
                .hybrid-legend {
                    position: fixed;
                    bottom: 24px;
                    right: 24px;
                    background: var(--bg-surface);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: var(--glass-border);
                    padding: 8px 16px;
                    border-radius: var(--radius-pill);
                    color: var(--text-secondary);
                    font-size: var(--font-size-sm);
                    font-family: var(--font-family);
                    pointer-events: none;
                    z-index: 30;
                    box-shadow: var(--shadow-ambient);
                    transition: opacity var(--transition-fast), visibility var(--transition-fast);
                    opacity: 0;
                    visibility: hidden;
                }
                
                .hud-hidden .top-bar {
                    opacity: 0 !important;
                    pointer-events: none !important;
                    transform: translateX(-50%) translateY(-20px) !important;
                    visibility: hidden !important;
                }
                .hud-hidden .hybrid-legend {
                    opacity: 0 !important;
                    pointer-events: none !important;
                    visibility: hidden !important;
                }
                .hud-hidden .helper-text {
                    opacity: 0 !important;
                    pointer-events: none !important;
                    visibility: hidden !important;
                }
            </style>
            <div class="viewer-container">
                <div class="top-bar">
                    <div class="counter">
                        <div>Page <span id="curr-page-num">1</span> • <span id="total-page-num">1</span></div>
                        <div style="color: rgba(255,255,255,0.2); margin: 0 4px;">•</div>
                        <div>Panel <span id="curr-panel-num">1</span> • <span id="total-panel-num">1</span></div>
                    </div>
                    <div>
                        <button class="copy-tel-btn" id="copy-telemetry-btn" style="display: ${viewerSettings.debug ? 'inline-block' : 'none'};">Copy Telemetry</button>
                        <button class="full-page-btn" id="toggle-full-page">Toggle Full Page (P)</button>
                        <button class="close-btn" id="close-viewer">Exit Viewer</button>
                    </div>
                </div>
                <div class="loading-spinner" id="bg-loader">
                    <div class="spinner-icon"></div>
                    <span>Slicing Background Pages...</span>
                </div>
                <div class="nav-zone nav-left" id="zone-prev"></div>
                <div class="nav-zone nav-right" id="zone-next"></div>
                <div class="image-wrapper" id="pz-wrapper"><img id="main-display" class="manga-image" src="" draggable="false"></div>
                <div class="helper-text" id="helper-txt">Double-click a panel to zoom in!</div>
                <div class="hybrid-legend" id="pz-hybrid-legend">[↓] Dive into panels | [←] [→] Change Page</div>
            </div>
        `;
        document.body.appendChild(overlayHost);
 
        const wrapperEl = shadow.getElementById('pz-wrapper');
        const mainImg = shadow.getElementById('main-display');
        const loader = shadow.getElementById('bg-loader');
        const helperTxt = shadow.getElementById('helper-txt');
        
        let currentLoadedUrl = "";
        let helperTimeout = null;
        
        // Navigation lock to prevent overlapping source swaps (e.g. from rapid key presses).
        // It's set to true during a cross-page load, and released after the new image
        // has loaded, layout is painted via rAF, or a 500ms safety timeout expires.
        let isNavigating = false;
        
        const renderCurrent = () => {
            const renderStart = performance.now();
            if (currentPanelIndex >= globalPanels.length) return;
            loader.style.display = isProcessingBackground && currentPanelIndex > globalPanels.length - 5 ? 'flex' : 'none';
            const p = globalPanels[currentPanelIndex];
            
            // UI Counters
            const pageIdx = mangaImages.indexOf(p.url) + 1;
            const panelsOnThisPage = globalPanels.filter(panel => panel.url === p.url);
            const panelIdxOnPage = panelsOnThisPage.indexOf(p) + 1;
            shadow.getElementById('curr-page-num').textContent = pageIdx;
            shadow.getElementById('total-page-num').textContent = mangaImages.length;
            
            if (isFullPageMode) {
                shadow.getElementById('curr-panel-num').textContent = "Full";
                shadow.getElementById('total-panel-num').textContent = "Page";
            } else {
                shadow.getElementById('curr-panel-num').textContent = panelIdxOnPage;
                shadow.getElementById('total-panel-num').textContent = panelsOnThisPage.length;
            }

            const applyCoordinates = () => {
                const viewW = window.innerWidth;
                const viewH = window.innerHeight;
                
                const existingDebugs = shadow.querySelectorAll('.pz-debug-box');
                existingDebugs.forEach(el => el.remove());

                const hybridLegend = shadow.getElementById('pz-hybrid-legend');

                if (isFullPageMode) {
                    if (viewerSettings.hybridMode) {
                        wrapperEl.classList.add('is-buffer-mode');
                        if (hybridLegend) {
                            hybridLegend.style.opacity = '1';
                            hybridLegend.style.visibility = 'visible';
                        }
                    } else {
                        wrapperEl.classList.remove('is-buffer-mode');
                        if (hybridLegend) {
                            hybridLegend.style.opacity = '0';
                            hybridLegend.style.visibility = 'hidden';
                        }
                        
                        helperTxt.textContent = "Double-click a panel to zoom in!";
                        helperTxt.style.opacity = '1';
                        helperTxt.style.visibility = 'visible';
                        if (helperTimeout) clearTimeout(helperTimeout);
                        helperTimeout = setTimeout(() => {
                            helperTxt.style.opacity = '0';
                            helperTxt.style.visibility = 'hidden';
                        }, 3500);
                    }
                    const scale = Math.min((viewW * 0.95) / p.ow, (viewH * 0.95) / p.oh);
                    wrapperEl.style.width = (p.ow * scale) + 'px'; 
                    wrapperEl.style.height = (p.oh * scale) + 'px';
                    mainImg.style.width = '100%'; 
                    mainImg.style.height = '100%';
                    mainImg.style.left = '0px'; 
                    mainImg.style.top = '0px';
                    
                    if (viewerSettings.debug) {
                        const tel = pzTelemetry[p.url];
                        if (tel) {
                            // Draw Accepted Panels
                            tel.finalPanels.forEach((panel, idx) => {
                                const box = document.createElement('div');
                                box.className = 'pz-debug-box';
                                box.style.cssText = `position: absolute; border: 4px solid #10b981; background: rgba(16, 185, 129, 0.15); box-sizing: border-box; display: flex; align-items: center; justify-content: center; color: #10b981; font-size: 3rem; font-family: sans-serif; font-weight: 900; text-shadow: -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000; z-index: 100; pointer-events: none;`;
                                box.style.left = (panel.sx / panel.ow * 100) + '%';
                                box.style.top = (panel.sy / panel.oh * 100) + '%';
                                box.style.width = (panel.sw / panel.ow * 100) + '%';
                                box.style.height = (panel.sh / panel.oh * 100) + '%';
                                box.textContent = (idx + 1);
                                wrapperEl.appendChild(box);
                            });

                            // Draw Discarded Boxes
                            if (tel.discardedBoxes) {
                                tel.discardedBoxes.forEach(box => {
                                    const dBox = document.createElement('div');
                                    dBox.className = 'pz-debug-box';
                                    dBox.style.cssText = `position: absolute; border: 2px dashed #ef4444; background: rgba(239, 68, 68, 0.2); box-sizing: border-box; display: flex; align-items: flex-start; justify-content: flex-start; color: #ef4444; font-size: 1rem; font-family: sans-serif; font-weight: bold; text-shadow: 1px 1px 2px black; padding: 4px; z-index: 99; pointer-events: none;`;
                                    dBox.style.left = (box.sx / tel.imageDimensions.ow * 100) + '%';
                                    dBox.style.top = (box.sy / tel.imageDimensions.oh * 100) + '%';
                                    dBox.style.width = (box.sw / tel.imageDimensions.ow * 100) + '%';
                                    dBox.style.height = (box.sh / tel.imageDimensions.oh * 100) + '%';
                                    dBox.textContent = box.reason;
                                    wrapperEl.appendChild(dBox);
                                });
                            }
                        }
                    }
                } else {
                    wrapperEl.classList.remove('is-buffer-mode');
                    if (hybridLegend) {
                        hybridLegend.style.opacity = '0';
                        hybridLegend.style.visibility = 'hidden';
                    }

                    helperTxt.style.opacity = '0';
                    helperTxt.style.visibility = 'hidden';
                    if (helperTimeout) clearTimeout(helperTimeout);
                    
                    // Fixed Padding spatial math: applies padding to viewport dimensions cleanly
                    const margin = viewerSettings.padding / 100;
                    const targetW = viewW * (1 - margin);
                    const targetH = viewH * (1 - margin);

                    let scale = Math.min(targetW / p.sw, targetH / p.sh);
                    const zoomMode = viewerSettings.zoomMode || 'dynamic';
                    if (zoomMode === 'dynamic') {
                        const maxRatio = Math.max(p.sw / p.ow, p.sh / p.oh);
                        scale = scale * Math.sqrt(maxRatio);
                    } else if (zoomMode === 'page-scale') {
                        scale = Math.min(targetW / p.ow, targetH / p.oh);
                    }
                    
                    wrapperEl.style.width = (p.sw * scale) + 'px'; 
                    wrapperEl.style.height = (p.sh * scale) + 'px';
                    mainImg.style.width = (p.ow * scale) + 'px'; 
                    mainImg.style.height = (p.oh * scale) + 'px';
                    mainImg.style.left = (-p.sx * scale) + 'px'; 
                    mainImg.style.top = (-p.sy * scale) + 'px';
                }
                pzPerf.lastRenderTime = performance.now() - renderStart;
            };

            if (currentLoadedUrl !== p.url) {
                currentLoadedUrl = p.url;
                pzPerf.crossPageNavCount++;
                
                isNavigating = true;
                
                // H1 Fix: Disable transitions during source swap
                mainImg.style.transition = 'none';
                wrapperEl.style.transition = 'none';
                mainImg.style.opacity = '0.5';
                
                const handleLoad = () => {
                    if (mainImg.src === p.url) {
                        pzPerf.crossPageNavTotalMs += (performance.now() - renderStart);
                        applyCoordinates();
                        // H3 Fix: Ensure layout is computed before revealing
                        requestAnimationFrame(() => {
                            mainImg.style.opacity = '1';
                            wrapperEl.style.visibility = 'visible';
                            // H1 Fix: Re-enable transitions after coordinates painted
                            requestAnimationFrame(() => {
                                mainImg.style.transition = '';
                                wrapperEl.style.transition = '';
                                isNavigating = false;
                            });
                        });
                    } else {
                        pzPerf.staleLoadCallbacks++;
                    }
                };
                
                mainImg.onload = handleLoad;
                mainImg.onerror = handleLoad;
                mainImg.src = p.url;
                
                // Safety timeout: prevent permanent lock if load event never fires
                setTimeout(() => { 
                    if (isNavigating) {
                        isNavigating = false;
                        pzPerf.lockTimeoutCount++;
                    }
                }, 500);

                // Frame monitor
                let lastFrame = performance.now();
                const frameMonitor = (ts) => {
                    if (ts - lastFrame > 50) pzPerf.droppedFrames++;
                    lastFrame = ts;
                    if (isNavigating) requestAnimationFrame(frameMonitor);
                };
                requestAnimationFrame(frameMonitor);
            } else {
                pzPerf.samePageNavCount++;
                applyCoordinates();
                pzPerf.samePageNavTotalMs += (performance.now() - renderStart);
            }
        };

        const goNext = () => {
            if (isNavigating) {
                pzPerf.lockBlockCount++;
                return;
            }
            if (isFullPageMode) {
                goNextPage();
            } else {
                if (currentPanelIndex < globalPanels.length - 1) { currentPanelIndex++; renderCurrent(); }
            }
        };

        const goPrev = () => { 
            if (isNavigating) {
                pzPerf.lockBlockCount++;
                return;
            }
            if (isFullPageMode) {
                goPrevPage();
            } else {
                if (currentPanelIndex > 0) { currentPanelIndex--; renderCurrent(); } 
            }
        };

        const goNextPage = () => {
            if (isNavigating) { pzPerf.lockBlockCount++; return; }
            const currentUrl = globalPanels[currentPanelIndex].url;
            let nextIndex = currentPanelIndex;
            while (nextIndex < globalPanels.length && globalPanels[nextIndex].url === currentUrl) nextIndex++;
            if (nextIndex < globalPanels.length) {
                currentPanelIndex = nextIndex;
                isFullPageMode = true;  // Always land in buffer state
                renderCurrent();
            }
        };

        const goPrevPage = () => {
            if (isNavigating) { pzPerf.lockBlockCount++; return; }
            const currentUrl = globalPanels[currentPanelIndex].url;
            let prevIndex = currentPanelIndex;
            while (prevIndex > 0 && globalPanels[prevIndex].url === currentUrl) prevIndex--;
            if (prevIndex >= 0) {
                const prevUrl = globalPanels[prevIndex].url;
                while (prevIndex > 0 && globalPanels[prevIndex - 1].url === prevUrl) prevIndex--;
                currentPanelIndex = prevIndex;
                isFullPageMode = true;  // Always land in buffer state
                renderCurrent();
            }
        };

        const goNextPanel = () => {
            if (isNavigating) { pzPerf.lockBlockCount++; return; }
            if (isFullPageMode) {
                // "Dive in" — enter panel mode at first panel of current page
                isFullPageMode = false;
                renderCurrent();
            } else {
                // Navigate to next panel
                const currentUrl = globalPanels[currentPanelIndex].url;
                if (currentPanelIndex < globalPanels.length - 1 && globalPanels[currentPanelIndex + 1].url === currentUrl) {
                    // Next panel on same page
                    currentPanelIndex++;
                    renderCurrent();
                } else {
                    // Last panel on page — return to buffer showing next page
                    if (viewerSettings.hybridMode) {
                        goNextPage();
                    } else {
                        goNext(); // Legacy: just go to next panel/page
                    }
                }
            }
        };

        const goPrevPanel = () => {
            if (isNavigating) { pzPerf.lockBlockCount++; return; }
            if (isFullPageMode) return; // Already in buffer, Up does nothing (or could go to prev page buffer)
            
            const currentUrl = globalPanels[currentPanelIndex].url;
            const panelsOnPage = globalPanels.filter(p => p.url === currentUrl);
            const panelIdx = panelsOnPage.indexOf(globalPanels[currentPanelIndex]);
            
            if (panelIdx > 0) {
                currentPanelIndex--;
                renderCurrent();
            } else {
                // First panel on page — Up returns to buffer for current page
                isFullPageMode = true;
                renderCurrent();
            }
        };

        const closeViewer = () => {
            const currentUrl = globalPanels[currentPanelIndex]?.url;
            const pageIndex = currentUrl ? mangaImages.indexOf(currentUrl) : -1;
            
            document.body.removeChild(overlayHost);
            document.body.style.overflow = ''; 
            overlayHost = null;
            document.removeEventListener('keydown', handleKeydown);

            if (pageIndex !== -1) {
                const containers = document.querySelectorAll('.page-container');
                if (containers[pageIndex]) {
                    containers[pageIndex].scrollIntoView({ behavior: 'instant', block: 'start' });
                }
            }
        };

        shadow.getElementById('zone-next').addEventListener('click', () => {
            viewerSettings.hybridMode ? goNextPage() : goNext();
        });
        shadow.getElementById('zone-prev').addEventListener('click', () => {
            viewerSettings.hybridMode ? goPrevPage() : goPrev();
        });
        shadow.getElementById('close-viewer').addEventListener('click', closeViewer);
        shadow.getElementById('copy-telemetry-btn').addEventListener('click', dumpTelemetry);
        
        shadow.getElementById('toggle-full-page').addEventListener('click', () => {
            if (isNavigating) return;
            isFullPageMode = !isFullPageMode;
            renderCurrent();
        });

        const container = shadow.querySelector('.viewer-container');

        let clickTimer = null;
        const toggleHUD = () => {
            container.classList.toggle('hud-hidden');
        };

        container.addEventListener('click', (e) => {
            if (e.target.closest('.nav-zone') || e.target.closest('.top-bar') || e.target.closest('.hybrid-legend')) return;
            if (isNavigating) return;

            if (clickTimer) clearTimeout(clickTimer);
            clickTimer = setTimeout(() => {
                toggleHUD();
                clickTimer = null;
            }, 250);
        });

        container.addEventListener('dblclick', (e) => {
            // Ignore double clicks if they happened on the navigation zones or top bar.
            // This prevents accidental full-page toggles when fast-clicking.
            if (e.target.closest('.nav-zone') || e.target.closest('.top-bar')) return;
            if (isNavigating) return;

            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }

            if (isFullPageMode) {
                // Determine which exact panel the user is hovering over to zoom into
                const p = globalPanels[currentPanelIndex];
                const rect = wrapperEl.getBoundingClientRect();
                
                const scaleX = p.ow / rect.width;
                const scaleY = p.oh / rect.height;
                const clickX = (e.clientX - rect.left) * scaleX;
                const clickY = (e.clientY - rect.top) * scaleY;

                for (let i = 0; i < globalPanels.length; i++) {
                    const panel = globalPanels[i];
                    if (panel.url === p.url && 
                        clickX >= panel.sx && clickX <= (panel.sx + panel.sw) &&
                        clickY >= panel.sy && clickY <= (panel.sy + panel.sh)) {
                        currentPanelIndex = i;
                        isFullPageMode = false;
                        renderCurrent();
                        return;
                    }
                }
                
                // If hybrid mode is enabled, clicking anywhere in the buffer state 
                // outside a specific panel will still dive into the first panel.
                if (viewerSettings.hybridMode) {
                    goNextPanel();
                }
            } else {
                // If in panel view, double click in center toggles full page mode
                isFullPageMode = true;
                renderCurrent();
            }
        });

        const handleKeydown = (e) => {
            if (viewerSettings.hybridMode) {
                if (isFullPageMode) {
                    // Buffer Mode (Macro): Left/Right = Pages, Down = Dive in
                    if (e.key === 'ArrowRight' || e.key === 'd') goNextPage();
                    if (e.key === 'ArrowLeft' || e.key === 'a') goPrevPage();
                    if (e.key === 'ArrowDown' || e.key === 's') goNextPanel();
                } else {
                    // Panel Mode (Micro): Left/Right = Panels, Up = Zoom out
                    if (e.key === 'ArrowRight' || e.key === 'd') goNextPanel();
                    if (e.key === 'ArrowLeft' || e.key === 'a') goPrevPanel();
                    if (e.key === 'ArrowUp' || e.key === 'w') {
                        if (isNavigating) return;
                        isFullPageMode = true;
                        renderCurrent();
                    }
                }
            } else {
                // Legacy: Left/Right = next/prev (panel or page depending on mode)
                if (e.key === 'ArrowRight' || e.key === 'd') goNext();
                if (e.key === 'ArrowLeft' || e.key === 'a') goPrev();
            }
            if (e.key === 'p' || e.key === 'P') {
                if (isNavigating) return;
                isFullPageMode = !isFullPageMode;
                renderCurrent();
            }
            if (e.key === 'z' || e.key === 'Z') {
                if (isNavigating) return;
                const modes = ['dynamic', 'page-scale', 'fill-canvas'];
                const currentMode = viewerSettings.zoomMode || 'dynamic';
                let nextIdx = (modes.indexOf(currentMode) + 1) % modes.length;
                viewerSettings.zoomMode = modes[nextIdx];
                renderCurrent();
                
                const prettyNames = {
                    'dynamic': 'Dynamic',
                    'page-scale': 'Page Scale',
                    'fill-canvas': 'Fill Canvas'
                };
                helperTxt.textContent = `Zoom Mode: ${prettyNames[viewerSettings.zoomMode]}`;
                helperTxt.style.opacity = '1';
                helperTxt.style.visibility = 'visible';
                if (helperTimeout) clearTimeout(helperTimeout);
                helperTimeout = setTimeout(() => {
                    if (isFullPageMode) {
                        if (!viewerSettings.hybridMode) {
                            helperTxt.textContent = "Double-click a panel to zoom in!";
                        } else {
                            helperTxt.textContent = "";
                        }
                    } else {
                        helperTxt.textContent = "";
                    }
                    helperTxt.style.opacity = '0';
                    helperTxt.style.visibility = 'hidden';
                }, 2500);
            }
            if (e.key === 'Escape') closeViewer();
            if ((e.key === 't' || e.key === 'T') && viewerSettings.debug) dumpTelemetry();
        };
        
        function dumpTelemetry() {
            if (!viewerSettings.debug) return;
            const currentUrl = globalPanels[currentPanelIndex].url;
            const data = pzTelemetry[currentUrl];
            
            if (!data) {
                helperTxt.textContent = "No telemetry for this page (Debug was OFF during scan).";
                helperTxt.style.opacity = '1';
                helperTxt.style.visibility = 'visible';
                if (helperTimeout) clearTimeout(helperTimeout);
                helperTimeout = setTimeout(() => {
                    if (isFullPageMode) helperTxt.textContent = "Double-click a panel to zoom in!";
                    helperTxt.style.opacity = '0';
                    helperTxt.style.visibility = 'hidden';
                }, 3000);
                return;
            }

            const report = JSON.stringify({ targetPage: currentUrl, data: data }, null, 2);
            navigator.clipboard.writeText(report).then(() => {
                helperTxt.textContent = "Telemetry copied to clipboard!";
                helperTxt.style.opacity = '1';
                helperTxt.style.visibility = 'visible';
                if (helperTimeout) clearTimeout(helperTimeout);
                helperTimeout = setTimeout(() => {
                    if (isFullPageMode) helperTxt.textContent = "Double-click a panel to zoom in!";
                    helperTxt.style.opacity = '0';
                    helperTxt.style.visibility = 'hidden';
                }, 3000);
            });
        }

        document.addEventListener('keydown', handleKeydown);
        
        if (viewerSettings.hybridMode) {
            isFullPageMode = true;
        }
        
        renderCurrent();
    }
}