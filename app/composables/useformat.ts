export const getAvatarPlaceholder = (name: string) => {
    const cleaned = (name || '')
        .toUpperCase()
        .replace(/[^\p{L}\p{N}\s]/gu, '')
        .trim();

    if (!cleaned) return '';

    const parts = cleaned.split(/\s+/).filter(Boolean);

    if (parts.length === 1) {
        return [...parts[0]].slice(0, 3).join('');
    }

    return parts.map(w => [...w][0]).slice(0, 3).join('');
};
