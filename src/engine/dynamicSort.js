export function dynamicSort(boxes, direction, options = {}) {
    if (boxes.length <= 1) return boxes;

    const yTolerance = options.yTolerance || 5;

    // 1. Recursive XY-Cut: Try Horizontal Cut (Tier Break)
    let ySorted = [...boxes].sort((a, b) => a.sy - b.sy);
    let yCutIndex = -1;
    let maxEy = ySorted[0].ey;
    
    for (let i = 1; i < ySorted.length; i++) {
        if (ySorted[i].sy > maxEy + yTolerance) {
            yCutIndex = i;
            break;
        }
        maxEy = Math.max(maxEy, ySorted[i].ey);
    }

    if (yCutIndex !== -1) {
        let topGroup = ySorted.slice(0, yCutIndex);
        let bottomGroup = ySorted.slice(yCutIndex);
        return [...dynamicSort(topGroup, direction, options), ...dynamicSort(bottomGroup, direction, options)];
    }

    // 2. Recursive XY-Cut: Try Vertical Cut (Column Break)
    let xSorted = [...boxes].sort((a, b) => a.sx - b.sx);
    let xCutIndex = -1;
    let maxEx = xSorted[0].ex;
    
    for (let i = 1; i < xSorted.length; i++) {
        if (xSorted[i].sx > maxEx + 5) {
            xCutIndex = i;
            break;
        }
        maxEx = Math.max(maxEx, xSorted[i].ex);
    }

    if (xCutIndex !== -1) {
        let leftGroup = xSorted.slice(0, xCutIndex);
        let rightGroup = xSorted.slice(xCutIndex);
        
        if (direction === "manga" || direction === "RTL") {
            return [...dynamicSort(rightGroup, direction, options), ...dynamicSort(leftGroup, direction, options)];
        } else {
            return [...dynamicSort(leftGroup, direction, options), ...dynamicSort(rightGroup, direction, options)];
        }
    }

    // 3. Fallback Heuristic
    return boxes.sort((a, b) => {
        const overlap = Math.max(0, Math.min(a.ey, b.ey) - Math.max(a.sy, b.sy));
        const minH = Math.min(a.ey - a.sy, b.ey - b.sy);

        if (overlap < minH * 0.4) {
            return a.sy - b.sy; // Top-to-bottom wins
        }

        const yDiff = a.sy - b.sy;
        if (yDiff < -minH * 0.5) return -1;
        if (yDiff > minH * 0.5) return 1;

        if (direction === "manga" || direction === "RTL") {
            return b.sx - a.sx; // Right-to-Left
        } else {
            return a.sx - b.sx; // Left-to-Right
        }
    });
}
