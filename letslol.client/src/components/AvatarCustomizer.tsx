import { Box, Button, Stack, Typography } from '@mui/material';
import type { Dispatch, SetStateAction } from 'react';
import {
    AVATAR_ACCENT_COLORS,
    AVATAR_ACCESSORY_OPTIONS,
    AVATAR_CLOTHING_COLORS,
    AVATAR_SKIN_TONES,
    AVATAR_STYLE_OPTIONS,
    type AvatarAppearance,
} from '../avatar/model';

type AvatarCustomizerProps = {
    avatarAppearance: AvatarAppearance;
    setAvatarAppearance: Dispatch<SetStateAction<AvatarAppearance>>;
    onRandomize?: () => void;
    showRandomize?: boolean;
};

export function AvatarCustomizer({
    avatarAppearance,
    setAvatarAppearance,
    onRandomize,
    showRandomize = false,
}: AvatarCustomizerProps) {
    return (
        <Stack spacing={1.5}>
            <Box
                sx={{
                    p: 1.5,
                    borderRadius: 3,
                    border: '1px solid rgba(24, 36, 52, 0.1)',
                    background: 'linear-gradient(180deg, rgba(247, 249, 252, 0.96) 0%, rgba(241, 244, 248, 0.96) 100%)',
                }}
            >
                <Stack direction="row" spacing={1.4} alignItems="center">
                    <Box
                        sx={{
                            width: 68,
                            height: 82,
                            borderRadius: 3,
                            background: `linear-gradient(180deg, ${avatarAppearance.skinTone} 0 34%, ${avatarAppearance.topColor} 34% 75%, ${avatarAppearance.bottomColor} 75% 100%)`,
                            border: '2px solid rgba(28, 38, 54, 0.14)',
                            boxShadow: 'inset 0 -14px 0 rgba(0, 0, 0, 0.08)',
                            flexShrink: 0,
                        }}
                    />
                    <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 900, color: '#213043' }}>
                            Avatar preview
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                            Style: {AVATAR_STYLE_OPTIONS.find((option) => option.value === avatarAppearance.bodyStyle)?.label}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                            Accessory: {AVATAR_ACCESSORY_OPTIONS.find((option) => option.value === avatarAppearance.accessory)?.label}
                        </Typography>
                    </Box>
                </Stack>
            </Box>

            {showRandomize && onRandomize && (
                <Button type="button" variant="outlined" onClick={onRandomize}>
                    Randomize Avatar
                </Button>
            )}

            <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800, display: 'block', mb: 0.7 }}>
                    Outfit
                </Typography>
                <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap>
                    {AVATAR_STYLE_OPTIONS.map((option) => (
                        <Button
                            key={option.value}
                            type="button"
                            variant={avatarAppearance.bodyStyle === option.value ? 'contained' : 'outlined'}
                            size="small"
                            onClick={() => setAvatarAppearance((current) => ({ ...current, bodyStyle: option.value }))}
                        >
                            {option.label}
                        </Button>
                    ))}
                </Stack>
            </Box>

            <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800, display: 'block', mb: 0.7 }}>
                    Accessory
                </Typography>
                <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap>
                    {AVATAR_ACCESSORY_OPTIONS.map((option) => (
                        <Button
                            key={option.value}
                            type="button"
                            variant={avatarAppearance.accessory === option.value ? 'contained' : 'outlined'}
                            size="small"
                            onClick={() => setAvatarAppearance((current) => ({ ...current, accessory: option.value }))}
                        >
                            {option.label}
                        </Button>
                    ))}
                </Stack>
            </Box>

            {([
                { label: 'Skin tone', values: AVATAR_SKIN_TONES, selected: avatarAppearance.skinTone, shape: 'circle' },
                { label: 'Top color', values: AVATAR_CLOTHING_COLORS, selected: avatarAppearance.topColor, shape: 'rounded' },
                { label: 'Bottom color', values: AVATAR_CLOTHING_COLORS, selected: avatarAppearance.bottomColor, shape: 'rounded' },
                { label: 'Accent color', values: AVATAR_ACCENT_COLORS, selected: avatarAppearance.accentColor, shape: 'circle' },
            ] as const).map((group) => (
                <Box key={group.label}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800, display: 'block', mb: 0.7 }}>
                        {group.label}
                    </Typography>
                    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                        {group.values.map((tone) => (
                            <Box
                                key={`${group.label}-${tone}`}
                                component="button"
                                type="button"
                                onClick={() => {
                                    setAvatarAppearance((current) => ({
                                        ...current,
                                        skinTone: group.label === 'Skin tone' ? tone : current.skinTone,
                                        topColor: group.label === 'Top color' ? tone : current.topColor,
                                        bottomColor: group.label === 'Bottom color' ? tone : current.bottomColor,
                                        accentColor: group.label === 'Accent color' ? tone : current.accentColor,
                                    }));
                                }}
                                sx={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: group.shape === 'circle' ? '50%' : 1.2,
                                    border: group.selected === tone ? '3px solid #223246' : '1px solid rgba(34, 50, 70, 0.18)',
                                    backgroundColor: tone,
                                    cursor: 'pointer',
                                }}
                            />
                        ))}
                    </Stack>
                </Box>
            ))}
        </Stack>
    );
}
