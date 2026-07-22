import React from 'react';

export default function Reader({ mangaImages, globalPanels }) {
    return (
        <div className="bg-zinc-900 text-white min-h-screen">
            <h1>Panpan Reader</h1>
            <p>Images: {mangaImages?.length || 0}</p>
            <p>Panels: {globalPanels?.length || 0}</p>
        </div>
    );
}
