import * as vscode from "vscode";
export function renderGraph(url: string, title: string) {
    const panel = vscode.window.createWebviewPanel(
        "cscoutGraph",
        title,
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    panel.webview.html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        html, body {
            margin: 0;
            padding: 0;
            overflow: hidden;
            background: #1e1e1e;
        }

        #container {
            width: 100vw;
            height: 100vh;
            cursor: grab;
            overflow: hidden;
        }

        #container:active {
            cursor: grabbing;
        }

        object {
            width: 100%;
            height: 100%;
            pointer-events: none;
        }
    </style>
</head>
<body>

<div id="container">
    <object data="${url}" type="image/svg+xml"></object>
</div>

<script>
    const container = document.getElementById('container');

    let scale = 1;
    let pos = { x: 0, y: 0 };
    let isDragging = false;
    let start = { x: 0, y: 0 };

    container.addEventListener('wheel', (e) => {
        e.preventDefault();

        const zoomFactor = 0.1;
        const direction = e.deltaY > 0 ? -1 : 1;

        scale += direction * zoomFactor;
        scale = Math.max(0.2, Math.min(scale, 5));

        updateTransform();
    });

    container.addEventListener('mousedown', (e) => {
        isDragging = true;
        start.x = e.clientX - pos.x;
        start.y = e.clientY - pos.y;
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        pos.x = e.clientX - start.x;
        pos.y = e.clientY - start.y;

        updateTransform();
    });

    function updateTransform() {
        container.style.transform =
            \`translate(\${pos.x}px, \${pos.y}px) scale(\${scale})\`;
    }
</script>

</body>
</html>
`;
}