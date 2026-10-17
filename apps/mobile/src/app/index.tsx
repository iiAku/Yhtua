import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useVault } from '../state/vault-store'
import { Avatar, Button } from '../ui/components'
import { Icon } from '../ui/icon'
import { colors, ui } from '../ui/theme'

export default function TokenList() {
  const tokens = useVault((state) => state.tokens)
  const [query, setQuery] = useState('')
  const insets = useSafeAreaInsets()
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    return tokens
      .filter(({ otp }) => `${otp.label} ${otp.issuer}`.toLocaleLowerCase().includes(term))
      .toSorted((a, b) => (b.lastUsed ?? 0) - (a.lastUsed ?? 0))
  }, [query, tokens])

  return (
    <View style={[ui.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={ui.row}>
          <View style={styles.brandIcon}>
            <Icon name="lock" color={colors.accent} size={22} />
          </View>
          <Text style={styles.brand}>Yhtua</Text>
          <View style={{ flex: 1 }} />
          <Text style={styles.local}>LOCAL VAULT</Text>
        </View>
        <View style={[ui.row, { justifyContent: 'space-between', marginTop: 30 }]}>
          <View style={{ gap: 6 }}>
            <Text style={ui.title}>Your tokens</Text>
            <Text style={ui.hint}>
              {tokens.length === 0
                ? 'A little more peace of mind.'
                : `${tokens.length} ${tokens.length === 1 ? 'account' : 'accounts'} · Encrypted on this device`}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add token"
            onPress={() => router.push('/token/new')}
            style={styles.add}
          >
            <Icon name="plus" color={colors.base} />
          </Pressable>
        </View>
        {tokens.length > 0 ? (
          <View style={styles.search}>
            <Icon name="search" size={18} color={colors.muted} />
            <TextInput
              accessibilityLabel="Search tokens"
              value={query}
              onChangeText={setQuery}
              placeholder="Search tokens…"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.searchInput}
              clearButtonMode="while-editing"
              selectionColor={colors.accent}
            />
          </View>
        ) : null}
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(token) => token.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.list, filtered.length === 0 && { flexGrow: 1 }]}
        ListEmptyComponent={
          tokens.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Icon name="shield" size={36} color={colors.accent} />
              </View>
              <Text style={[ui.title, { fontSize: 26, textAlign: 'center' }]}>
                Your accounts. Safely yours.
              </Text>
              <Text style={[ui.body, { textAlign: 'center' }]}>
                Keep your verification codes in one quiet, secure place. No Yhtua account needed.
              </Text>
              <View style={{ gap: 10, width: '100%', marginTop: 14 }}>
                <Button
                  title="Scan your first token"
                  icon="scan"
                  onPress={() => router.push('/token/scan')}
                />
                <Button
                  title="Enter a setup key"
                  variant="secondary"
                  icon="key"
                  onPress={() => router.push('/token/new')}
                />
                <Button
                  title="Restore a Yhtua backup"
                  variant="secondary"
                  icon="cloud"
                  onPress={() => router.push('/settings/transfer')}
                />
              </View>
            </View>
          ) : (
            <View style={styles.empty}>
              <Icon name="search" size={32} />
              <Text style={ui.heading}>No tokens found</Text>
              <Text style={ui.body}>Try a different name or service.</Text>
              <Button title="Clear search" variant="secondary" onPress={() => setQuery('')} />
            </View>
          )
        }
        renderItem={({ item: token }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${token.otp.label}`}
            onPress={() => router.push({ pathname: '/token/[id]', params: { id: token.id } })}
            style={({ pressed }) => [styles.token, pressed && { backgroundColor: colors.elevated }]}
          >
            <Avatar label={token.otp.label} />
            <View style={{ flex: 1, gap: 5 }}>
              <Text numberOfLines={1} style={styles.tokenName}>
                {token.otp.label}
              </Text>
              <Text numberOfLines={1} style={ui.hint}>
                {token.otp.issuer ? `${token.otp.issuer} · ` : ''}
                {token.otp.digits}-digit · {token.otp.period}s
              </Text>
            </View>
            <Icon name="chevron" size={17} color={colors.muted} />
          </Pressable>
        )}
        ListFooterComponent={
          tokens.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/settings/transfer')}
              style={styles.backup}
            >
              <Icon name="cloud" color={colors.accent} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600' }}>
                  Keep a recovery copy
                </Text>
                <Text style={ui.hint}>Save an encrypted backup to your cloud drive.</Text>
              </View>
              <Icon name="chevron" size={16} color={colors.accent} />
            </Pressable>
          ) : null
        }
      />
      <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <View accessibilityRole="tab" accessibilityState={{ selected: true }} style={styles.tab}>
          <Icon name="shield" color={colors.accent} />
          <Text style={[styles.tabText, { color: colors.accent }]}>Vault</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/settings/transfer')}
          style={styles.tab}
        >
          <Icon name="cloud" />
          <Text style={styles.tabText}>Backups</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/settings')}
          style={styles.tab}
        >
          <Icon name="settings" />
          <Text style={styles.tabText}>Settings</Text>
        </Pressable>
      </View>
    </View>
  )
}
const styles = StyleSheet.create({
  header: { padding: 24, paddingBottom: 18, borderBottomWidth: 1, borderColor: colors.border },
  brandIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderActive,
  },
  brand: { color: colors.text, fontSize: 21, fontWeight: '700', letterSpacing: -0.7 },
  local: { color: colors.muted, fontSize: 9, fontWeight: '600', letterSpacing: 1.6 },
  add: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.elevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    marginTop: 24,
  },
  searchInput: { flex: 1, minWidth: 0, minHeight: 48, color: colors.text, fontSize: 14 },
  list: { padding: 16, paddingTop: 8 },
  token: { flexDirection: 'row', gap: 14, padding: 14, alignItems: 'center', borderRadius: 14 },
  tokenName: { color: colors.text, fontSize: 15, fontWeight: '500' },
  backup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.accentSubtle,
    borderWidth: 1,
    borderColor: colors.borderActive,
    borderRadius: 14,
    padding: 16,
    marginTop: 24,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 14,
    maxWidth: 420,
    alignSelf: 'center',
    width: '100%',
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: colors.accentSubtle,
    borderWidth: 1,
    borderColor: colors.borderActive,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  dock: {
    paddingTop: 14,
    flexDirection: 'row',
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 6 },
  tabText: { color: colors.secondary, fontSize: 11, fontWeight: '500' },
})
