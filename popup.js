document.addEventListener('DOMContentLoaded', async () => {
    // UI Elements
    const titleEl = document.getElementById('manga-title');
    const chevronBtn = document.getElementById('title-chevron');
    const countEl = document.querySelector('#image-count span');
    const startBtn = document.getElementById('start-btn');
    
    // Setting Elements
    const dirSelect = document.getElementById('reading-direction');
    const padSelect = document.getElementById('padding');
    const adjCheck = document.getElementById('show-adjacent');
    const debugCheck = document.getElementById('debug-mode');
    
    // Preview Elements
    const settingsPreview = document.getElementById('settings-preview');
    const debugPreview = document.getElementById('debug-preview');
    const debugContent = document.getElementById('debug-content');
    const debugDumpBtn = document.getElementById('copy-debug');
    const debugTextArea = document.getElementById('debug-dump');
    
    // Navigation Elements
    const views = {
        home: document.getElementById('view-home'),
        settings: document.getElementById('view-settings'),
        debug: document.getElementById('view-debug')
    };
    const headerTitle = document.getElementById('header-title');
    const backBtn = document.getElementById('back-btn');

    let currentTab = null;
    let probeData = null;
    let rawError = "None";

    // --- View Navigation Logic ---
    const navigateTo = (viewName, titleStr) => {
        Object.values(views).forEach(v => v.classList.remove('active'));
        views[viewName].classList.add('active');
        headerTitle.textContent = titleStr;
        backBtn.style.display = viewName === 'home' ? 'none' : 'block';
    };

    document.getElementById('nav-settings').addEventListener('click', () => navigateTo('settings', 'Home > Settings'));
    document.getElementById('nav-debug').addEventListener('click', () => navigateTo('debug', 'Home > Debug'));
    
    // Hovering or clicking the back button returns home seamlessly
    backBtn.addEventListener('mouseenter', () => navigateTo('home', 'Home'));
    backBtn.addEventListener('click', () => navigateTo('home', 'Home'));

    // --- Dynamic Title Expander ---
    chevronBtn.addEventListener('click', () => {
        const isClamped = titleEl.classList.contains('clamped');
        if (isClamped) {
            titleEl.classList.remove('clamped');
            chevronBtn.classList.add('expanded');
        } else {
            titleEl.classList.add('clamped');
            chevronBtn.classList.remove('expanded');
        }
    });

    // --- Preview Generators ---
    const updatePreviews = () => {
        const dir = dirSelect.options[dirSelect.selectedIndex].text.split(' ')[0]; // Gets "Manga" or "Comic"
        const pad = padSelect.value;
        const adj = adjCheck.checked ? "Adj On" : "Adj Off";
        settingsPreview.textContent = `${dir} • ${pad}% Pad • ${adj}`;
        
        debugPreview.textContent = debugCheck.checked ? "Status: Enabled (Telemetry On)" : "Status: Disabled";
        debugContent.style.display = debugCheck.checked ? 'block' : 'none';
        debugPreview.style.color = debugCheck.checked ? "#10b981" : "#888";
    };

    // Attach listeners to update previews live
    dirSelect.addEventListener('change', updatePreviews);
    padSelect.addEventListener('change', updatePreviews);
    adjCheck.addEventListener('change', updatePreviews);
    debugCheck.addEventListener('change', updatePreviews);

    // --- Tab Connection & Probe Logic ---
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        currentTab = tabs[0];
        if (!currentTab || !currentTab.url.includes("kagane.to")) {
            titleEl.textContent = "Not a supported site.";
            chevronBtn.style.display = 'none';
            return;
        }

        const runProbe = async () => {
            try {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: currentTab.id },
                    func: () => {
                        return {
                            windowUrl: window.location.href,
                            totalContainers: document.querySelectorAll('.page-container').length,
                            blobImages: document.querySelectorAll('img[src^="blob:"]').length,
                            readyState: document.readyState,
                            contentScriptLoaded: typeof window.panelZoomInjected !== 'undefined',
                            isViewerActive: document.getElementById('panel-zoom-extension-host') !== null,
                            currentSettings: window.pzViewerSettings || null,
                            performanceMetrics: window.pzPerf || "No metrics yet"
                        };
                    }
                });
                return results && results[0] ? results[0].result : null;
            } catch (e) {
                rawError = e.message;
                return null;
            }
        };

        probeData = await runProbe();

        if (probeData && probeData.contentScriptLoaded === false) {
            console.log("Medic: Injecting missing content script...");
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: currentTab.id },
                    files: ['content.js']
                });
                probeData = await runProbe();
            } catch (injErr) {
                rawError = "Medic Injection Failed: " + injErr.message;
            }
        }

        // Hydrate UI from existing settings
        if (probeData && probeData.currentSettings) {
            dirSelect.value = probeData.currentSettings.direction || "manga";
            padSelect.value = probeData.currentSettings.padding !== undefined ? probeData.currentSettings.padding : 5;
            adjCheck.checked = probeData.currentSettings.showAdjacent !== false;
            debugCheck.checked = probeData.currentSettings.debug === true;
        }
        updatePreviews(); // Generate initial strings

        if (probeData && probeData.contentScriptLoaded) {
            titleEl.textContent = currentTab.title;
            // Check if title actually overflows 2 lines, if not hide chevron to keep it clean.
            // Small timeout to allow render
            setTimeout(() => {
                if (titleEl.scrollHeight <= titleEl.clientHeight) chevronBtn.style.display = 'none';
            }, 10);

            countEl.textContent = probeData.totalContainers + " Pages Detected";
            startBtn.disabled = false;
            
            if (probeData.isViewerActive) {
                startBtn.textContent = "Apply Change";
                startBtn.style.background = "#f59e0b";
            } else {
                startBtn.textContent = "Launch Panel View";
                startBtn.style.background = "#10b981";
            }
        } else {
            titleEl.textContent = "Injection Blocked by Browser";
            titleEl.style.color = "#ef4444";
            chevronBtn.style.display = 'none';
        }

        const ddReport = {
            timestamp: new Date().toISOString(),
            browser: navigator.userAgent,
            tabUrl: currentTab.url,
            tabId: currentTab.id,
            errorMessage: rawError,
            pageProbe: probeData || "Probe Failed",
            manifestVersion: chrome.runtime.getManifest().manifest_version
        };
        debugTextArea.value = JSON.stringify(ddReport, null, 2);
    } catch (e) {
        titleEl.textContent = "Error connecting to tab.";
        chevronBtn.style.display = 'none';
        rawError = e.message;
    }

    debugDumpBtn.addEventListener('click', () => {
        debugTextArea.select();
        document.execCommand('copy');
        debugDumpBtn.textContent = "Copied!";
        setTimeout(() => debugDumpBtn.textContent = "Copy DD Report", 2000);
    });

    startBtn.addEventListener('click', () => {
        if (!currentTab) return;
        chrome.tabs.sendMessage(currentTab.id, {
            action: "START_VIEWER",
            settings: {
                direction: dirSelect.value,
                padding: parseInt(padSelect.value),
                showAdjacent: adjCheck.checked,
                debug: debugCheck.checked
            }
        });
        window.close();
    });
});