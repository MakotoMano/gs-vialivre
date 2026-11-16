const LOCAL = window.VIALIVRE?.mode === 'local';
export {LOCAL};
export async function request(path, options = {}) {
  let response;
  try {
    response = await fetch('/api' + path, {
      ...options,
      headers: {'Content-Type': 'application/json', ...options.headers},
      signal: options.signal || AbortSignal.timeout(70000)
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Não foi possível conectar ao servidor local. Confira se ele continua aberto e tente novamente.');
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : 'Não foi possível concluir a operação.');
  return data;
}
