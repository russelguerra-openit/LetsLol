import { useEffect, type RefObject } from 'react';
import type { Container } from 'pixi.js';
import type { AvatarAppearance } from '../avatar/model';
import { getHubConnection, stopHubConnection } from './hubConnection';

type PlayerEventBindings = {
    closeAllPeerConnections: () => void;
    drawAvatarBody: (body: Container, appearance: AvatarAppearance, isLocalPlayer: boolean) => void;
    getFallbackAvatarAppearance: (playerId: string) => AvatarAppearance;
    normalizeAvatarAppearance: (value: unknown) => AvatarAppearance;
    removeAvatar: (playerId: string) => void;
    upsertAvatar: (playerId: string, x: number, y: number, displayName?: string, appearance?: AvatarAppearance) => void;
    pendingDisplayNamesRef: RefObject<Map<string, string>>;
    pendingAvatarAppearancesRef: RefObject<Map<string, AvatarAppearance>>;
    avatarsRef: RefObject<Map<string, { label: { text: string }; body: Container; appearance: AvatarAppearance }>>;
    connectionIdRef: RefObject<string | null>;
};

type RtcEventBindings = {
    handleReceiveOffer: (fromConnectionId: string, sdp: string) => void;
    handleReceiveAnswer: (fromConnectionId: string, sdp: string) => void;
    handleReceiveIceCandidate: (fromConnectionId: string, candidateJson: string) => void;
    handleReceiveScreenShareStarted: (fromConnectionId: string, sessionId: string) => void;
    handleReceiveScreenShareOfferRequest: (fromConnectionId: string, sessionId: string) => void;
    handleReceiveScreenShareOffer: (fromConnectionId: string, sessionId: string, sdp: string) => void;
    handleReceiveScreenShareAnswer: (fromConnectionId: string, sessionId: string, sdp: string) => void;
    handleReceiveScreenShareIceCandidate: (fromConnectionId: string, sessionId: string, candidateJson: string) => void;
    handleReceiveScreenShareStopped: (fromConnectionId: string, sessionId: string) => void;
    handleReceiveScreenShareReplaced: (replacingConnectionId: string, targetConnectionId: string, newSessionId: string, replacedSessionId: string) => void;
};

export function usePlayerHubEventBindings({
    closeAllPeerConnections,
    drawAvatarBody,
    getFallbackAvatarAppearance,
    normalizeAvatarAppearance,
    removeAvatar,
    upsertAvatar,
    pendingDisplayNamesRef,
    pendingAvatarAppearancesRef,
    avatarsRef,
    connectionIdRef,
}: PlayerEventBindings) {
    useEffect(() => {
        const connection = getHubConnection();

        const onPlayerSpawned = (playerId: string, x: number, y: number, displayName: string, appearanceJson?: string) => {
            let appearance: AvatarAppearance | undefined;
            if (appearanceJson) {
                try {
                    appearance = normalizeAvatarAppearance(JSON.parse(appearanceJson));
                } catch {
                    appearance = undefined;
                }
            }

            upsertAvatar(playerId, x, y, displayName, appearance);
        };

        const onPlayerMoved = (playerId: string, x: number, y: number) => {
            upsertAvatar(playerId, x, y);
        };

        const onPlayerNameUpdated = (playerId: string, displayName: string) => {
            pendingDisplayNamesRef.current.set(playerId, displayName);
            const existing = avatarsRef.current.get(playerId);
            if (existing?.label) {
                existing.label.text = displayName;
            }
        };

        const onPlayerAppearanceUpdated = (playerId: string, appearanceJson: string) => {
            let appearance: AvatarAppearance;
            try {
                appearance = normalizeAvatarAppearance(JSON.parse(appearanceJson));
            } catch {
                appearance = getFallbackAvatarAppearance(playerId);
            }

            pendingAvatarAppearancesRef.current.set(playerId, appearance);
            const existing = avatarsRef.current.get(playerId);
            if (existing) {
                existing.appearance = appearance;
                drawAvatarBody(existing.body, appearance, (connectionIdRef.current ?? getHubConnection().connectionId) === playerId);
            }
        };

        const onPlayerLeft = (playerId: string) => {
            removeAvatar(playerId);
        };

        connection.on('PlayerSpawned', onPlayerSpawned);
        connection.on('PlayerMoved', onPlayerMoved);
        connection.on('PlayerLeft', onPlayerLeft);
        connection.on('PlayerNameUpdated', onPlayerNameUpdated);
        connection.on('PlayerAppearanceUpdated', onPlayerAppearanceUpdated);

        return () => {
            connection.off('PlayerSpawned', onPlayerSpawned);
            connection.off('PlayerMoved', onPlayerMoved);
            connection.off('PlayerLeft', onPlayerLeft);
            connection.off('PlayerNameUpdated', onPlayerNameUpdated);
            connection.off('PlayerAppearanceUpdated', onPlayerAppearanceUpdated);
            closeAllPeerConnections();
            stopHubConnection();
        };
    }, [
        avatarsRef,
        closeAllPeerConnections,
        connectionIdRef,
        drawAvatarBody,
        getFallbackAvatarAppearance,
        normalizeAvatarAppearance,
        pendingAvatarAppearancesRef,
        pendingDisplayNamesRef,
        removeAvatar,
        upsertAvatar,
    ]);
}

