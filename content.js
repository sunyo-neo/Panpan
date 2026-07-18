if (typeof window.panelZoomInjected === 'undefined') {
    window.panelZoomInjected = true;
    console.log("  PanPan Content Script Injected Successfully!");

    let mangaImages = [];
    let globalPanels = [];
    let currentPanelIndex = 0;
    let overlayHost = null;
    let viewerSettings = { padding: 5, showAdjacent: true, direction: "manga", debug: false };
    let isProcessingBackground = false;
    let isFullPageMode = false;
    
    window.pzViewerSettings = viewerSettings;
    window.pzPerf = { totalSlicingTime: 0, pagesProcessed: 0, lastRenderTime: 0, memEstimate: "N/A" };
    window.pzTelemetry = {}; // Stores raw coordinate data for debugging
    window.pzPageData = {};  // Caches raw extracted boxes for quick re-sorting

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
            window.pzViewerSettings = viewerSettings;
            
            if (overlayHost) {
                applySettingsUpdate(); // Re-sort and re-render without scanning again
            } else {
                runScanner();
            }
        }
        return true;
    });

    function applySettingsUpdate() {
        // Rebuild globalPanels from cached pzPageData to apply new Direction instantly
        const currentUrl = globalPanels[currentPanelIndex]?.url;
        globalPanels = [];

        for (let i = 0; i < mangaImages.length; i++) {
            const imgUrl = mangaImages[i];
            const data = window.pzPageData[imgUrl];
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
        scanUI.style.cssText = `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.95); color: #10b981; z-index: 2147483647; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: monospace; font-size: 24px; font-weight: bold;`;
        scanUI.innerHTML = `<div id="pz-scan-text">PAC-MAN SCANNING: 0 / ${totalPages}</div>`;
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
                    const img = container.querySelector('img[src^="blob:"]');
                    if (img && img.src) { mangaImages[index] = img.src; foundCount++; timeoutCounter = 0; } 
                    else if (nextToFind === -1) { nextToFind = index; }
                }
            });

            document.getElementById('pz-scan-text').textContent = `PAC-MAN SCANNING: ${foundCount} / ${totalPages}`;

            if (allFound || timeoutCounter > 50) { 
                clearInterval(scanInterval);
                mangaImages = mangaImages.filter(src => src !== null);
                document.getElementById('pz-scan-text').textContent = "SLICING PAGE 1...";
                startProcessing(scanUI);
            } else {
                containers[nextToFind].scrollIntoView({ behavior: 'instant', block: 'center' });
                timeoutCounter++;
            }
        }, 100);
    }

    async function startProcessing(scanUI) {
        globalPanels = [];
        window.pzPerf.totalSlicingTime = 0;
        window.pzPerf.pagesProcessed = 0;

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

                const visited = new Uint8Array(w * h);
                const stackX = new Int32Array(w * h);
                const stackY = new Int32Array(w * h);
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
                    window.pzPageData[imgUrl] = { scale: scale, ow: img.width, oh: img.height, rawBoxes: [] };
                } else {
                    window.pzPageData[imgUrl] = {
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
                    window.pzTelemetry[imgUrl] = {
                        imageDimensions: { w, h, scale, ow: img.width, oh: img.height },
                        bgLum: bgLum,
                        votes: { lightVotes, darkVotes },
                        rawBoxes: JSON.parse(JSON.stringify(rawBoxes)),
                        discardedBoxes: discardedBoxes,
                        finalPanels: JSON.parse(JSON.stringify(panels))
                    };
                }

                window.pzPerf.totalSlicingTime += (performance.now() - startTime);
                window.pzPerf.pagesProcessed++;
                if (performance.memory) window.pzPerf.memEstimate = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + " MB";
                
                resolve(panels);
            };
            img.src = imgUrl;
        });
    }

    function launchOverlay() {
        if (overlayHost) return;

        overlayHost = document.createElement('div');
        overlayHost.id = "panel-zoom-extension-host";
        overlayHost.style.cssText = `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 2147483647; background: #080808;`;
        
        const shadow = overlayHost.attachShadow({mode: 'closed'});
        const showAdj = viewerSettings.showAdjacent === true || viewerSettings.showAdjacent === "true";
        
        shadow.innerHTML = `
            <style>
                * { user-select: none; -webkit-user-select: none; }
                .viewer-container { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100vw; height: 100vh; position: relative; }
                .image-wrapper { position: relative; overflow: ${showAdj ? 'visible' : 'hidden'}; box-shadow: ${showAdj ? 'none' : '0 10px 40px rgba(0,0,0,0.8)'}; visibility: hidden; }
                .manga-image { position: absolute; max-width: none !important; max-height: none !important; will-change: transform; transform: translateZ(0); }
                .nav-zone { position: absolute; top: 0; height: 100%; width: 30%; cursor: pointer; z-index: 10; }
                .nav-left { left: 0; } .nav-right { right: 0; }
                .top-bar { position: absolute; top: 0; left: 0; right: 0; padding: 16px; display: flex; justify-content: space-between; align-items: center; color: #fff; font-family: sans-serif; background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent); z-index: 20; opacity: 0; transition: opacity 0.3s; }
                .viewer-container:hover .top-bar { opacity: 1; }
                .close-btn { background: #ef4444; border: none; color: white; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: bold; margin-left: 8px;}
                .full-page-btn { background: #3b82f6; border: none; color: white; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: bold; }
                .copy-tel-btn { background: #8b5cf6; border: none; color: white; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: bold; margin-right: 8px; }
                .counter { font-size: 14px; font-weight: 500; text-shadow: 1px 1px 2px black; display: flex; gap: 12px;}
                .counter span { color: #10b981; font-weight: bold; }
                .loading-spinner { position: absolute; top: 20px; right: 300px; color: #3b82f6; font-size: 12px; font-weight: bold; display: none; }
                .helper-text { position: absolute; bottom: 20px; background: rgba(0,0,0,0.7); padding: 8px 16px; border-radius: 20px; color: #fff; font-size: 14px; font-family: sans-serif; pointer-events: none; z-index: 20; display: none; }
            </style>
            <div class="viewer-container">
                <div class="top-bar">
                    <div class="counter">
                        <div>Page <span id="curr-page-num">1</span>/<span id="total-page-num">1</span></div>
                        <div style="color: #666;">|</div>
                        <div>Panel <span id="curr-panel-num">1</span>/<span id="total-panel-num">1</span></div>
                    </div>
                    <div class="loading-spinner" id="bg-loader">Slicing Background Pages...</div>
                    <div>
                        <button class="copy-tel-btn" id="copy-telemetry-btn" style="display: ${viewerSettings.debug ? 'inline-block' : 'none'};">Copy Telemetry</button>
                        <button class="full-page-btn" id="toggle-full-page">Toggle Full Page (P)</button>
                        <button class="close-btn" id="close-viewer">Exit Viewer</button>
                    </div>
                </div>
                <div class="nav-zone nav-left" id="zone-prev"></div>
                <div class="nav-zone nav-right" id="zone-next"></div>
                <div class="image-wrapper" id="pz-wrapper"><img id="main-display" class="manga-image" src="" draggable="false"></div>
                <div class="helper-text" id="helper-txt">Double-click a panel to zoom in!</div>
            </div>
        `;
        document.body.appendChild(overlayHost);

        const wrapperEl = shadow.getElementById('pz-wrapper');
        const mainImg = shadow.getElementById('main-display');
        const loader = shadow.getElementById('bg-loader');
        const helperTxt = shadow.getElementById('helper-txt');
        
        let currentLoadedUrl = "";
        
        const renderCurrent = () => {
            const renderStart = performance.now();
            if (currentPanelIndex >= globalPanels.length) return;
            loader.style.display = isProcessingBackground && currentPanelIndex > globalPanels.length - 5 ? 'block' : 'none';
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

                if (isFullPageMode) {
                    helperTxt.textContent = "Double-click a panel to zoom in!";
                    helperTxt.style.display = 'block';
                    const scale = Math.min((viewW * 0.95) / p.ow, (viewH * 0.95) / p.oh);
                    wrapperEl.style.width = (p.ow * scale) + 'px'; 
                    wrapperEl.style.height = (p.oh * scale) + 'px';
                    mainImg.style.width = '100%'; 
                    mainImg.style.height = '100%';
                    mainImg.style.left = '0px'; 
                    mainImg.style.top = '0px';
                    
                    if (viewerSettings.debug) {
                        const tel = window.pzTelemetry[p.url];
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
                    helperTxt.style.display = 'none';
                    
                    // Fixed Padding spatial math: applies padding to viewport dimensions cleanly
                    const margin = viewerSettings.padding / 100;
                    const targetW = viewW * (1 - margin);
                    const targetH = viewH * (1 - margin);

                    const scale = Math.min(targetW / p.sw, targetH / p.sh);
                    
                    wrapperEl.style.width = (p.sw * scale) + 'px'; 
                    wrapperEl.style.height = (p.sh * scale) + 'px';
                    mainImg.style.width = (p.ow * scale) + 'px'; 
                    mainImg.style.height = (p.oh * scale) + 'px';
                    mainImg.style.left = (-p.sx * scale) + 'px'; 
                    mainImg.style.top = (-p.sy * scale) + 'px';
                }
                window.pzPerf.lastRenderTime = performance.now() - renderStart;
            };

            if (currentLoadedUrl !== p.url) {
                wrapperEl.style.visibility = 'hidden';
                currentLoadedUrl = p.url;
                
                const handleLoad = () => {
                    if (mainImg.src === p.url) {
                        applyCoordinates();
                        wrapperEl.style.visibility = 'visible';
                    }
                };
                
                mainImg.onload = handleLoad;
                mainImg.onerror = handleLoad;
                mainImg.src = p.url;
            } else {
                applyCoordinates();
            }
        };

        const goNext = () => {
            if (isFullPageMode) {
                const currentUrl = globalPanels[currentPanelIndex].url;
                let nextIndex = currentPanelIndex;
                while (nextIndex < globalPanels.length && globalPanels[nextIndex].url === currentUrl) nextIndex++;
                if (nextIndex < globalPanels.length) { currentPanelIndex = nextIndex; renderCurrent(); }
            } else {
                if (currentPanelIndex < globalPanels.length - 1) { currentPanelIndex++; renderCurrent(); }
            }
        };

        const goPrev = () => { 
            if (isFullPageMode) {
                const currentUrl = globalPanels[currentPanelIndex].url;
                let prevIndex = currentPanelIndex;
                while (prevIndex > 0 && globalPanels[prevIndex].url === currentUrl) prevIndex--;
                if (prevIndex > 0) {
                    const prevUrl = globalPanels[prevIndex].url;
                    while (prevIndex > 0 && globalPanels[prevIndex - 1].url === prevUrl) prevIndex--;
                    currentPanelIndex = prevIndex;
                    renderCurrent();
                }
            } else {
                if (currentPanelIndex > 0) { currentPanelIndex--; renderCurrent(); } 
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

        shadow.getElementById('zone-next').addEventListener('click', goNext);
        shadow.getElementById('zone-prev').addEventListener('click', goPrev);
        shadow.getElementById('close-viewer').addEventListener('click', closeViewer);
        shadow.getElementById('copy-telemetry-btn').addEventListener('click', dumpTelemetry);
        
        shadow.getElementById('toggle-full-page').addEventListener('click', () => {
            isFullPageMode = !isFullPageMode;
            renderCurrent();
        });

        const container = shadow.querySelector('.viewer-container');
        container.addEventListener('dblclick', (e) => {
            // Ignore double clicks if they happened on the navigation zones or top bar.
            // This prevents accidental full-page toggles when fast-clicking.
            if (e.target.closest('.nav-zone') || e.target.closest('.top-bar')) return;

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
            } else {
                // If in panel view, double click in center toggles full page mode
                isFullPageMode = true;
                renderCurrent();
            }
        });

        const handleKeydown = (e) => {
            if (e.key === 'ArrowRight' || e.key === 'd') goNext();
            if (e.key === 'ArrowLeft' || e.key === 'a') goPrev();
            if (e.key === 'p' || e.key === 'P') { isFullPageMode = !isFullPageMode; renderCurrent(); }
            if (e.key === 'Escape') closeViewer();
            if ((e.key === 't' || e.key === 'T') && viewerSettings.debug) dumpTelemetry(); 
        };
        
        function dumpTelemetry() {
            if (!viewerSettings.debug) return;
            const currentUrl = globalPanels[currentPanelIndex].url;
            const data = window.pzTelemetry[currentUrl];
            
            if (!data) {
                helperTxt.textContent = "No telemetry for this page (Debug was OFF during scan).";
                helperTxt.style.display = 'block';
                setTimeout(() => { if (isFullPageMode) helperTxt.textContent = "Double-click a panel to zoom in!"; else helperTxt.style.display = 'none'; }, 3000);
                return;
            }

            const report = JSON.stringify({ targetPage: currentUrl, data: data }, null, 2);
            navigator.clipboard.writeText(report).then(() => {
                helperTxt.textContent = "Telemetry copied to clipboard!";
                helperTxt.style.display = 'block';
                setTimeout(() => { if (isFullPageMode) helperTxt.textContent = "Double-click a panel to zoom in!"; else helperTxt.style.display = 'none'; }, 3000);
            });
        }

        document.addEventListener('keydown', handleKeydown);
        renderCurrent();
    }
}