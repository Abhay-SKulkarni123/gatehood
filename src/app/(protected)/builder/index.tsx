import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChoiceChip } from '@/components/choice-chip';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { FormField } from '@/components/form-field';
import { LoadingIndicator } from '@/components/loading-indicator';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SectionCard } from '@/components/section-card';
import { StatusBadge } from '@/components/status-badge';
import { WorkspaceHeader } from '@/components/workspace-header';
import { getClientConfig } from '@/config/env';
import {
  canCommitBuyerImport,
  createBuyerCsvState,
  type BuyerImportPreview,
} from '@/lib/csv/buyer-import';
import type { BuilderSnapshot } from '@/lib/data/builder';
import { loadBuilderSnapshot } from '@/lib/data/builder';
import { isValidPossessionDateInput, possessionDateToIsoDate } from '@/lib/data/units';
import {
  describeCallableError,
  callCreateNotice,
  callGenerateInvite,
  callGetNoticeReadStatus,
  callImportBuyers,
  callSetNoticePinned,
  callUpdateUnitInfo,
} from '@/lib/functions';
import { pickCsvFile } from '@/lib/files/pick-csv';
import { getFirebaseServices } from '@/lib/firebase';
import { parseConstructionProgressInput } from '@/lib/ui/unit-info';
import { useAuth } from '@/providers/auth-provider';
import type {
  BuyerContactDoc,
  FirestoreTimestamp,
  GenerateInviteResult,
  NoticeAudience,
  NoticeDoc,
  NoticeReadStatusResult,
  UnitDoc,
} from '@/types/domain';
import { colors, radius, spacing, typography } from '@/theme';
import { parseIdList } from '@/utils/identifiers';

type NoticeAudienceType = NoticeAudience['type'];

type UnitInfoDraft = {
  configuration: string;
  constructionProgress: string;
  possessionDate: string;
};

function draftForUnit(unit: UnitDoc): UnitInfoDraft {
  return {
    configuration: unit.configuration ?? '',
    constructionProgress: unit.constructionProgress === undefined || unit.constructionProgress === null
      ? ''
      : String(unit.constructionProgress),
    possessionDate: possessionDateToIsoDate(unit.possessionDate) ?? '',
  };
}

function formatTimestamp(value: FirestoreTimestamp | string): string {
  if (typeof value === 'string') {
    return new Date(value).toLocaleString();
  }
  return value.toDate().toLocaleString();
}

function audienceLabel(
  notice: NoticeDoc,
  towerNames: Map<string, string>,
  unitLabels: Map<string, string>,
): string {
  if (notice.audienceType === 'project') {
    return 'All buyers';
  }
  if (notice.audienceType === 'tower') {
    const names = notice.audienceTowerIds.map((id) => towerNames.get(id) ?? id);
    return names.length === 1 ? `Tower: ${names[0]}` : `Towers: ${names.join(', ')}`;
  }
  const labels = notice.audienceUnitIds.map((id) => unitLabels.get(id) ?? id);
  return labels.length === 1 ? `Unit: ${labels[0]}` : `Units: ${labels.join(', ')}`;
}

