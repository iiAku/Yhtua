export const clearOwnedClipboard = async (
  ownedValue: string,
  read: () => Promise<string>,
  write: (value: string) => Promise<void>,
): Promise<boolean> => {
  const currentValue = await read()
  if (currentValue !== ownedValue) return false
  await write('')
  return true
}
