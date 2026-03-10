import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react';

type UseAudioDevicesParams = {
    isMutedRef: RefObject<boolean>;
    localMicStreamRef: RefObject<MediaStream | null>;
    peerConnectionsRef: RefObject<Map<string, RTCPeerConnection>>;
    remoteAudioElementsRef: RefObject<Map<string, HTMLAudioElement>>;
    selectedMicDeviceIdRef: RefObject<string>;
    selectedOutputDeviceIdRef: RefObject<string>;
    setMicDevices: (devices: MediaDeviceInfo[]) => void;
    setOutputDevices: (devices: MediaDeviceInfo[]) => void;
    setSelectedMicDeviceId: (value: string) => void;
    setSelectedOutputDeviceId: (value: string) => void;
    setSettingsError: (value: string | null) => void;
    setIsMuted: Dispatch<SetStateAction<boolean>>;
};

type AudioElementWithSinkId = HTMLAudioElement & {
    setSinkId?: (sinkId: string) => Promise<void>;
};

export function useAudioDevices({
    isMutedRef,
    localMicStreamRef,
    peerConnectionsRef,
    remoteAudioElementsRef,
    selectedMicDeviceIdRef,
    selectedOutputDeviceIdRef,
    setMicDevices,
    setOutputDevices,
    setSelectedMicDeviceId,
    setSelectedOutputDeviceId,
    setSettingsError,
    setIsMuted,
}: UseAudioDevicesParams) {
    const setAudioElementSinkId = useCallback(async (audioElement: HTMLAudioElement, outputDeviceId: string) => {
        if (outputDeviceId === 'default') {
            return;
        }

        const audioElementWithSinkId = audioElement as AudioElementWithSinkId;
        if (typeof audioElementWithSinkId.setSinkId !== 'function') {
            return;
        }

        try {
            await audioElementWithSinkId.setSinkId(outputDeviceId);
        } catch {
            // Ignore browsers that reject unsupported device routing.
        }
    }, []);

    const applyOutputDeviceToAllRemoteAudio = useCallback(async (outputDeviceId: string) => {
        for (const audioElement of remoteAudioElementsRef.current.values()) {
            await setAudioElementSinkId(audioElement, outputDeviceId);
        }
    }, [remoteAudioElementsRef, setAudioElementSinkId]);

    const loadAudioDevices = useCallback(async () => {
        setSettingsError(null);

        let permissionProbeStream: MediaStream | null = null;
        try {
            let devices = await navigator.mediaDevices.enumerateDevices();
            let microphones = devices.filter((device) => device.kind === 'audioinput');
            let speakers = devices.filter((device) => device.kind === 'audiooutput');

            const hasLabels = microphones.some((device) => device.label.trim().length > 0);
            if (!hasLabels && !localMicStreamRef.current) {
                try {
                    permissionProbeStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                } catch {
                    // Ignore permission probe failures; we'll still show device IDs.
                }

                devices = await navigator.mediaDevices.enumerateDevices();
                microphones = devices.filter((device) => device.kind === 'audioinput');
                speakers = devices.filter((device) => device.kind === 'audiooutput');
            }

            setMicDevices(microphones);
            setOutputDevices(speakers);

            if (microphones.length === 0) {
                setSettingsError('No microphone devices found. Please connect a microphone and try again.');
            }

            const preferredId = selectedMicDeviceIdRef.current;
            const hasPreferred = preferredId === 'default' || microphones.some((device) => device.deviceId === preferredId);
            if (!hasPreferred && microphones.length > 0) {
                setSelectedMicDeviceId(microphones[0].deviceId);
            }

            const preferredOutputId = selectedOutputDeviceIdRef.current;
            const hasPreferredOutput = preferredOutputId === 'default' || speakers.some((device) => device.deviceId === preferredOutputId);
            if (!hasPreferredOutput && speakers.length > 0) {
                setSelectedOutputDeviceId(speakers[0].deviceId);
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unable to enumerate microphone devices.';
            setSettingsError(message);
        } finally {
            if (permissionProbeStream) {
                for (const track of permissionProbeStream.getTracks()) {
                    track.stop();
                }
            }
        }
    }, [
        localMicStreamRef,
        selectedMicDeviceIdRef,
        selectedOutputDeviceIdRef,
        setMicDevices,
        setOutputDevices,
        setSelectedMicDeviceId,
        setSelectedOutputDeviceId,
        setSettingsError,
    ]);

    const applyPreferredMicDevice = useCallback(async (deviceId: string) => {
        const audioConstraint: MediaTrackConstraints | boolean = deviceId === 'default'
            ? true
            : { deviceId: { exact: deviceId } };

        const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint, video: false });
        const previousStream = localMicStreamRef.current;
        localMicStreamRef.current = stream;

        const [newAudioTrack] = stream.getAudioTracks();
        if (newAudioTrack) {
            newAudioTrack.enabled = !isMutedRef.current;
            for (const peerConnection of peerConnectionsRef.current.values()) {
                const audioSender = peerConnection.getSenders().find((sender) => sender.track?.kind === 'audio');
                if (audioSender) {
                    await audioSender.replaceTrack(newAudioTrack);
                } else {
                    peerConnection.addTrack(newAudioTrack, stream);
                }
            }
        }

        if (previousStream) {
            for (const track of previousStream.getTracks()) {
                track.stop();
            }
        }
    }, [isMutedRef, localMicStreamRef, peerConnectionsRef]);

    const toggleMute = useCallback(() => {
        setIsMuted((previous) => !previous);
    }, [setIsMuted]);

    return {
        applyOutputDeviceToAllRemoteAudio,
        applyPreferredMicDevice,
        loadAudioDevices,
        setAudioElementSinkId,
        toggleMute,
    };
}
