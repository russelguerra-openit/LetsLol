export type AvatarBodyStyle = 'relaxed' | 'blazer' | 'hoodie';
export type AvatarAccessory = 'none' | 'glasses' | 'headset';
export type AvatarAppearance = {
    skinTone: string;
    bodyStyle: AvatarBodyStyle;
    topColor: string;
    bottomColor: string;
    accessory: AvatarAccessory;
    accentColor: string;
};

export const PLAYER_APPEARANCE_STORAGE_KEY = 'letslol.avatarAppearance';

export const DEFAULT_AVATAR_APPEARANCE: AvatarAppearance = {
    skinTone: '#f0c8a0',
    bodyStyle: 'relaxed',
    topColor: '#e4572e',
    bottomColor: '#2f3b52',
    accessory: 'none',
    accentColor: '#66b0ff',
};

export const AVATAR_SKIN_TONES = ['#f6d8bf', '#e8bc96', '#d39c72', '#b9734e', '#8a5638'];
export const AVATAR_CLOTHING_COLORS = ['#e4572e', '#17bebb', '#ff9f1c', '#5f0f40', '#3a86ff', '#2a9d8f', '#6f8f42', '#a44a3f'];
export const AVATAR_ACCENT_COLORS = ['#66b0ff', '#8fe388', '#f2be66', '#d59cff', '#ff8b94'];
export const AVATAR_STYLE_OPTIONS: Array<{ value: AvatarBodyStyle; label: string }> = [
    { value: 'relaxed', label: 'Relaxed' },
    { value: 'blazer', label: 'Blazer' },
    { value: 'hoodie', label: 'Hoodie' },
];
export const AVATAR_ACCESSORY_OPTIONS: Array<{ value: AvatarAccessory; label: string }> = [
    { value: 'none', label: 'None' },
    { value: 'glasses', label: 'Glasses' },
    { value: 'headset', label: 'Headset' },
];

export const normalizeAvatarAppearance = (value: unknown): AvatarAppearance => {
    if (!value || typeof value !== 'object') {
        return DEFAULT_AVATAR_APPEARANCE;
    }

    const candidate = value as Partial<AvatarAppearance>;
    return {
        skinTone: typeof candidate.skinTone === 'string' ? candidate.skinTone : DEFAULT_AVATAR_APPEARANCE.skinTone,
        bodyStyle: candidate.bodyStyle === 'blazer' || candidate.bodyStyle === 'hoodie' ? candidate.bodyStyle : DEFAULT_AVATAR_APPEARANCE.bodyStyle,
        topColor: typeof candidate.topColor === 'string' ? candidate.topColor : DEFAULT_AVATAR_APPEARANCE.topColor,
        bottomColor: typeof candidate.bottomColor === 'string' ? candidate.bottomColor : DEFAULT_AVATAR_APPEARANCE.bottomColor,
        accessory: candidate.accessory === 'glasses' || candidate.accessory === 'headset'
            ? candidate.accessory
            : DEFAULT_AVATAR_APPEARANCE.accessory,
        accentColor: typeof candidate.accentColor === 'string' ? candidate.accentColor : DEFAULT_AVATAR_APPEARANCE.accentColor,
    };
};

export const loadStoredAvatarAppearance = (): AvatarAppearance => {
    try {
        const raw = localStorage.getItem(PLAYER_APPEARANCE_STORAGE_KEY);
        if (!raw) {
            return DEFAULT_AVATAR_APPEARANCE;
        }

        return normalizeAvatarAppearance(JSON.parse(raw));
    } catch {
        return DEFAULT_AVATAR_APPEARANCE;
    }
};

const pickRandom = <T,>(values: T[]): T => values[Math.floor(Math.random() * values.length)] ?? values[0];

export const createRandomAvatarAppearance = (): AvatarAppearance => {
    const topColor = pickRandom(AVATAR_CLOTHING_COLORS);
    const initialBottomColor = pickRandom(AVATAR_CLOTHING_COLORS);
    const bottomColor = topColor === initialBottomColor
        ? (AVATAR_CLOTHING_COLORS[(AVATAR_CLOTHING_COLORS.indexOf(topColor) + 3) % AVATAR_CLOTHING_COLORS.length] ?? initialBottomColor)
        : initialBottomColor;

    return {
        skinTone: pickRandom(AVATAR_SKIN_TONES),
        bodyStyle: pickRandom(AVATAR_STYLE_OPTIONS.map((option) => option.value)),
        topColor,
        bottomColor,
        accessory: pickRandom(AVATAR_ACCESSORY_OPTIONS.map((option) => option.value)),
        accentColor: pickRandom(AVATAR_ACCENT_COLORS),
    };
};

export const hashConnectionId = (id: string): number => {
    let hash = 0;
    for (const character of id) {
        const codePoint = character.codePointAt(0) ?? 0;
        hash = Math.trunc((hash * 31) + codePoint);
    }
    return Math.abs(hash);
};

export const getFallbackAvatarAppearance = (playerId: string): AvatarAppearance => {
    const hash = hashConnectionId(playerId);
    return {
        skinTone: AVATAR_SKIN_TONES[hash % AVATAR_SKIN_TONES.length],
        bodyStyle: (['relaxed', 'blazer', 'hoodie'] as AvatarBodyStyle[])[hash % 3],
        topColor: AVATAR_CLOTHING_COLORS[(hash >> 5) % AVATAR_CLOTHING_COLORS.length],
        bottomColor: AVATAR_CLOTHING_COLORS[(hash >> 7) % AVATAR_CLOTHING_COLORS.length],
        accessory: (['none', 'glasses', 'headset'] as AvatarAccessory[])[hash % 3],
        accentColor: AVATAR_ACCENT_COLORS[(hash >> 9) % AVATAR_ACCENT_COLORS.length],
    };
};
