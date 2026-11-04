import { useState } from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { checkServer } from '../../adapters/reportsApi';
import { normaliseServerUrl } from '../../adapters/settingsStore';
import { useOutbox, useServices } from '../../app/ServicesProvider';
import { BrandHeader } from '../BrandHeader';
import { Button } from '../Button';
import { Icon, type IconName } from '../Icon';
import { useTheme, type Theme } from '../theme';
import { ResetSheet } from './ResetSheet';

type Check =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok'; message: string }
  | { kind: 'failed'; message: string };

function CardHeader({
  t,
  icon,
  tint,
  title,
}: {
  t: Theme;
  icon: IconName;
  tint: 'primary' | 'danger';
  title: string;
}) {
  const fg = tint === 'danger' ? t.color.dangerFg : t.color.primary;
  const bg = tint === 'danger' ? t.color.dangerBg : t.color.primarySoft;
  return (
    <View style={styles.cardHeader}>
      <View style={[styles.cardIcon, { backgroundColor: bg }]}>
        <Icon name={icon} size={18} color={fg} />
      </View>
      <Text accessibilityRole="header" style={t.text.heading}>
        {title}
      </Text>
    </View>
  );
}

export function SettingsScreen() {
  const t = useTheme();
  const c = t.color;
  const { serverUrl, setServerUrl } = useServices();
  const { reports } = useOutbox();
  const [address, setAddress] = useState(serverUrl());
  const [check, setCheck] = useState<Check>({ kind: 'idle' });
  const [saving, setSaving] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const normalised = normaliseServerUrl(address);
  const changed = normalised !== undefined && normalised !== serverUrl();
  const waiting = reports.filter(r => r.status !== 'delivered').length;
  const delivered = reports.length - waiting;

  const test = async () => {
    if (!normalised) return;
    setCheck({ kind: 'checking' });
    const problem = await checkServer(normalised);
    setCheck(
      problem
        ? { kind: 'failed', message: problem }
        : { kind: 'ok', message: 'Connected · the server answered' },
    );
  };

  const save = async () => {
    if (!normalised) return;
    setSaving(true);
    try {
      await setServerUrl(normalised);
      setAddress(normalised);
      setCheck({
        kind: 'ok',
        message: 'Saved · waiting reports will use this address',
      });
    } catch {
      setCheck({
        kind: 'failed',
        message: "Couldn't save the address on this phone. Try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  const card = [
    styles.card,
    { backgroundColor: c.raised, borderColor: c.line, boxShadow: c.shadow },
  ];

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <BrandHeader eyebrow="SiteProof 1.0" title="Settings">
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={card}>
            <CardHeader t={t} icon="server" tint="primary" title="Server" />
            <Text
              nativeID="serverLabel"
              style={[
                styles.label,
                { color: c.body, fontFamily: t.font.semibold },
              ]}
            >
              Address
            </Text>
            <TextInput
              accessibilityLabelledBy="serverLabel"
              value={address}
              onChangeText={text => {
                setAddress(text);
                setCheck({ kind: 'idle' });
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={[
                styles.input,
                {
                  backgroundColor: c.bg,
                  borderColor: normalised || !address ? c.line : c.dangerFg,
                  color: c.ink,
                  fontFamily: t.font.medium,
                },
              ]}
            />
            <Text style={t.text.small}>
              {normalised || !address
                ? 'Your computer on the same Wi-Fi, or http://localhost:3000 over USB.'
                : 'Use a full address, like http://192.168.1.20:3000'}
            </Text>
            <View style={styles.row}>
              <Button
                label="Test connection"
                variant="tonal"
                onPress={test}
                disabled={!normalised}
                busy={check.kind === 'checking'}
                style={styles.wide}
              />
              <Button
                label="Save"
                onPress={save}
                disabled={!changed}
                busy={saving}
                style={styles.grow}
              />
            </View>
            {(check.kind === 'ok' || check.kind === 'failed') && (
              <View style={styles.result} accessibilityLiveRegion="polite">
                <Icon
                  name={check.kind === 'ok' ? 'check' : 'alert'}
                  size={16}
                  color={check.kind === 'ok' ? c.doneFg : c.dangerFg}
                  strokeWidth={2.6}
                />
                <Text
                  style={[
                    styles.resultText,
                    {
                      color: check.kind === 'ok' ? c.doneFg : c.dangerFg,
                      fontFamily: t.font.semibold,
                    },
                  ]}
                >
                  {check.message}
                </Text>
              </View>
            )}
          </View>

          <View style={[card, styles.stats]}>
            <View style={[styles.stat, { backgroundColor: c.savedBg }]}>
              <Text
                style={[
                  styles.statNumber,
                  { color: c.savedFg, fontFamily: t.font.display },
                ]}
              >
                {waiting}
              </Text>
              <Text
                style={[
                  styles.statLabel,
                  { color: c.savedFg, fontFamily: t.font.semibold },
                ]}
              >
                waiting on this phone
              </Text>
            </View>
            <View style={[styles.stat, { backgroundColor: c.doneBg }]}>
              <Text
                style={[
                  styles.statNumber,
                  { color: c.doneFg, fontFamily: t.font.display },
                ]}
              >
                {delivered}
              </Text>
              <Text
                style={[
                  styles.statLabel,
                  { color: c.doneFg, fontFamily: t.font.semibold },
                ]}
              >
                delivered from here
              </Text>
            </View>
          </View>

          <View style={card}>
            <CardHeader
              t={t}
              icon="trash"
              tint="danger"
              title="Reset this phone"
            />
            <Text style={[t.text.body, { color: c.body }]}>
              Deletes every report, photo and draft on this phone. Reports
              already on the server stay there.
            </Text>
            <Button
              label="Reset this phone…"
              variant="danger"
              onPress={() => setResetOpen(true)}
            />
          </View>
        </ScrollView>
      </BrandHeader>
      <ResetSheet visible={resetOpen} onClose={() => setResetOpen(false)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingTop: 20, gap: 14, paddingBottom: 32 },
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 13 },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  row: { flexDirection: 'row', gap: 10 },
  grow: { flex: 1 },
  // The longer label gets more of the row, so it fits on one line.
  wide: { flex: 1.7 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  resultText: { fontSize: 14, flexShrink: 1 },
  stats: { flexDirection: 'row' },
  stat: { flex: 1, padding: 12, borderRadius: 14, gap: 2 },
  statNumber: { fontSize: 30, lineHeight: 34 },
  statLabel: { fontSize: 13 },
});
