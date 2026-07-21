let sharedVisited = null;
let sharedStackX = null;
let sharedStackY = null;

export function extractPanelsFromImage(imgData, w, h, options = {}) {
    const data = imgData.data || imgData;
    const minAreaThreshold = options.minArea !== undefined ? options.minArea : 50;

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

                const isNotEntirePage = boxArea < (pageArea * 0.95);
                const isInkDense = area > (pageArea * 0.005);
                const isPhysicallyLarge = boxArea > (pageArea * 0.015) && area > Math.max(boxWidth, boxHeight);

                if ((isInkDense || isPhysicallyLarge) && isNotEntirePage) {
                    if (boxArea >= minAreaThreshold) {
                        rawBoxes.push({ x: minX, y: minY, width: boxWidth, height: boxHeight });
                    }
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
            
            if (bA.x >= bB.x - 2 && (bA.x + bA.width) <= (bB.x + bB.width) + 2 && 
                bA.y >= bB.y - 2 && (bA.y + bA.height) <= (bB.y + bB.height) + 2) {
                isInside = true;
                break;
            }
        }
        
        if (!isInside) validBoxes.push(bA);
    }

    return validBoxes;
}
