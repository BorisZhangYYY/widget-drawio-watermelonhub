/**
 * Global configuration.
 */
DiagramEditor.prototype.config = null;

DiagramEditor.prototype.blockId = null;

DiagramEditor.prototype.svgDataURL = null;

DiagramEditor.prototype.iframe = null;

DiagramEditor.prototype.blockPath = null;

DiagramEditor.prototype.token = null;

DiagramEditor.prototype.tokenPromise = null;

DiagramEditor.prototype.dataPromise = null;


function DiagramEditor()
{
	this.blockId = DiagramEditor.getBlockId();
	this.iframe = document.getElementById('drawio-iframe');
	// 隐藏Tab栏
	this.config = {css : '.geTabContainer { height: 0px !important; }'};

	var self = this;

	// 优先通过 window.opener.postMessage 安全获取 token，避免 token 暴露在 URL 中
	this.tokenPromise = this.requestTokenFromOpener().then(function(token) {
		self.token = token;
		return token;
	});

	// 拿到 token 后再启动数据请求
	this.dataPromise = this.tokenPromise.then(function() {
		return Promise.all([
			self.getSvgDateUrl(),
			self.getBlockPath()
		]);
	}).then(function(results) {
		self.svgDataURL = results[0];
		self.blockPath = results[1];
	}).catch(function(error) {
		self.showError('加载 draw.io 数据失败：' + (error.message || '未知错误'));
		throw error;
	});


  	window.addEventListener('message', function(evt)
	{
		if (evt.data && evt.data.length > 0)
		{
			try
			{
				var msg = JSON.parse(evt.data);

				if (msg != null)
				{
					self.handleMessage(msg);
				}
			}
			catch (e)
			{
				console.error(e);
			}
		}
	});


};






DiagramEditor.prototype.handleMessage = function(msg)
{
	if (msg.event == 'configure')
	{
		this.configureEditor();
	}
	else if (msg.event == 'init')
	{
		this.initializeEditor();
	}
	else if (msg.event == 'autosave' || msg.event == 'save')
	{
		this.save(msg.xml, true, this.startElement);
	}
	else if (msg.event == 'export')
	{
		this.export(msg);
	}
	else if (msg.event == 'exit')
	{
    	this.exit();
	}

};

DiagramEditor.prototype.showError = function(message)
{
	console.error(message);
	var errorDiv = document.getElementById('error-message');
	if (errorDiv)
	{
		errorDiv.innerHTML = '';
		var textSpan = document.createElement('span');
		textSpan.textContent = message;
		errorDiv.appendChild(textSpan);

		var closeBtn = document.createElement('button');
		closeBtn.textContent = '×';
		closeBtn.style.marginLeft = '12px';
		closeBtn.style.background = 'transparent';
		closeBtn.style.border = 'none';
		closeBtn.style.color = '#c62828';
		closeBtn.style.fontSize = '18px';
		closeBtn.style.cursor = 'pointer';
		closeBtn.style.lineHeight = '1';
		closeBtn.onclick = function() {
			errorDiv.style.display = 'none';
		};
		errorDiv.appendChild(closeBtn);

		errorDiv.style.display = 'block';

		// 10 秒后自动隐藏，避免错误信息一直占着屏幕
		clearTimeout(errorDiv._hideTimer);
		errorDiv._hideTimer = setTimeout(function() {
			errorDiv.style.display = 'none';
		}, 10000);
	}
};

DiagramEditor.prototype.getAuthHeaders = function(contentType)
{
	var headers = {};
	if (contentType !== false)
	{
		headers['Content-Type'] = contentType || 'application/json';
	}
	if (this.token)
	{
		headers['Authorization'] = 'Token ' + this.token;
	}
	return headers;
};

DiagramEditor.prototype.postMessage = function(msg)
{
	if (this.iframe != null)
	{
		this.iframe.contentWindow.postMessage(JSON.stringify(msg), '*');
	}
};

/**
 * 通过 window.opener.postMessage 安全地向父窗口请求思源 API Token。
 * 这种方式比 URL 参数更安全，token 不会出现在浏览器历史或服务器日志中。
 */
DiagramEditor.prototype.requestTokenFromOpener = function()
{
	var self = this;
	return new Promise(function(resolve) {
		// Fallback 1: 如果页面是直接从 URL 打开，没有 opener，尝试从 URL 参数读取
		if (!window.opener)
		{
			var token = DiagramEditor.getTokenFromUrl();
			resolve(token);
			return;
		}

		function handleMessage(evt)
		{
			if (evt.data && evt.data.type === 'siyuan-token')
			{
				window.removeEventListener('message', handleMessage);
				resolve(evt.data.token || null);
			}
		}

		window.addEventListener('message', handleMessage);

		try
		{
			window.opener.postMessage({type: 'request-siyuan-token'}, '*');
		}
		catch (e)
		{
			console.error('向 opener 请求 token 失败:', e);
			window.removeEventListener('message', handleMessage);
			resolve(DiagramEditor.getTokenFromUrl());
			return;
		}

		// 3 秒超时
		setTimeout(function() {
			window.removeEventListener('message', handleMessage);
			console.warn('从父窗口获取思源 Token 超时，将回退到 cookie 认证');
			resolve(DiagramEditor.getTokenFromUrl());
		}, 3000);
	});
};

