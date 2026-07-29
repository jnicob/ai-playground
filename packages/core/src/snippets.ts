import { API_KEY_HEADER } from './api-contract';
import type { ApiTraceRequest } from './api-request';

export const SNIPPET_LANGUAGES = ['curl', 'javascript', 'python'] as const;
export type SnippetLanguage = (typeof SNIPPET_LANGUAGES)[number];

function requiresApiKey(request: ApiTraceRequest): boolean {
  return (
    typeof request.body === 'object' &&
    request.body !== null &&
    'provider' in request.body &&
    request.body.provider === 'google'
  );
}

function shellSingleQuoted(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function apiBaseUrl(requestUrl: string): string {
  const marker = '/v1/services/';
  const markerIndex = requestUrl.indexOf(marker);
  return markerIndex === -1 ? requestUrl.replace(/\/+$/, '') : requestUrl.slice(0, markerIndex);
}

function curlSnippet(request: ApiTraceRequest): string {
  const authHeader = requiresApiKey(request)
    ? ` \\\n  --header ${shellSingleQuoted(`${API_KEY_HEADER}: \${GOOGLE_API_KEY}`)}`
    : '';
  const pollAuthHeader = requiresApiKey(request)
    ? ` --header ${shellSingleQuoted(`${API_KEY_HEADER}: \${GOOGLE_API_KEY}`)}`
    : '';
  const body = shellSingleQuoted(JSON.stringify(request.body));
  const baseUrl = shellSingleQuoted(apiBaseUrl(request.url));

  return `API_BASE_URL=${baseUrl}
RESPONSE=$(curl --fail-with-body --silent --show-error \\
  --request POST ${shellSingleQuoted(request.url)} \\
  --header 'content-type: application/json'${authHeader} \\
  --data ${body})

STATUS=$(printf '%s' "$RESPONSE" | jq -r '.status')
while [ "$STATUS" = "IN_PROGRESS" ]; do
  TASK_ID=$(printf '%s' "$RESPONSE" | jq -r '.task_id')
  sleep 10
  RESPONSE=$(curl --fail-with-body --silent --show-error${pollAuthHeader} "$API_BASE_URL/v1/tasks/$TASK_ID")
  STATUS=$(printf '%s' "$RESPONSE" | jq -r '.status')
done

printf '%s\\n' "$RESPONSE"

if [ "$(printf '%s' "$RESPONSE" | jq -r '.output.kind // empty')" = "video" ]; then
  DOWNLOAD_URL=$(printf '%s' "$RESPONSE" | jq -r '.output.download_url')
  curl --fail-with-body --location${pollAuthHeader} --output result.webm "$API_BASE_URL$DOWNLOAD_URL"
fi`;
}

function javascriptSnippet(request: ApiTraceRequest): string {
  const authLine = requiresApiKey(request) ? `,\n  "${API_KEY_HEADER}": "\${GOOGLE_API_KEY}"` : '';

  return `const headers = {
  "content-type": "application/json"${authLine}
};

const createdResponse = await fetch(${JSON.stringify(request.url)}, {
  method: "POST",
  headers,
  body: JSON.stringify(${JSON.stringify(request.body, null, 2)})
});
if (!createdResponse.ok) throw new Error(\`API error \${createdResponse.status}\`);

let result = await createdResponse.json();
const deadline = Date.now() + 10 * 60 * 1000;

while (result.status === "IN_PROGRESS") {
  if (Date.now() >= deadline) throw new Error("Generation timed out");
  await new Promise((resolve) => setTimeout(resolve, 10_000));
  const pollUrl = new URL(\`/v1/tasks/\${result.task_id}\`, ${JSON.stringify(request.url)});
  const pollResponse = await fetch(pollUrl, { headers });
  if (!pollResponse.ok) throw new Error(\`API error \${pollResponse.status}\`);
  result = await pollResponse.json();
}

if (result.status === "FAILED") throw new Error(result.error.code);

if (result.output?.kind === "video") {
  const downloadUrl = new URL(result.output.download_url, ${JSON.stringify(request.url)});
  const videoResponse = await fetch(downloadUrl, { headers });
  if (!videoResponse.ok) throw new Error(\`Download error \${videoResponse.status}\`);
  const videoBlob = await videoResponse.blob();
  console.log(URL.createObjectURL(videoBlob));
} else {
  console.log(result.output);
}`;
}

function pythonSnippet(request: ApiTraceRequest): string {
  const authLine = requiresApiKey(request)
    ? `,\n    "${API_KEY_HEADER}": "\${GOOGLE_API_KEY}"`
    : '';

  return `import time
from urllib.parse import urljoin

import requests

headers = {
    "content-type": "application/json"${authLine}
}

response = requests.post(
    ${JSON.stringify(request.url)},
    headers=headers,
    json=${JSON.stringify(request.body, null, 2)},
    timeout=120,
)
response.raise_for_status()
result = response.json()

for _ in range(60):
    if result["status"] != "IN_PROGRESS":
        break
    time.sleep(10)
    poll_url = urljoin(${JSON.stringify(request.url)}, f"/v1/tasks/{result['task_id']}")
    response = requests.get(poll_url, headers=headers, timeout=120)
    response.raise_for_status()
    result = response.json()
else:
    raise TimeoutError("Generation timed out")

if result["status"] == "FAILED":
    raise RuntimeError(result["error"]["code"])

if result.get("output", {}).get("kind") == "video":
    download_url = urljoin(${JSON.stringify(request.url)}, result["output"]["download_url"])
    video_response = requests.get(download_url, headers=headers, timeout=120)
    video_response.raise_for_status()
    with open("result.webm", "wb") as video_file:
        video_file.write(video_response.content)
else:
    print(result["output"])`;
}

export function generateSnippet(request: ApiTraceRequest, language: SnippetLanguage): string {
  switch (language) {
    case 'curl':
      return curlSnippet(request);
    case 'javascript':
      return javascriptSnippet(request);
    case 'python':
      return pythonSnippet(request);
  }
}
