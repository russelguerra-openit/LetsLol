import { useEffect, type RefObject } from 'react';
import { getHubConnection, subscribeToHubConnectionStatus } from './hubConnection';

type SignalrStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';
type ToastSeverity = 'info' | 'success' | 'warning' | 'error';

type UseConnectionStatusSubscriptionParams = {
    avatarAppearanceRef: RefObject<unknown>;
    closeAllPeerConnections: () => void;
    connectionIdRef: RefObject<string | null>;
    playerNameRef: RefObject<string>;
    pushToast: (message: string, severity?: ToastSeverity, dedupeKey?: string) => void;
    removeAvatar: (playerId: string) => void;
    setConnectionId: (value: string | null) => void;
    setSignalrError: (value: string | null) => void;
    setSignalrStatus: (value: SignalrStatus) => void;
    setVoiceError: (value: string | null) => void;
    signalrStatusRef: RefObject<SignalrStatus>;
};

export function useConnectionStatusSubscription({
    avatarAppearanceRef,
    closeAllPeerConnections,
    connectionIdRef,
    playerNameRef,
    pushToast,
    removeAvatar,
    setConnectionId,
    setSignalrError,
    setSignalrStatus,
    setVoiceError,
    signalrStatusRef,
}: UseConnectionStatusSubscriptionParams) {
    useEffect(() => {
        const applyReconnectedProfile = async (): Promise<void> => {
            const connection = getHubConnection();
            const restoredName = (playerNameRef.current || localStorage.getItem('letslol.playerName') || 'Guest').trim() || 'Guest';
            await connection.invoke('SetDisplayName', restoredName);
            await connection.invoke('SetAvatarAppearance', JSON.stringify(avatarAppearanceRef.current));
        };

        return subscribeToHubConnectionStatus((event) => {
            const previousConnectionId = connectionIdRef.current;
            if (event.type === 'reconnecting') {
                if (previousConnectionId) {
                    removeAvatar(previousConnectionId);
                }

                setConnectionId(null);
                setSignalrStatus('reconnecting');
                setSignalrError(event.error?.message ?? 'Trying to reconnect to the server.');
                closeAllPeerConnections();
                pushToast('Connection lost. Reconnecting to the server...', 'warning', 'signalr-reconnecting');
                return;
            }

            if (event.type === 'reconnected') {
                setConnectionId(event.connectionId ?? getHubConnection().connectionId ?? null);
                setSignalrStatus('connected');
                setSignalrError(null);
                setVoiceError(null);
                pushToast('Reconnected to the server.', 'success', 'signalr-reconnected');

                void applyReconnectedProfile().catch((error: unknown) => {
                    const message = error instanceof Error ? error.message : 'Failed to restore your session after reconnecting.';
                    setSignalrStatus('error');
                    setSignalrError(message);
                });
                return;
            }

            if (previousConnectionId) {
                removeAvatar(previousConnectionId);
            }

            setConnectionId(null);
            closeAllPeerConnections();

            if (signalrStatusRef.current === 'idle') {
                return;
            }

            setSignalrStatus('disconnected');
            setSignalrError(event.error?.message ?? 'Disconnected from the server.');
            pushToast('Disconnected from the server.', 'error', 'signalr-disconnected');
        });
    }, [
        avatarAppearanceRef,
        closeAllPeerConnections,
        connectionIdRef,
        playerNameRef,
        pushToast,
        removeAvatar,
        setConnectionId,
        setSignalrError,
        setSignalrStatus,
        setVoiceError,
        signalrStatusRef,
    ]);
}
