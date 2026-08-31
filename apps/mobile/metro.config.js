// Expo's default Metro config detects the bun workspace root itself and
// resolves @yhtua/domain from source; overriding resolver behavior here is
// what expo-doctor warns against, so this stays at the defaults.
const { getDefaultConfig } = require('expo/metro-config')

module.exports = getDefaultConfig(__dirname)
