import { Box, Stack, Typography } from '@mui/material';
import type { VoiceOverlayChip } from '../voice/useVoiceOverlay';

type VoiceOverlayProps = {
    chips: VoiceOverlayChip[];
    isMobile: boolean;
};

export function VoiceOverlay({ chips, isMobile }: VoiceOverlayProps) {
    if (chips.length === 0) {
        return null;
    }

    return (
        <Stack
            spacing={0.75}
            sx={{
                position: 'absolute',
                left: '50%',
                bottom: isMobile ? 68 : 16,
                transform: 'translateX(-50%)',
                zIndex: 6,
                width: isMobile ? 'calc(100vw - 20px)' : 'min(460px, calc(100vw - 32px))',
                alignItems: 'center',
            }}
        >
            {chips.map((chip) => {
                const chipStyles = chip.tone === 'quiet'
                    ? { backgroundColor: 'rgba(78, 12, 25, 0.88)', border: '1px solid rgba(255, 160, 176, 0.24)', color: '#ffe3e8' }
                    : chip.tone === 'loading'
                        ? { backgroundColor: 'rgba(20, 26, 32, 0.82)', border: '1px solid rgba(194, 212, 234, 0.16)', color: '#d9e6f5' }
                        : chip.tone === 'holding'
                            ? { backgroundColor: 'rgba(74, 54, 16, 0.84)', border: '1px solid rgba(244, 211, 132, 0.18)', color: '#fde8b4' }
                            : chip.tone === 'connected'
                                ? { backgroundColor: 'rgba(18, 34, 24, 0.86)', border: '1px solid rgba(144, 230, 178, 0.18)', color: '#e4f8ea' }
                                : { backgroundColor: 'rgba(18, 20, 26, 0.84)', border: '1px solid rgba(194, 212, 234, 0.18)', color: '#dfe8f3' };

                return (
                    <Box
                        key={chip.key}
                        sx={{
                            px: 1.2,
                            py: chip.progress === undefined ? 0.6 : 0.7,
                            borderRadius: chip.progress === undefined ? 999 : 1.6,
                            backdropFilter: 'blur(8px)',
                            ...chipStyles,
                        }}
                    >
                        <Typography variant="caption" sx={{ color: chipStyles.color, fontWeight: 800, display: 'block' }}>
                            {chip.label}
                        </Typography>
                        {chip.progress !== undefined && (
                            <Box
                                sx={{
                                    mt: 0.5,
                                    width: 136,
                                    maxWidth: '100%',
                                    height: 4,
                                    borderRadius: 999,
                                    backgroundColor: 'rgba(255, 255, 255, 0.14)',
                                    overflow: 'hidden',
                                }}
                            >
                                <Box
                                    sx={{
                                        width: `${Math.max(0, Math.min(100, chip.progress * 100))}%`,
                                        height: '100%',
                                        borderRadius: 999,
                                        backgroundColor: chipStyles.color,
                                        transition: 'width 120ms linear',
                                    }}
                                />
                            </Box>
                        )}
                    </Box>
                );
            })}
        </Stack>
    );
}
