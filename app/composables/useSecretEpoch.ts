// The desktop copy of the lock machine's secret-session epoch. Every
// CLEAR_SECRET_CACHE bumps it; async secret work captures the epoch before
// awaiting and refuses to deliver plaintext once it has moved on — a decrypt
// that resolves after a lock can no longer repopulate caches or render.

let epoch = 0

export const bumpSecretEpoch = () => {
  epoch += 1
}

export const getSecretEpoch = () => epoch
