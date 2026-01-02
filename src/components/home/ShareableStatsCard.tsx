/**
 * ShareableStatsCard - Branded card for social media sharing
 * Designed for 1080x1080 capture, rendered off-screen
 * Uses native React Native components for proper capture rendering
 */

import { forwardRef } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { formatHashrate } from '@/utils/formatting';
import { colors } from '@/constants/colors';

export interface ShareableStatsCardProps {
  hashrate: number | null;
  bestDifficulty: string | null;
}

export const ShareableStatsCard = forwardRef<View, ShareableStatsCardProps>(
  function ShareableStatsCard({ hashrate, bestDifficulty }, ref) {
    const hashrateDisplay = hashrate != null ? formatHashrate(hashrate) : '--';
    const difficultyDisplay = bestDifficulty || '--';

    return (
      <View ref={ref} style={styles.container} collapsable={false}>
        {/* Brand Section */}
        <View style={styles.brandSection}>
          <Image
            source={require('../../../assets/icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.brandName}>PARASITE POOL</Text>
        </View>

        {/* Stats Section */}
        <View style={styles.statsSection}>
          <View style={styles.statBlock}>
            <Text style={styles.statLabel}>Current Hashrate</Text>
            <Text style={styles.hashrateValue}>{hashrateDisplay}</Text>
          </View>

          <View style={styles.statBlock}>
            <Text style={styles.statLabel}>Best Difficulty</Text>
            <Text style={styles.difficultyValue}>{difficultyDisplay}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.divider} />
          <Text style={styles.websiteText}>parasite.space</Text>
        </View>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    width: 1080,
    height: 1080,
    backgroundColor: colors.background,
    padding: 80,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandSection: {
    alignItems: 'center',
    gap: 16,
  },
  logo: {
    width: 120,
    height: 120,
    borderRadius: 24,
  },
  brandName: {
    fontSize: 36,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: 4,
  },
  statsSection: {
    alignItems: 'center',
    gap: 60,
  },
  statBlock: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 32,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  hashrateValue: {
    fontSize: 96,
    fontWeight: '700',
    color: colors.text,
  },
  difficultyValue: {
    fontSize: 72,
    fontWeight: '700',
    color: colors.text,
  },
  footer: {
    alignItems: 'center',
  },
  divider: {
    width: 200,
    height: 1,
    backgroundColor: colors.border,
    marginBottom: 24,
  },
  websiteText: {
    fontSize: 28,
    color: colors.textSecondary,
    letterSpacing: 2,
  },
});
