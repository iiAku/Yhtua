export const getAvatarPlaceholder = (name: string) =>
    name
        .split(" ")
        .map((word) => word[0])
        .slice(0, 3)
        .join("")