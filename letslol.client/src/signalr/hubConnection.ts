import * as signalR from '@microsoft/signalr';

const SIGNALR_HUB_URL = '/hubs/office';

let _connection: signalR.HubConnection | null = null;
let _startPromise: Promise<void> | null = null;
let _shouldBeConnected = false;
type HubConnectionStatusEvent =
    | { type: 'reconnecting'; error?: Error }
    | { type: 'reconnected'; connectionId?: string }
    | { type: 'close'; error?: Error };
type HubConnectionStatusListener = (event: HubConnectionStatusEvent) => void;

const _statusListeners = new Set<HubConnectionStatusListener>();

function notifyStatusListeners(event: HubConnectionStatusEvent): void {
    for (const listener of _statusListeners) {
        listener(event);
    }
}

export function getHubConnection(): signalR.HubConnection {
    if (!_connection) {
        _connection = new signalR.HubConnectionBuilder()
            .withUrl(SIGNALR_HUB_URL)
            .withAutomaticReconnect()
            .configureLogging(signalR.LogLevel.Information)
            .build();

        _connection.onreconnecting((error) => {
            notifyStatusListeners({ type: 'reconnecting', error });
        });

        _connection.onreconnected((connectionId) => {
            notifyStatusListeners({ type: 'reconnected', connectionId });
        });

        _connection.onclose((error) => {
            notifyStatusListeners({ type: 'close', error });
        });
    }
    return _connection;
}

export function subscribeToHubConnectionStatus(listener: HubConnectionStatusListener): () => void {
    _statusListeners.add(listener);
    return () => {
        _statusListeners.delete(listener);
    };
}

export async function startHubConnection(): Promise<void> {
    _shouldBeConnected = true;
    const connection = getHubConnection();

    if (connection.state === signalR.HubConnectionState.Connected) {
        return;
    }

    if (connection.state === signalR.HubConnectionState.Disconnected) {
        _startPromise = connection.start();
        try {
            await _startPromise;
        } finally {
            _startPromise = null;
        }
    } else if (_startPromise !== null) {
        // Already starting — wait for the in-progress negotiation
        await _startPromise;
    }
}

export async function stopHubConnection(): Promise<void> {
    _shouldBeConnected = false;

    if (_startPromise !== null) {
        // Wait for negotiation to finish before stopping,
        // otherwise SignalR throws "stopped during negotiation"
        try { await _startPromise; } catch { /* ignore */ }
        _startPromise = null;
    }

    // If a newer start request happened while we were waiting, do not stop.
    if (_shouldBeConnected) {
        return;
    }

    if (_connection && _connection.state !== signalR.HubConnectionState.Disconnected) {
        await _connection.stop();
    }
}
