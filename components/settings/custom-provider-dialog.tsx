import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Chip, Dialog, HelperText, Text, TextInput } from 'react-native-paper';

import { Colors } from '@/constants/theme';
import { fetchGatewayModels, type CustomProviderInput } from '@/lib/opencode/client';

type Palette = typeof Colors.light;

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

type CustomProviderDialogProps = {
  isSubmitting: boolean;
  onDismiss: () => void;
  onSubmit: (input: CustomProviderInput) => void;
  palette: Palette;
  submitError?: string;
  visible: boolean;
};

export function CustomProviderDialog({ isSubmitting, onDismiss, onSubmit, palette, submitError, visible }: CustomProviderDialogProps) {
  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [baseURL, setBaseURL] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [manualModelsText, setManualModelsText] = useState('');
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<Record<string, boolean>>({});
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [fetchError, setFetchError] = useState<string>();

  const toggleModel = (modelId: string) => {
    setSelectedModels((current) => ({ ...current, [modelId]: !current[modelId] }));
  };

  const hasFetched = fetchedModels.length > 0;
  const selectedIds = useMemo(
    () => (hasFetched ? fetchedModels.filter((model) => selectedModels[model]) : manualModelsText.split(/[\s,]+/).map((model) => model.trim()).filter(Boolean)),
    [fetchedModels, hasFetched, manualModelsText, selectedModels],
  );

  const invalidId = id.trim() !== '' && !/^[a-z0-9][a-z0-9-]*$/.test(id.trim());
  const invalidURL = baseURL.trim() !== '' && !/^https?:\/\//i.test(baseURL.trim());
  const canSubmit =
    !isSubmitting &&
    name.trim() !== '' &&
    id.trim() !== '' &&
    !invalidId &&
    baseURL.trim() !== '' &&
    !invalidURL &&
    selectedIds.length > 0;

  const errorMessage =
    submitError ||
    (invalidId ? 'Provider ID must be lowercase letters, digits, and dashes.' : invalidURL ? 'Base URL must start with http:// or https://.' : undefined);

  async function handleFetchModels() {
    setIsFetchingModels(true);
    setFetchError(undefined);
    try {
      const modelIds = await fetchGatewayModels(baseURL, apiKey);
      setFetchedModels(modelIds);
      setSelectedModels(Object.fromEntries(modelIds.map((model) => [model, true])));
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : 'Could not fetch models from this gateway.');
    } finally {
      setIsFetchingModels(false);
    }
  }

  return (
    <Dialog visible={visible} onDismiss={onDismiss}>
      <Dialog.Title>Add custom provider</Dialog.Title>
      <Dialog.Content style={styles.dialogContent}>
        <Text variant="bodyMedium" style={{ color: palette.muted }}>
          Register an OpenAI-compatible gateway as a provider on your OpenCode server.
        </Text>
        <TextInput mode="outlined" label="Display name" value={name} onChangeText={(value) => {
          setName(value);
          if (!id.trim() || id.trim() === slugify(name)) {
            setId(slugify(value));
          }
        }} autoCapitalize="words" />
        <TextInput mode="outlined" label="Provider ID" value={id} onChangeText={setId} autoCapitalize="none" autoCorrect={false} />
        <TextInput mode="outlined" label="Base URL" value={baseURL} onChangeText={setBaseURL} placeholder="http://192.168.1.10:3000/v1" autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        <TextInput mode="outlined" label="API key (optional)" value={apiKey} onChangeText={setApiKey} autoCapitalize="none" autoCorrect={false} secureTextEntry />
        <Button mode="outlined" loading={isFetchingModels} disabled={!baseURL.trim() || invalidURL} onPress={() => void handleFetchModels()}>
          {hasFetched ? 'Refetch models' : 'Fetch models'}
        </Button>
        {fetchError ? <HelperText type="error" visible>{fetchError}</HelperText> : null}
        {hasFetched ? (
          <View>
            <View style={styles.chipWrap}>
              {fetchedModels.map((model) => (
                <Chip key={model} selected={Boolean(selectedModels[model])} onPress={() => toggleModel(model)} compact>
                  {model}
                </Chip>
              ))}
            </View>
            <HelperText type={selectedIds.length > 0 ? 'info' : 'error'} visible>
              {selectedIds.length > 0 ? `${selectedIds.length} of ${fetchedModels.length} models selected.` : 'Select at least one model.'}
            </HelperText>
          </View>
        ) : (
          <View>
            <TextInput mode="outlined" label="Model IDs" value={manualModelsText} onChangeText={setManualModelsText} placeholder="deepseek-v4-flash-free, gpt-4o" autoCapitalize="none" autoCorrect={false} />
            <HelperText type={selectedIds.length > 0 ? 'info' : 'error'} visible>
              {selectedIds.length > 0 ? `${selectedIds.length} model${selectedIds.length === 1 ? '' : 's'} — comma or space separated.` : 'Enter model IDs or fetch them from the gateway.'}
            </HelperText>
          </View>
        )}
        {errorMessage ? <HelperText type="error" visible>{errorMessage}</HelperText> : null}
      </Dialog.Content>
      <Dialog.Actions>
        <Button disabled={isSubmitting} onPress={onDismiss}>Cancel</Button>
        <Button disabled={!canSubmit} loading={isSubmitting} onPress={() => onSubmit({
          id: id.trim(),
          name: name.trim(),
          baseURL: baseURL.trim(),
          apiKey: apiKey.trim() || undefined,
          models: selectedIds,
        })}>
          Add provider
        </Button>
      </Dialog.Actions>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  dialogContent: { gap: 14 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});