export default function BuilderHomeScreen() {
  const { user, logout, actionPending, actionError } = useAuth();
  const { constructionProjectId } = getClientConfig();

  const [snapshot, setSnapshot] = useState<BuilderSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [csv, setCsv] = useState('');
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [clientCsvErrors, setClientCsvErrors] = useState<string[]>([]);
  const [importPreview, setImportPreview] = useState<BuyerImportPreview | null>(null);
  const [generatedInvite, setGeneratedInvite] = useState<GenerateInviteResult | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audienceType, setAudienceType] = useState<NoticeAudienceType>('project');
  const [audienceIds, setAudienceIds] = useState('');
  const [readStatus, setReadStatus] = useState<NoticeReadStatusResult | null>(null);
  const [unitInfoDrafts, setUnitInfoDrafts] = useState<Record<string, UnitInfoDraft>>({});

  const load = async (showLoading: boolean) => {
    if (showLoading) {
      setLoading(true);
    }
    setLoadError(null);
    try {
      const { firestore } = getFirebaseServices();
      setSnapshot(await loadBuilderSnapshot(firestore, constructionProjectId));
    } catch (loadFailure) {
      setLoadError(describeCallableError(loadFailure));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const { firestore } = getFirebaseServices();
        const data = await loadBuilderSnapshot(firestore, constructionProjectId);
        if (active) {
          setSnapshot(data);
        }
      } catch (loadFailure) {
        if (active) {
          setLoadError(describeCallableError(loadFailure));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [constructionProjectId]);

  const refresh = () => load(false);

  const runAction = async <T,>(
    key: string,
    action: () => Promise<T>,
    successMessage?: string,
  ): Promise<T | null> => {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      const result = await action();
      if (successMessage) {
        setMessage(successMessage);
      }
      await refresh();
      return result;
    } catch (actionError) {
      setError(describeCallableError(actionError));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const towerNames = useMemo(
    () => new Map((snapshot?.towers ?? []).map((tower) => [tower.id, tower.name])),
    [snapshot],
  );
  const unitLabels = useMemo(
    () => new Map((snapshot?.units ?? []).map((unit) => [unit.id, unit.label])),
    [snapshot],
  );
  const buyerByUnit = useMemo(
    () =>
      new Map(
        (snapshot?.buyers ?? [])
          .filter((buyer) => buyer.unitId !== null)
          .map((buyer) => [buyer.unitId as string, buyer]),
      ),
    [snapshot],
  );
  const contactsByUnit = useMemo(() => {
    const grouped = new Map<string, BuyerContactDoc[]>();
    for (const contact of snapshot?.buyerContacts ?? []) {
      const list = grouped.get(contact.unitId) ?? [];
      list.push(contact);
      grouped.set(contact.unitId, list);
    }
    return grouped;
  }, [snapshot]);

  const currentDraftForUnit = (unit: UnitDoc): UnitInfoDraft =>
    unitInfoDrafts[unit.id] ?? draftForUnit(unit);

  const updateUnitInfoDraft = (unit: UnitDoc, field: keyof UnitInfoDraft, value: string) => {
    setUnitInfoDrafts((current) => ({
      ...current,
      [unit.id]: { ...(current[unit.id] ?? draftForUnit(unit)), [field]: value },
    }));
  };

  const handleUpdateUnitInfo = async (unit: UnitDoc) => {
    const draft = currentDraftForUnit(unit);
    const constructionProgress = parseConstructionProgressInput(draft.constructionProgress);
    const configuration = draft.configuration.trim();
    const possessionDate = draft.possessionDate.trim();
    if (
      !configuration ||
      constructionProgress === null ||
      !isValidPossessionDateInput(possessionDate)
    ) {
      setError(
        'Enter configuration, progress from 0 to 100, and a valid possession date (YYYY-MM-DD).',
      );
      return;
    }

    const result = await runAction(
      `unit-info:${unit.id}`,
      () =>
        callUpdateUnitInfo(getFirebaseServices().functions, {
          projectId: constructionProjectId,
          unitId: unit.id,
          configuration,
          constructionProgress,
          possessionDate,
        }),
      `Updated details for ${unit.label}.`,
    );
    if (!result) {
      return;
    }
    setUnitInfoDrafts((current) => ({
      ...current,
      [unit.id]: {
        configuration: result.configuration,
        constructionProgress: String(result.constructionProgress),
        possessionDate: result.possessionDate,
      },
    }));
  };

  const applyCsv = (value: string, fileName: string | null = null) => {
    const nextState = createBuyerCsvState(value, fileName);
    setCsv(nextState.csv);
    setCsvFileName(nextState.csvFileName);
    setClientCsvErrors(nextState.clientCsvErrors);
    setImportPreview(nextState.importPreview);
  };

  const handlePickCsv = async () => {
    setBusy('csv-pick');
    setError(null);
    setMessage(null);
    try {
      const picked = await pickCsvFile();
      if (picked) {
        applyCsv(picked.text, picked.name);
        setMessage(`Loaded ${picked.name}. Review the preview before importing.`);
      }
    } catch (pickError) {
      setError(describeCallableError(pickError));
    } finally {
      setBusy(null);
    }
  };

  const handleImport = async (dryRun: boolean) => {
    setBusy(dryRun ? 'import-preview' : 'import');
    setError(null);
    setMessage(null);
    try {
      const result = await callImportBuyers(getFirebaseServices().functions, {
        projectId: constructionProjectId,
        csv,
        dryRun,
      });
      if (dryRun) {
        setImportPreview({ csv, result });
        setMessage('Preview ready. Review each row before importing.');
      } else {
        setCsv('');
        setCsvFileName(null);
        setClientCsvErrors([]);
        setImportPreview(null);
        setMessage(
          `${result.created} buyer contact${result.created === 1 ? '' : 's'} imported; ` +
            `${result.unchanged} unchanged.`,
        );
        await refresh();
      }
    } catch (importError) {
      setError(describeCallableError(importError));
    } finally {
      setBusy(null);
    }
  };

  const handleGenerateInvite = async (
    towerId: string,
    unitId: string,
    regenerate = false,
  ) => {
    const result = await runAction(
      regenerate ? `replace-invite:${unitId}` : `invite:${unitId}`,
      () =>
        callGenerateInvite(getFirebaseServices().functions, {
          projectId: constructionProjectId,
          towerId,
          unitId,
          expiresInHours: 168,
          regenerate,
        }),
    );
    if (!result) {
      return;
    }
    setGeneratedInvite(result);
    if (result.codeAvailable) {
      setMessage(
        regenerate
          ? 'Previous invite revoked. Share the new code now; it is not stored in plaintext.'
          : 'Invite generated. Share the code now; it is not stored in plaintext.',
      );
    } else {
      setMessage(
        'An active invite already exists. Its code cannot be recovered; replace it to get a new code.',
      );
    }
  };

  const handleCreateNotice = async () => {
    const ids = parseIdList(audienceIds);
    let audience: NoticeAudience = { type: 'project' };
    if (audienceType === 'tower') {
      audience = { type: 'tower', towerIds: ids };
    }
    if (audienceType === 'unit') {
      audience = { type: 'unit', unitIds: ids };
    }

    const result = await runAction(
      'create-notice',
      () =>
        callCreateNotice(getFirebaseServices().functions, {
          projectId: constructionProjectId,
          title: title.trim(),
          body: body.trim(),
          audience,
        }),
    );
    if (!result) {
      return;
    }
    if (result.fanoutStatus === 'complete') {
      setMessage(`Notice published to all ${result.audienceCount} eligible buyers.`);
    } else if (result.fanoutStatus === 'partial') {
      setMessage(
        `Notice published with ${result.fanoutFailedCount} delivery failure(s); retry is pending.`,
      );
    } else {
      setMessage('Notice created, but delivery did not complete; retry is pending.');
    }
    setTitle('');
    setBody('');
    setAudienceIds('');
  };

  const handleReadStatus = async (noticeId: string) => {
    setBusy(`status:${noticeId}`);
    setError(null);
    setReadStatus(null);
    try {
      setReadStatus(
        await callGetNoticeReadStatus(getFirebaseServices().functions, {
          projectId: constructionProjectId,
          noticeId,
        }),
      );
    } catch (statusError) {
      setError(describeCallableError(statusError));
    } finally {
      setBusy(null);
    }
  };

  const handleTogglePin = async (notice: NoticeDoc) => {
    const result = await runAction(`pin:${notice.id}`, () =>
      callSetNoticePinned(getFirebaseServices().functions, {
        projectId: constructionProjectId,
        noticeId: notice.id,
        pinned: !notice.pinned,
      }),
    );
    if (!result) {
      return;
    }
    const label = result.pinned ? 'pinned' : 'unpinned';
    if (result.pinStatus === 'complete') {
      setMessage(`Notice ${label} across all delivered feeds.`);
    } else if (result.pinStatus === 'partial') {
      setMessage(
        `Canonical notice ${label}, but ${result.pinFailedCount} feed update(s) failed; retry is pending.`,
      );
    } else {
      setMessage(`Canonical notice ${label}, but pin propagation failed; retry is pending.`);
    }
  };

  const canPublish =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    (audienceType === 'project' || parseIdList(audienceIds).length > 0);
  const canCommitImport = canCommitBuyerImport({
    csv,
    clientCsvErrors,
    importPreview,
    previewPending: busy === 'import-preview',
    importPending: busy === 'import',
  });
  const visibleImportPreview = importPreview?.csv === csv ? importPreview.result : null;
  const selectedAudienceIds = useMemo(() => new Set(parseIdList(audienceIds)), [audienceIds]);

  const toggleAudienceId = (id: string) => {
    const next = selectedAudienceIds.has(id)
      ? Array.from(selectedAudienceIds).filter((value) => value !== id)
      : [...selectedAudienceIds, id];
    setAudienceIds(next.join(', '));
  };

  return (
    <Screen>
      <WorkspaceHeader
        accountLabel={`Signed in as ${user?.email ?? user?.uid ?? 'a builder'}`}
        eyebrow="BUILDER WORKSPACE"
        onSignOut={() => void logout()}
        signOutError={actionError}
        signOutPending={actionPending}
        subtitle="Manage units, invites, and notices for this project."
        title={snapshot?.project?.name ?? 'Project workspace'}
      />

      {message ? <Text accessibilityRole="status" style={styles.message}>{message}</Text> : null}
      {error ? <ErrorState message={error} title="Action failed" /> : null}

      {loading ? (
        <LoadingIndicator label="Loading workspace…" />
      ) : loadError || !snapshot ? (
        <ErrorState
          message={loadError ?? 'Project data could not be loaded.'}
          onRetry={() => void load(true)}
          retryLabel="Reload workspace"
          title="Workspace unavailable"
        />
      ) : (
        <View style={styles.sections}>
          <View style={styles.statsRow}>
            <View accessibilityLabel={`${snapshot.towers.length} towers`} style={styles.statCard}>
              <Text style={styles.statValue}>{snapshot.towers.length}</Text>
              <Text style={styles.statLabel}>Towers</Text>
            </View>
            <View accessibilityLabel={`${snapshot.units.length} units`} style={styles.statCard}>
              <Text style={styles.statValue}>{snapshot.units.length}</Text>
              <Text style={styles.statLabel}>Units</Text>
            </View>
            <View accessibilityLabel={`${snapshot.buyers.length} buyers`} style={styles.statCard}>
              <Text style={styles.statValue}>{snapshot.buyers.length}</Text>
              <Text style={styles.statLabel}>Buyers</Text>
            </View>
            <View accessibilityLabel={`${snapshot.notices.length} notices`} style={styles.statCard}>
              <Text style={styles.statValue}>{snapshot.notices.length}</Text>
              <Text style={styles.statLabel}>Notices</Text>
            </View>
          </View>

          <SectionCard
            helper="Choose a CSV with Tower, Unit, Name, and Phone columns, or paste one below. Existing tower and unit names are reused."
            title="Import buyers"
          >
            <Text style={styles.previewSummary}>
              Preview the CSV before importing. Import unlocks only after a successful server-side
              preview; editing the CSV requires a new preview.
            </Text>
            <PrimaryButton
              label="Choose CSV file"
              loading={busy === 'csv-pick'}
              onPress={() => void handlePickCsv()}
            />
            {csvFileName ? <Text style={styles.rowDetail}>Selected: {csvFileName}</Text> : null}
            <FormField
              label="Pasted CSV (optional)"
              multiline
              numberOfLines={6}
              onChangeText={(value) => applyCsv(value)}
              placeholder={'Tower,Unit,Name,Phone\nTower 1,Unit 101,Asha,+15551234567'}
              value={csv}
            />
            {clientCsvErrors.length > 0 ? (
              <View style={styles.preview}>
                <Text style={styles.previewSummary}>Fix these client-side issues:</Text>
                {clientCsvErrors.map((errorMessage) => (
                  <Text key={errorMessage} style={styles.previewError}>
                    {errorMessage}
                  </Text>
                ))}
              </View>
            ) : null}
            <View style={styles.buttonRow}>
              <PrimaryButton
                disabled={!csv.trim() || clientCsvErrors.length > 0}
                label="Preview CSV"
                loading={busy === 'import-preview'}
                onPress={() => void handleImport(true)}
              />
              <PrimaryButton
                disabled={!canCommitImport}
                label="Import buyers"
                loading={busy === 'import'}
                onPress={() => void handleImport(false)}
              />
            </View>
            {visibleImportPreview ? (
              <View style={styles.preview}>
                <Text style={styles.previewSummary}>
                  {visibleImportPreview.created} buyer contact(s) to create ·{' '}
                  {visibleImportPreview.unchanged} unchanged · {visibleImportPreview.failed} invalid
                </Text>
                {visibleImportPreview.rows.map((row) => (
                  <Text
                    key={`${row.row}-${row.phone}`}
                    style={[styles.previewRow, row.status === 'error' ? styles.previewError : null]}
                  >
                    Row {row.row}: {row.tower}/{row.unit} {row.name} ({row.phone}) — {row.status}
                    {row.message ? ` (${row.message})` : ''}
                  </Text>
                ))}
              </View>
            ) : null}
          </SectionCard>

          <SectionCard
            helper="Generate a single-use code for a unit. Replacing an invite revokes the previous code immediately. Saved unit details appear in the buyer's workspace."
            title="Invites and buyer status"
          >
            {snapshot.units.length === 0 ? (
              <EmptyState message="Import buyers to create units before generating invites." title="No units yet" />
            ) : (
              snapshot.units.map((unit) => {
                const buyer = buyerByUnit.get(unit.id);
                const contacts = contactsByUnit.get(unit.id) ?? [];
                const contactLabel = contacts
                  .map((contact) => `${contact.name} (${contact.phone})`)
                  .join('; ');
                const draft = currentDraftForUnit(unit);
                return (
                  <View key={unit.id} style={styles.unitRow}>
                    <View style={styles.unitRowHeader}>
                      <View style={styles.unitInfo}>
                        <Text style={styles.rowTitle}>{unit.label}</Text>
                        <Text style={styles.rowDetail}>
                          {towerNames.get(unit.towerId) ?? 'Tower not available'}
                        </Text>
                        <StatusBadge
                          label={buyer ? 'Joined' : 'Not joined'}
                          tone={buyer ? 'accent' : 'muted'}
                        />
                        {contactLabel ? (
                          <Text style={styles.rowDetail}>Imported: {contactLabel}</Text>
                        ) : null}
                      </View>
                      <View style={styles.inviteActions}>
                        <Pressable
                          accessibilityLabel={`Generate invite for ${unit.label}`}
                          accessibilityRole="button"
                          accessibilityState={{
                            busy: busy === `invite:${unit.id}`,
                            disabled: busy !== null,
                          }}
                          disabled={busy !== null}
                          onPress={() => void handleGenerateInvite(unit.towerId, unit.id)}
                          style={({ pressed }) => [
                            styles.inviteButton,
                            busy !== null ? styles.buttonDisabled : null,
                            pressed ? styles.pressed : null,
                          ]}
                        >
                          <Text style={styles.inviteButtonLabel}>
                            {busy === `invite:${unit.id}` ? 'Working…' : 'Invite'}
                          </Text>
                        </Pressable>
                        <Pressable
                          accessibilityLabel={`Replace invite for ${unit.label}`}
                          accessibilityRole="button"
                          accessibilityState={{
                            busy: busy === `replace-invite:${unit.id}`,
                            disabled: busy !== null,
                          }}
                          disabled={busy !== null}
                          onPress={() => void handleGenerateInvite(unit.towerId, unit.id, true)}
                          style={({ pressed }) => [
                            styles.inviteButton,
                            styles.replaceButton,
                            busy !== null ? styles.buttonDisabled : null,
                            pressed ? styles.pressed : null,
                          ]}
                        >
                          <Text style={[styles.inviteButtonLabel, styles.replaceButtonLabel]}>
                            {busy === `replace-invite:${unit.id}` ? 'Working…' : 'Replace'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                    <View style={styles.unitInfoForm}>
                      <Text style={styles.rowDetail}>Unit details</Text>
                      <FormField
                        label={`${unit.label} configuration`}
                        onChangeText={(value) => updateUnitInfoDraft(unit, 'configuration', value)}
                        placeholder="Not available yet"
                        value={draft.configuration}
                      />
                      <FormField
                        keyboardType="numeric"
                        label={`${unit.label} construction progress`}
                        onChangeText={(value) =>
                          updateUnitInfoDraft(unit, 'constructionProgress', value)
                        }
                        placeholder="0 to 100"
                        value={draft.constructionProgress}
                      />
                      <FormField
                        label={`${unit.label} possession date`}
                        onChangeText={(value) => updateUnitInfoDraft(unit, 'possessionDate', value)}
                        placeholder="YYYY-MM-DD"
                        value={draft.possessionDate}
                      />
                      <PrimaryButton
                        disabled={busy !== null}
                        label="Save unit details"
                        loading={busy === `unit-info:${unit.id}`}
                        onPress={() => void handleUpdateUnitInfo(unit)}
                      />
                    </View>
                  </View>
                );
              })
            )}
            {generatedInvite ? (
              <View style={styles.generatedInvite}>
                <Text style={styles.sectionTitle}>Generated invite</Text>
                {generatedInvite.codeAvailable ? (
                  <Text selectable style={styles.code}>
                    {generatedInvite.code}
                  </Text>
                ) : (
                  <Text style={styles.previewError}>
                    An active invite already exists. The plaintext code was never stored and cannot
                    be recovered; use Replace to issue a new one.
                  </Text>
                )}
                <Text style={styles.rowDetail}>
                  {unitLabels.get(generatedInvite.unitId) ?? generatedInvite.unitId} · expires{' '}
                  {formatTimestamp(generatedInvite.expiresAt)}
                </Text>
              </View>
            ) : null}
          </SectionCard>

          <SectionCard
            helper="Choose an audience and publish a construction update. Delivery and read status appear below."
            title="Publish notice"
          >
            <FormField label="Title" onChangeText={setTitle} placeholder="Water supply update" value={title} />
            <FormField
              label="Message"
              multiline
              numberOfLines={4}
              onChangeText={setBody}
              placeholder="What should buyers know?"
              value={body}
            />
            <View style={styles.chipRow}>
              <ChoiceChip
                label="All buyers"
                onPress={() => {
                  setAudienceIds('');
                  setAudienceType('project');
                }}
                selected={audienceType === 'project'}
              />
              <ChoiceChip
                label="Towers"
                onPress={() => {
                  setAudienceIds('');
                  setAudienceType('tower');
                }}
                selected={audienceType === 'tower'}
              />
              <ChoiceChip
                label="Units"
                onPress={() => {
                  setAudienceIds('');
                  setAudienceType('unit');
                }}
                selected={audienceType === 'unit'}
              />
            </View>
            {audienceType === 'tower' ? (
              snapshot.towers.length === 0 ? (
                <EmptyState message="Import buyers to create towers before targeting them." title="No towers yet" />
              ) : (
                <View style={styles.chipRow}>
                  {snapshot.towers.map((tower) => (
                    <ChoiceChip
                      key={tower.id}
                      label={tower.name}
                      onPress={() => toggleAudienceId(tower.id)}
                      selected={selectedAudienceIds.has(tower.id)}
                    />
                  ))}
                </View>
              )
            ) : audienceType === 'unit' ? (
              snapshot.units.length === 0 ? (
                <EmptyState message="Import buyers to create units before targeting them." title="No units yet" />
              ) : (
                <View style={styles.chipRow}>
                  {snapshot.units.map((unit) => (
                    <ChoiceChip
                      key={unit.id}
                      label={unit.label}
                      onPress={() => toggleAudienceId(unit.id)}
                      selected={selectedAudienceIds.has(unit.id)}
                    />
                  ))}
                </View>
              )
            ) : null}
            <PrimaryButton
              disabled={!canPublish}
              label="Publish notice"
              loading={busy === 'create-notice'}
              onPress={() => void handleCreateNotice()}
            />
          </SectionCard>

          <SectionCard
            helper="Review delivery, pinning, and read status for each published notice."
            title="Notices"
          >
            {snapshot.notices.length === 0 ? (
              <EmptyState message="Published notices will appear here." title="No notices yet" />
            ) : (
              snapshot.notices.map((notice) => (
                <View key={notice.id} style={styles.notice}>
                  <View style={styles.noticeHeader}>
                    <Text style={styles.rowTitle}>{notice.title}</Text>
                    {notice.pinned ? <StatusBadge label="Pinned" tone="accent" /> : null}
                  </View>
                  <Text style={styles.noticeBody}>{notice.body}</Text>
                  <Text style={styles.rowDetail}>
                    {audienceLabel(notice, towerNames, unitLabels)}
                  </Text>
                  <Text style={styles.rowDetail}>
                    Audience {notice.audienceCount} · Read {notice.readCount} · Fan-out{' '}
                    {notice.fanoutStatus} ({notice.fanoutFailedCount} failed)
                  </Text>
                  <Text style={styles.rowDetail}>
                    Canonical pin {notice.pinned ? 'on' : 'off'} · Pin propagation{' '}
                    {notice.pinStatus} ({notice.pinFailedCount} failed)
                  </Text>
                  <View style={styles.buttonRow}>
                    <PrimaryButton
                      label={notice.pinned ? 'Unpin' : 'Pin'}
                      loading={busy === `pin:${notice.id}`}
                      onPress={() => void handleTogglePin(notice)}
                    />
                    <PrimaryButton
                      label="Read status"
                      loading={busy === `status:${notice.id}`}
                      onPress={() => void handleReadStatus(notice.id)}
                    />
                  </View>
                  {readStatus?.noticeId === notice.id ? (
                    <View style={styles.statusPanel}>
                      <Text style={styles.sectionTitle}>Read status</Text>
                      <Text style={styles.rowDetail}>
                        Total audience {readStatus.audienceCount} · Total read{' '}
                        {readStatus.readCount}
                      </Text>
                      <Text style={styles.rowDetail}>
                        Sample: {readStatus.sampleRecipientCount} recipient(s) ·{' '}
                        {readStatus.sampleReadCount} read ·{' '}
                        {readStatus.sampleDeliveredUnreadCount} delivered-unread ·{' '}
                        {readStatus.sampleNotDeliveredCount} not delivered
                      </Text>
                      <Text style={styles.rowDetail}>
                        {readStatus.truncated
                          ? 'Recipient details are truncated; sample counts are not totals.'
                          : 'Recipient details are complete.'}
                      </Text>
                      {readStatus.recipients.length === 0 ? (
                        <Text style={styles.rowDetail}>No eligible buyers in this sample.</Text>
                      ) : (
                        readStatus.recipients.map((recipient) => (
                          <Text key={recipient.uid} style={styles.rowDetail}>
                            {unitLabels.get(recipient.unitId ?? '') ?? 'Unassigned buyer'}:{' '}
                            {recipient.read
                              ? `Read ${formatTimestamp(recipient.readAt as string)}`
                              : recipient.delivered
                                ? 'Delivered, unread'
                                : 'Not delivered'}
                          </Text>
                        ))
                      )}
                    </View>
                  ) : null}
                </View>
              ))
            )}
          </SectionCard>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  eyebrow: {
    ...typography.eyebrow,
    color: colors.accent,
  },
  title: {
    ...typography.heading,
    color: colors.text,
    fontSize: 28,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
  },
  message: {
    ...typography.caption,
    color: colors.accent,
    marginTop: spacing.md,
  },
  sections: {
    gap: spacing.lg,
    marginTop: spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 72,
    padding: spacing.md,
  },
  statValue: {
    ...typography.heading,
    color: colors.text,
    fontSize: 24,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  sectionTitle: {
    ...typography.heading,
    color: colors.text,
  },
  helper: {
    ...typography.caption,
    color: colors.textMuted,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  preview: {
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  previewSummary: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '700',
  },
  previewRow: {
    ...typography.caption,
    color: colors.textMuted,
  },
  previewError: {
    color: colors.danger,
  },
  unitRow: {
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  unitRowHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  unitInfo: {
    flexShrink: 1,
    gap: spacing.xs,
  },
  unitInfoForm: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  rowTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700',
  },
  rowDetail: {
    ...typography.caption,
    color: colors.textMuted,
  },
  joined: {
    ...typography.caption,
    color: colors.accent,
  },
  awaiting: {
    ...typography.caption,
    color: colors.danger,
  },
  inviteActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  inviteButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 72,
    paddingHorizontal: spacing.md,
  },
  replaceButton: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderWidth: 1,
  },
  replaceButtonLabel: {
    color: colors.text,
  },
  inviteButtonLabel: {
    ...typography.caption,
    color: colors.background,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.8,
  },
  generatedInvite: {
    borderColor: colors.accent,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  code: {
    ...typography.heading,
    color: colors.accent,
    letterSpacing: 2,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  notice: {
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  noticeHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  noticeBody: {
    ...typography.body,
    color: colors.textMuted,
  },
  pinned: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: '700',
  },
  statusPanel: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    gap: spacing.xs,
    padding: spacing.md,
  },
});
