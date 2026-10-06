/**
 * The browser-side bootstrap served by `GET /api/plugins/bootstrap.js`. The emitted
 * script is byte-for-byte what the legacy Next.js route produced: the UI plugin
 * runtime depends on its message protocol.
 */
export const bootstrapScript = (id: string, manifestJson: string, pluginCodeUrl: string): string => {
  let script = "";
  script += "// --- Plugin Bootstrap Script (Served from API for " + id + ") ---\n";
  script += "(async function() {\n";
  script += "  const pluginId = " + JSON.stringify(id) + ";\n";
  script += "  const pluginCodeUrl = " + JSON.stringify(pluginCodeUrl) + ";\n";
  script += "  console.log(`[Plugin Bootstrap (${pluginId})] Starting...`);\n";
  script += "  const pluginManifest = " + manifestJson + ";\n"; // Embed manifest
  script += "  const pluginRoot = document.getElementById('plugin-root');\n";
  script += "  const pendingPromises = new Map();\n";
  script += "  let pluginExports = null;\n";
  script += "  let pluginApi = null;\n\n";

  // reportError function
  script += "  const reportError = (stage, error) => {\n";
  script += "    const errorMsg = error?.message || String(error);\n";
  script += "    console.error(`[Plugin Bootstrap (${pluginId})] Error during ${stage}:`, errorMsg, error?.stack);\n";
  // --- BEGIN DEBUG LOGGING in reportError ---
  script += "    if (stage === 'activate') {\n"; // Only log extra details for activate errors
  script += "       console.log('[Plugin Bootstrap DEBUG] Logging pluginApi state during activate error:');\n";
  script += "       console.log('[Plugin Bootstrap DEBUG] typeof pluginApi:', typeof pluginApi);\n";
  script +=
    "       try { console.log('[Plugin Bootstrap DEBUG] pluginApi object:', pluginApi); } catch(e) { console.log('[Plugin Bootstrap DEBUG] Could not log pluginApi object'); }\n";
  script += "       console.log('[Plugin Bootstrap DEBUG] typeof pluginApi?.host:', typeof pluginApi?.host);\n";
  script += "    }\n";
  // --- END DEBUG LOGGING in reportError ---
  script += '    pluginRoot.innerHTML = \`<div class=\"plugin-error-state\">Failed (${stage})</div>\`; \n';
  script +=
    "    window.parent.postMessage({ type: 'plugin-init-result', success: false, pluginId: pluginId, error: \`${stage}: ${errorMsg}\` }, '*');\n";
  script += "  };\n\n";

  // Helper Functions (Concatenated)
  script +=
    "  function generateMessageId() { return 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9); }\n";
  script +=
    "  function callHostMethod(method, params, transferables) { return new Promise((resolve, reject) => { const msgId = generateMessageId(); pendingPromises.set(msgId, { resolve, reject }); window.parent.postMessage({ id: msgId, pluginId: pluginId, type: 'request', method, params }, '*', transferables || []); }); }\n";
  script +=
    "  function onHostEvent(eventName, handler) { pluginExports = pluginExports || {}; pluginExports._eventHandlers = pluginExports._eventHandlers || {}; const [ns, name] = eventName.split('.'); pluginExports._eventHandlers[ns] = pluginExports._eventHandlers[ns] || {}; pluginExports._eventHandlers[ns][name] = pluginExports._eventHandlers[ns][name] || []; const hs = pluginExports._eventHandlers[ns][name]; hs.push(handler); return () => { const i = hs.indexOf(handler); if (i !== -1) hs.splice(i, 1); }; }\n";
  script +=
    "  async function handleRequest(message) { const { id, method, params } = message; try { if (method.startsWith('_lifecycle.')) { const lm = method.split('.')[1]; let r; if (lm === 'deactivate' && typeof pluginExports?.deactivate === 'function') r = await pluginExports.deactivate(); else throw new Error('Unsupported lifecycle: ' + lm); window.parent.postMessage({ id, pluginId: pluginId, type: 'response', result:r }, '*'); return; } const [ns, mn] = method.split('.'); if (!ns || !mn) throw new Error('Invalid method: ' + method); const h = pluginExports && (pluginExports[ns]?.[mn] ?? pluginExports[mn]); if (typeof h !== 'function') throw new Error('Method not found: ' + method); const r = await h(params); window.parent.postMessage({ id, pluginId: pluginId, type: 'response', result:r }, '*'); } catch (e) { window.parent.postMessage({ id, pluginId: pluginId, type: 'response', error: { code: e?.code || -32000, message: e?.message || 'Unknown error', data: e?.data } }, '*'); } }\n";
  script +=
    "  function handleResponse(message) { const { id, result, error } = message; const p = pendingPromises.get(id); if (!p) return; pendingPromises.delete(id); if (error) { const e = new Error(error.message); /*e.code = error.code; e.data = error.data;*/ p.reject(e); } else { p.resolve(result); } }\n";
  script +=
    "  function handleEvent(message) { const { method, params } = message; if (!method) return; const [ns, en] = method.split('.'); const eh = pluginExports?._eventHandlers?.[ns]?.[en]; if (Array.isArray(eh)) { eh.forEach(h => { try { h(params); } catch (e) { console.error('Evt handler err ('+method+'):', e); } }); } }\n";
  script +=
    "  function createPluginApi(pluginId) { const api = {}; const um = { resizeToContent: () => callHostMethod('ui.resizeFrame', { height: document.documentElement.scrollHeight }), getTheme: () => callHostMethod('ui.getTheme', {}), onThemeChanged: (h) => onHostEvent('ui.themeChanged', h) }; const nss = ['model', 'ui', 'file', 'network', 'storage', 'host']; nss.forEach(ns => { api[ns] = new Proxy({}, { get(t, p) { if (typeof p !== 'string') return; if (ns === 'ui' && p in um) return um[p]; if (p.startsWith('on') && p.length > 2) { const en = p[2].toLowerCase() + p.slice(3); return (h) => onHostEvent(ns + '.' + en, h); } return (...a) => callHostMethod(ns + '.' + p, a[0]||{}, a[1]||[]); } }); }); return api; }\n\n";

  // Main Execution Logic
  script += "  try {\n";
  script += "    pluginApi = createPluginApi(pluginId);\n";
  script +=
    "    console.log(`[Plugin Bootstrap (${pluginId})] API created. Importing module from ${pluginCodeUrl}...`);\n";
  script += "    try {\n";
  script += "      const pluginModule = await import(pluginCodeUrl);\n";
  script += "      pluginExports = pluginModule.default || pluginModule;\n";
  script += "      console.log(`[Plugin Bootstrap (${pluginId})] Module imported.`);\n";
  script += "    } catch (importError) {\n";
  script += "      reportError('import', importError);\n";
  script += "      return; \n";
  script += "    }\n\n";

  // ---- REMOVED init() CALL ----

  // ---- REMOVED render() CALL ----

  // ---- ADDED activate() CALL ----
  script += "    if (typeof pluginExports?.activate === 'function') {\n";
  script += "      console.log(`[Plugin Bootstrap (${pluginId})] Calling activate...`);\n";
  script += "      try {\n";
  // --- BEGIN DEBUG LOGGING ---
  script += "         console.log('[Plugin Bootstrap DEBUG] Checking context before calling activate...');\n";
  script += "         console.log('[Plugin Bootstrap DEBUG] typeof pluginApi:', typeof pluginApi);\n";
  script += "         console.log('[Plugin Bootstrap DEBUG] typeof pluginApi?.host:', typeof pluginApi?.host);\n";
  script +=
    "         console.log('[Plugin Bootstrap DEBUG] typeof pluginApi?.host?.log:', typeof pluginApi?.host?.log);\n";
  // --- END DEBUG LOGGING ---
  script += "         const context = { pluginId: pluginId, pluginApi: pluginApi, pluginRoot: pluginRoot };\n";
  script += "         console.log('[Plugin Bootstrap DEBUG] context object:', context);\n"; // Log context
  script += "         const hostCallableApi = await pluginExports.activate(context);\n";
  script += "         if(hostCallableApi && typeof hostCallableApi === 'object') {\n";
  script += "            Object.assign(pluginExports, hostCallableApi);\n";
  script += "         }\n";
  script += "         console.log(`[Plugin Bootstrap (${pluginId})] Activate done.`);\n";
  script += "      } catch (activateError) {\n";
  script += "         reportError('activate', activateError);\n";
  script += "         return;\n";
  script += "      }\n";
  script += "    } else {\n";
  script += "        console.log(`[Plugin Bootstrap (${pluginId})] No activate() function found (required).`);\n";
  script += "        reportError('activation', new Error('Plugin does not export an activate function.'));\n";
  script += "        return; // Stop if no activate function\n";
  script += "    }\n\n";

  script += "    console.log(`[Plugin Bootstrap (${pluginId})] Success.`);\n";
  script +=
    "    window.parent.postMessage({ type: 'plugin-init-result', success: true, pluginId: pluginId }, '*');\n\n";
  script += "  } catch (bootstrapError) {\n";
  script += "    reportError('bootstrap', bootstrapError);\n";
  script += "  }\n\n";

  // Message Listener
  script += "  window.addEventListener('message', (event) => {\n";
  script += "    const message = event.data;\n";
  script += "    if (!message || typeof message !== 'object' || !message.type) return;\n";
  script += "    if (message.type === 'request') handleRequest(message);\n";
  script += "    else if (message.type === 'response') handleResponse(message);\n";
  script += "    else if (message.type === 'event') handleEvent(message);\n";
  script += "  });\n\n";
  script += "})();\n";
  script += "// --- End Plugin Bootstrap Script --- \n";
  return script
}
