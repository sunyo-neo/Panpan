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
    const hybridToggle = document.getElementById('hybrid-mode-toggle');
    
    // Zoom Mode Segmented Control
    const zoomGroup = document.getElementById('zoom-mode-group');
    const zoomButtons = Array.from(zoomGroup.querySelectorAll('.segment-btn'));
    let activeZoomValue = 'dynamic';

    const setZoomValue = (value) => {
        activeZoomValue = value;
        zoomButtons.forEach(btn => {
            const isActive = btn.getAttribute('data-value') === value;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
            btn.setAttribute('tabindex', isActive ? '0' : '-1');
        });
        updatePreviews();
    };

    zoomButtons.forEach((btn, idx) => {
        btn.addEventListener('click', () => {
            setZoomValue(btn.getAttribute('data-value'));
        });

        btn.addEventListener('keydown', (e) => {
            let targetIdx = -1;
            if (e.key === 'ArrowRight') {
                targetIdx = (idx + 1) % zoomButtons.length;
            } else if (e.key === 'ArrowLeft') {
                targetIdx = (idx - 1 + zoomButtons.length) % zoomButtons.length;
            }

            if (targetIdx !== -1) {
                e.preventDefault();
                zoomButtons[targetIdx].focus();
                setZoomValue(zoomButtons[targetIdx].getAttribute('data-value'));
            }
        });
    });
    
    // Define checked property on custom div toggles and handle interaction events
    const initCustomToggle = (el, onChange) => {
        Object.defineProperty(el, 'checked', {
            get() {
                return this.getAttribute('aria-checked') === 'true';
            },
            set(value) {
                this.setAttribute('aria-checked', value ? 'true' : 'false');
            }
        });

        const toggle = () => {
            el.checked = !el.checked;
            onChange();
        };

        el.addEventListener('click', toggle);
        el.addEventListener('keydown', (e) => {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                toggle();
            }
        });
    };
    
    // Navigation/Interactive Helpers
    const makeKeyboardInteractive = (el, onClick) => {
        el.addEventListener('click', onClick);
        el.addEventListener('keydown', (e) => {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                onClick();
            }
        });
    };
    
    // Preview Elements
    const settingsPreview = document.getElementById('settings-preview');
    const debugContent = document.getElementById('debug-content');
    const debugDumpBtn = document.getElementById('copy-debug');
    const debugTextArea = document.getElementById('debug-dump');
    
    // Navigation Elements
    const views = {
        home: document.getElementById('view-home'),
        settings: document.getElementById('view-settings')
    };
    const headerTitle = document.getElementById('header-title');
    const backBtn = document.getElementById('back-btn');
 
    let currentTab = null;
    let probeData = null;
    let rawError = "None";
 
    // --- View Navigation Logic with Animations ---
    const navigateTo = (viewName, titleStr) => {
        const currentActive = Object.values(views).find(v => v.classList.contains('active'));
        if (currentActive && currentActive !== views[viewName]) {
            currentActive.classList.remove('active');
            currentActive.classList.add('anim-exit');
            setTimeout(() => {
                currentActive.classList.remove('anim-exit');
            }, 250);
        }
 
        views[viewName].classList.add('anim-enter');
        views[viewName].classList.add('active');
        setTimeout(() => {
            views[viewName].classList.remove('anim-enter');
        }, 250);
 
        headerTitle.textContent = titleStr;
        backBtn.style.display = viewName === 'home' ? 'none' : 'block';
    };
 
    const settingsCard = document.getElementById('nav-settings');
 
    makeKeyboardInteractive(settingsCard, () => navigateTo('settings', 'Home > Settings'));
    
    // Clicking/pressing returns home seamlessly
    makeKeyboardInteractive(backBtn, () => navigateTo('home', 'Home'));

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
        
        const zoomPretty = {
            'dynamic': 'Dynamic',
            'page-scale': 'Page Scale',
            'fill-canvas': 'Fill'
        };
        const zoomName = zoomPretty[activeZoomValue] || 'Dynamic';
        
        let previewStr = `${dir} • ${pad}% Pad • ${adj} • ${zoomName}`;
        if (hybridToggle && hybridToggle.checked) {
            previewStr += " • Hybrid";
        }
        settingsPreview.textContent = previewStr;
        
        debugContent.style.display = debugCheck.checked ? 'block' : 'none';
    };

    initCustomToggle(adjCheck, updatePreviews);
    initCustomToggle(debugCheck, updatePreviews);
    initCustomToggle(hybridToggle, updatePreviews);

    // Attach listeners to update previews live
    dirSelect.addEventListener('change', updatePreviews);
    padSelect.addEventListener('change', updatePreviews);

    // --- Advanced Settings Accordion Logic ---
    const advToggle = document.getElementById('adv-settings-toggle');
    const advContent = document.getElementById('adv-settings-content');
    const advChevron = document.getElementById('adv-chevron');

    if (advToggle && advContent) {
        makeKeyboardInteractive(advToggle, () => {
            const isExpanded = advContent.classList.contains('expanded');
            if (isExpanded) {
                advContent.classList.remove('expanded');
                advChevron.classList.remove('expanded');
            } else {
                advContent.classList.add('expanded');
                advChevron.classList.add('expanded');
            }
        });
    }

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
                            blobImages: document.querySelectorAll('img').length,
                            readyState: document.readyState,
                            contentScriptLoaded: typeof window.panelZoomInjected !== 'undefined',
                            isViewerActive: document.getElementById('panel-zoom-extension-host') !== null,
                            currentSettings: null,
                            performanceMetrics: "No metrics yet"
                        };
                    }
                });
                const probe = results && results[0] ? results[0].result : null;
                if (probe && probe.contentScriptLoaded) {
                    try {
                        const response = await chrome.tabs.sendMessage(currentTab.id, { action: "GET_PROBE_DATA" });
                        if (response) {
                            probe.currentSettings = response.currentSettings;
                            probe.performanceMetrics = response.performanceMetrics;
                        }
                    } catch (err) {
                        console.warn("Failed to fetch probe data via messaging:", err);
                    }
                }
                return probe;
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
        let settingsToUse = null;
        if (probeData && probeData.currentSettings) {
            settingsToUse = probeData.currentSettings;
        } else {
            const data = await chrome.storage.local.get('savedSettings');
            if (data && data.savedSettings) {
                settingsToUse = data.savedSettings;
            }
        }

        if (settingsToUse) {
            dirSelect.value = settingsToUse.direction || "manga";
            padSelect.value = settingsToUse.padding !== undefined ? settingsToUse.padding : 5;
            adjCheck.checked = settingsToUse.showAdjacent !== false;
            debugCheck.checked = settingsToUse.debug === true;
            if (hybridToggle) {
                hybridToggle.checked = settingsToUse.hybridMode === true;
            }
            setZoomValue(settingsToUse.zoomMode || 'dynamic');
        } else {
            dirSelect.value = "manga";
            padSelect.value = 5;
            adjCheck.checked = true;
            debugCheck.checked = false;
            if (hybridToggle) {
                hybridToggle.checked = false;
            }
            setZoomValue('dynamic');
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
                startBtn.style.background = "linear-gradient(135deg, var(--color-warning) 0%, #d97706 100%)";
            } else {
                startBtn.textContent = "Launch Panel View";
                startBtn.style.background = "var(--primary-gradient)";
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
        navigator.clipboard.writeText(debugTextArea.value).then(() => {
            debugDumpBtn.textContent = "Copied!";
            setTimeout(() => debugDumpBtn.textContent = "Copy DD Report", 2000);
        }).catch((err) => {
            debugDumpBtn.textContent = "Copy Failed";
            console.error("Clipboard write failed:", err);
            setTimeout(() => debugDumpBtn.textContent = "Copy DD Report", 2000);
        });
    });

    startBtn.addEventListener('click', () => {
        if (!currentTab) return;
        const settings = {
            direction: dirSelect.value,
            padding: parseInt(padSelect.value),
            showAdjacent: adjCheck.checked,
            debug: debugCheck.checked,
            hybridMode: hybridToggle ? hybridToggle.checked : false,
            zoomMode: activeZoomValue
        };
        chrome.storage.local.set({ savedSettings: settings });
        chrome.tabs.sendMessage(currentTab.id, {
            action: "START_VIEWER",
            settings: settings
        }).catch(() => {
            // Ignore error if context invalidated
        });
        window.close();
    });
});