/**
 * Posts configure message to editor.
 */
DiagramEditor.prototype.configureEditor = function()
{
	this.postMessage({action: 'configure', config: this.config});
};

/**
 * Posts load message to editor after data is ready.
 */
DiagramEditor.prototype.initializeEditor = async function()
{
	try
	{
		await this.dataPromise;

		this.postMessage({
			action: 'load',
			autosave: 1,
			modified: 'unsavedChanges',
			title: `${this.blockPath || 'untitled'}/${this.blockId}-drawio.svg`,
			xml: this.svgDataURL
		});
	}
	catch (error)
	{
		this.showError('初始化编辑器失败：' + (error.message || '未知错误'));
	}
};

/**
 * Saves the given data.
 */
DiagramEditor.prototype.save = function()
{

	this.postMessage({
		action: 'export',
		format:'xmlsvg'
	});


};

DiagramEditor.prototype.export = async function(msg)
{
	const code = await this.saveSvgToSiyuan(msg.data, this.blockId + "-drawio.svg");
	if(code == 0){
		this.postMessage({
		action: 'status',
		messageKey: 'allChangesSaved',
		modified: false
		});
	} else {
		this.showError('保存失败，请检查网络或认证状态');
	}
};

DiagramEditor.prototype.exit = function()
{
	window.close();
};


// 获取块ID
DiagramEditor.getBlockId = function() {
  return new URLSearchParams(window.location.search).get("siyuan-blockid");
}

// 从 URL 参数获取 token（作为无 opener 时的 fallback，不推荐常规使用）
DiagramEditor.getTokenFromUrl = function() {
  return new URLSearchParams(window.location.search).get("siyuan-token");
}


DiagramEditor.prototype.getBlockPath = async function() {
    return fetch("/api/filetree/getHPathByID", {
        method: "POST",
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
            id: this.blockId
        }),
    }).then((response) => {
        // 检查响应状态
        if (response.status !== 200 || response == null) {
            return null;
        }
        return response.json();
    })
    .then(msg => {
		return msg.data;})
    .catch(error => {
		console.error("获取块路径失败:", error);
		return null;
	});
}




DiagramEditor.prototype.getSvgDateUrl = async function() {
    return fetch("/api/file/getFile", {
        method: "POST",
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
            path: `/data/assets/${this.blockId}-drawio.svg`,
        }),
    }).then((response) => {
        // 404 表示文件尚未创建，允许新建
        if (response.status === 404) {
            return null;
        }
        // 检查响应状态
        if (response.status !== 200 || response == null) {
            throw new Error("getFile failed: " + response.status);
        }
        return response.blob();
    })
    .then(originalBlob => originalBlob == null ? null : new Blob([originalBlob], { type: 'image/svg+xml' }))
    .then(blob => blob == null ? null : new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = error => reject(error);
            reader.readAsDataURL(blob);
    }))
    .catch(error => {
		console.error("读取 SVG 失败:", error);
		return null;
	});
}

DiagramEditor.prototype.saveSvgToSiyuan = async function(base64Data, fileName) {
	// 1. 分离 Base64 数据和 MIME 类型
	const parts = base64Data.split(';base64,');
	const base64String = parts.length > 1 ? parts[1] : base64Data;

	// 2. 解码 Base64 字符串
	const byteCharacters = atob(base64String);

	// 3. 创建字节数组
	const byteArrays = new Uint8Array(byteCharacters.length);
	for (let i = 0; i < byteCharacters.length; i++) {
		byteArrays[i] = byteCharacters.charCodeAt(i);
	}

	// 4. 创建 Blob 对象（指定为 SVG 类型）
	const blob = new Blob([byteArrays], { type: 'image/svg+xml' });

	// 5. 创建 File 对象
	const file =  new File([blob], fileName, { type: 'image/svg+xml' });

	const formdata = new FormData();
	formdata.append("path", "/data/assets/"+fileName);
	formdata.append("isDir", false);
	formdata.append("modTime", Date.now());
	formdata.append("file", file);

	return fetch("/api/file/putFile", {
		method: "POST",
		headers: this.getAuthHeaders(false),
		body: formdata,
	})
		.then((response) => {
		return response.json();
		})
		.then((data) => {
		return data.code;
		})
		.catch((error) => {
			console.error("保存 SVG 失败:", error);
			return -1;
		});
}

DiagramEditor.prototype.isAuthEnable = async function(){
  try {
    await this.tokenPromise;
    const reponse = await fetch("/api/attr/getBlockAttrs", {
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        id: this.blockId,
      }),
      method: "POST",
    });
    return reponse.status === 401;
  } catch (error) {
    console.error("认证检查失败:", error);
    return false;
  }
}

const diagramEditor = new DiagramEditor();
diagramEditor.isAuthEnable().then(auth => {
		if(auth){
			const { pathname, search } = window.location;
			const url = '/check-auth?to=' + encodeURIComponent(pathname + search);
			window.location.href = url;
		}
	});
