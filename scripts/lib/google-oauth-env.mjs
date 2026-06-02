export function updateGoogleOAuthEnvText(text, clientId) {
  return updateEnvText(text, {
    GOOGLE_CLIENT_ID: clientId,
    VITE_GOOGLE_CLIENT_ID: clientId,
  });
}

export function updateEnvText(text, updates) {
  const seen = new Set();
  const lines = text.split(/\r?\n/);
  while (lines.at(-1) === "") lines.pop();
  const updatedLines = lines.map((line) => {
    const match = line.match(/^([A-Z0-9_]+)=/);
    if (!match) return line;
    const key = match[1];
    if (!(key in updates)) return line;
    seen.add(key);
    return `${key}=${updates[key]}`;
  });
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) updatedLines.push(`${key}=${value}`);
  }
  return `${updatedLines.join("\n")}\n`;
}

export function isGoogleWebClientId(value) {
  return /^[a-z0-9-]+\.apps\.googleusercontent\.com$/i.test(value);
}