export function useRtcHubEventBindings({
    handleReceiveOffer,
    handleReceiveAnswer,
    handleReceiveIceCandidate,
    handleReceiveScreenShareStarted,
    handleReceiveScreenShareOfferRequest,
    handleReceiveScreenShareOffer,
    handleReceiveScreenShareAnswer,
    handleReceiveScreenShareIceCandidate,
    handleReceiveScreenShareStopped,
    handleReceiveScreenShareReplaced,
}: RtcEventBindings) {
    useEffect(() => {
        const connection = getHubConnection();
        connection.on('ReceiveOffer', handleReceiveOffer);
        connection.on('ReceiveAnswer', handleReceiveAnswer);
        connection.on('ReceiveIceCandidate', handleReceiveIceCandidate);
        connection.on('ReceiveScreenShareStarted', handleReceiveScreenShareStarted);
        connection.on('ReceiveScreenShareOfferRequest', handleReceiveScreenShareOfferRequest);
        connection.on('ReceiveScreenShareOffer', handleReceiveScreenShareOffer);
        connection.on('ReceiveScreenShareAnswer', handleReceiveScreenShareAnswer);
        connection.on('ReceiveScreenShareIceCandidate', handleReceiveScreenShareIceCandidate);
        connection.on('ReceiveScreenShareStopped', handleReceiveScreenShareStopped);
        connection.on('ReceiveScreenShareReplaced', handleReceiveScreenShareReplaced);

        return () => {
            connection.off('ReceiveOffer', handleReceiveOffer);
            connection.off('ReceiveAnswer', handleReceiveAnswer);
            connection.off('ReceiveIceCandidate', handleReceiveIceCandidate);
            connection.off('ReceiveScreenShareStarted', handleReceiveScreenShareStarted);
            connection.off('ReceiveScreenShareOfferRequest', handleReceiveScreenShareOfferRequest);
            connection.off('ReceiveScreenShareOffer', handleReceiveScreenShareOffer);
            connection.off('ReceiveScreenShareAnswer', handleReceiveScreenShareAnswer);
            connection.off('ReceiveScreenShareIceCandidate', handleReceiveScreenShareIceCandidate);
            connection.off('ReceiveScreenShareStopped', handleReceiveScreenShareStopped);
            connection.off('ReceiveScreenShareReplaced', handleReceiveScreenShareReplaced);
        };
    }, [
        handleReceiveAnswer,
        handleReceiveIceCandidate,
        handleReceiveOffer,
        handleReceiveScreenShareAnswer,
        handleReceiveScreenShareIceCandidate,
        handleReceiveScreenShareOffer,
        handleReceiveScreenShareOfferRequest,
        handleReceiveScreenShareReplaced,
        handleReceiveScreenShareStarted,
        handleReceiveScreenShareStopped,
    ]);
}
