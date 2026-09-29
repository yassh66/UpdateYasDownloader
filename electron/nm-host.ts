import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

const PIPE_NAME = 'yas-downloader-ipc';
const PIPE_PATH = process.platform === 'win32' 
  ? `\\\\.\\pipe\\${PIPE_NAME}` 
  : path.join(require('os').tmpdir(), `${PIPE_NAME}.sock`);

let debugLogPath: string | null = null;
function logDebug(msg: string) {
  try {
    if (!debugLogPath) {
      debugLogPath = path.join(process.env.APPDATA || process.cwd(), 'yas-downloader', 'native-messaging-debug.log');
      fs.mkdirSync(path.dirname(debugLogPath), { recursive: true });
    }
    fs.appendFileSync(debugLogPath, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (e) {}
}

// Redirect console to stderr to prevent Native Messaging protocol corruption
console.log = (...args) => { logDebug(`console.log: ${args}`); console.error(...args); };
console.warn = (...args) => { logDebug(`console.warn: ${args}`); console.error(...args); };
console.info = (...args) => { logDebug(`console.info: ${args}`); console.error(...args); };

logDebug(`--- DEDICATED NM HOST STARTUP ---`);
logDebug(`process.execPath: ${process.execPath}`);
logDebug(`process.argv: ${JSON.stringify(process.argv)}`);

let payloadSize: number | null = null;
let buffer = Buffer.alloc(0);
let handlingMessage = false;

process.stdin.on('data', (chunk) => {
  logDebug(`stdin data chunk length: ${chunk.length}`);
  buffer = Buffer.concat([buffer, chunk]);
  
  if (payloadSize === null && buffer.length >= 4) {
    payloadSize = buffer.readUInt32LE(0);
    logDebug(`parsed 32-bit payloadSize: ${payloadSize}`);
  }
  
  if (payloadSize !== null && buffer.length >= 4 + payloadSize) {
    const payload = buffer.toString('utf8', 4, 4 + payloadSize);
    try {
      const parsed = JSON.parse(payload);
      const sanitized = { ...parsed };
      if (sanitized.cookies) sanitized.cookies = '[REDACTED]';
      logDebug(`payload received from browser: ${JSON.stringify(sanitized)}`);
    } catch (e) {
      logDebug(`payload received from browser (length: ${payload.length})`);
    }
    buffer = buffer.subarray(4 + payloadSize);
    payloadSize = null;
    handlingMessage = true;
    handleMessage(payload);
  }
});

process.stdin.on('end', () => {
  logDebug(`stdin end event. handlingMessage=${handlingMessage}`);
  if (!handlingMessage) {
    logDebug(`Exiting due to stdin end (no message handled)`);
    process.exit(0);
  }
});

process.stdin.on('error', (err) => {
  logDebug(`stdin error: ${err.message}`);
});

process.stdout.on('error', (err) => {
  logDebug(`stdout error: ${err.message}`);
});

function handleMessage(payload: string) {
  logDebug(`handleMessage called`);
  try {
    const msg = JSON.parse(payload);
    logDebug(`JSON.parse success. msg.url exists: ${!!msg.url}`);
    
    if (msg.url) {
      forwardMessage(msg);
    } else {
      sendResponse({ success: false, error: 'No URL provided' });
      process.exit(1);
    }
  } catch (e: any) {
    logDebug(`JSON.parse failure: ${e.message}`);
    sendResponse({ success: false, error: e.message });
    process.exit(1);
  }
}

function forwardMessage(msgObj: any, retryCount = 0) {
  const MAX_RETRIES = 10;
  logDebug(`Attempting to connect to Named Pipe at ${PIPE_PATH} (Retry: ${retryCount})`);
  
  const client = net.createConnection(PIPE_PATH, () => {
    logDebug(`Named Pipe connect success`);
    const payloadStr = typeof msgObj === 'string' 
      ? JSON.stringify({ action: 'start-download', url: msgObj })
      : JSON.stringify(msgObj);
    logDebug(`Writing ${payloadStr.length} bytes to pipe`);
    client.write(payloadStr, () => {
      logDebug(`Named Pipe write callback execution`);
      sendResponse({ success: true });
      client.end();
      logDebug(`process exiting with 0 (success)`);
      setTimeout(() => process.exit(0), 100);
    });
  });

  client.on('error', (err: any) => {
    logDebug(`Named Pipe error event: ${err.code} - ${err.message}`);
    
    // If pipe connection refused/missing, try launching main executable and wait
    if (err.code === 'ENOENT' || err.code === 'ECONNREFUSED') {
       if (retryCount === 0) {
         logDebug(`Primary IPC server not running. Spawning main executable...`);
         try {
           const mainAppPath = path.join(path.dirname(process.execPath), 'YAS Downloader.exe');
           logDebug(`Spawning main GUI: ${mainAppPath}`);
           // Spawning the main GUI application
           const appProcess = spawn(mainAppPath, [], {
             detached: true,
             stdio: 'ignore'
           });
           appProcess.unref(); // Detach process from host
           
           logDebug(`Spawned main executable with PID ${appProcess.pid}. Waiting 500ms to retry...`);
           setTimeout(() => forwardMessage(msgObj, retryCount + 1), 500);
         } catch (spawnErr: any) {
           logDebug(`Failed to spawn main executable: ${spawnErr.message}`);
           sendResponse({ success: false, error: 'Failed to launch YAS Downloader: ' + spawnErr.message });
           process.exit(1);
         }
       } else if (retryCount < MAX_RETRIES) {
         logDebug(`Retrying connection in 500ms (Attempt ${retryCount + 1}/${MAX_RETRIES})...`);
         setTimeout(() => forwardMessage(msgObj, retryCount + 1), 500);
       } else {
         logDebug(`Max retries reached. Cannot connect.`);
         sendResponse({ success: false, error: 'Could not connect to YAS Downloader IPC server' });
         process.exit(1);
       }
    } else {
       sendResponse({ success: false, error: 'Cannot connect to YAS Downloader: ' + err.message });
       process.exit(1);
    }
  });
}

function sendResponse(msg: any) {
  logDebug(`sendResponse() invocation`);
  const msgStr = JSON.stringify(msg);
  logDebug(`response JSON length: ${msgStr.length}`);
  const outBuffer = Buffer.from(msgStr, 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(outBuffer.length, 0);
  
  try {
    process.stdout.write(header);
    process.stdout.write(outBuffer, () => {
      logDebug(`stdout.write completion`);
    });
  } catch (e: any) {
    logDebug(`stdout.write error: ${e.message}`);
  }
}
