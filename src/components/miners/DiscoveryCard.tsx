/**
 * DiscoveryCard - Inline discovery controls for MinersScreen
 * Includes scan button, progress indicator, manual IP entry, and custom range
 */

import { useState, useCallback } from 'react';
import { View, TextInput, Pressable, LayoutAnimation, Platform, UIManager } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../Card';
import { Text } from '../Text';
import { Button } from '../Button';
import { haptics } from '@/utils/haptics';
import { colors } from '@/constants/colors';
import { isValidIpAddress, parseIpRange } from '@/utils/validation';
import type { DiscoveryProgress } from '@/types';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

export interface DiscoveryCardProps {
  isDiscovering: boolean;
  progress: DiscoveryProgress | null;
  discoveryError: string | null;
  onStartScan: () => void;
  onStopScan: () => void;
  onAddManualIp: (ip: string) => Promise<boolean>;
  onScanRange: (subnet: string, start: number, end: number) => void;
  className?: string;
}

export function DiscoveryCard({
  isDiscovering,
  progress,
  discoveryError,
  onStartScan,
  onStopScan,
  onAddManualIp,
  onScanRange,
  className = '',
}: DiscoveryCardProps) {
  const [manualIp, setManualIp] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [isAddingManual, setIsAddingManual] = useState(false);
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');

  // Progress bar animation
  const progressWidth = useSharedValue(0);

  // Update progress animation
  if (progress) {
    progressWidth.value = withTiming(
      (progress.scanned / progress.total) * 100,
      { duration: 200 }
    );
  } else {
    progressWidth.value = 0;
  }

  const progressBarStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  const handleStartScan = useCallback(() => {
    haptics.light();
    onStartScan();
  }, [onStartScan]);

  const handleStopScan = useCallback(() => {
    haptics.light();
    onStopScan();
  }, [onStopScan]);

  const handleAddManualIp = useCallback(async () => {
    const trimmedIp = manualIp.trim();

    if (!trimmedIp) {
      setManualError('Enter an IP address');
      haptics.error();
      return;
    }

    if (!isValidIpAddress(trimmedIp)) {
      setManualError('Invalid IP address');
      haptics.error();
      return;
    }

    setManualError(null);
    setIsAddingManual(true);

    try {
      const success = await onAddManualIp(trimmedIp);
      if (success) {
        setManualIp('');
        haptics.success();
      } else {
        setManualError('Could not connect to miner');
        haptics.error();
      }
    } catch {
      setManualError('Failed to add miner');
      haptics.error();
    } finally {
      setIsAddingManual(false);
    }
  }, [manualIp, onAddManualIp]);

  const handleToggleCustomRange = useCallback(() => {
    haptics.selection();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowCustomRange(!showCustomRange);
  }, [showCustomRange]);

  const handleScanCustomRange = useCallback(() => {
    // Build range string and parse
    const rangeStr = `${rangeStart.trim()}-${rangeEnd.trim()}`;
    const parsed = parseIpRange(rangeStr);

    if (!parsed) {
      haptics.error();
      return;
    }

    haptics.light();
    onScanRange(parsed.subnet, parsed.start, parsed.end);
  }, [rangeStart, rangeEnd, onScanRange]);

  const isRangeValid = () => {
    const rangeStr = `${rangeStart.trim()}-${rangeEnd.trim()}`;
    return parseIpRange(rangeStr) !== null;
  };

  return (
    <Card padding="md" className={`mx-4 mt-4 ${className}`}>
      {/* Header */}
      <View className="flex-row items-center mb-3">
        <Ionicons
          name="hardware-chip-outline"
          size={20}
          color={colors.text}
        />
        <Text variant="subtitle" className="ml-2 flex-1">
          Discover Miners
        </Text>
      </View>

      {/* Auto-scan section */}
      {isDiscovering ? (
        <View>
          {/* Progress stats */}
          {progress && (
            <View className="flex-row justify-between mb-2">
              <Text variant="caption" color="muted">
                Scanning: {progress.scanned}/{progress.total}
              </Text>
              <Text variant="caption" color="success">
                Found: {progress.found}
              </Text>
            </View>
          )}

          {/* Progress bar */}
          <View className="h-2 bg-secondary rounded-full overflow-hidden mb-3">
            <Animated.View
              className="h-full bg-foreground rounded-full"
              style={progressBarStyle}
            />
          </View>

          {/* Cancel button */}
          <Button variant="secondary" onPress={handleStopScan}>
            Cancel
          </Button>
        </View>
      ) : (
        <Button
          variant="primary"
          icon="search"
          onPress={handleStartScan}
          className="mb-3"
        >
          Scan Network
        </Button>
      )}

      {/* Discovery error */}
      {discoveryError && !isDiscovering && (
        <View className="flex-row items-center mb-3 px-3 py-2 bg-danger/10 rounded-lg">
          <Ionicons name="alert-circle" size={16} color={colors.danger} />
          <Text variant="caption" color="danger" className="ml-2 flex-1">
            {discoveryError}
          </Text>
        </View>
      )}

      {/* Divider */}
      <View className="h-px bg-border my-3" />

      {/* Manual IP entry */}
      <View>
        <Text variant="caption" color="muted" className="mb-2">
          Add manually by IP
        </Text>
        <View className="flex-row gap-2">
          <TextInput
            className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-foreground"
            placeholder="192.168.1.100"
            placeholderTextColor={colors.textMuted}
            value={manualIp}
            onChangeText={(text) => {
              setManualIp(text);
              setManualError(null);
            }}
            keyboardType="numeric"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isAddingManual}
          />
          <Button
            variant="secondary"
            onPress={handleAddManualIp}
            loading={isAddingManual}
            disabled={isAddingManual || !manualIp.trim()}
          >
            Add
          </Button>
        </View>
        {manualError && (
          <Text variant="caption" color="danger" className="mt-1">
            {manualError}
          </Text>
        )}
      </View>

      {/* Custom range section */}
      <Pressable
        onPress={handleToggleCustomRange}
        className="flex-row items-center mt-4 py-2"
      >
        <Ionicons
          name={showCustomRange ? 'chevron-down' : 'chevron-forward'}
          size={16}
          color={colors.textMuted}
        />
        <Text variant="caption" color="muted" className="ml-1">
          Custom IP range
        </Text>
      </Pressable>

      {showCustomRange && (
        <View className="mt-2">
          <View className="flex-row items-center gap-2 mb-3">
            <TextInput
              className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-foreground text-center"
              placeholder="192.168.1.1"
              placeholderTextColor={colors.textMuted}
              value={rangeStart}
              onChangeText={setRangeStart}
              keyboardType="numeric"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text variant="caption" color="muted">
              to
            </Text>
            <TextInput
              className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-foreground text-center"
              placeholder="192.168.1.100"
              placeholderTextColor={colors.textMuted}
              value={rangeEnd}
              onChangeText={setRangeEnd}
              keyboardType="numeric"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <Button
            variant="secondary"
            onPress={handleScanCustomRange}
            disabled={!isRangeValid() || isDiscovering}
          >
            Scan Range
          </Button>
        </View>
      )}
    </Card>
  );
}
