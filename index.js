
const imageContainer = document.querySelector('.fullscreen-image');
const blockId = getBlockIdFromParentDom();
// 从iframe的父Dom获取块ID
function getBlockIdFromParentDom() {
  const parentDom = window.frameElement?.parentElement?.parentElement;
  return parentDom?.getAttribute("data-node-id") || null;
}

// 获取思源 API Token，用于外部 IP / 非本地访问时认证
function getSiyuanToken() {
    try {
        return window.parent.siyuan.config.api.token;
    } catch (e) {
        return null;
    }
}

function makeAuthHeaders(token, contentType) {
    const headers = {};
    if (contentType !== false) {
        headers['Content-Type'] = contentType || 'application/json';
    }
    if (token) {
        headers['Authorization'] = 'Token ' + token;
    }
    return headers;
}

function showError(message) {
    console.error(message);
    const errorDiv = document.getElementById('error-message');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }
}

function getSvg(blockId, token) {
    return fetch("/api/file/getFile", {
        method: "POST",
        headers: makeAuthHeaders(token),
        body: JSON.stringify({
            path: `/data/assets/${blockId}-drawio.svg`,
        }),
    }).then((response) => {
        // 检查响应状态，404 表示文件尚未创建
        if (response.status === 404) {
            return null;
        }
        if (response.status !== 200) {
            showError(`预览图加载失败，状态码: ${response.status}`);
            return null;
        }
        return response.blob();
    }).catch((error) => {
        showError("读取 SVG 预览失败: " + error.message);
        return null;
    });
}

//连接资源到块，否则svg会变为未引用资源。而且这个属性名称必须是custom-data-assets，属性值必须是assets/...
async function linkResource(blockId, token) {
    return fetch("/api/attr/setBlockAttrs", {
        method: "POST",
        headers: makeAuthHeaders(token),
        body: JSON.stringify(
            {
                id: blockId,
                attrs: {
                    "custom-data-assets": `assets/${blockId}-drawio.svg`,
                }
            }),
    }).then(response => {
        if (response.status !== 200 && response.status !== 0) {
            showError(`关联资源失败，状态码: ${response.status}`);
        }
    }).catch((error) => {
        showError("关联资源失败: " + error.message);
    });
}

function showSvg(blockId, token) {
    getSvg(blockId, token).then(blob => {
        if (!blob) return;

        // 撤销旧的URL（如果存在）
        if (imageContainer.src) {
            URL.revokeObjectURL(imageContainer.src);
        }

        const imageUrl = URL.createObjectURL(blob);
        imageContainer.src = imageUrl;

        // 直接在显示的imageContainer上监听加载事件
        imageContainer.onload = function() {
            URL.revokeObjectURL(imageUrl);
            // 清除事件处理器避免内存泄漏
            imageContainer.onload = null;
        };

        // 添加错误处理
        imageContainer.onerror = function() {
            showError("图片加载失败");
            URL.revokeObjectURL(imageUrl);
        };
    });
}

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', function() {
    const token = getSiyuanToken();

    linkResource(blockId, token);
	const editBtn = document.getElementById('editBtn');

    // 获取块ID

    showSvg(blockId, token);
    editBtn.addEventListener('click', function() {
		// 定义draw.io编辑器的URL，参数embed=1和proto=json是关键
		// 注意：不再通过 URL 传递 token，改为通过 window.opener.postMessage 安全传递
		const drawIoUrl = `iframe.html?siyuan-blockid=${encodeURIComponent(blockId)}`;
		window.open(drawIoUrl, 'drawio-editor');
	});
    refreshBtn.addEventListener('click', function() {
		showSvg(blockId, token);
	});
});

// 响应来自 iframe.html 的 token 请求（通过 window.opener.postMessage 安全传递）
window.addEventListener('message', function(evt) {
    if (evt.data && evt.data.type === 'request-siyuan-token') {
        const token = getSiyuanToken();
        if (token && evt.source) {
            evt.source.postMessage({
                type: 'siyuan-token',
                token: token
            }, '*');
        }
    }
});

