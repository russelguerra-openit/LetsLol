import { useEffect, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react';
import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { AvatarAppearance } from '../avatar/model';
import {
    BREAK_QUIET_ZONE_RECT,
    CAMERA_EDGE_PADDING_RATIO,
    CAMERA_ZOOM,
    CONFERENCE_DOOR_RECT,
    CONFERENCE_ROOM_RECT,
    CONFERENCE_TABLE_RECT,
    OFFICE_CUBICLE_PODS,
    PLAYER_SPEED_PX_PER_SEC,
    PLAYER_SPRINT_MULTIPLIER,
    WORLD_HEIGHT,
    WORLD_WIDTH,
} from './layout';

type AvatarPosition = { x: number; y: number };
type AvatarVisual = {
    ring: Graphics;
    body: Container;
    label: Text;
    speakingBadge: Graphics;
    target: AvatarPosition;
    appearance: AvatarAppearance;
};
type MovementInput = { up: boolean; down: boolean; left: boolean; right: boolean; sprint: boolean };
type RemoteScreenShare = { peerId: string; stream: MediaStream };
type RemoteScreenShareStatus = 'idle' | 'starting' | 'active' | 'stopping' | 'error';
type SpeechMeter = { analyser: AnalyserNode; source: MediaStreamAudioSourceNode; data: Uint8Array<ArrayBuffer> };
type SignalrStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

type UsePixiWorldParams = {
    appRef: MutableRefObject<Application | null>;
    avatarsRef: MutableRefObject<Map<string, AvatarVisual>>;
    broadcastPosition: (x: number, y: number) => void;
    closeAllPeerConnections: () => void;
    connectionIdRef: MutableRefObject<string | null>;
    detachRemoteSpeechMeter: (peerId: string) => void;
    flushPendingAvatars: () => void;
    hasCameraCenteredRef: MutableRefObject<boolean>;
    isWalkablePosition: (x: number, y: number) => boolean;
    lastBroadcastAtRef: MutableRefObject<number>;
    lastVoiceSyncAtRef: MutableRefObject<number>;
    localPositionRef: MutableRefObject<AvatarPosition | null>;
    localScreenShareSessionIdsRef: MutableRefObject<Map<string, string>>;
    movementInputRef: MutableRefObject<MovementInput>;
    nearbyIndicatorSinceRef: MutableRefObject<Map<string, number>>;
    nearbySinceRef: MutableRefObject<Map<string, number>>;
    pendingAvatarAppearancesRef: MutableRefObject<Map<string, AvatarAppearance>>;
    pendingAvatarsRef: MutableRefObject<Map<string, AvatarPosition>>;
    pendingDisplayNamesRef: MutableRefObject<Map<string, string>>;
    pixiContainerRef: RefObject<HTMLDivElement | null>;
    remoteScreenShareSessionIdsRef: MutableRefObject<Map<string, string>>;
    remoteScreenStreamsRef: MutableRefObject<Map<string, MediaStream>>;
    remoteSpeechMetersRef: MutableRefObject<Map<string, SpeechMeter>>;
    setIsInQuietZone: Dispatch<SetStateAction<boolean>>;
    setRemoteScreenShareStatuses: Dispatch<SetStateAction<Record<string, RemoteScreenShareStatus>>>;
    setRemoteScreenShares: Dispatch<SetStateAction<RemoteScreenShare[]>>;
    signalrStatusRef: MutableRefObject<SignalrStatus>;
    syncLeavingUsersIndicator: () => void;
    syncLoadingUsersIndicator: () => void;
    syncProximityVoiceConnections: () => void;
    syncQuietZoneIndicator: () => void;
    syncRemoteSpeechIndicators: () => void;
    syncTalkableUsersIndicator: () => void;
    updateProximityIndicators: () => void;
    announcedRemoteScreenSharersRef: MutableRefObject<Set<string>>;
};

const REMOTE_SMOOTHING_SPEED = 14;
const VOICE_SYNC_INTERVAL_MS = 120;
const POSITION_BROADCAST_INTERVAL_MS = 50;

export function usePixiWorld({
    appRef,
    avatarsRef,
    broadcastPosition,
    closeAllPeerConnections,
    connectionIdRef,
    detachRemoteSpeechMeter,
    flushPendingAvatars,
    hasCameraCenteredRef,
    isWalkablePosition,
    lastBroadcastAtRef,
    lastVoiceSyncAtRef,
    localPositionRef,
    localScreenShareSessionIdsRef,
    movementInputRef,
    nearbyIndicatorSinceRef,
    nearbySinceRef,
    pendingAvatarAppearancesRef,
    pendingAvatarsRef,
    pendingDisplayNamesRef,
    pixiContainerRef,
    remoteScreenShareSessionIdsRef,
    remoteScreenStreamsRef,
    remoteSpeechMetersRef,
    setIsInQuietZone,
    setRemoteScreenShareStatuses,
    setRemoteScreenShares,
    signalrStatusRef,
    syncLeavingUsersIndicator,
    syncLoadingUsersIndicator,
    syncProximityVoiceConnections,
    syncQuietZoneIndicator,
    syncRemoteSpeechIndicators,
    syncTalkableUsersIndicator,
    updateProximityIndicators,
    announcedRemoteScreenSharersRef,
}: UsePixiWorldParams) {
    useEffect(() => {
        let initialized: Application | null = null;
        let cancelled = false;
        let resizeHandler: (() => void) | null = null;
        const app = new Application();

        app.init({ width: window.innerWidth, height: window.innerHeight, background: '#4e4236', antialias: true, autoDensity: true }).then(() => {
            if (cancelled) {
                app.destroy(true);
                return;
            }

            initialized = app;
            appRef.current = app;
            app.stage.scale.set(CAMERA_ZOOM, CAMERA_ZOOM);

            const clampCameraPosition = () => {
                const viewportWidth = app.renderer.width;
                const viewportHeight = app.renderer.height;
                const minX = Math.min(0, viewportWidth - (WORLD_WIDTH * CAMERA_ZOOM));
                const minY = Math.min(0, viewportHeight - (WORLD_HEIGHT * CAMERA_ZOOM));

                app.stage.x = Math.min(0, Math.max(minX, app.stage.x));
                app.stage.y = Math.min(0, Math.max(minY, app.stage.y));
            };

            const updateCameraForLocalAvatar = (avatar: AvatarVisual, hardCenter = false) => {
                const viewportWidth = app.renderer.width;
                const viewportHeight = app.renderer.height;
                const minX = Math.min(0, viewportWidth - (WORLD_WIDTH * CAMERA_ZOOM));
                const minY = Math.min(0, viewportHeight - (WORLD_HEIGHT * CAMERA_ZOOM));
                let nextX = app.stage.x;
                let nextY = app.stage.y;

                if (hardCenter) {
                    nextX = (viewportWidth * 0.5) - (avatar.body.x * CAMERA_ZOOM);
                    nextY = (viewportHeight * 0.5) - (avatar.body.y * CAMERA_ZOOM);
                } else {
                    const leftEdge = viewportWidth * CAMERA_EDGE_PADDING_RATIO;
                    const rightEdge = viewportWidth * (1 - CAMERA_EDGE_PADDING_RATIO);
                    const topEdge = viewportHeight * CAMERA_EDGE_PADDING_RATIO;
                    const bottomEdge = viewportHeight * (1 - CAMERA_EDGE_PADDING_RATIO);
                    const screenX = (avatar.body.x * CAMERA_ZOOM) + app.stage.x;
                    const screenY = (avatar.body.y * CAMERA_ZOOM) + app.stage.y;

                    if (screenX < leftEdge) nextX += leftEdge - screenX;
                    else if (screenX > rightEdge) nextX -= screenX - rightEdge;

                    if (screenY < topEdge) nextY += topEdge - screenY;
                    else if (screenY > bottomEdge) nextY -= screenY - bottomEdge;
                }

                app.stage.x = Math.min(0, Math.max(minX, nextX));
                app.stage.y = Math.min(0, Math.max(minY, nextY));
            };

            resizeHandler = () => {
                app.renderer.resize(window.innerWidth, window.innerHeight);
                clampCameraPosition();
            };

            window.addEventListener('resize', resizeHandler);

            const OFF_Y = 22;
            const OFF_H = 538;
            const BRK_Y = 610;
            const BRK_H = 200;
            const floors = new Graphics();
            const floorWidth = WORLD_WIDTH - 16;
            const floorRightEdge = WORLD_WIDTH - 8;
            floors.rect(8, OFF_Y, floorWidth, OFF_H).fill(0xf0e4cf);
            floors.rect(8, BRK_Y, floorWidth, BRK_H).fill(0xe8f4e8);
            for (let gx = 68; gx < floorRightEdge; gx += 60) floors.rect(gx, OFF_Y, 1, OFF_H).fill(0xe6d8c0);
            for (let gy = 82; gy < OFF_Y + OFF_H; gy += 60) floors.rect(8, gy, floorWidth, 1).fill(0xe6d8c0);
            for (let gx = 68; gx < floorRightEdge; gx += 60) floors.rect(gx, BRK_Y, 1, BRK_H).fill(0xd8e8d4);
            for (let gy = BRK_Y + 60; gy < BRK_Y + BRK_H; gy += 60) floors.rect(8, gy, floorWidth, 1).fill(0xd8e8d4);
            app.stage.addChild(floors);

            const conn = new Graphics();
            conn.rect(780, 560, 100, 50).fill(0xd4c9b0);
            conn.rect(774, 556, 6, 58).fill(0x6a5030);
            conn.rect(880, 556, 6, 58).fill(0x6a5030);
            app.stage.addChild(conn);

            const offDeco = new Graphics();
            offDeco.roundRect(190, 22, 148, 18, 4).fill(0x88c8f4);
            offDeco.roundRect(772, 22, 148, 18, 4).fill(0x88c8f4);
            offDeco.roundRect(492, 22, 256, 20, 3).fill(0xf0f0ec);
            offDeco.roundRect(1206, 454, 472, 58, 24).fill({ color: 0x7d8f9f, alpha: 0.12 });
            offDeco.roundRect(1220, 464, 444, 38, 18).fill({ color: 0xffffff, alpha: 0.3 });
            offDeco.roundRect(146, 132, 18, 148, 9).fill(0xddd0b8);
            offDeco.roundRect(152, 142, 6, 128, 3).fill(0xf7f0df);
            offDeco.roundRect(948, 108, 18, 176, 9).fill(0xddd0b8);
            offDeco.roundRect(954, 118, 6, 156, 3).fill(0xf7f0df);
            app.stage.addChild(offDeco);

            const coffeeStation = new Graphics();
            coffeeStation.roundRect(320, 508, 138, 52, 12).fill(0xf7f1e7).stroke({ color: 0xc2b092, width: 3, alpha: 0.9 });
            coffeeStation.roundRect(332, 520, 114, 28, 8).fill(0xd2ab77).stroke({ color: 0x92653b, width: 2, alpha: 0.86 });
            coffeeStation.roundRect(342, 526, 36, 16, 5).fill(0x3a434d);
            coffeeStation.roundRect(348, 530, 24, 7, 3).fill(0x8fd0f8);
            coffeeStation.roundRect(384, 526, 18, 16, 5).fill(0xeee7dc).stroke({ color: 0xbda78a, width: 1.5, alpha: 0.82 });
            coffeeStation.roundRect(408, 526, 18, 16, 5).fill(0xeee7dc).stroke({ color: 0xbda78a, width: 1.5, alpha: 0.82 });
            coffeeStation.roundRect(387, 529, 3, 8, 1.5).fill(0xb88955);
            coffeeStation.roundRect(411, 529, 3, 8, 1.5).fill(0xb88955);
            coffeeStation.circle(436, 534, 6).fill(0x6f8d52);
            coffeeStation.circle(443, 536, 5).fill(0x5c7744);
            app.stage.addChild(coffeeStation);

            const conferenceRoom = new Graphics();
            conferenceRoom.roundRect(CONFERENCE_ROOM_RECT.x, CONFERENCE_ROOM_RECT.y, CONFERENCE_ROOM_RECT.width, CONFERENCE_ROOM_RECT.height, 22).fill({ color: 0xf3efe7, alpha: 0.98 }).stroke({ color: 0x9b896d, width: 7, alpha: 0.98 });
            conferenceRoom.roundRect(CONFERENCE_ROOM_RECT.x + 24, CONFERENCE_ROOM_RECT.y + 22, CONFERENCE_ROOM_RECT.width - 48, CONFERENCE_ROOM_RECT.height - 44, 18).fill({ color: 0xf9f8f2, alpha: 0.92 }).stroke({ color: 0xcbd4df, width: 3, alpha: 0.7 });
            conferenceRoom.roundRect(CONFERENCE_ROOM_RECT.x + 154, CONFERENCE_ROOM_RECT.y + 34, 260, 58, 12).fill(0xf1f3f6).stroke({ color: 0xc6ccd4, width: 3, alpha: 0.95 });
            conferenceRoom.roundRect(CONFERENCE_ROOM_RECT.x + 174, CONFERENCE_ROOM_RECT.y + 52, 220, 22, 8).fill(0xffffff);
            conferenceRoom.roundRect(CONFERENCE_ROOM_RECT.x + 92, CONFERENCE_ROOM_RECT.y + 138, CONFERENCE_ROOM_RECT.width - 184, CONFERENCE_ROOM_RECT.height - 220, 24).fill({ color: 0xe7edf3, alpha: 0.3 });
            conferenceRoom.roundRect(CONFERENCE_ROOM_RECT.x + 106, CONFERENCE_ROOM_RECT.y + 154, CONFERENCE_ROOM_RECT.width - 212, CONFERENCE_ROOM_RECT.height - 252, 28).fill({ color: 0xb8c5d1, alpha: 0.12 });
            conferenceRoom.roundRect(CONFERENCE_ROOM_RECT.x + 124, CONFERENCE_ROOM_RECT.y + 44, 86, 124, 14).fill(0xf8f5ef).stroke({ color: 0xcfb999, width: 3, alpha: 0.82 });
            conferenceRoom.roundRect(CONFERENCE_ROOM_RECT.x + 136, CONFERENCE_ROOM_RECT.y + 56, 62, 42, 10).fill(0xe0c1a3);
            conferenceRoom.roundRect(CONFERENCE_ROOM_RECT.x + 136, CONFERENCE_ROOM_RECT.y + 108, 62, 42, 10).fill(0xb5cfb4);
            conferenceRoom.roundRect(CONFERENCE_ROOM_RECT.x + CONFERENCE_ROOM_RECT.width - 210, CONFERENCE_ROOM_RECT.y + 44, 86, 124, 14).fill(0xf8f5ef).stroke({ color: 0xcfb999, width: 3, alpha: 0.82 });
            conferenceRoom.roundRect(CONFERENCE_ROOM_RECT.x + CONFERENCE_ROOM_RECT.width - 198, CONFERENCE_ROOM_RECT.y + 56, 62, 42, 10).fill(0xccd7e4);
            conferenceRoom.roundRect(CONFERENCE_ROOM_RECT.x + CONFERENCE_ROOM_RECT.width - 198, CONFERENCE_ROOM_RECT.y + 108, 62, 42, 10).fill(0xd9c1a5);
            conferenceRoom.roundRect(CONFERENCE_TABLE_RECT.x, CONFERENCE_TABLE_RECT.y, CONFERENCE_TABLE_RECT.width, CONFERENCE_TABLE_RECT.height, 22).fill(0xb78a54).stroke({ color: 0x7f5f39, width: 6, alpha: 0.95 });
            conferenceRoom.roundRect(CONFERENCE_TABLE_RECT.x + 22, CONFERENCE_TABLE_RECT.y + 18, CONFERENCE_TABLE_RECT.width - 44, 26, 10).fill(0xd0a26a);
            conferenceRoom.roundRect(CONFERENCE_TABLE_RECT.x + 24, CONFERENCE_TABLE_RECT.y + CONFERENCE_TABLE_RECT.height - 42, CONFERENCE_TABLE_RECT.width - 48, 22, 10).fill(0x9f7443);
            conferenceRoom.circle(CONFERENCE_TABLE_RECT.x + 60, CONFERENCE_TABLE_RECT.y - 34, 20).fill(0x8a4f7d);
            conferenceRoom.roundRect(CONFERENCE_TABLE_RECT.x + 50, CONFERENCE_TABLE_RECT.y - 60, 20, 16, 6).fill(0x6f3b67);
            conferenceRoom.circle(CONFERENCE_TABLE_RECT.x + 150, CONFERENCE_TABLE_RECT.y - 34, 20).fill(0x367eae);
            conferenceRoom.roundRect(CONFERENCE_TABLE_RECT.x + 140, CONFERENCE_TABLE_RECT.y - 60, 20, 16, 6).fill(0x255d84);
            conferenceRoom.circle(CONFERENCE_TABLE_RECT.x + 240, CONFERENCE_TABLE_RECT.y - 34, 20).fill(0x6e56a4);
            conferenceRoom.roundRect(CONFERENCE_TABLE_RECT.x + 230, CONFERENCE_TABLE_RECT.y - 60, 20, 16, 6).fill(0x55407f);
            conferenceRoom.circle(CONFERENCE_TABLE_RECT.x + 60, CONFERENCE_TABLE_RECT.y + CONFERENCE_TABLE_RECT.height + 34, 20).fill(0xb07624);
            conferenceRoom.roundRect(CONFERENCE_TABLE_RECT.x + 50, CONFERENCE_TABLE_RECT.y + CONFERENCE_TABLE_RECT.height + 8, 20, 16, 6).fill(0x8a5a18);
            conferenceRoom.circle(CONFERENCE_TABLE_RECT.x + 150, CONFERENCE_TABLE_RECT.y + CONFERENCE_TABLE_RECT.height + 34, 20).fill(0x2c918d);
            conferenceRoom.roundRect(CONFERENCE_TABLE_RECT.x + 140, CONFERENCE_TABLE_RECT.y + CONFERENCE_TABLE_RECT.height + 8, 20, 16, 6).fill(0x1f6e6b);
            conferenceRoom.circle(CONFERENCE_TABLE_RECT.x + 240, CONFERENCE_TABLE_RECT.y + CONFERENCE_TABLE_RECT.height + 34, 20).fill(0x4e8a3a);
            conferenceRoom.roundRect(CONFERENCE_TABLE_RECT.x + 230, CONFERENCE_TABLE_RECT.y + CONFERENCE_TABLE_RECT.height + 8, 20, 16, 6).fill(0x39672a);
            conferenceRoom.circle(CONFERENCE_TABLE_RECT.x - 42, CONFERENCE_TABLE_RECT.y + 48, 20).fill(0xb05032);
            conferenceRoom.roundRect(CONFERENCE_TABLE_RECT.x - 66, CONFERENCE_TABLE_RECT.y + 40, 16, 20, 6).fill(0x883b25);
            conferenceRoom.circle(CONFERENCE_TABLE_RECT.x - 42, CONFERENCE_TABLE_RECT.y + 102, 20).fill(0x9b7440);
            conferenceRoom.roundRect(CONFERENCE_TABLE_RECT.x - 66, CONFERENCE_TABLE_RECT.y + 94, 16, 20, 6).fill(0x78562e);
            conferenceRoom.circle(CONFERENCE_TABLE_RECT.x + CONFERENCE_TABLE_RECT.width + 42, CONFERENCE_TABLE_RECT.y + 48, 20).fill(0x7b8f30);
            conferenceRoom.roundRect(CONFERENCE_TABLE_RECT.x + CONFERENCE_TABLE_RECT.width + 50, CONFERENCE_TABLE_RECT.y + 40, 16, 20, 6).fill(0x617223);
            conferenceRoom.circle(CONFERENCE_TABLE_RECT.x + CONFERENCE_TABLE_RECT.width + 42, CONFERENCE_TABLE_RECT.y + 102, 20).fill(0x4f8d54);
            conferenceRoom.roundRect(CONFERENCE_TABLE_RECT.x + CONFERENCE_TABLE_RECT.width + 50, CONFERENCE_TABLE_RECT.y + 94, 16, 20, 6).fill(0x39673d);
            conferenceRoom.roundRect(CONFERENCE_DOOR_RECT.x + 6, CONFERENCE_DOOR_RECT.y, CONFERENCE_DOOR_RECT.width - 2, CONFERENCE_DOOR_RECT.height, 10).fill(0xd4c9b0);
            conferenceRoom.roundRect(CONFERENCE_DOOR_RECT.x, CONFERENCE_DOOR_RECT.y - 6, CONFERENCE_DOOR_RECT.width + 8, 6, 3).fill(0x6a5030);
            conferenceRoom.roundRect(CONFERENCE_DOOR_RECT.x, CONFERENCE_DOOR_RECT.y + CONFERENCE_DOOR_RECT.height, CONFERENCE_DOOR_RECT.width + 8, 6, 3).fill(0x6a5030);
            conferenceRoom.roundRect(CONFERENCE_DOOR_RECT.x + 18, CONFERENCE_DOOR_RECT.y + 18, 12, CONFERENCE_DOOR_RECT.height - 36, 6).fill(0xefdfb0);
            const conferenceLabel = new Text({ text: 'CONFERENCE', style: new TextStyle({ fontFamily: 'Verdana', fontSize: 24, fontWeight: '900', fill: '#596474', letterSpacing: 3 }) });
            conferenceLabel.anchor.set(0.5);
            conferenceLabel.position.set(CONFERENCE_ROOM_RECT.x + (CONFERENCE_ROOM_RECT.width * 0.5), CONFERENCE_ROOM_RECT.y + 124);
            conferenceRoom.addChild(conferenceLabel);
            app.stage.addChild(conferenceRoom);

            const cubicles = new Graphics();
            OFFICE_CUBICLE_PODS.forEach((pod) => {
                cubicles.roundRect(pod.x + 6, pod.y + 6, pod.width - 12, pod.height - 12, 16).fill({ color: 0xf8f5ee, alpha: 0.98 });
                cubicles.roundRect(pod.x, pod.y, pod.width, 12, 8).fill(0xb39f84);
                cubicles.roundRect(pod.x, pod.y + pod.height - 12, pod.width, 12, 8).fill(0xb39f84);
                cubicles.roundRect(pod.x, pod.y, 12, pod.height, 8).fill(0xb39f84);
                cubicles.roundRect(pod.x + pod.width - 12, pod.y, 12, 42, 8).fill(0xb39f84);
                cubicles.roundRect(pod.x + pod.width - 12, pod.y + 94, 12, pod.height - 94, 8).fill(0xb39f84);
                cubicles.roundRect(pod.x + pod.width - 28, pod.y + 50, 12, 34, 6).fill(0xe4d4bb).stroke({ color: 0xb99668, width: 2, alpha: 0.9 });
                cubicles.roundRect(pod.x + 30, pod.y + 22, 116, 32, 8).fill(0xc99658).stroke({ color: 0x8d6636, width: 2, alpha: 0.9 });
                cubicles.roundRect(pod.x + 42, pod.y + 28, 92, 10, 5).fill(0xe6bb82);
                cubicles.roundRect(pod.x + 82, pod.y + 30, 28, 16, 4).fill(0x2f3843);
                cubicles.roundRect(pod.x + 86, pod.y + 33, 20, 9, 3).fill(0x79b9ee);
                cubicles.circle(pod.x + 98, pod.y + 86, 16).fill(0x287a9f);
                cubicles.roundRect(pod.x + 90, pod.y + 92, 16, 14, 5).fill(0x1f5f7b);
            });
            app.stage.addChild(cubicles);

            const podLabels = ['Pod A', 'Pod B', 'Pod C'];
            OFFICE_CUBICLE_PODS.forEach((pod, index) => {
                const label = new Text({ text: podLabels[index] ?? `Pod ${index + 1}`, style: new TextStyle({ fontFamily: 'Verdana', fontSize: 11, fontWeight: '900', fill: '#6a7582', letterSpacing: 0.6 }) });
                label.anchor.set(0.5, 0.5);
                label.position.set(pod.x + (pod.width * 0.5), pod.y + 112);
                app.stage.addChild(label);
            });

            const officeCore = new Graphics();
            const officeClusterOffsetX = 320;
            officeCore.roundRect(224 + officeClusterOffsetX, 92, 452, 318, 34).fill({ color: 0x8f6c49, alpha: 0.12 });
            officeCore.roundRect(236 + officeClusterOffsetX, 102, 428, 298, 30).fill({ color: 0xd8c1a0, alpha: 0.46 });
            officeCore.rect(250 + officeClusterOffsetX, 110, 400, 280).fill(0xc89a5a).stroke({ color: 0x8d6636, width: 5 });
            officeCore.rect(264 + officeClusterOffsetX, 122, 372, 24).fill(0xdab074);
            officeCore.rect(264 + officeClusterOffsetX, 346, 372, 24).fill(0xb7884e);
            officeCore.rect(268 + officeClusterOffsetX, 150, 20, 200).fill(0xb5864e);
            officeCore.rect(612 + officeClusterOffsetX, 150, 20, 200).fill(0xb5864e);
            const chairFill = [0x2968b4, 0xb02e2e, 0x2e8a4a, 0x8040b4, 0xb07820, 0x2e9898, 0x6a4c93, 0x4d8f41, 0xa14578, 0x287a9f, 0x7b8f30, 0xa35f2b];
            const chairBack = [0x184898, 0x8a1a1a, 0x1a6832, 0x602890, 0x8a5c10, 0x1e7070, 0x4d376f, 0x346e2f, 0x7a2f5a, 0x1f5f7b, 0x60701f, 0x7d4620];
            [280, 400, 520, 640].map((x) => x + officeClusterOffsetX).forEach((x, i) => {
                officeCore.circle(x, 66, 20).fill(chairFill[i]);
                officeCore.roundRect(x - 10, 40, 20, 16, 6).fill(chairBack[i]);
                officeCore.roundRect(x - 19, 122, 38, 18, 4).fill(0x303741);
                officeCore.roundRect(x - 16, 106, 32, 18, 4).fill(0x1b2330);
                officeCore.roundRect(x - 13, 109, 26, 12, 3).fill(0x5ca3e8);
            });
            [280, 400, 520, 640].map((x) => x + officeClusterOffsetX).forEach((x, i) => {
                officeCore.circle(x, 430, 20).fill(chairFill[i + 4]);
                officeCore.roundRect(x - 10, 440, 20, 16, 6).fill(chairBack[i + 4]);
                officeCore.roundRect(x - 19, 370, 38, 18, 4).fill(0x303741);
                officeCore.roundRect(x - 16, 370, 32, 18, 4).fill(0x1b2330);
                officeCore.roundRect(x - 13, 373, 26, 12, 3).fill(0x5ca3e8);
            });
            [230, 390].forEach((y, i) => {
                officeCore.circle(200 + officeClusterOffsetX, y - 60, 20).fill(chairFill[8 + i]);
                officeCore.roundRect(176 + officeClusterOffsetX, y - 68, 16, 20, 6).fill(chairBack[8 + i]);
                officeCore.roundRect(270 + officeClusterOffsetX, y - 79, 18, 38, 4).fill(0x303741);
                officeCore.roundRect(270 + officeClusterOffsetX, y - 76, 18, 32, 4).fill(0x1b2330);
                officeCore.roundRect(273 + officeClusterOffsetX, y - 73, 12, 26, 3).fill(0x5ca3e8);
            });
            [230, 390].forEach((y, i) => {
                officeCore.circle(700 + officeClusterOffsetX, y - 60, 20).fill(chairFill[10 + i]);
                officeCore.roundRect(708 + officeClusterOffsetX, y - 68, 16, 20, 6).fill(chairBack[10 + i]);
                officeCore.roundRect(612 + officeClusterOffsetX, y - 79, 18, 38, 4).fill(0x303741);
                officeCore.roundRect(612 + officeClusterOffsetX, y - 76, 18, 32, 4).fill(0x1b2330);
                officeCore.roundRect(615 + officeClusterOffsetX, y - 73, 12, 26, 3).fill(0x5ca3e8);
            });
            app.stage.addChild(officeCore);
            const quotePlaque = new Graphics();
            quotePlaque.roundRect(1164, 214, 260, 108, 18).fill({ color: 0xf8f3e7, alpha: 0.96 }).stroke({ color: 0xc6ab7e, width: 4, alpha: 0.9 });
            quotePlaque.roundRect(1180, 230, 228, 76, 14).fill({ color: 0xfffcf5, alpha: 0.92 }).stroke({ color: 0xd9ccb6, width: 2, alpha: 0.7 });
            quotePlaque.circle(1188, 268, 5).fill(0xd9b96a);
            quotePlaque.circle(1400, 268, 5).fill(0xd9b96a);
            app.stage.addChild(quotePlaque);
            const quoteText = new Text({ text: '"Ideas grow when shared."', style: new TextStyle({ fontFamily: 'Georgia', fontSize: 20, fontStyle: 'italic', fontWeight: '700', fill: '#5f5b63', align: 'center' }) });
            quoteText.anchor.set(0.5);
            quoteText.position.set(1294, 258);
            app.stage.addChild(quoteText);
            const quoteAuthor = new Text({ text: 'TEAM WALL', style: new TextStyle({ fontFamily: 'Verdana', fontSize: 11, fontWeight: '900', fill: '#907f68', letterSpacing: 1.6 }) });
            quoteAuthor.anchor.set(0.5);
            quoteAuthor.position.set(1294, 287);
            app.stage.addChild(quoteAuthor);

            const outdoorDeco = new Graphics();
            outdoorDeco.roundRect(184, 822, 126, 16, 4).fill(0x85bfd8);
            outdoorDeco.roundRect(874, 822, 126, 16, 4).fill(0x85bfd8);
            outdoorDeco.roundRect(8, 610, floorWidth, 200, 26).fill({ color: 0xecf5eb, alpha: 0.22 });
            outdoorDeco.roundRect(14, 618, floorWidth - 12, 184, 22).fill({ color: 0xf7fbf5, alpha: 0.18 });
            outdoorDeco.ellipse(244, 640, 88, 34).fill(0xd9efcf);
            outdoorDeco.ellipse(930, 760, 70, 30).fill(0xd4ecc8);
            outdoorDeco.ellipse(980, 610, 64, 24).fill(0xcbe7bf);
            outdoorDeco.ellipse(438, 752, 98, 34).fill({ color: 0xe3f1d8, alpha: 0.84 });
            outdoorDeco.ellipse(1406, 748, 104, 34).fill({ color: 0xe3f1d8, alpha: 0.8 });
            outdoorDeco.ellipse(1608, 652, 82, 28).fill({ color: 0xd7edcf, alpha: 0.76 });
            outdoorDeco.roundRect(754, 608, 152, 90, 18).fill(0xcab894);
            outdoorDeco.roundRect(770, 682, 120, 116, 20).fill(0xd4c3a0);
            outdoorDeco.roundRect(510, 694, 102, 26, 13).fill(0xe1d5bf).stroke({ color: 0xbeae91, width: 2, alpha: 0.52 });
            outdoorDeco.roundRect(640, 694, 108, 26, 13).fill(0xe1d5bf).stroke({ color: 0xbeae91, width: 2, alpha: 0.52 });
            outdoorDeco.roundRect(772, 694, 104, 26, 13).fill(0xe1d5bf).stroke({ color: 0xbeae91, width: 2, alpha: 0.52 });
            outdoorDeco.roundRect(902, 694, 108, 26, 13).fill(0xe1d5bf).stroke({ color: 0xbeae91, width: 2, alpha: 0.52 });
            outdoorDeco.roundRect(1032, 694, 102, 26, 13).fill(0xe1d5bf).stroke({ color: 0xbeae91, width: 2, alpha: 0.52 });
            outdoorDeco.roundRect(1302, 702, 128, 14, 7).fill({ color: 0x90b48b, alpha: 0.5 });
            outdoorDeco.roundRect(1296, 696, 14, 28, 7).fill({ color: 0x90b48b, alpha: 0.5 });
            outdoorDeco.roundRect(1422, 696, 14, 28, 7).fill({ color: 0x90b48b, alpha: 0.5 });
            const breakAreaWipX = WORLD_WIDTH - 352;
            outdoorDeco.roundRect(breakAreaWipX, 636, 344, 166, 24).fill({ color: 0xf7fbf4, alpha: 0.3 }).stroke({ color: 0xc2d7ba, width: 3, alpha: 0.38 });
            outdoorDeco.roundRect(breakAreaWipX + 28, 664, 290, 92, 18).fill({ color: 0xebdfba, alpha: 0.72 }).stroke({ color: 0xc2ac73, width: 3, alpha: 0.7 });
            outdoorDeco.roundRect(breakAreaWipX + 42, 678, 262, 16, 8).fill({ color: 0xf2c95b, alpha: 0.96 });
            outdoorDeco.roundRect(breakAreaWipX + 52, 708, 100, 10, 5).fill({ color: 0xffffff, alpha: 0.58 });
            outdoorDeco.roundRect(breakAreaWipX + 52, 726, 136, 10, 5).fill({ color: 0xffffff, alpha: 0.48 });
            outdoorDeco.roundRect(breakAreaWipX + 10, 770, 324, 16, 8).fill({ color: 0x3f4744, alpha: 0.95 });
            outdoorDeco.roundRect(breakAreaWipX + 8, 768, 78, 20, 10).fill({ color: 0xf2c95b, alpha: 0.98 });
            outdoorDeco.roundRect(breakAreaWipX + 132, 768, 78, 20, 10).fill({ color: 0xf2c95b, alpha: 0.98 });
            outdoorDeco.roundRect(breakAreaWipX + 256, 768, 78, 20, 10).fill({ color: 0xf2c95b, alpha: 0.98 });
            outdoorDeco.roundRect(breakAreaWipX + 38, 710, 44, 44, 10).fill({ color: 0xd3b285, alpha: 0.95 }).stroke({ color: 0xaa8257, width: 2.5, alpha: 0.8 });
            outdoorDeco.roundRect(breakAreaWipX + 96, 710, 58, 44, 10).fill({ color: 0xe0c599, alpha: 0.95 }).stroke({ color: 0xb58d5e, width: 2.5, alpha: 0.82 });
            outdoorDeco.roundRect(breakAreaWipX + 240, 706, 60, 54, 12).fill({ color: 0xbc7d5b, alpha: 0.92 }).stroke({ color: 0x8c5539, width: 2.5, alpha: 0.84 });
            outdoorDeco.circle(breakAreaWipX + 270, 728, 14).fill(0x8fc17a);
            outdoorDeco.circle(breakAreaWipX + 286, 728, 14).fill(0x74a860);
            outdoorDeco.circle(breakAreaWipX + 278, 712, 12).fill(0x5e8f4a);
            app.stage.addChild(outdoorDeco);

            const rulesBoard = new Graphics();
            rulesBoard.roundRect(42, 628, 284, 154, 20).fill({ color: 0xf7f1e4, alpha: 0.97 }).stroke({ color: 0xb89664, width: 4, alpha: 0.92 });
            rulesBoard.roundRect(56, 646, 256, 120, 16).fill({ color: 0xfffcf6, alpha: 0.95 }).stroke({ color: 0xd8ccba, width: 2, alpha: 0.72 });
            rulesBoard.roundRect(68, 658, 120, 16, 8).fill({ color: 0x7fb1c6, alpha: 0.92 });
            rulesBoard.circle(292, 642, 10).fill(0x78ab72);
            rulesBoard.circle(304, 642, 10).fill(0x5f8f5c);
            app.stage.addChild(rulesBoard);
            const rulesBoardTitle = new Text({ text: 'HOW TO USE LETSLOL', style: new TextStyle({ fontFamily: 'Verdana', fontSize: 16, fontWeight: '900', fill: '#5a6d7c', letterSpacing: 1.2 }) });
            rulesBoardTitle.anchor.set(0.5);
            rulesBoardTitle.position.set(184, 682);
            app.stage.addChild(rulesBoardTitle);
            const rulesBoardText = new Text({ text: 'Move close to people to join calls\nStay in Quiet Zone to pause audio\nUse mic and screen-share buttons above\nOpen settings to change name and devices', style: new TextStyle({ fontFamily: 'Verdana', fontSize: 11, fontWeight: '700', fill: '#6a6258', lineHeight: 17, align: 'center' }) });
            rulesBoardText.anchor.set(0.5);
            rulesBoardText.position.set(184, 724);
            app.stage.addChild(rulesBoardText);

            const vibeWarning = new Graphics();
            vibeWarning.roundRect(360, 648, 188, 86, 18).fill({ color: 0x4f4032, alpha: 0.94 }).stroke({ color: 0xe9c15b, width: 4, alpha: 0.95 });
            vibeWarning.roundRect(378, 664, 38, 38, 10).fill({ color: 0xe9c15b, alpha: 0.98 });
            app.stage.addChild(vibeWarning);
            const vibeWarningIcon = new Text({ text: '!', style: new TextStyle({ fontFamily: 'Verdana', fontSize: 26, fontWeight: '900', fill: '#5a452b' }) });
            vibeWarningIcon.anchor.set(0.5);
            vibeWarningIcon.position.set(397, 683);
            app.stage.addChild(vibeWarningIcon);
            const vibeWarningLabel = new Text({ text: 'WARNING', style: new TextStyle({ fontFamily: 'Verdana', fontSize: 12, fontWeight: '900', fill: '#f6d98f', letterSpacing: 1.4 }) });
            vibeWarningLabel.anchor.set(0, 0.5);
            vibeWarningLabel.position.set(430, 670);
            app.stage.addChild(vibeWarningLabel);
            const vibeWarningText = new Text({ text: 'This app was\nvibe coded', style: new TextStyle({ fontFamily: 'Verdana', fontSize: 14, fontWeight: '800', fill: '#fff6df', lineHeight: 16 }) });
            vibeWarningText.anchor.set(0, 0.5);
            vibeWarningText.position.set(430, 694);
            app.stage.addChild(vibeWarningText);

            const quietZone = new Graphics();
            quietZone.roundRect(BREAK_QUIET_ZONE_RECT.x, BREAK_QUIET_ZONE_RECT.y, BREAK_QUIET_ZONE_RECT.width, BREAK_QUIET_ZONE_RECT.height, 22).fill({ color: 0xa76872, alpha: 0.16 }).stroke({ color: 0xd89fa7, width: 3, alpha: 0.68 });
            quietZone.roundRect(BREAK_QUIET_ZONE_RECT.x + 14, BREAK_QUIET_ZONE_RECT.y + 14, BREAK_QUIET_ZONE_RECT.width - 28, BREAK_QUIET_ZONE_RECT.height - 28, 16).fill({ color: 0xe8c9ce, alpha: 0.22 }).stroke({ color: 0xffeef0, width: 1.5, alpha: 0.22 });
            app.stage.addChild(quietZone);
            const quietZoneLabel = new Text({ text: 'QUIET ZONE', style: new TextStyle({ fontFamily: 'Verdana', fontSize: 26, fontWeight: '900', fill: '#fff2f3', letterSpacing: 2 }) });
            quietZoneLabel.anchor.set(0.5);
            quietZoneLabel.position.set(BREAK_QUIET_ZONE_RECT.x + (BREAK_QUIET_ZONE_RECT.width * 0.5), BREAK_QUIET_ZONE_RECT.y + 42);
            app.stage.addChild(quietZoneLabel);
            const quietZoneHint = new Text({ text: 'No proximity calls here', style: new TextStyle({ fontFamily: 'Verdana', fontSize: 14, fontWeight: '700', fill: '#fff2f3', letterSpacing: 0.8 }) });
            quietZoneHint.anchor.set(0.5);
            quietZoneHint.position.set(BREAK_QUIET_ZONE_RECT.x + (BREAK_QUIET_ZONE_RECT.width * 0.5), BREAK_QUIET_ZONE_RECT.y + 76);
            app.stage.addChild(quietZoneHint);

            const breakChair = new Graphics();
            breakChair.roundRect(584, 700, 92, 34, 14).fill(0xd2a451);
            breakChair.roundRect(594, 680, 72, 24, 12).fill(0xb9812f);
            breakChair.roundRect(598, 706, 26, 16, 8).fill(0xe3c27f);
            breakChair.roundRect(636, 706, 26, 16, 8).fill(0xe3c27f);
            breakChair.roundRect(596, 732, 8, 24, 4).fill(0x7a5030);
            breakChair.roundRect(656, 732, 8, 24, 4).fill(0x7a5030);
            app.stage.addChild(breakChair);
            const courtyardPlanters = new Graphics();
            ([[1188, 642], [1246, 652], [1512, 620], [1584, 618]] as [number, number][]).forEach(([px, py], index) => {
                const leaf = index % 2 === 0 ? 0x66995e : 0x78ab72;
                const leafDark = index % 2 === 0 ? 0x426f3e : 0x517f4a;
                courtyardPlanters.roundRect(px, py + 18, 34, 22, 7).fill(0x8b5d39);
                courtyardPlanters.circle(px + 9, py + 8, 13).fill(leaf);
                courtyardPlanters.circle(px + 24, py + 7, 12).fill(leafDark);
                courtyardPlanters.circle(px + 18, py - 2, 12).fill(leaf);
            });
            app.stage.addChild(courtyardPlanters);
            const bigTree = new Graphics();
            bigTree.roundRect(1002, 640, 48, 150, 16).fill(0x7a5030);
            bigTree.roundRect(1018, 620, 16, 28, 8).fill(0x6d4728);
            bigTree.circle(1026, 600, 82).fill(0x3f9247);
            bigTree.circle(972, 620, 56).fill(0x4eaa56);
            bigTree.circle(1084, 620, 54).fill(0x4ca754);
            bigTree.circle(1024, 548, 52).fill(0x5cbf64);
            bigTree.circle(996, 560, 34).fill(0x2f7d3a);
            bigTree.circle(1062, 564, 32).fill(0x2f7d3a);
            app.stage.addChild(bigTree);
            const breakAreaLabel = new Text({ text: 'BREAK AREA', style: new TextStyle({ fontFamily: 'Verdana', fontSize: 42, fontWeight: '900', fill: '#6f8852', stroke: { color: '#eff6df', width: 5 }, letterSpacing: 3 }) });
            breakAreaLabel.anchor.set(0.5);
            breakAreaLabel.position.set(600, 775);
            breakAreaLabel.alpha = 0.9;
            app.stage.addChild(breakAreaLabel);
            const breakAreaWipLabel = new Text({ text: 'WORK IN PROGRESS', style: new TextStyle({ fontFamily: 'Verdana', fontSize: 21, fontWeight: '900', fill: '#64503b', letterSpacing: 2 }) });
            breakAreaWipLabel.anchor.set(1, 0.5);
            breakAreaWipLabel.position.set(WORLD_WIDTH - 34, 686);
            breakAreaWipLabel.alpha = 0.95;
            app.stage.addChild(breakAreaWipLabel);
            const breakAreaWipHint = new Text({ text: 'Patio expansion coming soon', style: new TextStyle({ fontFamily: 'Verdana', fontSize: 12, fontWeight: '700', fill: '#6d7f61', letterSpacing: 1 }) });
            breakAreaWipHint.anchor.set(1, 0.5);
            breakAreaWipHint.position.set(WORLD_WIDTH - 34, 714);
            breakAreaWipHint.alpha = 0.96;
            app.stage.addChild(breakAreaWipHint);

            app.canvas.style.width = '100%';
            app.canvas.style.height = '100%';
            app.canvas.style.display = 'block';
            pixiContainerRef.current?.appendChild(app.canvas);
            flushPendingAvatars();

            app.ticker.add(() => {
                const dtSeconds = app.ticker.deltaMS / 1000;
                const smoothingAlpha = 1 - Math.exp(-REMOTE_SMOOTHING_SPEED * dtSeconds);
                const localId = connectionIdRef.current;

                for (const [playerId, avatar] of avatarsRef.current) {
                    if (localId && playerId === localId) {
                        continue;
                    }

                    const dx = avatar.target.x - avatar.body.x;
                    const dy = avatar.target.y - avatar.body.y;
                    if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) {
                        avatar.body.position.set(avatar.target.x, avatar.target.y);
                    } else {
                        avatar.body.position.set(avatar.body.x + (dx * smoothingAlpha), avatar.body.y + (dy * smoothingAlpha));
                    }

                    avatar.ring.position.set(avatar.body.x, avatar.body.y);
                    avatar.label.position.set(avatar.body.x, avatar.body.y - 26);
                    avatar.speakingBadge.position.set(avatar.body.x, avatar.body.y - 38);
                }

                updateProximityIndicators();

                const nowForVoice = performance.now();
                if (nowForVoice - lastVoiceSyncAtRef.current >= VOICE_SYNC_INTERVAL_MS) {
                    lastVoiceSyncAtRef.current = nowForVoice;
                    syncQuietZoneIndicator();
                    syncProximityVoiceConnections();
                    syncTalkableUsersIndicator();
                    syncLoadingUsersIndicator();
                    syncLeavingUsersIndicator();
                    syncRemoteSpeechIndicators();
                }

                if (localId) {
                    const localAvatarForCamera = avatarsRef.current.get(localId);
                    if (localAvatarForCamera) {
                        const shouldHardCenter = !hasCameraCenteredRef.current;
                        updateCameraForLocalAvatar(localAvatarForCamera, shouldHardCenter);
                        if (shouldHardCenter) {
                            hasCameraCenteredRef.current = true;
                        }
                    }
                }

                if (!localId || signalrStatusRef.current !== 'connected') {
                    return;
                }

                const avatarVisual = avatarsRef.current.get(localId);
                if (!avatarVisual) {
                    return;
                }

                localPositionRef.current ??= { x: avatarVisual.body.x, y: avatarVisual.body.y };

                const input = movementInputRef.current;
                let dirX = 0;
                let dirY = 0;
                if (input.left) dirX -= 1;
                if (input.right) dirX += 1;
                if (input.up) dirY -= 1;
                if (input.down) dirY += 1;
                if (dirX === 0 && dirY === 0) {
                    return;
                }

                const magnitude = Math.hypot(dirX, dirY);
                const normalizedX = dirX / magnitude;
                const normalizedY = dirY / magnitude;
                const deltaSeconds = app.ticker.deltaMS / 1000;
                const speedMultiplier = input.sprint ? PLAYER_SPRINT_MULTIPLIER : 1;
                const distance = PLAYER_SPEED_PX_PER_SEC * speedMultiplier * deltaSeconds;
                const current = localPositionRef.current;
                const tryX = current.x + normalizedX * distance;
                const tryY = current.y + normalizedY * distance;
                let nextX = current.x;
                let nextY = current.y;

                if (isWalkablePosition(tryX, current.y)) {
                    nextX = tryX;
                }
                if (isWalkablePosition(nextX, tryY)) {
                    nextY = tryY;
                }
                if (nextX === current.x && nextY === current.y) {
                    return;
                }

                localPositionRef.current = { x: nextX, y: nextY };
                avatarVisual.target = { x: nextX, y: nextY };
                avatarVisual.ring.position.set(nextX, nextY);
                avatarVisual.body.position.set(nextX, nextY);
                avatarVisual.label.position.set(nextX, nextY - 26);
                avatarVisual.speakingBadge.position.set(nextX, nextY - 38);

                const now = performance.now();
                if (now - lastBroadcastAtRef.current >= POSITION_BROADCAST_INTERVAL_MS) {
                    lastBroadcastAtRef.current = now;
                    broadcastPosition(nextX, nextY);
                }
            });
        });

        return () => {
            cancelled = true;
            appRef.current = null;
            localPositionRef.current = null;
            movementInputRef.current = { up: false, down: false, left: false, right: false, sprint: false };
            avatarsRef.current.clear();
            pendingAvatarsRef.current.clear();
            pendingDisplayNamesRef.current.clear();
            pendingAvatarAppearancesRef.current.clear();
            for (const peerId of Array.from(remoteSpeechMetersRef.current.keys())) {
                detachRemoteSpeechMeter(peerId);
            }
            localScreenShareSessionIdsRef.current.clear();
            announcedRemoteScreenSharersRef.current.clear();
            remoteScreenShareSessionIdsRef.current.clear();
            remoteScreenStreamsRef.current.clear();
            setRemoteScreenShares([]);
            setRemoteScreenShareStatuses({});
            setIsInQuietZone(false);
            closeAllPeerConnections();
            nearbySinceRef.current.clear();
            nearbyIndicatorSinceRef.current.clear();
            if (resizeHandler) {
                window.removeEventListener('resize', resizeHandler);
            }
            if (initialized) {
                initialized.destroy(true);
                initialized = null;
            }
        };
    }, [
        announcedRemoteScreenSharersRef,
        appRef,
        avatarsRef,
        broadcastPosition,
        closeAllPeerConnections,
        connectionIdRef,
        detachRemoteSpeechMeter,
        flushPendingAvatars,
        hasCameraCenteredRef,
        isWalkablePosition,
        lastBroadcastAtRef,
        lastVoiceSyncAtRef,
        localPositionRef,
        localScreenShareSessionIdsRef,
        movementInputRef,
        nearbyIndicatorSinceRef,
        nearbySinceRef,
        pendingAvatarAppearancesRef,
        pendingAvatarsRef,
        pendingDisplayNamesRef,
        pixiContainerRef,
        remoteScreenShareSessionIdsRef,
        remoteScreenStreamsRef,
        remoteSpeechMetersRef,
        setIsInQuietZone,
        setRemoteScreenShareStatuses,
        setRemoteScreenShares,
        signalrStatusRef,
        syncLeavingUsersIndicator,
        syncLoadingUsersIndicator,
        syncProximityVoiceConnections,
        syncQuietZoneIndicator,
        syncRemoteSpeechIndicators,
        syncTalkableUsersIndicator,
        updateProximityIndicators,
    ]);
}
