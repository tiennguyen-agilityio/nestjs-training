export const generateOrderNumber = (): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random()
    .toString(36)
    .substring(2, 6)
    .padEnd(4, '0')
    .toUpperCase();
  return `ORD-${timestamp}-${random}`;
};
